/** Complete administrator response fixture shared by bootstrap operation tests. */
import { prepareBootstrapProtection, bootstrapProtectionPath, bootstrapResponsePath } from '../bootstrap-protection.ts'
import type { DeliveryConfig } from '../operations.ts'
/** Create retained evidence through the administrator preparation path.
 * @param config - fixture distribution.
 * @returns Exact files and complete live ruleset response.
 */
export async function protectionFixture(config: DeliveryConfig): Promise<{ rules: Record<string, unknown>
  files: Record<string, string> }> {
  const rules = { id: config.bootstrapRulesetId, source: config.repository, source_type: 'Repository', target: 'tag', enforcement: 'active', updated_at: '2026-09-08T12:00:00Z', conditions: { ref_name: { include: [`refs/tags/${config.bootstrapTagPrefix}*`], exclude: [] } }, bypass_actors: [], rules: [{ type: 'update' }, { type: 'deletion' }] }
  const prepared = await prepareBootstrapProtection(config, { async request(_method, path) {
    if (path === '/user') return Promise.resolve({ id: config.maintainerIds[0] })
    if (path.includes('/rulesets/')) return rules
    return { id: config.repositoryId, full_name: config.repository, permissions: { admin: true } }
  } })
  return { rules, files: { [bootstrapProtectionPath]: `${JSON.stringify(prepared.attestation)}\n`, [bootstrapResponsePath]: prepared.response } }
}
