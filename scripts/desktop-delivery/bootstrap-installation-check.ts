/** External final-head evidence for first-merge activation; never writes repository or remote state. */
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { canonicalJson } from './bootstrap-protection.ts'
import { installationFile, installationRecord, validateBootstrapInstallation } from './bootstrap-installation.ts'
import { digest, object, readJson, sourceLock } from './evidence.ts'
import { legacyBaseline, migrationPreflight, requireActivation } from './migration.ts'
import { deliveryConfig, type DeliveryConfig, type GitHub } from './operations.ts'

/** Validate the completed successor against unchanged retained evidence and fresh administrator reads.
 * @param config - expected distribution.
 * @param root - reviewed evidence checkout.
 * @param configPath - reviewed configuration file inside root.
 * @param migrationPath - reviewed migration report inside root.
 * @param lockPath - legacy publication's source identity.
 * @param bundle - downloaded actual legacy assets.
 * @param context - completed successor bootstrap invocation.
 * @param administrator - current explicit administrator evidence.
 * @param api - read-only transport with administrator visibility.
 * @returns External observation binding the final head, evidence digests and observation time.
 */
export async function bootstrapInstallationCheck(config: DeliveryConfig, root: string, configPath: string, migrationPath: string,
  lockPath: string, bundle: string, context: unknown,
  administrator: Record<string, unknown>, api: GitHub): Promise<Record<string, unknown>> {
  const current = await validateBootstrapInstallation(config, context, api)
  const baselinePath = resolve(root, config.baselinePath)
  const baseline = object(readJson(baselinePath))
  const retained = installationRecord(baseline.bootstrapInstallation, config)
  for (const key of ['repository', 'repositoryId', 'pullRequest', 'baseBranch', 'baseCommit'] as const) {
    if (retained.context[key] !== current.record.context[key]) throw new Error('Successor installation identity differs from retained baseline')
  }
  const historicalBytes = await installationFile(config, api, retained.observedHead, config.sourceLockPath)
  const historical = sourceLock(JSON.parse(historicalBytes.toString()) as unknown, config)
  const lineage = (lock: ReturnType<typeof sourceLock>): unknown => ({
    release: lock.release, predecessor: lock.predecessor, observed: lock.observed,
  })
  if (canonicalJson(lineage(historical)) !== canonicalJson(lineage(current.lock))
    || historical.adoptionSeed?.commit !== retained.context.seedCommit || historical.adoptionSeed.tree !== retained.context.seedTree) throw new Error('Successor source lineage differs from retained installation')
  const paths = [configPath, config.baselinePath, migrationPath, config.activationPath]
  const evidenceDigests: Record<string, string> = {}
  for (const path of paths) {
    const local = resolve(root, path)
    const owned = relative(resolve(root), local)
    if (owned.startsWith('../') || owned === '..' || owned.startsWith('/')) throw new Error('Reviewed installation evidence must be inside root')
    const bytes = readFileSync(local)
    if (!bytes.equals(await installationFile(config, api, current.record.observedHead, owned))) throw new Error(`Final installation contains different reviewed evidence: ${owned}`)
    evidenceDigests[owned] = digest(bytes)
  }
  if (canonicalJson(deliveryConfig(resolve(root, configPath))) !== canonicalJson(config)) throw new Error('Reviewed installation configuration differs')
  const reportPath = resolve(root, migrationPath)
  const report = object(readJson(reportPath))
  if (canonicalJson(report.administratorEvidence) !== canonicalJson(administrator)) throw new Error('Administrator evidence changed; refresh retained migration report')
  await requireActivation(config, resolve(root, config.activationPath), reportPath, api, baselinePath)
  const freshControls = await migrationPreflight(config, api, administrator)
  if (freshControls.state !== 'controls-verified') throw new Error(`Final migration controls blocked: ${JSON.stringify(freshControls.blockers)}`)
  const attestations = (value: unknown): unknown => {
    if (!Array.isArray(value)) throw new Error('Missing migration attestations')
    return value.map((item) => {
      const entry = object(item)
      return { check: entry.check, resource: entry.resource, values: entry.values }
    })
  }
  if (canonicalJson(attestations(report.attestations)) !== canonicalJson(attestations(freshControls.attestations))) throw new Error('Migration controls changed; refresh retained report')
  const controls = (value: unknown): unknown => {
    const observed = object(value)
    const environment = object(observed['release-environment'])
    if (!Array.isArray(observed.workflows)) throw new Error('Missing legacy workflow inventory')
    return { environment: { protection_rules: environment.protection_rules,
      deployment_branch_policy: environment.deployment_branch_policy },
    workflows: observed.workflows.map(object).filter(item => config.legacyWorkflows.includes(String(item.path)))
      .map(item => ({ id: item.id, path: item.path, state: item.state })).sort((a, b) => String(a.path).localeCompare(String(b.path))) }
  }
  if (canonicalJson(controls(report.observed)) !== canonicalJson(controls(freshControls.observed))) throw new Error('Migration environment or legacy controls changed')
  const freshBaseline = await legacyBaseline(config, lockPath, bundle, api, context)
  if (object(freshBaseline.bootstrapInstallation).observedHead !== current.record.observedHead) throw new Error('Final installation head changed during inspection')
  const publication = (value: Record<string, unknown>): unknown => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'bootstrapInstallation' && key !== 'releaseMetadataDigest'))
  if (canonicalJson(publication(baseline)) !== canonicalJson(publication(freshBaseline))) throw new Error('Published baseline or pending adoption inventory changed')
  if (!Array.isArray(freshBaseline.assets)) throw new Error('Missing publication assets')
  for (const value of freshBaseline.assets) {
    const asset = object(value)
    const bytes = await api.request('DOWNLOAD', `/repos/${config.repository}/releases/assets/${String(asset.githubAssetId)}`)
    if (!(bytes instanceof Uint8Array) || bytes.length !== asset.size || digest(bytes) !== asset.sha256) throw new Error('Published asset bytes changed')
  }
  const finalPr = object(await api.request('GET', `/repos/${config.repository}/pulls/${String(current.record.context.pullRequest)}`))
  const finalBase = object(await api.request('GET', `/repos/${config.repository}/git/ref/heads/${config.defaultBranch}`))
  if (object(finalPr.head).sha !== current.record.observedHead || finalPr.state !== 'open'
    || object(finalBase.object).sha !== current.record.context.baseCommit) throw new Error('Installation head or base changed before evidence completion')
  return { schemaVersion: 1, purpose: 'desktop-bootstrap-installation-check', state: 'installation-verified',
    repository: config.repository, repositoryId: config.repositoryId, distribution: config.id,
    finalHead: current.record.observedHead, contextDigest: current.record.contextDigest, retainedContextDigest: retained.contextDigest,
    evidenceDigests, observedAt: new Date().toISOString(),
    nextAction: 'Review and check this exact final head. Any remote evidence change requires a fresh installation check before merge.' }
}
