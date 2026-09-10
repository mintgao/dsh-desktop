/** Release edits retain the approved immutable tag and reconcile by Release ID. */
import { object } from './evidence.ts'
import { tagCommit } from './migration.ts'
import type { DeliveryConfig, GitHub } from './operations.ts'

/** Read the same release and reject identity or intended-state drift.
 * @param config - owning repository.
 * @param api - authorized transport.
 * @param expected - approved identity and optional intended state.
 * @returns Verified release metadata.
 */
export async function readRelease(config: DeliveryConfig, api: GitHub,
  expected: { id: number; tag: string; draft?: boolean; body?: string }): Promise<Record<string, unknown>> {
  const remote = object(await api.request('GET', `/repos/${config.repository}/releases/${String(expected.id)}`))
  if (remote.id !== expected.id || remote.tag_name !== expected.tag || remote.prerelease !== true
    || typeof remote.draft !== 'boolean' || (expected.draft !== undefined && remote.draft !== expected.draft)
    || (expected.body !== undefined && remote.body !== expected.body)) throw new Error('Release identity or intended state drifted; maintainer recovery required')
  return remote
}

/** Patch only the approved release and verify the complete intended state after any response.
 * @param config - owning repository.
 * @param api - authorized transport.
 * @param expected - immutable release identity and intended visibility/body.
 * @returns Same-ID verified metadata; conflicting state is never repaired automatically.
 */
export async function patchRelease(config: DeliveryConfig, api: GitHub,
  expected: { id: number; tag: string; commit: string; draft: boolean; body?: string; previousBody: string },
): Promise<Record<string, unknown>> {
  await readRelease(config, api, { id: expected.id, tag: expected.tag, body: expected.previousBody })
  if (await tagCommit(config, expected.tag, api) !== expected.commit) throw new Error('Release immutable tag differs from approved commit')
  const patch = { tag_name: expected.tag, draft: expected.draft, prerelease: true,
    ...(expected.draft ? {} : { make_latest: 'false' }), ...(expected.body === undefined ? {} : { body: expected.body }) }
  try { await api.request('PATCH', `/repos/${config.repository}/releases/${String(expected.id)}`, patch) }
  catch {
    // A lost response succeeds only when the same release already has every intended field.
    return readRelease(config, api, expected)
  }
  return readRelease(config, api, expected)
}
