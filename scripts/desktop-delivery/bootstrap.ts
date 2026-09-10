/** One-time installation of the reviewed finalizer from an owner-approved immutable snapshot. */
import { bootstrapProtectionPath, bootstrapResponsePath, checkedBootstrapProtection, seedBootstrapProtection, verifyBootstrapProtection } from './bootstrap-protection.ts'
import { execFileSync } from 'node:child_process'
import { applyAdoption, git } from './adoption.ts'
import { digest, hex, object, sourceLock, sameRelease, string, textField } from './evidence.ts'
import { tagCommit } from './migration.ts'
import { optional, operationPlan, type DeliveryConfig, type GitHub } from './operations.ts'

/** Verify immutable bootstrap authority, then reuse lock-only bot finalization.
 * @param config - repository and explicit bootstrap protection identities.
 * @param plan - exact reviewed seed and baseline.
 * @param api - environment-approved bot transport.
 * @param context - current workflow server identity.
 * @returns Bot-authored implementation PR without merging or publishing.
 */
export async function bootstrapAdoption(config: DeliveryConfig, plan: Record<string, unknown>, api: GitHub,
  context: { ref: string; commit: string; runId: string; attempt: string }): Promise<Record<string, unknown>> {
  if (config.bootstrapRulesetId === null) throw new Error('Bootstrap tag protection is not configured')
  if (!context.ref.startsWith(`refs/tags/${config.bootstrapTagPrefix}`) || context.commit !== plan.seed) throw new Error('Bootstrap ref differs from reviewed snapshot')
  const base = `/repos/${config.repository}`
  const repository = object(await api.request('GET', base))
  if (repository.id !== config.repositoryId) throw new Error('Bootstrap repository mismatch')
  if (await optional(api, `${base}/contents/.github/workflows/desktop-delivery-adopt.yml?ref=${config.defaultBranch}`) !== undefined) throw new Error('Normal finalizer is installed; bootstrap is disabled')
  if (object(object(await api.request('GET', `${base}/git/ref/heads/${config.defaultBranch}`)).object).sha !== plan.base) throw new Error('Bootstrap default baseline changed')
  if (await tagCommit(config, context.ref.slice('refs/tags/'.length), api) !== context.commit) throw new Error('Bootstrap immutable tag moved')
  await verifyBootstrapRun(config, api, context, hex(plan.bootstrapProtectionDigest))
  const branch = string(plan.branch)
  if (!/^desktop-adopt\/\d+-[a-f0-9]{12}$/u.test(branch)) throw new Error('Unexpected bootstrap branch')
  let seedLockDigest: string | undefined
  if (plan.baseLock !== undefined) {
    const absent = object(plan.baseLock)
    if (absent.state !== 'absent' || absent.baseCommit !== plan.base || absent.path !== config.sourceLockPath) throw new Error('Bootstrap absent-lock claim differs')
    const baseCommit = object(await api.request('GET', `${base}/git/commits/${hex(plan.base, 40)}`))
    const tree = object(await api.request('GET', `${base}/git/trees/${hex(object(baseCommit.tree).sha, 40)}?recursive=1`))
    if (tree.truncated !== false || !Array.isArray(tree.tree) || tree.tree.some(value => object(value).path === config.sourceLockPath)) throw new Error('Exact base tree does not prove source-lock absence')
    const seedFile = object(await api.request('GET', `${base}/contents/${config.sourceLockPath}?ref=${hex(plan.seed, 40)}`))
    const bytes = Buffer.from(textField(seedFile.content), 'base64')
    seedLockDigest = hex(plan.seedLockDigest)
    if (digest(bytes) !== seedLockDigest) throw new Error('Reviewed bootstrap seed lock changed')
    const seedLock = sourceLock(JSON.parse(bytes.toString()) as unknown, config)
    const proposed = sourceLock(plan.proposedLock, config)
    if (!sameRelease(seedLock.release, proposed.release) || JSON.stringify(seedLock.predecessor) !== JSON.stringify(proposed.predecessor)
      || JSON.stringify(seedLock.observed) !== JSON.stringify(proposed.observed)) throw new Error('Bootstrap finalization changes reviewed adoption identity')
    const legacy = object(plan.legacyEvidence)
    if (legacy.commit !== config.legacyAdoptionEvidence.commit || legacy.path !== config.legacyAdoptionEvidence.path || legacy.digest !== config.legacyAdoptionEvidence.digest) throw new Error('Bootstrap adoption evidence is not the configured pinned record')
    const evidence = object(await api.request('GET', `${base}/contents/${string(legacy.path)}?ref=${hex(legacy.commit, 40)}`))
    const evidenceBytes = Buffer.from(textField(evidence.content), 'base64')
    if (digest(evidenceBytes) !== hex(legacy.digest)) throw new Error('Pinned adoption evidence changed')
    verifyLegacy(config, object(JSON.parse(evidenceBytes.toString()) as unknown), seedLock)
  }
  const seedMetadata = object(await api.request('GET', `${base}/git/commits/${hex(plan.seed, 40)}`))
  if (object(seedMetadata.tree).sha !== plan.tree) throw new Error('Bootstrap seed tree changed')
  const relation = object(await api.request('GET', `${base}/compare/${hex(object(plan.upstream).commit, 40)}...${hex(plan.seed, 40)}`))
  if (!['ahead', 'identical'].includes(String(relation.status))) throw new Error('Bootstrap seed lost upstream ancestry')
  if (await optional(api, `${base}/git/ref/heads/${branch}`) === undefined) {
    try { await api.request('POST', `${base}/git/refs`, { ref: `refs/heads/${branch}`, sha: hex(plan.seed, 40) }) }
    catch (error) { if (object((await optional(api, `${base}/git/ref/heads/${branch}`))?.object).sha !== plan.seed) throw error }
  }
  return applyAdoption(config, plan, api, seedLockDigest)
}

/** Validate pinned legacy adoption identity shared by preparation and installation inspection.
 * @param config - expected upstream repository.
 * @param evidence - pinned legacy JSON.
 * @param lock - reviewed seed source identity.
 */
export function verifyLegacy(config: DeliveryConfig, evidence: Record<string, unknown>, lock: ReturnType<typeof sourceLock>): void {
  const adopted = object(evidence.schemaVersion === 2 ? evidence.lastPublishedRelease : evidence.lastAdoptedRelease)
  if (![1, 2].includes(Number(evidence.schemaVersion)) || evidence.upstreamRepository !== config.upstreamRepository
    || adopted.tag !== lock.release.tag || adopted.commit !== lock.release.commit || adopted.publishedAt !== lock.release.publishedAt) throw new Error('Pinned legacy adoption evidence does not match seed source')
}

/** Prepare an initial absent-lock plan from exact local Git objects, without writing remote state.
 * @param config - distribution.
 * @param root - local source object database.
 * @param base - exact protected-main bootstrap baseline.
 * @param seed - reviewed implementation snapshot.
 * @param legacyCommit - immutable adoption-evidence revision.
 * @param legacyPath - repository-relative legacy evidence file.
 * @returns Reviewable bot-finalization plan with explicit absence and seed-lock digests.
 */
export function bootstrapPlan(config: DeliveryConfig,
  root: string,
  base: string,
  seed: string,
  legacyCommit: string,
  legacyPath: string): Record<string,
  unknown> {
  hex(base, 40); hex(seed, 40); hex(legacyCommit, 40)
  if (legacyCommit !== config.legacyAdoptionEvidence.commit || legacyPath !== config.legacyAdoptionEvidence.path) throw new Error('Bootstrap adoption reference differs from configuration')
  if (!['.github/upstream-sync-state.json', 'state/upstream-adoption.json'].includes(legacyPath)) throw new Error('Unsupported pinned legacy adoption evidence path')
  if (git(root, ['ls-tree', '-r', '--name-only', base]).split('\n').includes(config.sourceLockPath)) throw new Error('Existing base lock requires ordinary preparation')
  git(root, ['merge-base', '--is-ancestor', base, seed])
  const bytes = execFileSync('git', ['show', `${seed}:${config.sourceLockPath}`], { cwd: root })
  const lock = sourceLock(JSON.parse(bytes.toString()) as unknown, config)
  git(root, ['merge-base', '--is-ancestor', lock.release.commit, seed])
  const evidence = execFileSync('git', ['show', `${legacyCommit}:${legacyPath}`], { cwd: root })
  if (digest(evidence) !== config.legacyAdoptionEvidence.digest) throw new Error('Configured adoption evidence bytes differ')
  verifyLegacy(config, object(JSON.parse(evidence.toString()) as unknown), lock)
  const protection = execFileSync('git', ['show', `${seed}:${bootstrapProtectionPath}`], { cwd: root })
  checkedBootstrapProtection(config, protection, execFileSync('git', ['show', `${seed}:${bootstrapResponsePath}`], { cwd: root }))
  const tree = git(root, ['rev-parse', `${seed}^{tree}`])
  const proposedLock = { ...lock, schemaVersion: 2, adoptionSeed: { commit: seed, tree } }
  return operationPlan(config, 'adoption-apply', { bootstrapProtectionDigest: digest(protection), base, seed, tree, branch: `desktop-adopt/${String(lock.release.id)}-${lock.release.commit.slice(0, 12)}`,
    upstream: lock.release, desktopVersion: 'bootstrap-source-only', proposedLock,
    baseLock: { state: 'absent', baseCommit: base, path: config.sourceLockPath }, seedLockDigest: digest(bytes),
    legacyEvidence: { commit: legacyCommit, path: legacyPath, digest: digest(evidence) },
    nextAction: 'Review this exact source-only bootstrap, configure immutable tag protection and approve the matching bootstrap environment run.' })
}

/** Require immutable tag protection and the approved bootstrap environment for this server run.
 * @param config - bootstrap protection and maintainer identities.
 * @param api - GitHub read adapter.
 * @param context - current immutable workflow invocation.
 * @param protectionDigest - approved seed attestation digest.
 */
export async function verifyBootstrapRun(config: DeliveryConfig, api: GitHub,
  context: { ref: string; commit: string; runId: string; attempt: string }, protectionDigest: string): Promise<void> {
  if (config.bootstrapRulesetId === null || !context.ref.startsWith(`refs/tags/${config.bootstrapTagPrefix}`)) throw new Error('Bootstrap immutable protection is not configured')
  const base = `/repos/${config.repository}`
  if (await optional(api, `${base}/contents/.github/workflows/desktop-delivery-adopt.yml?ref=${config.defaultBranch}`) !== undefined) throw new Error('Normal finalizer is installed; bootstrap is disabled')
  if (await tagCommit(config, context.ref.slice('refs/tags/'.length), api) !== context.commit) throw new Error('Bootstrap tag differs')
  const protection = await seedBootstrapProtection(config, api, context.commit)
  if (digest(protection.bytes) !== hex(protectionDigest)) throw new Error('Bootstrap approved protection digest differs')
  verifyBootstrapProtection(config, await api.request('GET', `${base}/rulesets/${String(config.bootstrapRulesetId)}`), protection.projection)
  const environment = object(await api.request('GET', `${base}/environments/${config.bootstrapEnvironment}`))
  const protections = Array.isArray(environment.protection_rules) ? environment.protection_rules.map(object) : []
  const review = protections.find(item => item.type === 'required_reviewers')
  if (!Array.isArray(review?.reviewers) || review.reviewers.length === 0 || review.reviewers.some(value => !config.maintainerIds.includes(Number(object(object(value).reviewer).id)))) throw new Error('Bootstrap environment requires configured maintainer approval')
  const run = object(await api.request('GET', `${base}/actions/runs/${context.runId}`))
  if (run.event !== 'workflow_dispatch' || run.head_branch !== context.ref.slice('refs/tags/'.length) || run.path !== '.github/workflows/desktop-ci.yml' || run.head_sha !== context.commit || String(run.run_attempt) !== context.attempt || run.status !== 'in_progress') throw new Error('Bootstrap workflow identity differs')
  const pending = await api.request('GET', `${base}/actions/runs/${context.runId}/pending_deployments`)
  if (!Array.isArray(pending) || pending.length !== 0) throw new Error('Bootstrap environment approval remains pending')
}
