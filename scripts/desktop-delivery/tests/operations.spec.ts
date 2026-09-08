/** Local Git transactions and authoritative notification regressions for reviewed delivery. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { applyAdoption, adoptionPlan, prepareAdoption, verifyFinalization } from '../adoption.ts'
import { digest, object, sourceLock } from '../evidence.ts'
import { deliveryPredecessor, requireNewVersion, requireUnsignedVersion } from '../lineage.ts'
import { applyNotification, notificationPlan } from '../notifications.ts'
import { deliveryConfig, GitHubError, operationPlan, type GitHub } from '../operations.ts'
import { discover } from '../discovery.ts'
import { reviewedSummary } from '../reviewed-cli.ts'

const configPath = resolve('.github/desktop-delivery/mint.json')
const config = deliveryConfig(configPath)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function temporary(): string { const root = mkdtempSync(join(tmpdir(), 'delivery-operation-')); roots.push(root); return root }
function git(root: string, ...args: string[]): string { return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' }).trim() }
function store(path: string, value: unknown): void { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`) }
function repository(): { root: string; base: string; lock: ReturnType<typeof sourceLock>; next: ReturnType<typeof sourceLock>['release'] } {
  const root = temporary()
  git(root, 'init', '-b', 'main')
  git(root, 'config', 'user.name', 'Fixture maintainer')
  git(root, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(root, 'upstream.txt'), 'first')
  git(root, 'add', '.')
  git(root, 'commit', '-m', 'upstream first')
  const first = { id: 1, tag: 'dsh-v1.0.0-alpha.1', publishedAt: '2026-01-01T00:00:00Z', commit: git(root, 'rev-parse', 'HEAD') }
  git(root, 'checkout', '-b', 'upstream')
  writeFileSync(join(root, 'upstream.txt'), 'second')
  git(root, 'commit', '-am', 'upstream second')
  const next = { id: 2, tag: 'dsh-v1.0.0-alpha.2', publishedAt: '2026-01-02T00:00:00Z', commit: git(root, 'rev-parse', 'HEAD') }
  git(root, 'checkout', 'main')
  mkdirSync(join(root, '.github/desktop-delivery'), { recursive: true })
  const lock = sourceLock({ schemaVersion: 1,
    upstreamRepository: config.upstreamRepository,
    release: first,
    predecessor: null,
    observed: [first] },
  config)
  store(join(root, config.sourceLockPath), lock)
  writeFileSync(join(root, 'downstream.txt'), 'retained downstream feature')
  git(root, 'add', '.')
  git(root, 'commit', '-m', 'downstream baseline')
  return { root, base: git(root, 'rev-parse', 'HEAD'), lock, next }
}

function gitHubRepository(checkout: string) {
  let writes = 0
  let interrupted = true
  const prs: Record<string, unknown>[] = []
  const api: GitHub = { async request(method, path, body) {
    const relative = path.replace(`/repos/${config.repository}`, '')
    if (method !== 'GET') writes++
    if (relative.startsWith('/pulls')) {
      if (method === 'POST') { const pr = { user: { id: config.botId, type: 'Bot' }, html_url: 'https://example.invalid/pr/1' }; prs.push(pr); return pr }
      return prs
    }
    if (relative.startsWith('/git/ref/heads/')) return { object: { sha: git(checkout, 'rev-parse', relative.slice('/git/ref/heads/'.length)) } }
    if (relative.startsWith('/contents/')) {
      const [pathPart, revision] = relative.slice('/contents/'.length).split('?ref=')
      try { return { content: Buffer.from(execFileSync('git', ['show', `${String(revision)}:${String(pathPart)}`], { cwd: checkout })).toString('base64') } }
      catch { throw new GitHubError(404, method, path) }
    }
    if (relative.startsWith('/compare/')) {
      const [base, head] = relative.slice('/compare/'.length).split('...')
      const result = spawnSync('git', ['merge-base', '--is-ancestor', String(base), String(head)], { cwd: checkout })
      return { status: result.status === 0 ? base === head ? 'identical' : 'ahead' : 'diverged', files: git(checkout, 'diff', '--name-only', String(base), String(head)).split('\n').filter(Boolean).map(filename => ({ filename })) }
    }
    if (relative.startsWith('/git/commits/') && method === 'GET') {
      const sha = relative.slice('/git/commits/'.length)
      return { tree: { sha: git(checkout, 'rev-parse', `${sha}^{tree}`) }, parents: git(checkout, 'show', '-s', '--format=%P', sha).split(' ').map(value => ({ sha: value })) }
    }
    const value = object(body)
    if (relative === '/git/blobs') return { sha: execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: checkout, input: String(value.content), encoding: 'utf8' }).trim() }
    if (relative === '/git/trees') {
      git(checkout, 'read-tree', String(value.base_tree))
      const entry = object((value.tree as unknown[])[0])
      git(checkout, 'update-index', '--add', '--cacheinfo', `100644,${String(entry.sha)},${String(entry.path)}`)
      return { sha: git(checkout, 'write-tree') }
    }
    if (relative === '/git/commits') return { sha: git(checkout, 'commit-tree', String(value.tree), '-p', String((value.parents as unknown[])[0]), '-m', String(value.message)) }
    if (relative.startsWith('/git/refs/heads/')) {
      expect(value.force).toBe(false)
      git(checkout, 'update-ref', `refs/heads/${relative.slice('/git/refs/heads/'.length)}`, String(value.sha))
      if (interrupted) { interrupted = false; throw new Error('response lost after write') }
      return {}
    }
    throw new Error(`Unhandled fixture ${method} ${relative}`)
  } }
  return { api, prs, writes: () => writes }
}

it('prepares real isolated upstream Git source and reconciles a bot lock commit without repeat writes', async () => {
  const fixture = repository()
  const checkout = join(temporary(), 'checkout')
  const plan = await adoptionPlan(config, fixture.root, join(fixture.root, config.sourceLockPath), { complete: true, releases: [fixture.lock.release, fixture.next] }, fixture.base, '1.0.0-alpha.2.unsigned.1', { request: async () => [] })
  const prepared = await prepareAdoption(config, fixture.root, plan, checkout, async (cwd, env) => {
    expect(env.GH_TOKEN).toBeUndefined()
    expect(readFileSync(join(cwd, 'downstream.txt'), 'utf8')).toContain('retained')
    expect(readFileSync(join(cwd, 'upstream.txt'), 'utf8')).toBe('second')
  })
  git(checkout, 'branch', String(prepared.branch), String(prepared.seed))
  const remote = gitHubRepository(checkout)
  const { api, prs } = remote
  const result = await applyAdoption(config, prepared, api)
  expect(result.state).toBe('prepared-for-review')
  const final = git(checkout, 'rev-parse', String(prepared.branch))
  expect(verifyFinalization(checkout, config, final).release).toEqual(fixture.next)
  const initialWrites = remote.writes()
  await applyAdoption(config, prepared, api)
  expect(remote.writes()).toBe(initialWrites)
  prs[0] = { ...prs[0], user: { id: config.maintainerIds[0], type: 'User' } }
  await expect(applyAdoption(config, prepared, api)).rejects.toThrow('not bot-authored')
  expect(remote.writes()).toBe(initialWrites)
  prs[0] = { ...prs[0], user: { id: config.botId, type: 'Bot' } }
  git(checkout, 'checkout', '--force', String(prepared.branch))
  writeFileSync(join(checkout, 'downstream.txt'), 'human-reviewed correction')
  git(checkout, 'commit', '-am', 'Human fix after bot finalization')
  const humanSeed = git(checkout, 'rev-parse', 'HEAD')
  await expect(applyAdoption(config, prepared, api)).rejects.toThrow('new reviewed seed is required')
  expect(remote.writes()).toBe(initialWrites)
  const corrected = await prepareAdoption(config, checkout, plan, checkout, () => Promise.resolve())
  expect(corrected.seed).toBe(humanSeed)
  expect(object(corrected.proposedLock).release).toEqual(fixture.next)
  expect(object(corrected.proposedLock).predecessor).toEqual(fixture.lock.release)
  await applyAdoption(config, corrected, api)
  const correctedFinal = git(checkout, 'rev-parse', String(corrected.branch))
  expect(git(checkout, 'show', '-s', '--format=%P', correctedFinal)).toBe(humanSeed)
  expect(git(checkout, 'diff', '--name-only', humanSeed, correctedFinal)).toBe(config.sourceLockPath)
  const finalLock = verifyFinalization(checkout, config, correctedFinal)
  expect(finalLock.release).toEqual(fixture.next)
  expect(finalLock.predecessor).toEqual(fixture.lock.release)
  expect(finalLock.observed).toEqual(object(prepared.proposedLock).observed)
  expect(git(checkout, 'show', `${correctedFinal}:downstream.txt`)).toBe('human-reviewed correction')
  const correctedWrites = remote.writes()
  await applyAdoption(config, corrected, api)
  expect(remote.writes()).toBe(correctedWrites)
})

it('separates desktop rebuild ordering from the immediate next upstream and withdrawn versions', () => {
  const fixture = repository()
  const prior = { purpose: 'desktop-legacy-baseline', desktopTag: 'desktop-v1.0.0-alpha.1.unsigned.1', upstream: fixture.lock.release }
  expect(deliveryPredecessor('desktop', fixture.lock, prior).tag).toBe(prior.desktopTag)
  expect(() => deliveryPredecessor('upstream', fixture.lock, prior)).toThrow('immediate upstream')
  const nextLock = sourceLock({ ...fixture.lock,
    release: fixture.next,
    predecessor: fixture.lock.release,
    observed: [fixture.lock.release,
      fixture.next] },
  config)
  expect(deliveryPredecessor('upstream', nextLock, prior).tag).toBe(prior.desktopTag)
  expect(() =>{  requireNewVersion('1.0.0-alpha.1.unsigned.1', [{ tag_name: 'desktop-v1.0.0-alpha.1.unsigned.2', draft: true }]) }).toThrow('including withdrawals')
  requireNewVersion('1.0.0-alpha.1.unsigned.3', [{ tag_name: 'desktop-v1.0.0-alpha.1.unsigned.2', draft: true }])
})

it('rejects foreign notification identities and leaves unchanged closed notices untouched', async () => {
  const lock = sourceLock(JSON.parse(readFileSync('.github/desktop-delivery/source-lock.json', 'utf8')) as unknown, config)
  const observations = JSON.parse(readFileSync('scripts/desktop-delivery/tests/fixtures/releases.json', 'utf8')) as unknown
  const report = discover(config, lock, observations)
  const other = { ...config, id: 'other-distribution' }
  const foreign = notificationPlan(other, { ...report, distribution: other.id }, 'a'.repeat(64), 'b'.repeat(40), 'https://example.invalid/run')
  const writes: unknown[] = []
  const api: GitHub = { async request(method, path, body) {
    if (method !== 'GET') { writes.push(body); return {} }
    if (path.includes('/git/ref/')) return { object: { sha: 'b'.repeat(40) } }
    return []
  } }
  await expect(applyNotification(config, foreign, api)).rejects.toThrow('identity')
  expect(writes).toEqual([])
  const blocked = notificationPlan(config, { purpose: 'desktop-delivery-shadow', kind: 'discovery', state: 'blocked', blocker: 'GET exhausted' }, 'a'.repeat(64), 'b'.repeat(40), 'https://example.invalid/run')
  expect(object(object(blocked.notice).state).outcome).toBe('blocked')
  expect(reviewedSummary({ purpose: 'desktop-release-native-evidence', qualificationEligible: false })).not.toContain('Desktop delivery shadow')
  expect(operationPlan(config, 'notification-apply', {}).distribution).toBe(config.id)
})

it('feeds real CLI discovery exhaustion into the strict blocked-notification producer', () => {
  const root = temporary()
  const mock = join(root, 'offline.mjs')
  writeFileSync(mock, 'globalThis.fetch = async () => { throw new Error("fixture network unavailable") }\n')
  const out = join(root, 'discovery.json')
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--import', mock, resolve('scripts/desktop-delivery/cli.ts'), 'discover', '--config', configPath, '--lock', resolve('.github/desktop-delivery/source-lock.json'), '--out', out], { encoding: 'utf8' })
  expect(result.status).toBe(1)
  const report = object(JSON.parse(readFileSync(out, 'utf8')) as unknown)
  expect(report.kind).toBe('discovery')
  const plan = notificationPlan(config, report, 'a'.repeat(64), 'b'.repeat(40), 'https://example.invalid/run')
  expect(object(object(plan.notice).state).outcome).toBe('blocked')
})

it('accepts stable-base and prerelease-base unsigned SemVer while rejecting disguised signing modes', () => {
  for (const version of ['0.1.2-unsigned.1', '0.1.2-alpha.3.unsigned.1']) requireUnsignedVersion(version)
  for (const version of ['0.1.2', '0.1.2+unsigned.1', '0.1.2-alpha_bad.unsigned.1', '0.1.2-unsigned.01']) expect(() =>{  requireUnsignedVersion(version) }).toThrow('signed-mode-unconfigured')
})

it('runs actual CLI preparation with an isolated fixture checkout and preserves explicit version failures', async () => {
  const fixture = repository()
  for (const path of ['packages/cli/main', 'vendor/fixture', 'scripts']) mkdirSync(join(fixture.root, path), { recursive: true })
  store(join(fixture.root, 'package.json'), { name: 'desktop-cli-fixture', version: '1.0.0-alpha.1', private: true, type: 'module', devDependencies: { tsx: `link:${resolve('node_modules/tsx')}` } })
  store(join(fixture.root, 'packages/cli/main/package.json'), { name: '@deepseek-ai/dsh', version: '1.0.0-alpha.1' })
  store(join(fixture.root, 'vendor/fixture/package.json'), { name: '@deepseek-ai/vendor-fixture', version: '1.0.0' })
  writeFileSync(join(fixture.root, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .:\n    devDependencies:\n      tsx:\n        specifier: link:${resolve('node_modules/tsx')}\n        version: link:${resolve('node_modules/tsx')}\n`)
  writeFileSync(join(fixture.root, '.gitignore'), 'node_modules/\n')
  for (const name of ['check-workspace-constraints.ts', 'verify-package-dependencies.ts']) writeFileSync(join(fixture.root, 'scripts', name), 'import assert from "node:assert/strict"; assert.equal(process.env.GH_TOKEN, undefined)\n')
  git(fixture.root, 'add', '.'); git(fixture.root, 'commit', '-m', 'CLI source-check fixture')
  const base = git(fixture.root, 'rev-parse', 'HEAD')
  const plan = await adoptionPlan(config, fixture.root, join(fixture.root, config.sourceLockPath), { complete: true, releases: [fixture.lock.release, fixture.next] }, base, '1.0.0-alpha.2.unsigned.1', { request: async () => [] })
  const output = temporary(); const planPath = join(output, 'plan.json'); store(planPath, plan)
  const command = (checkout: string) => spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/desktop-delivery/cli.ts'), 'adoption-prepare', '--config', configPath, '--root', fixture.root, '--plan', planPath, '--digest', digest(readFileSync(planPath)), '--checkout', checkout, '--out', join(output, 'result.json')], { encoding: 'utf8', timeout: 30_000 })
  const result = command(join(output, 'checkout'))
  expect(result.stderr || result.stdout).not.toContain('ERR_PNPM')
  expect(result.status, result.stdout + result.stderr).toBe(0)
  const prepared = object(JSON.parse(readFileSync(join(output, 'result.json'), 'utf8')) as unknown)
  expect(prepared.operation).toBe('adoption-apply')
  expect(git(join(output, 'checkout'), 'merge-base', '--is-ancestor', fixture.next.commit, String(prepared.seed))).toBe('')
  mkdirSync(join(output, 'checkout', 'packages/cli/mismatch'), { recursive: true })
  store(join(output, 'checkout', 'packages/cli/mismatch/package.json'), { name: '@deepseek-ai/mismatch', version: '0.0.0' })
  const mismatch = command(join(output, 'checkout'))
  expect(mismatch.status).toBe(1)
  expect(mismatch.stdout).toContain('dsh release members must share one version')
})

it('deduplicates authoritative closed notices on later pages and ignores copied human markers', async () => {
  const second = { ...config, id: 'another-desktop' }
  const plan = notificationPlan(second, { purpose: 'desktop-delivery-shadow', kind: 'discovery', state: 'blocked', blocker: 'fixture exhausted' }, 'a'.repeat(64), 'b'.repeat(40), 'https://example.invalid/run')
  let createdBody = ''
  let writes = 0
  let duplicate = false
  const bot = { id: second.botId, type: 'Bot' }
  const api: GitHub = { async request(method, path, body) {
    if (method !== 'GET') { writes++; createdBody = String(object(body).body); return {} }
    if (path.includes('/git/ref/')) return { object: { sha: 'b'.repeat(40) } }
    if (createdBody === '') return []
    const issue = { id: 500, number: 5, state: 'closed', user: bot, body: createdBody }
    if (path.includes('/comments')) return []
    if (path.endsWith('page=1')) return Array.from({ length: 100 }, (_, id) => ({ id, user: { id: 999, type: 'User' }, body: createdBody }))
    return duplicate ? [issue, { ...issue, id: 501, number: 6 }] : [issue]
  } }
  await applyNotification(second, plan, api)
  expect(writes).toBe(1)
  expect((await applyNotification(second, { ...plan, runUrl: 'https://example.invalid/later-run' }, api)).state).toBe('unchanged')
  expect(writes).toBe(1)
  duplicate = true
  await expect(applyNotification(second, plan, api)).rejects.toThrow('Multiple authoritative')
  expect(writes).toBe(1)
})

it('prepares and finalizes successive desktop fixes while upstream waits, then adopts that exact next upstream', async () => {
  const fixture = repository()
  const observations = { complete: true, releases: [fixture.lock.release, fixture.next] }
  let root = fixture.root
  let delivered: Record<string, unknown> = { purpose: 'desktop-legacy-baseline', desktopTag: 'desktop-v1.0.0-alpha.1.unsigned.1', upstream: fixture.lock.release }
  for (const sequence of [2, 3]) {
    const base = git(root, 'rev-parse', 'main')
    const lockPath = join(root, config.sourceLockPath)
    expect(discover(config, sourceLock(JSON.parse(readFileSync(lockPath, 'utf8')) as unknown, config), observations).next).toEqual(fixture.next)
    const version = `1.0.0-alpha.1.unsigned.${String(sequence)}`
    const plan = await adoptionPlan(config, root, lockPath, observations, base, version, { request: async () => [] }, 'desktop', delivered)
    expect(plan.upstream).toEqual(fixture.lock.release)
    const checkout = join(temporary(), 'checkout')
    const prepared = await prepareAdoption(config, root, plan, checkout, (cwd) => {
      expect(readFileSync(join(cwd, 'upstream.txt'), 'utf8')).toBe('first')
      writeFileSync(join(cwd, `desktop-fix-${String(sequence)}`), `reviewed desktop fix ${String(sequence)}`)
      return Promise.resolve()
    })
    git(checkout, 'branch', '--force', String(prepared.branch), String(prepared.seed))
    const remote = gitHubRepository(checkout)
    await applyAdoption(config, prepared, remote.api)
    const final = git(checkout, 'rev-parse', String(prepared.branch))
    const lock = verifyFinalization(checkout, config, final)
    expect(lock.release).toEqual(fixture.lock.release)
    expect(lock.predecessor).toBeNull()
    expect(lock.observed).toEqual(fixture.lock.observed)
    expect(deliveryPredecessor('desktop', lock, delivered).tag).toBe(delivered.desktopTag ?? delivered.tag)
    git(checkout, 'checkout', '--force', 'main')
    git(checkout, 'merge', '--no-ff', '-m', 'Review-approved desktop merge', String(prepared.branch))
    expect(verifyFinalization(checkout, config, git(checkout, 'rev-parse', 'HEAD')).release).toEqual(fixture.lock.release)
    delivered = { purpose: 'desktop-release-qualification', tag: `desktop-v${version}`, upstream: lock.release }
    root = checkout
  }
  const plan = await adoptionPlan(config, root, join(root, config.sourceLockPath), observations, git(root, 'rev-parse', 'main'), '1.0.0-alpha.2.unsigned.1', { request: async () => [] }, 'upstream')
  expect(plan.upstream).toEqual(fixture.next)
  const checkout = join(temporary(), 'checkout')
  const prepared = await prepareAdoption(config, root, plan, checkout, (cwd) => {
    expect(readFileSync(join(cwd, 'upstream.txt'), 'utf8')).toBe('second')
    for (const sequence of [2, 3]) expect(readFileSync(join(cwd, `desktop-fix-${String(sequence)}`), 'utf8')).toContain('reviewed desktop fix')
    return Promise.resolve()
  })
  git(checkout, 'branch', String(prepared.branch), String(prepared.seed))
  await applyAdoption(config, prepared, gitHubRepository(checkout).api)
  const final = git(checkout, 'rev-parse', String(prepared.branch))
  const lock = verifyFinalization(checkout, config, final)
  expect(lock.release).toEqual(fixture.next)
  expect(lock.predecessor).toEqual(fixture.lock.release)
  expect(deliveryPredecessor('upstream', lock, delivered).tag).toBe(delivered.tag)
})
