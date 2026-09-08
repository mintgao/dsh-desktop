/** Ordered discovery notices with API-authenticated bot identity and semantic deduplication. */
import { digest, hex, object, release, string } from './evidence.ts'
import { operationPlan, pages, type DeliveryConfig, type GitHub } from './operations.ts'

const MARKER = 'desktop-discovery-notice'
function authored(config: DeliveryConfig, value: Record<string, unknown>): boolean {
  const user = object(value.user)
  return user.id === config.botId && user.type === 'Bot'
}
function stateFrom(report: Record<string, unknown>, config: DeliveryConfig): Record<string, unknown> {
  if (!['next', 'current', 'blocked'].includes(String(report.state))) throw new Error('Unknown discovery outcome')
  const next = report.state === 'next' ? release(report.next) : null
  const raw = typeof report.blocker === 'string' ? report.blocker : ''
  const category = ['Missing recorded release', 'Changed recorded release', 'Conflicting release identity', 'Unexpected earlier release'].find(value => raw.startsWith(value)) ?? 'discovery-unavailable'
  return { outcome: report.state, next, blocker: report.state === 'blocked' ? { category, resource: config.upstreamRepository } : null }
}
function semantic(config: DeliveryConfig, state: Record<string, unknown>, sourceLockDigest: string): Record<string, unknown> {
  const normalized = stateFrom({ state: state.outcome, next: state.next, blocker: state.blocker === null ? '' : string(object(state.blocker).category) }, config)
  if (JSON.stringify(normalized) !== JSON.stringify(state)) throw new Error('Inconsistent normalized discovery state')
  return { repositoryId: config.repositoryId, distribution: config.id, sourceLockDigest: hex(sourceLockDigest), state }
}
function parseMarker(body: unknown, config: DeliveryConfig, issueId?: number): Record<string, unknown> | undefined {
  if (typeof body !== 'string' || !body.includes(`<!-- ${MARKER}`)) return undefined
  const matches = [...body.matchAll(/<!-- desktop-discovery-notice (.+) -->/gu)]
  if (matches.length !== 1) throw new Error('Malformed authoritative bot notice marker')
  const parsed = object(JSON.parse(string(matches[0]?.[1])) as unknown)
  if (parsed.schemaVersion !== 1 || parsed.kind !== MARKER) throw new Error('Unknown authoritative notice schema')
  if (parsed.repositoryId !== config.repositoryId) throw new Error('Notice repository identity mismatch')
  if (parsed.distribution !== config.id) {
    if (issueId !== undefined) throw new Error('Comment distribution identity mismatch')
    return undefined
  }
  if (parsed.issueId !== issueId) throw new Error('Notice issue identity mismatch')
  const value = semantic(config, object(parsed.state), string(parsed.sourceLockDigest))
  if (parsed.fingerprint !== digest(JSON.stringify(value))) throw new Error('Notice semantic fingerprint mismatch')
  return parsed
}
function noticeBody(notice: Record<string, unknown>, runUrl: string, issueId?: number): string {
  const state = object(notice.state)
  const outcome = string(state.outcome)
  const action = outcome === 'next' ? `Upstream ${string(object(state.next).tag)} needs reviewed source adoption. Bring this candidate to the Agent for preparation and confirmation.` : outcome === 'current' ? 'Discovery recovered or remains current; no new source adoption is required.' : 'Upstream discovery is blocked. Bring the recorded blocker to the Agent for investigation.'
  const marker = JSON.stringify({ ...notice, ...(issueId === undefined ? {} : { issueId }) }).replaceAll('<', '\\u003c')
  return `${action}\n\nThis is not an installable desktop update. Evidence: ${runUrl}\n\n<!-- ${MARKER} ${marker} -->\n`
}
/** Build semantic notification inputs without writing to GitHub.
 * @param config - distribution.
 * @param report - ordered discovery result.
 * @param lockDigest - exact committed source-lock digest.
 * @param commit - exact checked-out protected main revision.
 * @param runUrl - workflow evidence link.
 * @returns Notification-only plan; later releases and transient wording do not affect its fingerprint.
 */
export function notificationPlan(config: DeliveryConfig,
  report: Record<string, unknown>,
  lockDigest: string,
  commit: string,
  runUrl: string): Record<string, unknown> {
  if (report.purpose !== 'desktop-delivery-shadow' || report.kind !== 'discovery' || (report.distribution !== undefined && report.distribution !== config.id)) throw new Error('Invalid discovery report')
  const state = stateFrom(report, config)
  const value = semantic(config, state, lockDigest)
  return operationPlan(config, 'notification-apply', { commit: hex(commit, 40), runUrl, notice: { schemaVersion: 1, kind: MARKER, ...value, fingerprint: digest(JSON.stringify(value)) }, nextAction: 'After activation, send only a deduplicated discovery notice; adoption and publication remain manual.' })
}
async function currentNotice(config: DeliveryConfig,
  api: GitHub): Promise<{ issue?: Record<string, unknown>
  notice?: Record<string, unknown> }> {
  const matches: Array<{ issue: Record<string, unknown>; notice: Record<string, unknown> }> = []
  for (const issue of await pages(api, `/repos/${config.repository}/issues?state=all`)) {
    if (issue.pull_request !== undefined || !authored(config, issue)) continue
    const notice = parseMarker(issue.body, config)
    if (notice !== undefined) matches.push({ issue, notice })
  }
  if (matches.length > 1) throw new Error('Multiple authoritative discovery issues require repair')
  const selected = matches[0]
  if (selected === undefined) return {}
  const id = Number(selected.issue.id)
  const number = Number(selected.issue.number)
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Malformed issue identity')
  const comments = await pages(api, `/repos/${config.repository}/issues/${String(number)}/comments`)
  comments.sort((a, b) => string(a.created_at).localeCompare(string(b.created_at)) || Number(a.id) - Number(b.id))
  for (const comment of comments) {
    if (!authored(config, comment)) continue
    const marker = parseMarker(comment.body, config, id)
    if (marker !== undefined) selected.notice = marker
  }
  return selected
}
/** Apply one notice under the trusted workflow's distribution concurrency group.
 * @param config - expected bot and repository identity.
 * @param plan - notification-only plan from exact protected main source.
 * @param api - issues-write transport; no source or release endpoints are written.
 * @returns Existing or newly appended notice outcome.
 */
export async function applyNotification(config: DeliveryConfig,
  plan: Record<string, unknown>,
  api: GitHub): Promise<Record<string, unknown>> {
  const main = object(await api.request('GET', `/repos/${config.repository}/git/ref/heads/${config.defaultBranch}`))
  if (object(main.object).sha !== plan.commit) throw new Error('Stale discovery checkout cannot notify')
  const notice = object(plan.notice)
  if (plan.purpose !== 'desktop-delivery-operation' || plan.operation !== 'notification-apply' || plan.repository !== config.repository || plan.distribution !== config.id || parseMarker(noticeBody(notice, string(plan.runUrl)), config) === undefined) throw new Error('Notification plan identity mismatch')
  const current = await currentNotice(config, api)
  if (current.notice?.fingerprint === notice.fingerprint) return { ...plan, state: 'unchanged', nextAction: 'No Issue creation, edit, comment or reopening was needed.' }
  if (current.issue === undefined && object(notice.state).outcome === 'current') return { ...plan, state: 'current', nextAction: 'No actionable update; no Issue was created.' }
  const reconcile = async (error: unknown): Promise<void> => { if ((await currentNotice(config,
    api)).notice?.fingerprint !== notice.fingerprint) throw error }
  if (current.issue === undefined) {
    try { await api.request('POST', `/repos/${config.repository}/issues`, { title: `${config.id}: upstream discovery`, body: noticeBody(notice, string(plan.runUrl)) }) }
    catch (error) { await reconcile(error) }
  } else {
    const id = Number(current.issue.number)
    if (current.issue.state === 'closed' && object(notice.state).outcome !== 'current') {
      try { await api.request('PATCH', `/repos/${config.repository}/issues/${String(id)}`, { state: 'open' }) }
      catch (error) { if ((await currentNotice(config, api)).issue?.state !== 'open') throw error }
    }
    try { await api.request('POST', `/repos/${config.repository}/issues/${String(id)}/comments`, { body: noticeBody(notice, string(plan.runUrl), Number(current.issue.id)) }) }
    catch (error) { await reconcile(error) }
  }
  return { ...plan, state: 'notice-recorded', nextAction: 'GitHub subscriptions control notification delivery; review source adoption separately.' }
}

/** Maintain one release-specific status Issue, without editing identical outcome text.
 * @param config - expected authenticated bot.
 * @param result - release operation outcome.
 * @param api - issue-write transport.
 */
export async function releaseStatus(config: DeliveryConfig, result: Record<string, unknown>, api: GitHub): Promise<void> {
  const tag = string(result.tag)
  const marker = `<!-- desktop-release-status:${tag} -->`
  const body = `${marker}\n\n${JSON.stringify({ state: result.state, manifestDigest: result.manifestDigest, blocker: result.blocker ?? null, nextAction: result.nextAction }, null, 2)}\n`
  const matches = (await pages(api, `/repos/${config.repository}/issues?state=all`)).filter(issue => issue.pull_request === undefined && authored(config, issue) && typeof issue.body === 'string' && issue.body.includes(marker))
  if (matches.length > 1) throw new Error('Duplicate release status issues')
  const issue = matches[0]
  if (issue?.body === body) return
  const method = issue === undefined ? 'POST' : 'PATCH'
  const path = `/repos/${config.repository}/issues${issue === undefined ? '' : `/${String(issue.number)}`}`
  try { await api.request(method, path, { ...(issue === undefined ? { title: `${config.id}: ${tag}` } : {}), body }) }
  catch (error) {
    const reread = await pages(api, `/repos/${config.repository}/issues?state=all`)
    if (!reread.some(item => authored(config, item) && item.body === body)) throw error
  }
}
