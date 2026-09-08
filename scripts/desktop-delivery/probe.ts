/** Owner-approved, fixed-content draft access probe for the initial activation evidence. */
import { seedBootstrapProtection } from './bootstrap-protection.ts'
import { verifyBootstrapRun } from './bootstrap.ts'
import { digest, hex, object, string, textField } from './evidence.ts'
import { operationPlan, pages, validatePlan, type DeliveryConfig, type GitHub } from './operations.ts'
import { tagCommit } from './migration.ts'

const CONTENT = Buffer.from('Desktop delivery draft access probe. No application payload.\n')
/** Plan one harmless draft probe against an immutable bootstrap tag.
 * @param config - repository identity.
 * @param id - maintainer-created draft Release ID.
 * @param tag - exact immutable bootstrap tag.
 * @param commit - reviewed implementation snapshot.
 * @param api - maintainer read adapter.
 * @returns Exact original body and uniquely named probe asset for review.
 */
export async function probePlan(config: DeliveryConfig,
  id: number,
  tag: string,
  commit: string,
  api: GitHub): Promise<Record<string,
  unknown>> {
  if (!Number.isSafeInteger(id) || id < 1 || !tag.startsWith(config.bootstrapTagPrefix)) throw new Error('Probe requires an exact bootstrap draft identity')
  const remote = object(await api.request('GET', `/repos/${config.repository}/releases/${String(id)}`))
  if (remote.id !== id || remote.draft !== true || remote.prerelease !== true || remote.tag_name !== tag || await tagCommit(config, tag, api) !== hex(commit, 40)) throw new Error('Probe draft identity differs')
  if (typeof remote.body !== 'string') throw new Error('Probe draft body must be explicit text')
  const protection = await seedBootstrapProtection(config, api, commit)
  return operationPlan(config, 'bootstrap-probe', { bootstrapProtectionDigest: digest(protection.bytes), releaseId: id, tag, commit, originalBody: remote.body, assetName: `desktop-bootstrap-probe-${String(id)}-${commit.slice(0, 12)}.txt`, assetDigest: digest(CONTENT), nextAction: 'Approve only the exact immutable bootstrap workflow and this harmless draft-access probe.' })
}

/** Exercise upload, read, delete and body restoration without publishing or retargeting.
 * @param config - repository and bootstrap environment.
 * @param plan - exact owner-approved probe plan.
 * @param api - publication-scoped Actions transport.
 * @param context - current immutable bootstrap workflow identity.
 * @returns Completed evidence only after both asset deletion and body restoration.
 */
export async function probeDraft(config: DeliveryConfig, plan: Record<string, unknown>, api: GitHub,
  context: { commit: string; ref: string; runId: string; attempt: string }): Promise<Record<string, unknown>> {
  validatePlan(plan, 'bootstrap-probe', config)
  const id = Number(plan.releaseId)
  const tag = string(plan.tag)
  if (!Number.isSafeInteger(id) || id < 1 || context.commit !== plan.commit || context.ref !== `refs/tags/${tag}` || !tag.startsWith(config.bootstrapTagPrefix)
    || plan.assetName !== `desktop-bootstrap-probe-${String(id)}-${hex(plan.commit, 40).slice(0, 12)}.txt` || plan.assetDigest !== digest(CONTENT)) throw new Error('Probe approval identity changed')
  await verifyBootstrapRun(config, api, context, hex(plan.bootstrapProtectionDigest))
  const base = `/repos/${config.repository}`
  const run = object(await api.request('GET', `${base}/actions/runs/${context.runId}`))
  if (object(run.repository).id !== config.repositoryId || run.path !== '.github/workflows/desktop-ci.yml' || run.head_sha !== context.commit
    || run.event !== 'workflow_dispatch' || run.head_branch !== tag || String(run.run_attempt) !== context.attempt || run.status !== 'in_progress') throw new Error('Probe workflow identity differs')
  const pending = await api.request('GET', `${base}/actions/runs/${context.runId}/pending_deployments`)
  if (!Array.isArray(pending) || pending.length !== 0) throw new Error('Probe owner approval is pending')
  if (await tagCommit(config, tag, api) !== context.commit) throw new Error('Probe immutable tag differs')
  const releasePath = `${base}/releases/${String(id)}`
  const original = typeof plan.originalBody === 'string' ? plan.originalBody : textField(plan.originalBody)
  const edited = `${original}\n\n<!-- desktop-draft-access-probe ${string(plan.assetDigest)} -->\n`
  const read = async (): Promise<Record<string, unknown>> => {
    const value = object(await api.request('GET', releasePath))
    if (value.id !== id || value.tag_name !== tag || value.draft !== true || value.prerelease !== true || (value.body !== original && value.body !== edited)) throw new Error('Probe draft changed or became public')
    return value
  }
  await read()
  const asset = async (): Promise<Record<string, unknown> | undefined> => {
    const matches = (await pages(api, `${releasePath}/assets`)).filter(value => value.name === plan.assetName)
    if (matches.length > 1) throw new Error('Conflicting probe assets')
    const found = matches[0]
    if (found === undefined) return undefined
    const bytes = await api.request('DOWNLOAD', `${base}/releases/assets/${String(found.id)}`)
    if (!(bytes instanceof Uint8Array) || bytes.length !== CONTENT.length || digest(bytes) !== plan.assetDigest) throw new Error('Probe asset bytes conflict')
    return found
  }
  let found = await asset()
  if (found === undefined) {
    try { await api.request('POST', `https://uploads.github.com/repos/${config.repository}/releases/${String(id)}/assets?name=${encodeURIComponent(string(plan.assetName))}`, CONTENT) }
    catch (error) { if (await asset() === undefined) throw error }
    found = await asset()
  }
  if (found === undefined) throw new Error('Probe upload could not be verified')
  const edit = async (body: string): Promise<void> => {
    await read()
    try { await api.request('PATCH', releasePath, { draft: true, body }) }
    catch (error) { if ((await read()).body !== body) throw error }
    if ((await read()).body !== body) throw new Error('Probe body edit could not be verified')
  }
  await edit(edited)
  try {
    try { await api.request('DELETE', `${base}/releases/assets/${String(found.id)}`) }
    catch (error) { if (await asset() !== undefined) throw error }
    if (await asset() !== undefined) throw new Error('Probe asset cleanup incomplete')
  } finally { await edit(original) }
  return operationPlan(config, 'bootstrap-probe', { state: 'draft-access-verified', repositoryId: config.repositoryId, releaseId: id, tag, commit: context.commit,
    workflow: { path: '.github/workflows/desktop-ci.yml', commit: context.commit, runId: Number(context.runId), attempt: Number(context.attempt) },
    tokenPermissions: { contents: 'write', issues: 'write', actions: 'read' }, uploaded: true, downloadedDigest: digest(CONTENT), deleted: true, bodyRestored: true, remainedDraft: true,
    nextAction: 'Use this completed probe as draft-operation evidence in administrator preflight; it does not prove publication.' })
}
