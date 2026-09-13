/** Offline behavior and real source-plane CLI evidence for shadow delivery. */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { load } from 'js-yaml'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { BrowserAuth } from '../../../packages/client/connection/src/browser-auth.ts'
import { RecordCredentials } from '../../../packages/client/connection/tests/browser-credentials.ts'
import { artifact, checkArchitecture, combine, summary } from '../artifacts.ts'
import { candidate } from '../candidate.ts'
import { probeBackendPage } from '../smoke.ts'
import { discover, githubReleases } from '../discovery.ts'
import { digest, distribution, readJson, shadow, sourceLock, type Release } from '../evidence.ts'

const root = resolve(import.meta.dirname, '../../..')
const configPath = join(root, '.github/desktop-delivery/mint.json')
// Historical discovery scenarios use the lock paired with their recorded releases.
const lockPath = join(import.meta.dirname, 'fixtures/source-lock.json')
const config = distribution(readJson(configPath))
const lock = sourceLock(readJson(lockPath), config)
const fixturePath = join(import.meta.dirname, 'fixtures/releases.json')
const observed = (readJson(fixturePath) as { releases: Release[] }).releases
const roots: string[] = []
function temporary(): string { const path = mkdtempSync(join(tmpdir(), 'dsh-delivery-test-')); roots.push(path); return path }
function json(path: string, value: unknown): void { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`) }
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })

it('orders releases, deduplicates identical identities and reports the immediate successor', () => {
  const report = discover(config, lock, { complete: true, releases: [...observed].reverse().concat(observed) })
  expect(report.state).toBe('next')
  expect((report.next as Release).tag).toBe('dsh-v0.1.2-alpha.4')
  expect((report.observations as Release[]).length).toBe(observed.length)
  expect(discover(config, lock, { complete: true, releases: lock.observed }).state).toBe('current')
})

it('blocks changed, missing, conflicting and unexpectedly earlier identities', () => {
  const current = lock.release
  for (const releases of [
    observed.filter(item => item.id !== current.id),
    observed.map(item => item.id === current.id ? { ...item, commit: 'a'.repeat(40) } : item),
    [...observed, { ...current, id: current.id + 1 }],
    [...observed, { ...current, id: 1, tag: 'dsh-v0.0.0', publishedAt: '2020-01-01T00:00:00Z' }],
  ]) expect(discover(config, lock, { complete: true, releases }).state).toBe('blocked')
  expect(discover(config, lock, { complete: false, releases: observed }).state).toBe('blocked')
  expect(discover(config, lock, { complete: true, releases: [{ id: 'bad' }] }).state).toBe('blocked')
})

it('retrieves all pages using GET and resolves annotated tags with bounded transient retries', async () => {
  const calls: string[] = []
  const waits: number[] = []
  const first = lock.release
  let transient = true
  const request: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString()
    calls.push(url)
    expect(init?.method).toBe('GET')
    expect(init?.redirect).toBe('error')
    if (transient) { transient = false; return new Response('', { status: 503 }) }
    if (new URL(url).searchParams.get('page') === '1') return Response.json([{ id: first.id, tag_name: first.tag, published_at: first.publishedAt, draft: false, prerelease: true }], { headers: { link: '<https://api.github.com/next>; rel="next"' } })
    if (new URL(url).searchParams.get('page') === '2') return Response.json([])
    if (url.includes('/git/ref/')) return Response.json({ object: { type: 'tag', sha: 'b'.repeat(40) } })
    return Response.json({ object: { type: 'commit', sha: first.commit } })
  }
  await expect(githubReleases(config, { fetch: request, wait: async (ms) => { waits.push(ms) } })).resolves.toEqual([first])
  expect(waits).toEqual([250])
  expect(calls.some(url => url.endsWith('page=2'))).toBe(true)
})

it('fails incomplete/API/auth/malformed discovery and limits retries to three attempts', async () => {
  for (const status of [401, 403, 500]) {
    let calls = 0
    await expect(githubReleases(config, { fetch: async () => { calls++; return new Response('', { status }) }, wait: async () => {} })).rejects.toThrow('GitHub GET failed')
    expect(calls).toBe(status === 500 ? 3 : 1)
  }
  let calls = 0
  await expect(githubReleases(config, { fetch: async () => { calls++; throw new Error('network unavailable') }, wait: async () => {} })).rejects.toThrow('network unavailable')
  expect(calls).toBe(3)
  await expect(githubReleases(config, { fetch: async () => Response.json({}), wait: async () => {} })).rejects.toThrow('Malformed')
  await expect(githubReleases(config, { fetch: async () => Response.json([], { headers: { link: '<next>; rel="next"' } }), wait: async () => {} })).rejects.toThrow('Incomplete')
})

it('runs the real source CLI for two distributions and compares owner-local Markdown', () => {
  const directory = temporary()
  for (const selected of [configPath, join(import.meta.dirname, 'fixtures/other-distribution.json')]) {
    const out = join(directory, 'report.json')
    const markdown = join(directory, 'report.md')
    // The deliverable is a source-plane repository CLI, not a published dsh launcher.
    const result = spawnSync(process.execPath, ['--import', 'tsx', join(root, 'scripts/desktop-delivery/cli.ts'), 'discover', '--config', selected, '--lock', lockPath, '--fixture', fixturePath, '--out', out, '--summary', markdown], { encoding: 'utf8', timeout: 30_000 })
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    expect(result.status, result.stderr).toBe(0)
    expect((readJson(out) as Record<string, unknown>).state).toBe('next')
    const expected = selected === configPath ? 'mint-discovery.md' : 'other-discovery.md'
    expect(readFileSync(markdown, 'utf8')).toBe(readFileSync(join(import.meta.dirname, 'expected', expected), 'utf8'))
  }
})

function packageEvidence(): { directory: string; candidatePath: string; names: string[] } {
  const directory = temporary()
  const candidatePath = join(directory, 'candidate.json')
  json(candidatePath, { ...shadow, kind: 'candidate', distribution: config.id, configDigest: digest(readFileSync(configPath)), sourceLockDigest: digest(readFileSync(lockPath)), downstreamCommit: 'a'.repeat(40), upstream: lock.release, sourceDifference: { status: '', trackedDiffDigest: digest('') }, desktopVersion: '0.1.2-alpha.3', components: { '@deepseek-ai/dsh': '0.1.2-alpha.3' }, qualificationEligible: true })
  const names: string[] = []
  for (const arch of config.architectures) {
    const filename = `package-${arch}.dmg`
    writeFileSync(join(directory, filename), `offline artifact fixture ${arch}`)
    const smokeName = `smoke-${arch}.json`
    json(join(directory, smokeName), { ...shadow, kind: 'smoke', candidateDigest: digest(readFileSync(candidatePath)), dmgDigest: digest(readFileSync(join(directory, filename))), architecture: arch, executableArchitectures: arch === 'x64' ? 'x86_64' : 'arm64', bootstrap: true, backendHttp: true, backendStopped: true, mountedReadOnly: true, detached: true })
    const reportName = `artifact-${arch}.json`
    json(join(directory, reportName), artifact(configPath, candidatePath, join(directory, filename), join(directory, smokeName), arch))
    names.push(reportName)
  }
  return { directory, candidatePath, names }
}

it('combines exact files while preserving unsigned non-publication markers', () => {
  const { directory, candidatePath, names } = packageEvidence()
  expect(combine(configPath, candidatePath, directory, names)).toMatchObject({ ...shadow, state: 'shadow-qualified' })
})

it('rejects substituted files, symlinks, malformed evidence, missing architectures and failed smokes', () => {
  const { directory, candidatePath, names } = packageEvidence()
  expect(() => combine(configPath, candidatePath, directory, names.slice(0, 1))).toThrow('Missing')
  expect(() => combine(configPath, candidatePath, directory, [names[0]!, names[0]!])).toThrow('duplicate')
  expect(() => combine(configPath, candidatePath, directory, ['../outside.json', names[1]!])).toThrow('Unsafe')
  const dmg = join(directory, 'package-arm64.dmg')
  const original = readFileSync(dmg)
  writeFileSync(dmg, 'altered')
  expect(() => combine(configPath, candidatePath, directory, names)).toThrow('bytes changed')
  writeFileSync(dmg, original)
  const smokePath = join(directory, 'smoke-arm64.json')
  const smoke = readJson(smokePath) as Record<string, unknown>
  json(smokePath, { ...smoke, backendHttp: false })
  expect(() => artifact(configPath, candidatePath, dmg, smokePath, 'arm64')).toThrow('smoke')
  expect(() => combine(configPath, candidatePath, directory, names)).toThrow('Smoke evidence bytes')
  json(smokePath, { ...smoke, executableArchitectures: 'x86_64' })
  expect(() => artifact(configPath, candidatePath, dmg, smokePath, 'arm64')).toThrow('architecture')
  json(smokePath, smoke)
  rmSync(dmg)
  symlinkSync(candidatePath, dmg)
  expect(() => combine(configPath, candidatePath, directory, names)).toThrow('regular file')
  for (const invalid of ['x86_64 arm64', 'arm64e', '']) expect(() =>{  checkArchitecture(invalid, 'arm64') }).toThrow('architecture')
})

it('blocks changed candidate identity and dirty qualification', () => {
  const { directory, candidatePath, names } = packageEvidence()
  const record = readJson(candidatePath) as Record<string, unknown>
  json(candidatePath, { ...record, publicationEligible: true })
  expect(() => combine(configPath, candidatePath, directory, names)).toThrow('marker')
  json(candidatePath, { ...record, qualificationEligible: false, sourceDifference: { status: ' M example', trackedDiffDigest: digest('changed') } })
  expect(() => combine(configPath, candidatePath, directory, names)).toThrow('diagnostic')
  json(candidatePath, { ...record, downstreamCommit: 'b'.repeat(40) })
  expect(() => combine(configPath, candidatePath, directory, names)).toThrow('candidate')
})

it('rejects source mismatches and inconsistent workspace versions before packaging', () => {
  const current = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim()
  expect(() => candidate(root, configPath, lockPath, 'a'.repeat(40))).toThrow('checkout')
  const directory = temporary()
  for (const path of ['apps/cli', 'packages/core/example']) mkdirSync(join(directory, path), { recursive: true })
  json(join(directory, 'apps/cli/package.json'), { name: '@deepseek-ai/dsh', version: '1.0.0' })
  json(join(directory, 'packages/core/example/package.json'), { name: '@deepseek-ai/dsh-example', version: '2.0.0' })
  // The repository object database is read-only; this private worktree supplies only version inputs.
  const gitDirectory = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: root, encoding: 'utf8' }).stdout.trim()
  writeFileSync(join(directory, '.git'), `gitdir: ${gitDirectory}\n`)
  expect(() => candidate(directory, configPath, lockPath, current)).toThrow('must share one version')
})

it('keeps the workflow dispatch-only, read-only, pinned, unsigned and connected to the CLI', () => {
  const text = readFileSync(join(root, '.github/workflows/desktop-delivery-shadow.yml'), 'utf8')
  const workflow = load(text) as {
    on: Record<string, unknown>
    permissions: Record<string, string>
    jobs: Record<string, { needs?: string[]; steps: Array<{ uses?: string; with?: Record<string, unknown> }> }>
  }
  expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
  expect(workflow.permissions).toEqual({ contents: 'read' })
  expect(workflow.jobs.combine?.needs).toEqual(['candidate', 'qualify'])
  for (const job of Object.values(workflow.jobs)) for (const step of job.steps) if (step.uses?.startsWith('actions/checkout@')) expect(step.with).toMatchObject({ ref: '${{ github.sha }}', 'persist-credentials': false })
  for (const command of ['discover', 'candidate', 'smoke', 'artifact', 'combine']) expect(text).toContain(`desktop:delivery ${command}`)
  for (const required of ['macos-15-intel', 'macos-15', '--publish never', '--config.mac.identity=null', '--config.mac.notarize=false', 'pnpm run desktop:stage', 'cmp "$RUNNER_TEMP/shadow/candidate.json"']) expect(text).toContain(required)
  const writes = /secrets\.|contents: write|git (?:push|commit|tag)|gh (?:api|release|pr|issue)|upstream-sync-state|environment:/u
  expect(text).not.toMatch(writes)
  expect(summary({ kind: 'discovery', state: 'blocked', blocker: 'API failed' })).toContain('    API failed')
})

it('executes offline artifact and combine CLI paths and persists blocking output', () => {
  const { directory, candidatePath, names } = packageEvidence()
  const out = join(directory, 'combined.json')
  const command = (args: string[]): ReturnType<typeof spawnSync> => spawnSync(process.execPath, [
    '--import', 'tsx', join(root, 'scripts/desktop-delivery/cli.ts'), ...args,
    '--config', configPath, '--out', out,
  ], { encoding: 'utf8', timeout: 30_000 })
  const generated = command(['artifact', '--candidate', candidatePath, '--dmg', join(directory, 'package-arm64.dmg'), '--smoke', join(directory, 'smoke-arm64.json'), '--arch', 'arm64'])
  expect(generated.error).toBeUndefined()
  expect(generated.signal).toBeNull()
  expect(generated.status).toBe(0)
  expect(readJson(out)).toEqual(readJson(join(directory, names[0]!)))
  const good = command(['combine', '--candidate', candidatePath, '--directory', directory, '--reports', names.join(',')])
  expect(good.error).toBeUndefined()
  expect(good.signal).toBeNull()
  expect(good.status).toBe(0)
  expect((readJson(out) as Record<string, unknown>).state).toBe('shadow-qualified')
  const bad = command(['combine', '--candidate', candidatePath, '--directory', directory, '--reports', names[0]!])
  expect(bad.error).toBeUndefined()
  expect(bad.signal).toBeNull()
  expect(bad.status).toBe(1)
  expect(readJson(out)).toMatchObject({ ...shadow, state: 'blocked' })
})

it('exchanges the launch token for a same-origin cookie and rejects unsafe redirects', async () => {
  const url = 'http://127.0.0.1:43123/?token=synthetic-token'
  let calls = 0
  await probeBackendPage(url, async (input, init) => {
    calls++
    if (calls === 1) {
      expect(input).toBe(url)
      expect(init?.redirect).toBe('manual')
      return new Response('', { status: 303, headers: { location: '/', 'set-cookie': 'dsh-auth-test=synthetic-cookie; HttpOnly; SameSite=Strict' } })
    }
    expect(input).toBe('http://127.0.0.1:43123/')
    expect(init?.headers).toEqual({ Cookie: 'dsh-auth-test=synthetic-cookie' })
    return new Response('<html>desktop</html>')
  })
  expect(calls).toBe(2)
  for (const location of ['http://example.com/', 'http://127.0.0.1:43124/', '/other', '/?token=again', '/#fragment']) {
    let attempts = 0
    await expect(probeBackendPage(url, async () => {
      attempts++
      return new Response('', { status: 303, headers: { location, 'set-cookie': 'dsh-auth-test=synthetic-cookie' } })
    })).rejects.toThrow('Unsafe')
    expect(attempts).toBe(1)
  }
  await expect(probeBackendPage(url, async () => new Response('unauthorized', { status: 401 }))).rejects.toThrow('did not serve')
})

it('uses the real BrowserAuth producer for the token exchange and authenticated index request', async () => {
  const auth = await BrowserAuth.create({}, new RecordCredentials() as unknown as CredentialProvider, 30)
  const url = auth.authenticatedUrl('http://127.0.0.1:43123/')
  const statuses: number[] = []
  await probeBackendPage(url, async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : input.toString())
    const headers = new Headers(init?.headers)
    headers.set('host', target.host)
    let status = 200
    let responseHeaders: Record<string, string> = { 'content-type': 'text/html' }
    let body = ''
    const allowed = auth.authorizeIndex({ method: 'GET', url: `${target.pathname}${target.search}`, headers }, {
      writeHead(code, values) { status = code; if (values !== undefined) responseHeaders = { ...values } },
      end(value) { body = value ?? '' },
    })
    if (allowed) body = '<html>authenticated desktop</html>'
    statuses.push(status)
    return new Response(body, { status, headers: responseHeaders })
  })
  expect(statuses).toEqual([303, 200])
  await expect(probeBackendPage(url, async () => new Response('', { status: 302 })))
    .rejects.toThrow('status=302, content-type=text/plain')
  await expect(probeBackendPage(url, async () => new Response('private response body', { status: 401 })))
    .rejects.toThrow('status=401, content-type=text/plain')
})

it('writes readable Markdown for a real multiline candidate failure without a secondary exception', () => {
  const directory = temporary()
  const out = join(directory, 'blocked.json')
  const markdown = join(directory, 'blocked.md')
  const result = spawnSync(process.execPath, [
    '--import', 'tsx', join(root, 'scripts/desktop-delivery/cli.ts'), 'candidate',
    '--config', configPath, '--lock', lockPath, '--root', directory,
    '--expected-commit', 'a'.repeat(40), '--out', out, '--summary', markdown,
  ], { encoding: 'utf8', timeout: 30_000 })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  expect(result.status).toBe(1)
  const report = readJson(out) as { state: string; blocker: string }
  expect(report.state).toBe('blocked')
  expect(report.blocker).toContain('\n')
  const text = readFileSync(markdown, 'utf8')
  expect(text).toContain('State: blocked')
  expect(text).toContain('git rev-parse HEAD exited with')
  expect(text).toContain('not a git repository')
  expect(text).not.toContain('checks passed')
  expect(result.stdout).toBe(text)
  expect(result.stderr).not.toMatch(/Expected nonempty|Error:|artifacts\.ts|evidence\.ts/u)
})
