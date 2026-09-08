/** Shared validation and GitHub transport for reviewed delivery operations. */
import { setTimeout as delay } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import { digest, distribution, hex, object, readJson, string, type Distribution } from './evidence.ts'

/** Product values needed by the operational delivery consumer. */
export interface DeliveryConfig extends Distribution {
  legacyAdoptionEvidence: { commit: string; path: string; digest: string }
  assetPrefix: string
  repository: string
  repositoryId: number
  defaultBranch: string
  releaseEnvironment: string
  sourceLockPath: string
  activationPath: string
  baselinePath: string
  mainRulesetId: number
  tagCreationRulesetId: number
  tagImmutabilityRulesetId: number
  legacyAppIds: number[]
  legacyWorkflows: string[]
  maintainerIds: number[]
  requiredChecks: string[]
  bootstrapTagPrefix: string
  bootstrapEnvironment: string
  bootstrapRulesetId: number | null
  botId: number
}
/** GitHub request adapter; tests replace only the remote transport. */
export interface GitHub { request(method: string, path: string, body?: unknown): Promise<unknown> }
/** A response whose server result may require reconciliation after a failed write. */
export class GitHubError extends Error {
  constructor(readonly status: number, method: string, path: string) { super(`GitHub ${method} ${path}: HTTP ${String(status)}`) }
}
/** Parse operational configuration without accepting arbitrary executable commands.
 * @param path - distribution configuration.
 * @returns Operational distribution values.
 */
export function deliveryConfig(path: string): DeliveryConfig {
  const raw = object(readJson(path))
  const parsed = distribution(raw)
  const fields = ['repository', 'defaultBranch', 'releaseEnvironment', 'sourceLockPath', 'activationPath', 'baselinePath'] as const
  const values = Object.fromEntries(fields.map(field => [field, string(raw[field])])) as Record<typeof fields[number], string>
  if (!/^[\w.-]+\/[\w.-]+$/u.test(values.repository) || values.defaultBranch !== 'main') throw new Error('Delivery requires a configured repository and protected main')
  for (const pathValue of [values.sourceLockPath, values.activationPath, values.baselinePath]) {
    if (!pathValue.startsWith('.github/desktop-delivery/') || pathValue.split('/').includes('..')) throw new Error('Unsafe delivery evidence path')
  }
  const ids = ['repositoryId', 'mainRulesetId', 'tagCreationRulesetId', 'tagImmutabilityRulesetId'] as const
  for (const id of ids) if (!Number.isSafeInteger(raw[id]) || Number(raw[id]) <= 0) throw new Error(`Invalid ${id}`)
  if (!Array.isArray(raw.legacyAppIds) || !raw.legacyAppIds.every(id => Number.isSafeInteger(id) && Number(id) > 0)
    || !Array.isArray(raw.legacyWorkflows) || !raw.legacyWorkflows.every(pathValue => typeof pathValue === 'string' && pathValue.startsWith('.github/workflows/'))) throw new Error('Missing legacy authority inventory')
  if (!Array.isArray(raw.maintainerIds) || raw.maintainerIds.length === 0 || !raw.maintainerIds.every(id => Number.isSafeInteger(id) && Number(id) > 0) || !Array.isArray(raw.requiredChecks) || raw.requiredChecks.length === 0 || !raw.requiredChecks.every(item => typeof item === 'string' && item.trim() !== '') || !Number.isSafeInteger(raw.botId) || Number(raw.botId) < 1) throw new Error('Missing maintainer, check or bot identity')
  if (!/^desktop-bootstrap-[a-z0-9-]*$/u.test(string(raw.bootstrapTagPrefix))) throw new Error('Unsafe bootstrap tag namespace')
  if (raw.bootstrapRulesetId !== null && (!Number.isSafeInteger(raw.bootstrapRulesetId) || Number(raw.bootstrapRulesetId) < 1)) throw new Error('Invalid bootstrap protection identity')
  const legacy = object(raw.legacyAdoptionEvidence)
  if (!['.github/upstream-sync-state.json', 'state/upstream-adoption.json'].includes(string(legacy.path))) throw new Error('Unsupported pinned adoption evidence path')
  return { legacyAdoptionEvidence: { commit: hex(legacy.commit,
    40),
  path: string(legacy.path),
  digest: hex(legacy.digest) },
  assetPrefix: string(raw.assetPrefix),
  bootstrapTagPrefix: string(raw.bootstrapTagPrefix),

  bootstrapEnvironment: string(raw.bootstrapEnvironment),
  bootstrapRulesetId: raw.bootstrapRulesetId === null ? null : Number(raw.bootstrapRulesetId),
  ...parsed,
  ...values,
  repositoryId: Number(raw.repositoryId),
  mainRulesetId: Number(raw.mainRulesetId),
  tagCreationRulesetId: Number(raw.tagCreationRulesetId),
  tagImmutabilityRulesetId: Number(raw.tagImmutabilityRulesetId),
  legacyAppIds: raw.legacyAppIds as number[],
  legacyWorkflows: raw.legacyWorkflows as string[],
  maintainerIds: raw.maintainerIds as number[],
  requiredChecks: raw.requiredChecks.map(string),
  botId: Number(raw.botId) }
}
/** HTTP implementation with GET retries only; ambiguous writes are never blindly retried.
 * @param token - optional GitHub token, retained only in request headers.
 * @returns Real HTTP adapter.
 */
export function github(token: string | undefined): GitHub {
  return { async request(method, path, body) {
    const download = method === 'DOWNLOAD'
    if (download) method = 'GET'
    const url = path.startsWith('https://uploads.github.com/') ? path : `https://api.github.com${path}`
    if (!path.startsWith('/') && !path.startsWith('https://uploads.github.com/repos/')) throw new Error('Unsupported GitHub endpoint')
    for (let attempt = 0; attempt < (method === 'GET' ? 3 : 1); attempt++) {
      let response: Response
      try {
        response = await fetch(url, {
          method, redirect: download ? 'manual' : 'error', signal: AbortSignal.timeout(30_000),
          headers: { Accept: download ? 'application/octet-stream' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }), ...(body instanceof Uint8Array ? { 'Content-Type': 'application/octet-stream' } : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: body instanceof Uint8Array ? Buffer.from(body) : JSON.stringify(body) }),
        })
      } catch (error) {
        if (method !== 'GET' || attempt === 2) throw error
        await delay(250 * 2 ** attempt)
        continue
      }
      if (download && response.status === 302) {
        const target = new URL(string(response.headers.get('location')))
        if (target.protocol !== 'https:' || target.username !== '' || target.password !== '') throw new Error('Unsafe GitHub download redirect')
        await response.body?.cancel()
        response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(300_000) })
      }
      if (method === 'GET' && [429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await response.body?.cancel(); await delay(250 * 2 ** attempt); continue
      }
      if (!response.ok) { await response.body?.cancel(); throw new GitHubError(response.status, method, path) }
      if (response.status === 204) return null
      if (download) return new Uint8Array(await response.arrayBuffer())
      return await response.json() as unknown
    }
    throw new Error('GitHub read attempts exhausted')
  } }
}
/** Read every page from one GitHub collection.
 * @param api - remote adapter.
 * @param path - collection URL without page parameters.
 * @param key - response array field, absent for a bare array.
 * @returns Complete records, rejecting an incomplete bounded traversal.
 */
export async function pages(api: GitHub, path: string, key?: string): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = []
  for (let page = 1; page <= 100; page++) {
    const response = await api.request('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${String(page)}`)
    const items = key === undefined ? response : object(response)[key]
    if (!Array.isArray(items)) throw new Error('Malformed GitHub collection')
    results.push(...items.map(object))
    if (items.length < 100) return results
  }
  throw new Error('Incomplete GitHub collection')
}
/** Read one optional existing remote object without hiding other API failures.
 * @param api - remote adapter.
 * @param path - object endpoint.
 * @returns Object or undefined on HTTP404 only.
 */
export async function optional(api: GitHub, path: string): Promise<Record<string, unknown> | undefined> {
  try { return object(await api.request('GET', path)) }
  catch (error) { if (error instanceof GitHubError && error.status === 404) return undefined; throw error }
}
/** Validate an explicitly approved local operation plan.
 * @param path - exact serialized plan.
 * @param approvedDigest - reviewed SHA-256 bytes digest.
 * @param operation - required operation name.
 * @param config - expected repository.
 * @returns Approved plan fields.
 */
export function approvedPlan(path: string, approvedDigest: string, operation: string, config: DeliveryConfig): Record<string, unknown> {
  if (digest(readFileSync(path)) !== hex(approvedDigest)) throw new Error('Operation plan digest changed')
  const plan = object(readJson(path))
  validatePlan(plan, operation, config)
  return plan
}
/** Construct a local operation plan, never an authorization receipt.
 * @param config - owning repository.
 * @param operation - operation being reviewed.
 * @param values - exact inputs and proposed effects.
 * @returns Serializable review plan.
 */
export function operationPlan(config: DeliveryConfig, operation: string, values: Record<string, unknown>): Record<string, unknown> {
  return { schemaVersion: 1, purpose: 'desktop-delivery-operation', repository: config.repository, distribution: config.id, operation, state: 'planned', ...values }
}

/** Validate durable operation identity before any apply path.
 * @param plan - parsed operation evidence.
 * @param operation - expected operation.
 * @param config - owning distribution and repository.
 */
export function validatePlan(plan: Record<string, unknown>, operation: string, config: DeliveryConfig): void {
  if (plan.schemaVersion !== 1 || plan.purpose !== 'desktop-delivery-operation' || plan.operation !== operation
    || plan.repository !== config.repository || plan.distribution !== config.id) throw new Error('Operation plan identity mismatch')
}
