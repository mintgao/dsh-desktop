/** Live-control predicates use explicit fixture API identities and deny missing administration evidence. */
import { expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { deliveryConfig, type GitHub } from '../operations.ts'
import { migrationPreflight, requireActivation } from '../migration.ts'
import { digest, object } from '../evidence.ts'
const config = deliveryConfig(resolve('.github/desktop-delivery/mint.json'))
const admin = { schemaVersion: 1, repositoryId: config.repositoryId, revokedAppIds: config.legacyAppIds, revocationEvidence: ['fixture administrator observation'], outstandingAuthorityRevoked: true, delayedCallbacksDisabled: true, botReviewEligibilityVerified: true, preparedDraftTokenAccessVerified: true, draftAccessProbe: { schemaVersion: 1, operation: 'bootstrap-probe', state: 'draft-access-verified', repository: config.repository, repositoryId: config.repositoryId, tag: `${config.bootstrapTagPrefix}fixture`, commit: 'a'.repeat(40), workflow: { commit: 'a'.repeat(40), runId: 123, attempt: 1 }, uploaded: true, deleted: true, bodyRestored: true, remainedDraft: true, downloadedDigest: digest('Desktop delivery draft access probe. No application payload.\n'), tokenPermissions: { contents: 'write', issues: 'write', actions: 'read' } } }
function controls() {
  const main = { id: config.mainRulesetId, updated_at: '2026-01-01T00:00:00Z', target: 'branch', enforcement: 'active', conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] as string[] } }, bypass_actors: [] as unknown[], rules: [{ type: 'pull_request', parameters: { required_approving_review_count: 1, require_last_push_approval: true, dismiss_stale_reviews_on_push: true } }, { type: 'required_status_checks', parameters: { required_status_checks: config.requiredChecks.map(context => ({ context })) } }] }
  const creation = { id: config.tagCreationRulesetId, updated_at: '2026-01-01T00:00:00Z', target: 'tag', enforcement: 'active', conditions: { ref_name: { include: ['refs/tags/desktop-v*'], exclude: [] as string[] } }, bypass_actors: [{ actor_type: 'RepositoryRole', actor_id: 2, bypass_mode: 'always' }], rules: [{ type: 'creation' }] }
  const immutable = { ...creation, id: config.tagImmutabilityRulesetId, bypass_actors: [] as unknown[], rules: [{ type: 'update' }, { type: 'deletion' }] }
  const reviewers = config.maintainerIds.map(id => ({ reviewer: { id } }))
  const api: GitHub = { async request(method, path) {
    expect(method).toBe('GET')
    if (path.includes('/actions/runs/123')) return { event: 'workflow_dispatch', head_branch: `${config.bootstrapTagPrefix}fixture`, path: '.github/workflows/desktop-ci.yml', head_sha: 'a'.repeat(40), run_attempt: 1, status: 'completed', conclusion: 'success', repository: { id: config.repositoryId } }
    if (path === '/user') return { id: config.maintainerIds[0] }
    if (path.endsWith(`/rulesets/${String(config.mainRulesetId)}`)) return main
    if (path.endsWith(`/rulesets/${String(config.tagCreationRulesetId)}`)) return creation
    if (path.endsWith(`/rulesets/${String(config.tagImmutabilityRulesetId)}`)) return immutable
    if (path.includes('/environments/')) return { protection_rules: [{ type: 'required_reviewers', reviewers, prevent_self_review: false }], deployment_branch_policy: { protected_branches: true } }
    if (path.endsWith('/permissions/workflow')) return { default_workflow_permissions: 'read', can_approve_pull_request_reviews: true }
    if (path.includes('/runs?')) return { workflow_runs: [] }
    if (path.includes('/actions/workflows?')) return { workflows: config.legacyWorkflows.map((value, id) => ({ path: value, id, state: 'disabled_manually' })) }
    return { id: config.repositoryId, default_branch: 'main' }
  } }
  return { api, main, creation, immutable, reviewers }
}
it('requires exact protected refs, authorized bypass actors and no alternate environment reviewers', async () => {
  const fixture = controls()
  expect((await migrationPreflight(config, fixture.api, admin)).state).toBe('controls-verified')
  fixture.main.conditions.ref_name.exclude.push('refs/heads/main')
  expect(JSON.stringify((await migrationPreflight(config, fixture.api, admin)).blockers)).toContain('required refs')
  fixture.main.conditions.ref_name.exclude = []
  fixture.creation.bypass_actors.push({ actor_type: 'Integration', actor_id: 123, bypass_mode: 'always' })
  expect(JSON.stringify((await migrationPreflight(config, fixture.api, admin)).blockers)).toContain('App bypass')
  fixture.creation.bypass_actors.pop()
  fixture.reviewers.push({ reviewer: { id: 999 } })
  expect(JSON.stringify((await migrationPreflight(config, fixture.api, admin)).blockers)).toContain('maintainer reviewer')
  expect(object(await migrationPreflight(config, controls().api)).state).toBe('blocked')
})

it('runtime validates pinned attestations without requesting Administration permissions', async () => {
  const fixture = controls()
  const root = mkdtempSync(join(tmpdir(), 'delivery-runtime-'))
  try {
    const baselineBytes = JSON.stringify({ purpose: 'desktop-legacy-baseline', repository: config.repository, repositoryId: config.repositoryId, unresolvedAdoption: [] })
    const localConfig = { ...config, baselinePath: join(root, 'baseline.json') }
    writeFileSync(localConfig.baselinePath, baselineBytes)
    const report = await migrationPreflight(localConfig, fixture.api, admin)
    const reportPath = join(root, 'report.json')
    const bytes = JSON.stringify(report)
    writeFileSync(reportPath, bytes)
    const activationPath = join(root, 'activation.json')
    writeFileSync(activationPath, JSON.stringify({ active: true, repositoryId: config.repositoryId, botId: config.botId,
      migrationReportDigest: digest(bytes), baselineDigest: digest(baselineBytes), configDigest: report.configDigest,
      protectionIds: [config.mainRulesetId, config.tagCreationRulesetId, config.tagImmutabilityRulesetId] }))
    let drift = false
    const runtime: GitHub = { async request(method, path, body) {
      if (path.endsWith('/permissions/workflow') || path === '/user') throw new Error('Runtime requested administrator API')
      const value = await fixture.api.request(method, path, body)
      if (!path.includes('/rulesets/')) return value
      const visible = { ...object(value) }
      delete visible.bypass_actors
      if (drift) visible.updated_at = '2026-02-01T00:00:00Z'
      return visible
    } }
    await requireActivation(localConfig, activationPath, reportPath, runtime)
    drift = true
    await expect(requireActivation(localConfig, activationPath, reportPath, runtime)).rejects.toThrow('Live activation controls blocked')
    const failed: GitHub = { request: () => Promise.reject(new Error('403')) }
    expect((await migrationPreflight(config, failed, admin)).state).toBe('blocked')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
