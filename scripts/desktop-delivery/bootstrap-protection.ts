/** Seed-owned administrator evidence for the bootstrap ruleset's requester-hidden bypass field. */
import { rulesetTime } from './ruleset-time.ts'
import { digest, hex, object, textField } from './evidence.ts'
import type { DeliveryConfig, GitHub } from './operations.ts'

/** Fixed seed-owned attestation path. */
export const bootstrapProtectionPath = '.github/desktop-delivery/bootstrap-protection.json'
/** Fixed retained administrator response path. */
export const bootstrapResponsePath = '.github/desktop-delivery/bootstrap-protection-response.json'

/** Serialize JSON with sorted object keys and unchanged array order.
 * @param value - JSON value.
 * @returns Deterministic JSON bytes as text.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(object(value)).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') throw new Error('Bootstrap evidence contains non-JSON data')
  return JSON.stringify(value)
}

function projection(config: DeliveryConfig, value: unknown): Record<string, unknown> {
  const rule = object(value)
  const keys = ['id', 'source', 'source_type', 'target', 'enforcement', 'conditions', 'rules', 'updated_at']
  if (keys.some(key => !Object.hasOwn(rule, key)) || rule.id !== config.bootstrapRulesetId || rule.source !== config.repository || rule.source_type !== 'Repository'
    || rule.target !== 'tag' || rule.enforcement !== 'active' || typeof rule.updated_at !== 'string' || !Number.isFinite(Date.parse(rule.updated_at))) throw new Error('Bootstrap ruleset visible identity is incomplete or differs')
  const conditions = object(rule.conditions)
  const refs = object(conditions.ref_name)
  if (Object.keys(conditions).length !== 1 || canonicalJson(refs.include) !== canonicalJson([`refs/tags/${config.bootstrapTagPrefix}*`]) || canonicalJson(refs.exclude) !== '[]'
    || !Array.isArray(rule.rules) || !['update', 'deletion'].every(type => (rule.rules as unknown[]).some(item => object(item).type === type))) throw new Error('Bootstrap immutable tag scope or rules differ')
  return Object.fromEntries(keys.map(key => [key, key === 'updated_at' ? rulesetTime(rule[key]) : rule[key]]))
}

function emptyBypass(rule: Record<string, unknown>): void {
  if (!Array.isArray(rule.bypass_actors) || rule.bypass_actors.length !== 0) throw new Error('Bootstrap administrator bypass actors must be explicitly empty')
}

/** Capture successful administrator reads for retention in the reviewed seed.
 * @param config - configured repository and bootstrap ruleset.
 * @param api - existing administrator GET transport.
 * @returns Attestation and exact response bytes to retain at their fixed paths.
 */
export async function prepareBootstrapProtection(config: DeliveryConfig,
  api: GitHub): Promise<{ attestation: Record<string, unknown>; response: string }> {
  if (config.bootstrapRulesetId === null) throw new Error('Bootstrap ruleset is not configured')
  const administrator = object(await api.request('GET', '/user'))
  const repository = object(await api.request('GET', `/repos/${config.repository}`))
  if (!Number.isSafeInteger(administrator.id) || !config.maintainerIds.includes(Number(administrator.id)) || object(repository.permissions).admin !== true || repository.id !== config.repositoryId || repository.full_name !== config.repository) throw new Error('Bootstrap evidence requires the configured repository administrator')
  const ruleset = object(await api.request('GET', `/repos/${config.repository}/rulesets/${String(config.bootstrapRulesetId)}`))
  const observed = projection(config, ruleset)
  emptyBypass(ruleset)
  const response = `${canonicalJson(ruleset)}\n`
  return { response, attestation: { schemaVersion: 1, purpose: 'desktop-bootstrap-protection', repository: config.repository, repositoryId: config.repositoryId,
    rulesetId: config.bootstrapRulesetId, observedAt: new Date().toISOString(), administratorId: administrator.id,
    bypassActors: [], projection: observed,
    projectionDigest: digest(canonicalJson(observed)), evidence: { path: bootstrapResponsePath, digest: digest(response) } } }
}

/** Validate exact retained attestation and administrator response bytes.
 * @param config - expected repository, administrator and ruleset.
 * @param bytes - seed-owned attestation bytes.
 * @param response - seed-owned response bytes.
 * @returns Validated visible projection.
 */
export function checkedBootstrapProtection(config: DeliveryConfig, bytes: Uint8Array, response: Uint8Array): Record<string, unknown> {
  const proof = object(JSON.parse(Buffer.from(bytes).toString()) as unknown)
  if (proof.schemaVersion !== 1 || proof.purpose !== 'desktop-bootstrap-protection' || proof.repository !== config.repository || proof.repositoryId !== config.repositoryId
    || proof.rulesetId !== config.bootstrapRulesetId || !Number.isSafeInteger(proof.administratorId)
    || !config.maintainerIds.includes(Number(proof.administratorId))
    || typeof proof.observedAt !== 'string' || !Number.isFinite(Date.parse(proof.observedAt)) || canonicalJson(proof.bypassActors) !== '[]') throw new Error('Bootstrap attestation identity differs')
  const evidence = object(proof.evidence)
  if (evidence.path !== bootstrapResponsePath || digest(response) !== hex(evidence.digest)) throw new Error('Bootstrap administrator response bytes differ')
  const observed = projection(config, proof.projection)
  if (canonicalJson(observed) !== canonicalJson(proof.projection)) throw new Error('Bootstrap projection contains unexpected fields')
  if (digest(canonicalJson(observed)) !== hex(proof.projectionDigest)) throw new Error('Bootstrap projection digest differs')
  const retained = object(JSON.parse(Buffer.from(response).toString()) as unknown)
  emptyBypass(retained)
  if (canonicalJson(projection(config, retained)) !== canonicalJson(observed)) throw new Error('Bootstrap retained administrator projection differs')
  return observed
}

/** Read the exact immutable seed's evidence; API failures never become attestation fallbacks.
 * @param config - expected identities.
 * @param api - GitHub GET transport.
 * @param commit - immutable seed commit.
 * @returns Attestation bytes and validated projection.
 */
export async function seedBootstrapProtection(config: DeliveryConfig, api: GitHub,
  commit: string): Promise<{ bytes: Buffer; projection: Record<string, unknown> }> {
  const read = async (path: string): Promise<Buffer> => {
    const file = object(await api.request('GET', `/repos/${config.repository}/contents/${path}?ref=${hex(commit, 40)}`))
    if (file.type !== 'file' || file.encoding !== 'base64' || file.path !== path) throw new Error('Bootstrap seed evidence file differs')
    return Buffer.from(textField(file.content), 'base64')
  }
  const bytes = await read(bootstrapProtectionPath)
  return { bytes, projection: checkedBootstrapProtection(config, bytes, await read(bootstrapResponsePath)) }
}

/** Compare live protection with seed evidence, permitting only a wholly omitted bypass field.
 * @param config - configured bootstrap protection.
 * @param fresh - successful fresh ruleset response.
 * @param observed - validated administrator projection.
 */
export function verifyBootstrapProtection(config: DeliveryConfig, fresh: unknown, observed: Record<string, unknown>): void {
  const rule = object(fresh)
  if (canonicalJson(projection(config, rule)) !== canonicalJson(observed)) throw new Error('Bootstrap ruleset changed since administrator observation')
  if (Object.hasOwn(rule, 'bypass_actors')) emptyBypass(rule)
}
