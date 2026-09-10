/** Live sole-writer/protection inspection and reviewed import of actual legacy release bytes. */
import { installationRecord, validateBootstrapInstallation } from './bootstrap-installation.ts'
import { rulesetTime } from './ruleset-time.ts'
import { readFileSync, statSync } from 'node:fs'
import { assetPath, digest, hex, object, readJson, sourceLock, string, textField } from './evidence.ts'
import { optional, pages, type DeliveryConfig, type GitHub } from './operations.ts'

/** Resolve a lightweight or annotated immutable tag to its commit.
 * @param config - repository.
 * @param tag - exact desktop release tag.
 * @param api - GitHub reads.
 * @returns Resolved commit or undefined when the tag does not exist.
 */
export async function tagCommit(config: DeliveryConfig, tag: string, api: GitHub): Promise<string | undefined> {
  const ref = await optional(api, `/repos/${config.repository}/git/ref/tags/${encodeURIComponent(tag)}`)
  if (ref === undefined) return undefined
  let target = object(ref.object)
  for (let depth = 0; target.type === 'tag' && depth < 5; depth++) target = object(object(await api.request('GET', `/repos/${config.repository}/git/tags/${hex(target.sha, 40)}`)).object)
  if (target.type !== 'commit') throw new Error('Tag did not resolve to a commit')
  return hex(target.sha, 40)
}

/** Import exact downloaded legacy assets without inventing historical qualification.
 * @param config - owning distribution.
 * @param lockPath - reviewed last-completed upstream identity.
 * @param directory - downloaded legacy files.
 * @param api - live release and tag reads.
 * @param bootstrap - optional explicit completed installation context.
 * @returns Reviewed-baseline candidate including outstanding adoption blockers.
 */
export async function legacyBaseline(config: DeliveryConfig,
  lockPath: string,
  directory: string,
  api: GitHub,
  bootstrap?: unknown): Promise<Record<string, unknown>> {
  const installation = bootstrap === undefined ? undefined : await validateBootstrapInstallation(config, bootstrap, api)
  const lock = sourceLock(readJson(lockPath), config)
  const releases = await pages(api, `/repos/${config.repository}/releases`)
  const latest = releases.filter(item => item.draft === false && String(item.tag_name).startsWith('desktop-v')).sort((a, b) => string(b.published_at).localeCompare(string(a.published_at)))[0]
  if (latest === undefined || latest.prerelease !== true) throw new Error('No unsigned legacy release baseline')
  const tag = string(latest.tag_name)
  const commit = await tagCommit(config, tag, api)
  if (commit === undefined) throw new Error('Legacy baseline tag is missing')
  const body = textField(latest.body)
  if (!body.includes(lock.release.tag) || !body.includes(lock.release.commit) || !body.includes(commit) || !body.includes('unsigned-preview')) throw new Error('Legacy release source provenance does not match supplied upstream identity')
  const ancestry = object(await api.request('GET', `/repos/${config.repository}/compare/${lock.release.commit}...${commit}`))
  if (ancestry.status !== 'ahead' && ancestry.status !== 'identical') throw new Error('Legacy source does not retain upstream ancestry')
  const checksumPath = assetPath(directory, 'SHA256SUMS.txt')
  const sums = new Map<string, string>()
  for (const line of readFileSync(checksumPath, 'utf8').trim().split(/\r?\n/u)) {
    const match = /^([a-f0-9]{64})\s+\*?((?:bundle\/)?[A-Za-z0-9][A-Za-z0-9._-]*)$/u.exec(line)
    if (match?.[1] === undefined || match[2] === undefined) throw new Error('Unsafe or malformed legacy checksum entry')
    const name = match[2].replace(/^bundle\//u, '')
    if (sums.has(name)) throw new Error('Duplicate legacy checksum asset')
    sums.set(name, match[1])
  }
  if (!Array.isArray(latest.assets) || latest.assets.length !== config.architectures.length + 1 || sums.size !== config.architectures.length) throw new Error('Incomplete legacy asset set')
  const assets = latest.assets.map((value) => {
    const remote = object(value)
    const name = string(remote.name)
    const path = assetPath(directory, name)
    const sha256 = digest(readFileSync(path))
    if (statSync(path).size !== remote.size || (name !== 'SHA256SUMS.txt' && sums.get(name) !== sha256)) throw new Error('Legacy artifact checksum or size mismatch')
    return { name, size: statSync(path).size, sha256, githubAssetId: remote.id }
  })
  for (const arch of config.architectures) if (assets.filter(asset => asset.name.endsWith(`-${arch}.dmg`)).length !== 1) throw new Error('Legacy architecture missing')
  const pending: Record<string, unknown>[] = []
  const inventory = await pages(api, `/repos/${config.repository}/pulls?state=open&base=${config.defaultBranch}`)
  const numbers = inventory.map(pr => pr.number)
  if (numbers.some(number => !Number.isSafeInteger(number) || Number(number) < 1) || new Set(numbers).size !== numbers.length) throw new Error('Incomplete or duplicate pending adoption inventory')
  if (installation !== undefined && inventory.filter(pr => pr.number === installation.record.context.pullRequest).length !== 1) throw new Error('Bootstrap installation PR is missing from pending inventory')
  for (const pr of inventory) {
    if (installation !== undefined && pr.number === installation.record.context.pullRequest) {
      if (object(pr.head).sha !== installation.record.observedHead) throw new Error('Bootstrap installation head changed during inventory')
      continue
    }
    const head = object(pr.head)
    if (object(head.repo).full_name !== config.repository) continue
    const branch = string(head.ref)
    const legacyTag = branch.startsWith(`automation/adopt/${config.tagPrefix}`) ? branch.slice('automation/adopt/'.length) : undefined
    const replacement = /^desktop-adopt\/(\d+)-[a-f0-9]{12}$/u.exec(branch)
    if (legacyTag === undefined && replacement === null) continue
    const upstreamRelease = object(await api.request('GET', `/repos/${config.upstreamRepository}/releases/${legacyTag === undefined ? string(replacement?.[1]) : `tags/${encodeURIComponent(legacyTag)}`}`))
    const upstreamTag = string(upstreamRelease.tag_name)
    const upstreamCommit = await tagCommit({ ...config, repository: config.upstreamRepository }, upstreamTag, api)
    if (upstreamCommit === undefined) throw new Error('Pending adoption upstream tag is missing')
    const relation = object(await api.request('GET', `/repos/${config.repository}/compare/${upstreamCommit}...${hex(head.sha, 40)}`))
    if (relation.status !== 'ahead' && relation.status !== 'identical') throw new Error('Pending adoption branch lacks its upstream ancestry')
    pending.push({ number: pr.number, head: head.sha, branch, upstreamTag, upstreamCommit, url: pr.html_url })
  }
  return { schemaVersion: 1, purpose: 'desktop-legacy-baseline', repository: config.repository, repositoryId: config.repositoryId, upstream: lock.release, desktopTag: tag, sourceCommit: commit, assets, releaseId: latest.id, releaseMetadataDigest: digest(JSON.stringify(latest)), evidenceReferences: [`https://github.com/${config.repository}/releases/tag/${tag}`], unresolvedAdoption: pending, ...(installation === undefined ? {} : { bootstrapInstallation: installation.record, releaseBodyDigest: digest(body), releasePublishedAt: string(latest.published_at) }) }
}

/** Inspect all required visible controls and require explicit administrator revocation evidence.
 * @param config - exact expected IDs and workflow inventory.
 * @param api - GitHub reads.
 * @param admin - administrator-owned evidence for permissions unavailable to the runtime token.
 * @returns Non-authorizing migration report with exact blockers.
 */
export async function migrationPreflight(config: DeliveryConfig,
  api: GitHub,
  admin?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const blockers: string[] = []
  const observed: Record<string, unknown> = {}
  const read = async (name: string, path: string): Promise<Record<string, unknown> | undefined> => {
    try { const value = object(await api.request('GET', path)); observed[name] = value; return value }
    catch { blockers.push(`Cannot inspect ${name}: ${path}`); return undefined }
  }
  const base = `/repos/${config.repository}`
  const administrator = await read('administrator', '/user')
  if (!config.maintainerIds.includes(Number(administrator?.id))) blockers.push('Preflight requires the configured administrator identity')
  const repo = await read('repository', base)
  if (repo?.id !== config.repositoryId || repo.default_branch !== config.defaultBranch) blockers.push('Repository/default-branch identity mismatch')
  for (const [kind, id] of [['main', config.mainRulesetId], ['creation', config.tagCreationRulesetId], ['immutable', config.tagImmutabilityRulesetId]] as const) {
    const rule = await read(`${kind}-rules`, `${base}/rulesets/${String(id)}`)
    const rules = Array.isArray(rule?.rules) ? rule.rules.map(object) : []
    const condition = rule?.conditions === undefined ? {} : object(object(rule.conditions).ref_name)
    const expectedRef = kind === 'main' ? `refs/heads/${config.defaultBranch}` : 'refs/tags/desktop-v*'
    const includes = condition.include
    if (rule?.target !== (kind === 'main' ? 'branch' : 'tag') || !Array.isArray(includes)
      || !includes.some(value => value === expectedRef || (kind === 'main' && value === '~DEFAULT_BRANCH'))
      || !Array.isArray(condition.exclude) || condition.exclude.length !== 0) blockers.push(`${kind} ruleset no longer covers its required refs`)
    if (rule?.enforcement !== 'active') blockers.push(`${kind} ruleset is not active`)
    if (!Array.isArray(rule?.bypass_actors)) blockers.push(`${kind} administrator bypass evidence is missing`)
    if (rule?.id !== id || typeof rule.updated_at !== 'string') blockers.push(`${kind} ruleset identity or update timestamp is missing`)
    const bypass = Array.isArray(rule?.bypass_actors) ? rule.bypass_actors.map(object) : []
    if (bypass.some(actor => actor.actor_type === 'Integration')) blockers.push(`${kind} ruleset retains App bypass authority`)
    if (kind === 'main') {
      const pr = rules.find(item => item.type === 'pull_request')
      const parameters = pr === undefined ? {} : object(pr.parameters)
      if (Number(parameters.required_approving_review_count) < 1 || parameters.require_last_push_approval !== true || parameters.dismiss_stale_reviews_on_push !== true) blockers.push('Main requires approving review, stale-review dismissal and last-push approval')
      const status = rules.find(item => item.type === 'required_status_checks')
      const checks = status === undefined ? [] : object(status.parameters).required_status_checks
      if (!Array.isArray(checks) || config.requiredChecks.some(name => !checks.some(item => object(item).context === name))) blockers.push('Required main status checks are missing')
      if (bypass.length !== 0) blockers.push('Main retains bypass actors')
    } else if (kind === 'creation') {
      if (!rules.some(item => item.type === 'creation') || bypass.length !== 1 || !bypass.some(item => item.actor_type === 'RepositoryRole' && item.actor_id === 2 && item.bypass_mode === 'always')) blockers.push('Maintainer-only tag creation authority is missing')
    } else if (bypass.length !== 0 || !['update', 'deletion'].every(type => rules.some(item => item.type === type))) blockers.push('Tag update/deletion protection is incomplete or bypassable')
  }
  const env = await read('release-environment', `${base}/environments/${encodeURIComponent(config.releaseEnvironment)}`)
  const protections = Array.isArray(env?.protection_rules) ? env.protection_rules.map(object) : []
  const reviewers = protections.find(item => item.type === 'required_reviewers')
  const identities = Array.isArray(reviewers?.reviewers) ? reviewers.reviewers.map(item => object(object(item).reviewer).id) : []
  if (identities.length === 0 || identities.some(id => !config.maintainerIds.includes(Number(id)))) blockers.push('Release environment has no required maintainer reviewer')
  if (reviewers?.prevent_self_review === true) blockers.push('Single-maintainer environment prevents the approved owner review flow')
  if (env?.deployment_branch_policy === null || env?.deployment_branch_policy === undefined || object(env.deployment_branch_policy).protected_branches !== true) blockers.push('Release environment is not restricted to protected branches')
  const permissions = await read('actions-permissions', `${base}/actions/permissions/workflow`)
  if (permissions?.default_workflow_permissions !== 'read' || permissions.can_approve_pull_request_reviews !== true) blockers.push('Actions PR creation must be enabled while default permissions remain read-only')
  try {
    const workflows = await pages(api, `${base}/actions/workflows`, 'workflows')
    observed.workflows = workflows
    for (const path of config.legacyWorkflows) {
      const workflow = workflows.find(item => item.path === path)
      if (workflow === undefined || !['disabled_manually', 'disabled_inactivity'].includes(String(workflow.state))) blockers.push(`Legacy entry point is not disabled: ${path}`)
      if (workflow !== undefined) {
        const runs = await pages(api, `${base}/actions/workflows/${String(workflow.id)}/runs`, 'workflow_runs')
        if (runs.some(run => run.status !== 'completed')) blockers.push(`Legacy jobs remain outstanding: ${path}`)
      }
    }
  } catch { blockers.push('Legacy workflow/run inventory is incomplete') }
  let draftAccessVerified = false
  if (admin?.draftAccessProbe !== undefined) {
    try {
      const probe = object(admin.draftAccessProbe)
      const identity = object(probe.workflow)
      const run = object(await api.request('GET', `${base}/actions/runs/${String(identity.runId)}`))
      draftAccessVerified = probe.schemaVersion === 1 && probe.operation === 'bootstrap-probe' && probe.state === 'draft-access-verified'
        && probe.repositoryId === config.repositoryId && probe.repository === config.repository
        && string(probe.tag).startsWith(config.bootstrapTagPrefix)
        && probe.uploaded === true && probe.deleted === true && probe.bodyRestored === true && probe.remainedDraft === true
        && typeof probe.downloadedDigest === 'string' && probe.downloadedDigest === digest('Desktop delivery draft access probe. No application payload.\n')
        && JSON.stringify(probe.tokenPermissions) === JSON.stringify({ contents: 'write', issues: 'write', actions: 'read' })
        && run.event === 'workflow_dispatch' && run.head_branch === probe.tag && run.path === '.github/workflows/desktop-ci.yml' && run.head_sha === identity.commit && run.head_sha === probe.commit
        && run.run_attempt === identity.attempt && run.status === 'completed' && run.conclusion === 'success' && object(run.repository).id === config.repositoryId
    } catch { draftAccessVerified = false }
  }
  if (admin?.schemaVersion !== 1 || admin.repositoryId !== config.repositoryId || !Array.isArray(admin.revokedAppIds) || config.legacyAppIds.some(id => !(admin.revokedAppIds as unknown[]).includes(id)) || !Array.isArray(admin.revocationEvidence) || admin.revocationEvidence.length === 0 || admin.outstandingAuthorityRevoked !== true || admin.delayedCallbacksDisabled !== true || admin.botReviewEligibilityVerified !== true || !draftAccessVerified) blockers.push('Administrator revocation, delayed-callback, bot-review and prepared-draft access evidence is missing')
  const observedAt = new Date().toISOString()
  const attestations = [
    { check: 'actions-permissions', resource: `${base}/actions/permissions/workflow`, values: permissions ?? null },
    ...(['main', 'creation', 'immutable'] as const).map((kind) => { const rule = observed[`${kind}-rules`]; return { check: 'ruleset-bypass', resource: rule === undefined ? null : object(rule).id, values: rule === undefined ? null : { visible: visibleRules(object(rule)), bypass_actors: object(rule).bypass_actors ?? null } } }),
    { check: 'legacy-administrator-evidence', resource: config.repository, values: admin ?? null },
  ].map(item => ({ ...item,
    repositoryId: config.repositoryId,
    observedAt,
    administratorId: administrator?.id ?? null,
    evidenceDigest: digest(JSON.stringify(item.values)) }))
  return { preparedDraftTokenAccessVerified: draftAccessVerified, configDigest: digest(JSON.stringify(config)), attestations, schemaVersion: 1, purpose: 'desktop-delivery-migration', repositoryId: config.repositoryId, distribution: config.id, state: blockers.length === 0 ? 'controls-verified' : 'blocked', blockers, observed, administratorEvidence: admin ?? null, adminEvidenceDigest: admin === undefined ? null : digest(JSON.stringify(admin)), nextAction: blockers.length === 0 ? 'Review baseline and this exact report before enabling activation.' : 'Resolve each live protection and sole-writer blocker; writers remain inactive.' }
}

/** Require reviewed activation plus fresh live controls before any automated writer.
 * @param config - expected repository and protection identities.
 * @param activationPath - reviewed local activation record.
 * @param migrationPath - exact reviewed migration report.
 * @param api - fresh GitHub reads.
 * @param baselinePath - local retained baseline path, defaulting to configuration.
 * @returns Validated activation fields.
 */
export async function requireActivation(config: DeliveryConfig,
  activationPath: string,
  migrationPath: string,
  api: GitHub,
  baselinePath = config.baselinePath): Promise<Record<string, unknown>> {
  const activation = object(readJson(activationPath))
  const report = object(readJson(migrationPath))
  if (activation.active !== true || activation.repositoryId !== config.repositoryId || activation.botId !== config.botId) throw new Error('Delivery writers are inactive')
  if (activation.migrationReportDigest !== digest(readFileSync(migrationPath)) || report.state !== 'controls-verified') throw new Error('Activation migration report does not match')
  hex(activation.baselineDigest)
  if (digest(readFileSync(baselinePath)) !== activation.baselineDigest) throw new Error('Activated baseline bytes differ')
  const baseline = object(readJson(baselinePath))
  if (baseline.purpose !== 'desktop-legacy-baseline' || baseline.repositoryId !== config.repositoryId || baseline.repository !== config.repository
    || !Array.isArray(baseline.unresolvedAdoption) || baseline.unresolvedAdoption.length !== 0) throw new Error('Activated baseline has unresolved adoption or identity mismatch')
  if (baseline.bootstrapInstallation !== undefined) installationRecord(baseline.bootstrapInstallation, config)
  if (JSON.stringify(activation.protectionIds) !== JSON.stringify([config.mainRulesetId, config.tagCreationRulesetId, config.tagImmutabilityRulesetId])) throw new Error('Activation protection IDs changed')
  if (activation.configDigest !== digest(JSON.stringify(config)) || report.configDigest !== activation.configDigest) throw new Error('Activation distribution configuration changed')
  const attestations = Array.isArray(report.attestations) ? report.attestations.map(object) : []
  const attested = (check: string, resource: unknown): Record<string, unknown> => {
    const matches = attestations.filter(item => item.check === check && item.resource === resource)
    const entry = matches[0]
    if (matches.length !== 1 || entry === undefined || entry.repositoryId !== config.repositoryId
      || !config.maintainerIds.includes(Number(entry.administratorId))
      || typeof entry.observedAt !== 'string' || !Number.isFinite(Date.parse(entry.observedAt)) || entry.evidenceDigest !== digest(JSON.stringify(entry.values))) throw new Error('Missing or altered administrator attestation')
    return object(entry.values)
  }
  const permissionsPath = `/repos/${config.repository}/actions/permissions/workflow`
  const permissions = attested('actions-permissions', permissionsPath)
  const administratorEvidence = attested('legacy-administrator-evidence', config.repository)
  if (JSON.stringify(administratorEvidence) !== JSON.stringify(report.administratorEvidence)) throw new Error('Administrator evidence does not match report')
  const runtime: GitHub = { async request(method, path, body) {
    if (method !== 'GET') throw new Error('Runtime control verification is read-only')
    if (path === permissionsPath) return permissions
    if (path === '/user') return { id: object(attestations.find(item => item.check === 'actions-permissions')).administratorId }
    const response = await api.request(method, path, body)
    for (const id of [config.mainRulesetId, config.tagCreationRulesetId, config.tagImmutabilityRulesetId]) {
      if (path !== `/repos/${config.repository}/rulesets/${String(id)}`) continue
      const values = attested('ruleset-bypass', id)
      const current = object(response)
      if (JSON.stringify(visibleRules(current)) !== JSON.stringify(values.visible)) throw new Error('Runtime-visible ruleset fields changed')
      if (current.bypass_actors !== undefined && JSON.stringify(current.bypass_actors) !== JSON.stringify(values.bypass_actors)) throw new Error('Runtime bypass data conflicts with attestation')
      return { ...current, bypass_actors: values.bypass_actors }
    }
    return response
  } }
  const fresh = await migrationPreflight(config, runtime, administratorEvidence)
  if (fresh.state !== 'controls-verified') throw new Error(`Live activation controls blocked: ${JSON.stringify(fresh.blockers)}`)
  return activation
}

function visibleRules(rule: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(['id', 'target', 'enforcement', 'conditions', 'rules', 'updated_at'].map(key => [key, key === 'updated_at' ? rulesetTime(rule[key]) : rule[key]]))
}
