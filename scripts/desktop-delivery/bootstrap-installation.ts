/** Read-only identification of the initial bot installation, before ordinary delivery is installed. */
import { createHash } from 'node:crypto'
import { canonicalJson, seedBootstrapProtection, verifyBootstrapProtection } from './bootstrap-protection.ts'
import { verifyLegacy } from './bootstrap.ts'
import { digest, hex, object, sourceLock, string, textField, type SourceLock } from './evidence.ts'
import { tagCommit } from './migration.ts'
import { pages, type DeliveryConfig, type GitHub } from './operations.ts'

/** Explicit completed bootstrap invocation; no branch-name heuristic grants this classification. */
export interface BootstrapContext {
  schemaVersion: 1
  purpose: 'desktop-bootstrap-installation'
  repository: string
  repositoryId: number
  pullRequest: number
  baseBranch: string
  baseCommit: string
  tag: string
  seedCommit: string
  seedTree: string
  runId: number
  attempt: number
}

/** Parse the sole optional installation context, rejecting unknown fields and versions.
 * @param value - supplied JSON.
 * @param config - configured identities.
 * @returns Validated context.
 */
export function bootstrapContext(value: unknown, config: DeliveryConfig): BootstrapContext {
  const item = object(value)
  const keys = ['schemaVersion', 'purpose', 'repository', 'repositoryId', 'pullRequest', 'baseBranch', 'baseCommit', 'tag', 'seedCommit', 'seedTree', 'runId', 'attempt']
  if (Object.keys(item).length !== keys.length || keys.some(key => !Object.hasOwn(item, key))
    || item.schemaVersion !== 1 || item.purpose !== 'desktop-bootstrap-installation'
    || item.repository !== config.repository || item.repositoryId !== config.repositoryId || item.baseBranch !== config.defaultBranch
    || !['pullRequest', 'runId', 'attempt'].every(key => Number.isSafeInteger(item[key]) && Number(item[key]) > 0)
    || !string(item.tag).startsWith(config.bootstrapTagPrefix)) throw new Error('Invalid bootstrap installation context')
  return { schemaVersion: 1, purpose: 'desktop-bootstrap-installation', repository: config.repository, repositoryId: config.repositoryId,
    pullRequest: Number(item.pullRequest), baseBranch: config.defaultBranch, baseCommit: hex(item.baseCommit, 40), tag: string(item.tag),
    seedCommit: hex(item.seedCommit, 40), seedTree: hex(item.seedTree, 40), runId: Number(item.runId), attempt: Number(item.attempt) }
}

/** Validate historical baseline classification without consulting an already installed PR.
 * @param value - retained classification.
 * @param config - current distribution.
 * @returns Digest-bound historical identity.
 */
export function installationRecord(value: unknown, config: DeliveryConfig): {
  context: BootstrapContext
  contextDigest: string
  observedHead: string
} {
  const record = object(value)
  const context = bootstrapContext(record.context, config)
  if (Object.keys(record).sort().join(',') !== 'context,contextDigest,observedHead' || record.contextDigest !== digest(canonicalJson(context))) throw new Error('Bootstrap installation context digest differs')
  return { context, contextDigest: hex(record.contextDigest), observedHead: hex(record.observedHead, 40) }
}

/** Read exact commit-owned file bytes, refusing lookup failures and incomplete content.
 * @param config - repository.
 * @param api - read transport.
 * @param commit - exact commit.
 * @param path - repository-relative file.
 * @returns Verified Git blob bytes.
 */
export async function installationFile(config: DeliveryConfig, api: GitHub, commit: string, path: string): Promise<Buffer> {
  const file = object(await api.request('GET', `/repos/${config.repository}/contents/${path}?ref=${hex(commit, 40)}`))
  if (file.type !== 'file' || file.path !== path || file.encoding !== 'base64') throw new Error('Installation evidence file identity differs')
  const bytes = Buffer.from(textField(file.content), 'base64')
  const blob = createHash('sha1').update(`blob ${String(bytes.length)}\0`).update(bytes).digest('hex')
  if (file.sha !== blob || file.size !== bytes.length) throw new Error('Installation evidence blob is incomplete or changed')
  return bytes
}

async function completeTree(config: DeliveryConfig, api: GitHub, tree: string): Promise<Map<string, Record<string, unknown>>> {
  const response = object(await api.request('GET', `/repos/${config.repository}/git/trees/${hex(tree, 40)}?recursive=1`))
  if (response.sha !== tree || response.truncated !== false || !Array.isArray(response.tree)) throw new Error('Installation requires a complete exact Git tree')
  const entries = new Map<string, Record<string, unknown>>()
  for (const value of response.tree) {
    const entry = object(value)
    const path = string(entry.path)
    if (entries.has(path) || !['blob', 'tree', 'commit'].includes(string(entry.type)) || !/^(?:100644|100755|120000|040000|160000)$/u.test(string(entry.mode))) throw new Error('Invalid or duplicate installation tree entry')
    entries.set(path, { path, type: entry.type, mode: entry.mode, sha: hex(entry.sha, 40) })
  }
  return entries
}

/** Verify one completed bootstrap and its current substantive lock-only PR finalization.
 * @param config - expected distribution and protections.
 * @param value - explicit completed invocation context.
 * @param api - read-only GitHub transport.
 * @returns Classification plus retained source lineage for final-head comparison.
 */
export async function validateBootstrapInstallation(config: DeliveryConfig, value: unknown,
  api: GitHub): Promise<{ record: ReturnType<typeof installationRecord>; lock: SourceLock }> {
  const context = bootstrapContext(value, config)
  const base = `/repos/${config.repository}`
  const repository = object(await api.request('GET', base))
  if (repository.id !== config.repositoryId || repository.full_name !== config.repository || repository.default_branch !== config.defaultBranch) throw new Error('Bootstrap repository identity changed')
  const currentBase = object(object(await api.request('GET', `${base}/git/ref/heads/${config.defaultBranch}`)).object)
  if (currentBase.type !== 'commit' || currentBase.sha !== context.baseCommit) throw new Error('Bootstrap protected base changed')
  const baseMetadata = object(await api.request('GET', `${base}/git/commits/${context.baseCommit}`))
  const baseTree = await completeTree(config, api, hex(object(baseMetadata.tree).sha, 40))
  if ([config.sourceLockPath, ...['adopt', 'qualify', 'mutate', 'discover'].map(name => `.github/workflows/desktop-delivery-${name}.yml`)].some(path => baseTree.has(path))) throw new Error('Ordinary delivery is installed or base source lock exists')
  const pr = object(await api.request('GET', `${base}/pulls/${String(context.pullRequest)}`))
  const head = object(pr.head)
  const prBase = object(pr.base)
  const author = object(pr.user)
  const repositoryMatches = (value: unknown): boolean => {
    const item = object(value)
    return item.id === config.repositoryId && item.full_name === config.repository
  }
  if (pr.number !== context.pullRequest || pr.state !== 'open' || author.id !== config.botId || author.type !== 'Bot'
    || !repositoryMatches(head.repo) || !repositoryMatches(prBase.repo) || prBase.ref !== context.baseBranch || prBase.sha !== context.baseCommit) throw new Error('Bootstrap PR identity differs')
  const observedHead = hex(head.sha, 40)
  const branch = string(head.ref)
  const ref = object(object(await api.request('GET', `${base}/git/ref/heads/${branch}`)).object)
  if (ref.type !== 'commit' || ref.sha !== observedHead) throw new Error('Bootstrap PR head differs from live branch')
  if (await tagCommit(config, context.tag, api) !== context.seedCommit) throw new Error('Bootstrap immutable tag differs')
  const seed = object(await api.request('GET', `${base}/git/commits/${context.seedCommit}`))
  if (object(seed.tree).sha !== context.seedTree) throw new Error('Bootstrap seed tree differs')
  const protection = await seedBootstrapProtection(config, api, context.seedCommit)
  verifyBootstrapProtection(config, await api.request('GET', `${base}/rulesets/${String(config.bootstrapRulesetId)}`), protection.projection)
  const environment = object(await api.request('GET', `${base}/environments/${config.bootstrapEnvironment}`))
  const reviews = Array.isArray(environment.protection_rules) ? environment.protection_rules.map(object).filter(item => item.type === 'required_reviewers') : []
  if (reviews.length !== 1 || !Array.isArray(reviews[0]?.reviewers) || reviews[0].reviewers.length === 0
    || reviews[0].reviewers.some(value => !config.maintainerIds.includes(Number(object(object(value).reviewer).id)))) throw new Error('Bootstrap environment approval protection differs')
  const runPath = `${base}/actions/runs/${String(context.runId)}/attempts/${String(context.attempt)}`
  const run = object(await api.request('GET', runPath))
  if (run.id !== context.runId || run.run_attempt !== context.attempt || !repositoryMatches(run.repository)
    || run.event !== 'workflow_dispatch' || run.head_branch !== context.tag || run.head_sha !== context.seedCommit
    || run.path !== '.github/workflows/desktop-ci.yml' || run.status !== 'completed' || run.conclusion !== 'success') throw new Error('Completed bootstrap run identity differs')
  let totalJobs: number | undefined
  const jobs = await pages({ async request(method, path) {
    const response = object(await api.request(method, path))
    if (!Number.isSafeInteger(response.total_count) || Number(response.total_count) < 0
      || totalJobs !== undefined && totalJobs !== response.total_count) throw new Error('Incomplete bootstrap job inventory')
    totalJobs = Number(response.total_count)
    return response
  } }, `${runPath}/jobs`, 'jobs')
  if (jobs.length !== totalJobs) throw new Error('Incomplete bootstrap job inventory')
  const finalizers = jobs.filter(job => job.name === 'bootstrap')
  if (finalizers.length !== 1 || finalizers[0]?.run_id !== context.runId
    || finalizers[0].run_attempt !== context.attempt || finalizers[0].head_sha !== context.seedCommit
    || finalizers[0].status !== 'completed' || finalizers[0].conclusion !== 'success') throw new Error('Exact bootstrap finalization job did not succeed')
  const finalization = object(await api.request('GET', `${base}/git/commits/${observedHead}`))
  if (!Array.isArray(finalization.parents) || finalization.parents.length !== 1 || object(finalization.parents[0]).sha !== context.seedCommit) throw new Error('Bootstrap finalization requires the seed as sole parent')
  const seedTree = await completeTree(config, api, context.seedTree)
  const finalTree = await completeTree(config, api, hex(object(finalization.tree).sha, 40))
  const leaves = (tree: Map<string, Record<string, unknown>>): Map<string, Record<string, unknown>> =>
    new Map([...tree].filter(([, entry]) => entry.type !== 'tree'))
  const before = leaves(seedTree)
  const after = leaves(finalTree)
  const changed = [...new Set([...before.keys(), ...after.keys()])]
    .filter(path => canonicalJson(before.get(path) ?? null) !== canonicalJson(after.get(path) ?? null))
  if (changed.length !== 1 || changed[0] !== config.sourceLockPath || before.get(config.sourceLockPath)?.type !== 'blob'
    || after.get(config.sourceLockPath)?.type !== 'blob' || before.get(config.sourceLockPath)?.mode !== after.get(config.sourceLockPath)?.mode) throw new Error('Bootstrap finalization must substantively change only the source lock')
  for (const path of new Set([...seedTree.keys(), ...finalTree.keys()])) {
    const beforeEntry = seedTree.get(path)
    const afterEntry = finalTree.get(path)
    if (beforeEntry?.type !== 'tree' && afterEntry?.type !== 'tree') continue
    if (canonicalJson(beforeEntry ?? null) === canonicalJson(afterEntry ?? null)) continue
    if (!config.sourceLockPath.startsWith(`${path}/`) || beforeEntry?.type !== 'tree' || afterEntry?.type !== 'tree' || beforeEntry.mode !== afterEntry.mode) throw new Error('Bootstrap finalization changes another directory or mode')
  }
  const seedBytes = await installationFile(config, api, context.seedCommit, config.sourceLockPath)
  const finalBytes = await installationFile(config, api, observedHead, config.sourceLockPath)
  const blobSha = (bytes: Buffer): string => createHash('sha1').update(`blob ${String(bytes.length)}\0`).update(bytes).digest('hex')
  if (blobSha(seedBytes) !== before.get(config.sourceLockPath)?.sha || blobSha(finalBytes) !== after.get(config.sourceLockPath)?.sha) throw new Error('Source lock bytes differ from complete trees')
  const seedLock = sourceLock(JSON.parse(seedBytes.toString()) as unknown, config)
  const lock = sourceLock(JSON.parse(finalBytes.toString()) as unknown, config)
  if (lock.schemaVersion !== 2 || lock.adoptionSeed?.commit !== context.seedCommit || lock.adoptionSeed.tree !== context.seedTree
    || branch !== `desktop-adopt/${String(lock.release.id)}-${lock.release.commit.slice(0, 12)}`
    || canonicalJson({ ...seedLock, schemaVersion: 2, adoptionSeed: lock.adoptionSeed }) !== canonicalJson(lock)
    || canonicalJson(seedLock) === canonicalJson(lock)) throw new Error('Bootstrap finalization source lineage differs or is not substantive')
  const legacy = config.legacyAdoptionEvidence
  const legacyBytes = await installationFile(config, api, legacy.commit, legacy.path)
  if (digest(legacyBytes) !== legacy.digest) throw new Error('Pinned legacy adoption evidence changed')
  verifyLegacy(config, object(JSON.parse(legacyBytes.toString()) as unknown), lock)
  for (const ancestor of [context.baseCommit, lock.release.commit]) {
    const relation = object(await api.request('GET', `${base}/compare/${ancestor}...${context.seedCommit}`))
    if (!['ahead', 'identical'].includes(String(relation.status))) throw new Error('Bootstrap seed lost required ancestry')
  }
  return { record: { context, contextDigest: digest(canonicalJson(context)), observedHead }, lock }
}
