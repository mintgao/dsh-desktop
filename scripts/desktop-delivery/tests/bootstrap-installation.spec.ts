/** Installation classification is explicit, completed-run bound, and read-only across successor seeds. */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { bootstrapContext, installationRecord } from '../bootstrap-installation.ts'
import { bootstrapInstallationCheck } from '../bootstrap-installation-check.ts'
import { canonicalJson } from '../bootstrap-protection.ts'
import { digest, object } from '../evidence.ts'
import { legacyBaseline, migrationPreflight, requireActivation } from '../migration.ts'
import { main } from '../cli.ts'
import { deliveryConfig, type GitHub } from '../operations.ts'
import { protectionFixture } from './bootstrap-protection-fixture.ts'

const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const sha = (letter: string): string => letter.repeat(40)
const gitBlob = (bytes: Buffer): string => createHash('sha1').update(`blob ${String(bytes.length)}\0`).update(bytes).digest('hex')
async function fixture(other = false) {
  const root = mkdtempSync(join(tmpdir(), 'installation-')); roots.push(root)
  const original = deliveryConfig(resolve('.github/desktop-delivery/mint.json'))
  const config = { ...original, ...(other ? { id: 'other', repository: 'other/delivery', repositoryId: 456, botId: 789, bootstrapTagPrefix: 'desktop-bootstrap-other-' } : {}), bootstrapRulesetId: 999 }
  const release = { id: 1, tag: `${config.tagPrefix}1`, commit: sha('a'), publishedAt: '2026-01-01T00:00:00Z' }
  const context = { schemaVersion: 1, purpose: 'desktop-bootstrap-installation', repository: config.repository, repositoryId: config.repositoryId,
    pullRequest: 67, baseBranch: config.defaultBranch, baseCommit: sha('b'), tag: `${config.bootstrapTagPrefix}one`, seedCommit: sha('c'), seedTree: sha('d'), runId: 111, attempt: 1 }
  const upstreamLock = { schemaVersion: 1, upstreamRepository: config.upstreamRepository, release, predecessor: null, observed: [release] }
  const finalLock = { ...upstreamLock, schemaVersion: 2, adoptionSeed: { commit: context.seedCommit, tree: context.seedTree } }
  const repo = { id: config.repositoryId, full_name: config.repository, default_branch: config.defaultBranch }
  const head = sha('e')
  const branch = `desktop-adopt/1-${release.commit.slice(0, 12)}`
  const pr = { number: 67, state: 'open', user: { id: config.botId, type: 'Bot' }, base: { repo, ref: 'main', sha: context.baseCommit }, head: { repo, ref: branch, sha: head }, html_url: 'https://github.com/fixture/pull/67' }
  const prefix = `/repos/${config.repository}`
  const responses = new Map<string, unknown>()
  const files = new Map<string, Buffer>()
  const setFile = (commit: string, path: string, value: unknown): Buffer => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value))
    files.set(`${commit}:${path}`, bytes)
    responses.set(`${prefix}/contents/${path}?ref=${commit}`, { type: 'file', encoding: 'base64', path, content: bytes.toString('base64'), sha: gitBlob(bytes), size: bytes.length })
    return bytes
  }
  const seedBytes = setFile(context.seedCommit, config.sourceLockPath, upstreamLock)
  const headBytes = setFile(head, config.sourceLockPath, finalLock)
  const legacy = { schemaVersion: 2, upstreamRepository: config.upstreamRepository, lastPublishedRelease: release }
  const legacyBytes = setFile(context.baseCommit, config.legacyAdoptionEvidence.path, legacy)
  config.legacyAdoptionEvidence = { ...config.legacyAdoptionEvidence, commit: context.baseCommit, digest: digest(legacyBytes) }
  const protection = await protectionFixture(config)
  for (const [path, content] of Object.entries(protection.files)) setFile(context.seedCommit, path, content)
  const leaf = (bytes: Buffer) => ({ path: config.sourceLockPath, type: 'blob', mode: '100644', sha: gitBlob(bytes) })
  const seedTree = { sha: context.seedTree, truncated: false, tree: [leaf(seedBytes)] }
  const finalTree = { sha: sha('f'), truncated: false, tree: [leaf(headBytes)] }
  const baseTree = { sha: sha('1'), truncated: false, tree: [] as unknown[] }
  responses.set(prefix, repo)
  responses.set(`${prefix}/git/ref/heads/main`, { object: { type: 'commit', sha: context.baseCommit } })
  responses.set(`${prefix}/git/commits/${context.baseCommit}`, { tree: { sha: baseTree.sha } })
  responses.set(`${prefix}/git/commits/${context.seedCommit}`, { tree: { sha: seedTree.sha } })
  responses.set(`${prefix}/git/commits/${head}`, { tree: { sha: finalTree.sha }, parents: [{ sha: context.seedCommit }] })
  for (const tree of [baseTree, seedTree, finalTree]) responses.set(`${prefix}/git/trees/${tree.sha}?recursive=1`, tree)
  responses.set(`${prefix}/pulls/67`, pr)
  const inventory = [pr]
  responses.set(`${prefix}/pulls?state=open&base=main&per_page=100&page=1`, inventory)
  responses.set(`${prefix}/git/ref/heads/${branch}`, { object: { type: 'commit', sha: head } })
  responses.set(`${prefix}/git/ref/tags/${context.tag}`, { object: { type: 'commit', sha: context.seedCommit } })
  responses.set(`${prefix}/rulesets/999`, protection.rules)
  const reviewers = { type: 'required_reviewers', reviewers: config.maintainerIds.map(id => ({ reviewer: { id } })), prevent_self_review: false }
  const environment = { protection_rules: [reviewers], deployment_branch_policy: { protected_branches: true } }
  responses.set(`${prefix}/environments/${config.bootstrapEnvironment}`, environment)
  responses.set(`${prefix}/environments/${config.releaseEnvironment}`, environment)
  const run = { id: 111, run_attempt: 1, repository: repo, event: 'workflow_dispatch', head_branch: context.tag, head_sha: context.seedCommit, path: '.github/workflows/desktop-ci.yml', status: 'completed', conclusion: 'success' }
  responses.set(`${prefix}/actions/runs/111/attempts/1`, run)
  const job = { name: 'bootstrap', run_id: 111, run_attempt: 1, head_sha: context.seedCommit, status: 'completed', conclusion: 'success' }
  responses.set(`${prefix}/actions/runs/111/attempts/1/jobs?per_page=100&page=1`, { total_count: 1, jobs: [job] })
  for (const ancestor of [context.baseCommit, release.commit]) responses.set(`${prefix}/compare/${ancestor}...${context.seedCommit}`, { status: 'ahead' })
  responses.set(`${prefix}/compare/${release.commit}...${head}`, { status: 'ahead' })
  const assets = config.architectures.map((arch, index) => ({ name: `desktop-${arch}.dmg`, id: index + 1, size: 3 }))
  for (const asset of assets) writeFileSync(join(root, asset.name), 'dmg')
  const sums = assets.map(asset => `${digest('dmg')}  ${asset.name}`).join('\n') + '\n'
  writeFileSync(join(root, 'SHA256SUMS.txt'), sums)
  assets.push({ name: 'SHA256SUMS.txt', id: 3, size: Buffer.byteLength(sums) })
  for (const asset of assets) responses.set(`${prefix}/releases/assets/${String(asset.id)}`, new Uint8Array(readFileSync(join(root, asset.name))))
  const published = { id: 3, tag_name: 'desktop-v1', draft: false, prerelease: true, published_at: release.publishedAt, body: `${release.tag} ${release.commit} ${head} unsigned-preview`, assets }
  responses.set(`${prefix}/releases?per_page=100&page=1`, [published])
  responses.set(`${prefix}/git/ref/tags/desktop-v1`, { object: { type: 'commit', sha: head } })
  responses.set(`/repos/${config.upstreamRepository}/releases/1`, { tag_name: release.tag })
  responses.set(`/repos/${config.upstreamRepository}/git/ref/tags/${release.tag}`, { object: { type: 'commit', sha: release.commit } })
  const lockPath = join(root, 'legacy-lock.json'); writeFileSync(lockPath, JSON.stringify(upstreamLock))
  const mainRules = { id: config.mainRulesetId, target: 'branch', updated_at: '2026-01-01T00:00:00Z', enforcement: 'active', conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } }, bypass_actors: [], rules: [{ type: 'pull_request', parameters: { required_approving_review_count: 1, require_last_push_approval: true, dismiss_stale_reviews_on_push: true } }, { type: 'required_status_checks', parameters: { required_status_checks: config.requiredChecks.map(context => ({ context })) } }] }
  const tagRules = { ...mainRules, target: 'tag', conditions: { ref_name: { include: ['refs/tags/desktop-v*'], exclude: [] } } }
  responses.set(`${prefix}/rulesets/${String(config.mainRulesetId)}`, mainRules)
  responses.set(`${prefix}/rulesets/${String(config.tagCreationRulesetId)}`, { ...tagRules, id: config.tagCreationRulesetId, rules: [{ type: 'creation' }], bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 2, bypass_mode: 'always' }] })
  responses.set(`${prefix}/rulesets/${String(config.tagImmutabilityRulesetId)}`, { ...tagRules, id: config.tagImmutabilityRulesetId, rules: [{ type: 'update' }, { type: 'deletion' }] })
  responses.set('/user', { id: config.maintainerIds[0] })
  responses.set(`${prefix}/actions/permissions/workflow`, { default_workflow_permissions: 'read', can_approve_pull_request_reviews: true })
  const workflows = config.legacyWorkflows.map((path, id) => ({ path, id, state: 'disabled_manually' }))
  responses.set(`${prefix}/actions/workflows?per_page=100&page=1`, { workflows })
  for (const workflow of workflows) responses.set(`${prefix}/actions/workflows/${String(workflow.id)}/runs?per_page=100&page=1`, { workflow_runs: [] })
  const admin = { schemaVersion: 1, repositoryId: config.repositoryId, revokedAppIds: config.legacyAppIds, revocationEvidence: ['administrator observation'], outstandingAuthorityRevoked: true, delayedCallbacksDisabled: true, botReviewEligibilityVerified: true,
    draftAccessProbe: { schemaVersion: 1, operation: 'bootstrap-probe', state: 'draft-access-verified', repository: config.repository, repositoryId: config.repositoryId, tag: context.tag, commit: context.seedCommit, workflow: { commit: context.seedCommit, runId: 222, attempt: 1 }, uploaded: true, deleted: true, bodyRestored: true, remainedDraft: true, downloadedDigest: digest('Desktop delivery draft access probe. No application payload.\n'), tokenPermissions: { contents: 'write', issues: 'write', actions: 'read' } } }
  responses.set(`${prefix}/actions/runs/222`, { ...run, id: 222 })
  const api: GitHub = { async request(method, path) {
    expect(['GET', 'DOWNLOAD']).toContain(method)
    if (!responses.has(path)) throw new Error(`Missing fixture endpoint: ${path}`)
    return structuredClone(responses.get(path))
  } }
  return { root, config, context, api, responses, prefix, pr, inventory, run, job, seedTree, finalTree, baseTree, setFile, files,
    lockPath, mainRules, workflows, admin, published, protection, upstreamLock }
}

it.each([false, true])('classifies only explicit completed installation, including another distribution (%s)', async (other) => {
  const f = await fixture(other)
  const ordinary = await legacyBaseline(f.config, f.lockPath, f.root, f.api)
  expect(ordinary.bootstrapInstallation).toBeUndefined()
  expect(ordinary.unresolvedAdoption).toHaveLength(1)
  const baseline = await legacyBaseline(f.config, f.lockPath, f.root, f.api, f.context)
  expect(baseline.unresolvedAdoption).toEqual([])
  expect(object(baseline.bootstrapInstallation).observedHead).toBe(f.pr.head.sha)
  expect(installationRecord(baseline.bootstrapInstallation, f.config).contextDigest).toBe(digest(canonicalJson(f.context)))
  expect(() => bootstrapContext({ ...f.context, ignored: true }, f.config)).toThrow('context')
  f.inventory.push({ ...f.pr, number: 68 })
  expect((await legacyBaseline(f.config, f.lockPath, f.root, f.api, f.context)).unresolvedAdoption).toHaveLength(1)
})

it.each(['repository', 'author', 'base', 'head', 'tag', 'seed', 'attempt', 'run', 'job', 'parent', 'extra-file', 'mode', 'truncated', 'installed', 'base-lock', 'lineage', 'duplicate', 'missing', 'api', 'pagination', 'job-count', 'numeric-author', 'branch', 'lock-lineage', 'non-substantive'])('rejects %s evidence without writes', async (failure) => {
  const f = await fixture()
  switch (failure) {
    case 'repository': f.context.repositoryId++; break
    case 'author': f.pr.user.type = 'User'; break
    case 'base': f.pr.base.sha = sha('9'); break
    case 'head': f.pr.head.sha = sha('9'); break
    case 'tag': f.context.tag += '-other'; break
    case 'seed': f.context.seedTree = sha('9'); break
    case 'attempt': f.run.run_attempt++; break
    case 'run': f.run.status = 'in_progress'; break
    case 'job': f.job.conclusion = 'skipped'; break
    case 'parent': f.responses.set(`${f.prefix}/git/commits/${f.pr.head.sha}`, { tree: { sha: f.finalTree.sha }, parents: [{ sha: f.context.seedCommit }, { sha: sha('9') }] }); break
    case 'extra-file': f.finalTree.tree.push({ path: 'extra', type: 'commit', mode: '160000', sha: sha('9') }); break
    case 'mode': f.finalTree.tree[0]!.mode = '100755'; break
    case 'truncated': f.baseTree.truncated = true; break
    case 'installed': f.baseTree.tree.push({ path: '.github/workflows/desktop-delivery-adopt.yml', type: 'blob', mode: '100644', sha: sha('9') }); break
    case 'base-lock': f.baseTree.tree.push(f.seedTree.tree[0]); break
    case 'lineage': f.responses.set(`${f.prefix}/compare/${f.context.baseCommit}...${f.context.seedCommit}`, { status: 'diverged' }); break
    case 'duplicate': f.inventory.push(f.pr); break
    case 'missing': f.inventory.splice(0); break
    case 'pagination': f.inventory.push(...Array.from({ length: 99 }, (_, i) => ({ ...f.pr, number: i + 100 }))); break
    case 'job-count': f.responses.set(`${f.prefix}/actions/runs/111/attempts/1/jobs?per_page=100&page=1`, { total_count: 2, jobs: [f.job] }); break
    case 'numeric-author': f.pr.user.id++; break
    case 'branch': f.pr.head.ref += '-wrong'; break
    case 'lock-lineage': {
      const bytes = f.setFile(f.pr.head.sha, f.config.sourceLockPath, { ...f.upstreamLock, schemaVersion: 2, adoptionSeed: { commit: sha('9'), tree: f.context.seedTree } })
      f.finalTree.tree[0]!.sha = gitBlob(bytes)
      break
    }
    case 'non-substantive': {
      const bytes = f.files.get(`${f.pr.head.sha}:${f.config.sourceLockPath}`)!
      f.setFile(f.context.seedCommit, f.config.sourceLockPath, bytes)
      f.seedTree.tree[0]!.sha = gitBlob(bytes)
      break
    }
    case 'api': f.responses.delete(`${f.prefix}/rulesets/999`); break
  }
  await expect(legacyBaseline(f.config, f.lockPath, f.root, f.api, f.context)).rejects.toThrow()
})

async function successor() {
  const f = await fixture()
  const baseline = await legacyBaseline(f.config, f.lockPath, f.root, f.api, f.context)
  const report = await migrationPreflight(f.config, f.api, f.admin)
  const configPath = '.github/desktop-delivery/config.json'
  const migrationPath = '.github/desktop-delivery/migration-report.json'
  const baselineBytes = JSON.stringify(baseline)
  const reportBytes = JSON.stringify(report)
  const activation = { active: true, repositoryId: f.config.repositoryId, botId: f.config.botId,
    baselineDigest: digest(baselineBytes), migrationReportDigest: digest(reportBytes), configDigest: digest(JSON.stringify(f.config)),
    protectionIds: [f.config.mainRulesetId, f.config.tagCreationRulesetId, f.config.tagImmutabilityRulesetId] }
  const next = { ...f.context, seedCommit: sha('2'), seedTree: sha('3'), tag: `${f.config.bootstrapTagPrefix}two`, runId: 333 }
  const nextHead = sha('4')
  const oldLock = object(JSON.parse(f.files.get(`${f.pr.head.sha}:${f.config.sourceLockPath}`)!.toString()) as unknown)
  const seedBytes = f.setFile(next.seedCommit, f.config.sourceLockPath, oldLock)
  const headBytes = f.setFile(nextHead, f.config.sourceLockPath, { ...oldLock,
    adoptionSeed: { commit: next.seedCommit, tree: next.seedTree } })
  const leaf = (bytes: Buffer) => ({ path: f.config.sourceLockPath, type: 'blob', mode: '100644', sha: gitBlob(bytes) })
  f.responses.set(`${f.prefix}/git/trees/${next.seedTree}?recursive=1`, { sha: next.seedTree, truncated: false, tree: [leaf(seedBytes)] })
  f.responses.set(`${f.prefix}/git/trees/${sha('5')}?recursive=1`, { sha: sha('5'), truncated: false, tree: [leaf(headBytes)] })
  f.responses.set(`${f.prefix}/git/commits/${next.seedCommit}`, { tree: { sha: next.seedTree } })
  f.responses.set(`${f.prefix}/git/commits/${nextHead}`, { tree: { sha: sha('5') }, parents: [{ sha: next.seedCommit }] })
  f.responses.set(`${f.prefix}/git/ref/heads/${f.pr.head.ref}`, { object: { type: 'commit', sha: nextHead } })
  f.pr.head.sha = nextHead
  f.responses.set(`${f.prefix}/compare/${f.upstreamLock.release.commit}...${nextHead}`, { status: 'ahead' })
  f.responses.set(`${f.prefix}/git/ref/tags/${next.tag}`, { object: { type: 'commit', sha: next.seedCommit } })
  f.responses.set(`${f.prefix}/actions/runs/333/attempts/1`, { ...f.run, id: 333, head_sha: next.seedCommit, head_branch: next.tag })
  f.responses.set(`${f.prefix}/actions/runs/333/attempts/1/jobs?per_page=100&page=1`, { total_count: 1, jobs: [{ ...f.job, run_id: 333, head_sha: next.seedCommit }] })
  for (const ancestor of [next.baseCommit, f.upstreamLock.release.commit])
    f.responses.set(`${f.prefix}/compare/${ancestor}...${next.seedCommit}`, { status: 'ahead' })
  for (const [path, bytes] of Object.entries(f.protection.files)) f.setFile(next.seedCommit, path, bytes)
  const retained = { [configPath]: JSON.stringify(f.config), [f.config.baselinePath]: baselineBytes,
    [migrationPath]: reportBytes, [f.config.activationPath]: JSON.stringify(activation) }
  for (const [path, bytes] of Object.entries(retained)) {
    mkdirSync(dirname(join(f.root, path)), { recursive: true })
    writeFileSync(join(f.root, path), bytes)
    f.setFile(nextHead, path, bytes)
  }
  const check = () => bootstrapInstallationCheck(f.config, f.root, configPath, migrationPath, f.lockPath, f.root, next, f.admin, f.api)
  return { ...f, next, nextHead, baselineBytes, reportBytes, configPath, migrationPath, check }
}

it('validates a successor using unchanged prior evidence and keeps historical activation readable after installation', async () => {
  const f = await successor()
  Object.assign(f.published.assets[0]!, { download_count: 22 })
  const result = await f.check()
  expect(result.finalHead).toBe(f.nextHead)
  expect(result.state).toBe('installation-verified')
  expect(readFileSync(join(f.root, f.config.baselinePath), 'utf8')).toBe(f.baselineBytes)
  f.baseTree.tree.push({ path: '.github/workflows/desktop-delivery-adopt.yml', type: 'blob', mode: '100644', sha: sha('9') })
  await expect(f.check()).rejects.toThrow('installed')
  await expect(requireActivation(f.config, join(f.root, f.config.activationPath), join(f.root, f.migrationPath),
    f.api, join(f.root, f.config.baselinePath))).resolves.toMatchObject({ active: true })
})

it.each(['embedded', 'assets', 'controls', 'legacy', 'pending', 'head', 'administrator', 'asset-bytes', 'release-body'])('blocks successor %s movement', async (failure) => {
  const f = await successor()
  if (failure === 'embedded') f.setFile(f.nextHead, f.config.baselinePath, '{}')
  if (failure === 'asset-bytes') f.responses.set(`${f.prefix}/releases/assets/1`, new Uint8Array(Buffer.from('bad')))
  if (failure === 'release-body') f.published.body += ' changed'
  if (failure === 'assets') f.published.assets[0]!.id++
  if (failure === 'controls') f.mainRules.updated_at = '2026-01-02T00:00:00Z'
  if (failure === 'legacy') f.workflows[0]!.state = 'active'
  if (failure === 'pending') f.inventory.push({ ...f.pr, number: 68 })
  if (failure === 'head') f.pr.head.sha = sha('9')
  if (failure === 'administrator') f.admin.outstandingAuthorityRevoked = false
  await expect(f.check()).rejects.toThrow()
})

it('CLI accepts explicit context, emits final evidence and reports rejected bootstrap jobs', async () => {
  const f = await successor()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).replace('https://api.github.com', '')
    const value = await f.api.request('GET', path)
    return new Response(value instanceof Uint8Array ? Buffer.from(value) : JSON.stringify(value), { status: 200 })
  })
  const contextPath = join(f.root, 'context.json'); writeFileSync(contextPath, JSON.stringify(f.next))
  const adminPath = join(f.root, 'admin.json'); writeFileSync(adminPath, JSON.stringify(f.admin))
  const out = join(f.root, 'out.json')
  const args = ['bootstrap-installation-check', '--config', join(f.root, f.configPath), '--root', f.root, '--migration-report', f.migrationPath, '--lock', f.lockPath, '--bundle', f.root, '--bootstrap-context', contextPath, '--admin-evidence', adminPath, '--out', out]
  expect(await main(args)).toBe(0)
  const jobsPath = `${f.prefix}/actions/runs/333/attempts/1/jobs?per_page=100&page=1`
  f.responses.set(jobsPath, { total_count: 1, jobs: [{ ...f.job, name: 'bootstrap-probe', run_id: 333, head_sha: f.next.seedCommit }] })
  expect(await main(args)).toBe(1)
  expect(readFileSync(out, 'utf8')).toContain('finalization job did not succeed')
})
