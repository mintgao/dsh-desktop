/** Operational CLI entry points shared with the protected delivery workflows. */
import { bootstrapInstallationCheck } from './bootstrap-installation-check.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bootstrapResponsePath, prepareBootstrapProtection } from './bootstrap-protection.ts'
import { probePlan, probeDraft } from './probe.ts'
import { releaseFamily } from '../release/families.ts'
import { capture } from '../release/process.ts'
import { bootstrapAdoption, bootstrapPlan } from './bootstrap.ts'
import { releaseManifest } from './manifest.ts'
import { promotionPlan, preparePublication, mutateRelease, retainedBundle, verifyMutationApproval } from './publication.ts'
import { notificationPlan, applyNotification, releaseStatus } from './notifications.ts'
import { digest, object, readJson, string } from './evidence.ts'
import { adoptionPlan, prepareAdoption, applyAdoption } from './adoption.ts'
import { githubReleases } from './discovery.ts'
import { approvedPlan, deliveryConfig, github, operationPlan, type DeliveryConfig, type GitHub } from './operations.ts'
import { legacyBaseline, migrationPreflight, requireActivation } from './migration.ts'

/** Execute one reviewed operation, requiring explicit digest-bound apply for remote writes.
 * @param operation - selected CLI command.
 * @param values - parsed options.
 * @returns Local operation result.
 */
export async function reviewedCommand(operation: string, values: Record<string, unknown>): Promise<Record<string, unknown>> {
  const required = (name: string): string => string(values[name])
  const config = deliveryConfig(required('config'))
  const api = github(process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN)
  const root = resolve(typeof values.root === 'string' ? values.root : '.')
  if (operation === 'bootstrap-protection-prepare') {
    const prepared = await prepareBootstrapProtection(config, api)
    writeFileSync(resolve(root, bootstrapResponsePath), prepared.response)
    return prepared.attestation
  }
  if (operation === 'bootstrap-installation-check') return bootstrapInstallationCheck(config, root, required('config'), required('migration-report'), required('lock'), required('bundle'), readJson(required('bootstrap-context')), object(readJson(required('admin-evidence'))), api)
  if (operation === 'migration-preflight') {
    if (values['bootstrap-context'] !== undefined && typeof values.bundle !== 'string') throw new Error('Bootstrap classification requires the legacy asset bundle')
    const admin = typeof values['admin-evidence'] === 'string' ? object(readJson(values['admin-evidence'])) : undefined
    const report = await migrationPreflight(config, api, admin)
    if (typeof values.bundle === 'string') {
      const baseline = await legacyBaseline(config, required('lock'), values.bundle, api, typeof values['bootstrap-context'] === 'string' ? readJson(values['bootstrap-context']) : undefined)
      report.legacyBaseline = baseline
      if (typeof values['baseline-output'] === 'string') writeFileSync(values['baseline-output'], `${JSON.stringify(baseline, null, 2)}\n`)
      if (Array.isArray(baseline.unresolvedAdoption) && baseline.unresolvedAdoption.length > 0) {
        (report.blockers as string[]).push('Unresolved adoption must be reconciled before activation')
        report.state = 'blocked'
      }
    }
    return report
  }
  if (operation === 'adoption-plan') return adoptionPlan(config, root, required('lock'), typeof values.fixture === 'string' ? readJson(values.fixture) : { complete: true, releases: await githubReleases(config) }, required('base'), required('version'), api, required('kind'), typeof values.baseline === 'string' ? object(readJson(values.baseline)) : undefined)
  if (operation === 'adoption-prepare') {
    const plan = approvedPlan(required('plan'), required('digest'), operation, config)
    return prepareAdoption(config, root, plan, required('checkout'), (cwd, environment) => {
      for (const id of ['dsh', 'vendor']) { const family = releaseFamily(id); family.verifyVersions(family.members(cwd)) }
      capture('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], { cwd, env: environment })
      for (const name of ['check-workspace-constraints.ts', 'verify-package-dependencies.ts']) capture(process.execPath, ['--import', 'tsx', resolve(cwd, 'scripts', name)], { cwd, env: environment })
      return Promise.resolve()
    })
  }
  if (operation === 'bootstrap-probe-plan') return probePlan(config, Number(required('draft-id')), required('tag'), required('expected-commit'), api)
  if (operation === 'bootstrap-probe') {
    const plan = approvedPlan(required('plan'), required('digest'), operation, config)
    if (values.apply !== true) return plan
    if (process.env.GITHUB_REPOSITORY !== config.repository || process.env.GITHUB_WORKFLOW_REF !== `${config.repository}/.github/workflows/desktop-ci.yml@${string(process.env.GITHUB_REF)}`) throw new Error('Probe requires the existing bootstrap workflow')
    return probeDraft(config,
      plan,
      api,
      { ref: string(process.env.GITHUB_REF),
        commit: string(process.env.GITHUB_SHA),
        runId: string(process.env.GITHUB_RUN_ID),
        attempt: string(process.env.GITHUB_RUN_ATTEMPT) })
  }
  if (operation === 'bootstrap-plan') return bootstrapPlan(config, root, required('base'), required('expected-commit'), required('legacy-ref'), required('legacy-path'))
  if (operation === 'bootstrap-apply') {
    const plan = approvedPlan(required('plan'), required('digest'), 'adoption-apply', config)
    if (values.apply !== true) return plan
    if (process.env.GITHUB_REPOSITORY !== config.repository || process.env.GITHUB_WORKFLOW_REF !== `${config.repository}/.github/workflows/desktop-ci.yml@${string(process.env.GITHUB_REF)}`) throw new Error('Bootstrap requires the existing desktop CI workflow')
    return bootstrapAdoption(config,
      plan,
      api,
      { ref: string(process.env.GITHUB_REF),
        commit: string(process.env.GITHUB_SHA),
        runId: string(process.env.GITHUB_RUN_ID),
        attempt: string(process.env.GITHUB_RUN_ATTEMPT) })
  }
  if (operation === 'adoption-apply') {
    const plan = approvedPlan(required('plan'), required('digest'), operation, config)
    if (values.apply !== true) return plan
    await trustedWorkflow(config.repository, config.defaultBranch, 'adopt', api)
    await requireActivation(config, resolve(root, config.activationPath), required('migration-report'), api)
    return applyAdoption(config, plan, api)
  }
  if (operation === 'release-manifest') return releaseManifest(config, required('config'), {
    root, directory: required('directory'), candidatePath: required('candidate'), nativeNames: required('native').split(','),
    dmgNames: required('reports').split(','), version: required('version'), releaseKind: required('kind'),
    notesPath: required('notes'), compatibilityPath: required('compatibility'), predecessorPath: required('baseline'),
    run: { commit: required('workflow-commit'), id: Number(required('run-id')), attempt: Number(required('run-attempt')) },
  })
  if (operation === 'release-bundle') return retainedBundle(config, required('tag'), required('directory'), api, values.operation === 'withdraw')
  if (operation === 'promotion-plan') return promotionPlan(config, required('manifest'), required('directory'), required('operation'), {
    id: Number(required('run-id')), attempt: Number(required('run-attempt')), commit: required('workflow-commit'),
  }, api)
  if (operation === 'notification-plan') return notificationPlan(config, object(readJson(required('fixture'))), digest(readFileSync(required('lock'))), required('expected-commit'), required('run-url'))
  if (operation === 'prepare-publication' || ['promote', 'withdraw', 'restore'].includes(operation)) {
    const plan = approvedPlan(required('plan'), required('digest'), operation === 'prepare-publication' ? 'promote' : operation, config)
    if (values.apply !== true) return plan
    const activation = await requireActivation(config, resolve(root, config.activationPath), required('migration-report'), api)
    if (operation === 'prepare-publication') return preparePublication(config, plan, required('manifest'), required('directory'), api)
    await trustedWorkflow(config.repository, config.defaultBranch, 'mutate', api)
    const run = object(plan.mutationRun)
    if (String(run.id) !== process.env.GITHUB_RUN_ID || String(run.attempt) !== process.env.GITHUB_RUN_ATTEMPT || run.commit !== process.env.GITHUB_SHA) throw new Error('Approval belongs to another mutation run')
    return reviewedMutation(config, plan, required('manifest'), required('directory'), string(activation.baselineDigest), api)
  }
  if (operation === 'notification-apply') {
    const plan = object(readJson(required('plan')))
    if (values.apply !== true) return plan
    await trustedWorkflow(config.repository, config.defaultBranch, 'discover', api)
    const activation = object(readJson(resolve(root, config.activationPath)))
    if (activation.active !== true) return { ...plan, state: 'inactive', nextAction: 'Discovery is available; notification waits for reviewed activation.' }
    await requireActivation(config, resolve(root, config.activationPath), required('migration-report'), api)
    return applyNotification(config, plan, api)
  }
  throw new Error(`Unsupported reviewed delivery command: ${operation}`)
}

/** Render operational summaries with multiline blockers and no publication inference.
 * @param report - operational command result.
 * @returns Maintainer Markdown.
 */
export function reviewedSummary(report: Record<string, unknown>): string {
  const blockers = report.blockers ?? (report.blocker === undefined ? [] : [report.blocker])
  const identities = ['tag', 'desktopVersion', 'downstreamCommit', 'candidate', 'seed', 'pullRequest', 'manifestDigest', 'releaseId']
    .filter(key => report[key] !== undefined).map(key => `${key}: ${JSON.stringify(report[key])}`)
  if (report.upstream !== undefined) identities.push(`Upstream: ${JSON.stringify(report.upstream)}`)
  for (const key of ['workflow', 'mutationRun']) if (report[key] !== undefined) identities.push(`${key}: ${JSON.stringify(report[key])}`)
  const checks = ['bootstrap', 'backendHttp', 'backendStopped', 'mountedReadOnly', 'detached', 'copiedInstallation', 'installationStopped', 'installationRemoved']
    .filter(key => report[key] === true)
  return ['# Reviewed desktop delivery', '', `State: ${string(report.state ?? 'planned')}`, `Operation: ${string(report.operation ?? report.kind ?? report.purpose)}`, ...identities, `Completed checks: ${checks.length === 0 ? 'none recorded' : checks.join(', ')}`, `Qualification eligible: ${JSON.stringify(report.qualificationEligible ?? false)}`, `Report digest: ${digest(`${JSON.stringify(report, null, 2)}\n`)}`, '', `Blockers: ${JSON.stringify(blockers)}`, '', `Next action: ${typeof report.nextAction === 'string' ? report.nextAction : 'Review this exact local result before authorizing an operation.'}`, '', 'Local plans and shadow reports do not authorize publication. Live notification receipts require separate verification.', ''].join('\n')
}

async function trustedWorkflow(repository: string, branch: string, name: string, api: GitHub): Promise<void> {
  if (process.env.GITHUB_REF !== `refs/heads/${branch}` || process.env.GITHUB_REPOSITORY !== repository
    || process.env.GITHUB_WORKFLOW_REF !== `${repository}/.github/workflows/desktop-delivery-${name}.yml@refs/heads/${branch}`) throw new Error('Writer requires the trusted default-branch workflow')
  const run = object(await api.request('GET', `/repos/${repository}/actions/runs/${string(process.env.GITHUB_RUN_ID)}`))
  if (run.path !== `.github/workflows/desktop-delivery-${name}.yml` || run.head_branch !== branch || run.head_sha !== process.env.GITHUB_SHA
    || run.event !== 'workflow_dispatch' && !(name === 'discover' && run.event === 'schedule') || run.status !== 'in_progress'
    || String(run.run_attempt) !== process.env.GITHUB_RUN_ATTEMPT || object(run.repository).full_name !== repository) throw new Error('Writer server run differs from trusted orchestration')
}

/** Execute and report an already activated attempt only after exact protected approval is verified.
 * @param config - distribution with activation checked by the CLI.
 * @param plan - digest-approved mutation plan.
 * @param manifestPath - exact approved manifest.
 * @param directory - local payload or retained recovery files.
 * @param baselineDigest - activated publication baseline.
 * @param api - protected workflow transport.
 * @returns Success or blocked operation, with deduplicated release-specific status.
 */
export async function reviewedMutation(config: DeliveryConfig, plan: Record<string, unknown>, manifestPath: string,
  directory: string, baselineDigest: string, api: GitHub): Promise<Record<string, unknown>> {
  await verifyMutationApproval(config, plan, manifestPath, api)
  let result: Record<string, unknown>
  try { result = await mutateRelease(config, plan, manifestPath, directory, baselineDigest, api) }
  catch (error) {
    await verifyMutationApproval(config, plan, manifestPath, api)
    result = operationPlan(config, string(plan.operation), { state: 'blocked', tag: plan.tag, candidate: plan.candidate,
      manifestDigest: plan.manifestDigest, blocker: error instanceof Error ? error.message : 'Release mutation failed',
      nextAction: 'Inspect this exact release and blocker before approving recovery; conflicting assets were not overwritten.' })
  }
  await releaseStatus(config, result, api)
  return result
}
