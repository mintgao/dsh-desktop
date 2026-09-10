/** Reviewed upstream merges and bot-owned, lock-only finalization without force updates. */
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { capture, attempt } from '../release/process.ts'
import { catchUpEvidence, compareRelease, type CatchUp, digest, hex, object, readJson, release, sameRelease, sourceLock, string, textField } from './evidence.ts'
import { deliveryPredecessor, requireUnsignedVersion } from './lineage.ts'
import { assessmentFiles, catchUpObservations, gitEvidence, localEvidence, verifyCatchUpBaseline, verifyLiveCatchUp, verifyRemoteAssessment } from './catch-up.ts'
import { discover } from './discovery.ts'
import { optional, pages, operationPlan, validatePlan, type DeliveryConfig, type GitHub } from './operations.ts'

/** Run Git with candidate hooks disabled and optional isolated environment.
 * @param cwd - checkout directory.
 * @param args - fixed Git argv.
 * @param env - credential-free process environment.
 * @returns Captured output.
 */
export function git(cwd: string, args: string[], env?: NodeJS.ProcessEnv): string {
  return capture('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, ...(env === undefined ? {} : { env }) })
}
/** Select one immediate successor and identify an existing adoption PR.
 * @param config - distribution.
 * @param root - local source object database.
 * @param lockPath - current reviewed source lock.
 * @param observations - complete release fixture or live observation set.
 * @param base - exact protected downstream base.
 * @param version - explicit unsigned desktop version.
 * @param api - read-only GitHub adapter.
 * @param kind - explicit adoption or same-upstream delivery kind.
 * @param prior - delivered baseline for same-upstream or catch-up planning.
 * @param target - pinned catch-up target and assessment path; absent for other kinds.
 * @returns Local adoption preparation plan.
 */
export async function adoptionPlan(config: DeliveryConfig, root: string, lockPath: string, observations: unknown, base: string, version: string, api: GitHub, kind = 'upstream', prior?: Record<string, unknown>, target?: { tag: string; commit: string; assessment: string }): Promise<Record<string, unknown>> {
  hex(base, 40)
  if (git(root, ['rev-parse', `${base}^{commit}`]) !== base) throw new Error('Invalid adoption base')
  requireUnsignedVersion(version)
  const lock = sourceLock(readJson(lockPath), config)
  const discovery = discover(config, lock, observations)
  if (kind === 'upstream' && discovery.state !== 'next') throw new Error(`Adoption blocked: ${String(discovery.state)}`)
  if (!['upstream', 'catch-up', 'desktop', 'replacement'].includes(kind)) throw new Error('Unknown release kind')
  if (kind !== 'upstream' && kind !== 'catch-up' && (prior === undefined || !sameRelease(release(prior.upstream), lock.release))) throw new Error('Same-upstream preparation requires exact delivered evidence')
  let catchUp: CatchUp | null = null
  let observed = discovery.observations
  if (kind === 'catch-up') {
    if (target === undefined) throw new Error('Catch-up requires explicit target tag, commit and assessment')
    if (prior === undefined || !sameRelease(release(prior.upstream), lock.release)) throw new Error('Pending unpublished source advancement blocks catch-up')
    const main = object(object(await api.request('GET', `/repos/${config.repository}/git/ref/heads/${config.defaultBranch}`)).object)
    if (main.sha !== base || digest(gitEvidence(root, base, config.sourceLockPath)) !== digest(readFileSync(lockPath))) throw new Error('Catch-up protected base or prior lock changed')
    await verifyCatchUpBaseline(config, prior, api)
    const selected = catchUpObservations(lock, observations, target.tag, target.commit)
    observed = selected
    const selectedTarget = release(selected.find(item => item.tag === target.tag))
    catchUp = catchUpEvidence({ schemaVersion: 1,
      from: lock.release,
      to: selectedTarget,
      releases: selected.filter(item => compareRelease(item, lock.release) > 0 && compareRelease(item, selectedTarget) <= 0),
      assessment: { path: target.assessment, sha256: digest(localEvidence(root, target.assessment)) } }, selected)
    assessmentFiles(catchUp, config.sourceLockPath, path => localEvidence(root, path), false)
  }
  const next = catchUp?.to ?? (kind === 'upstream' ? release(discovery.next) : lock.release)
  const branch = `desktop-adopt/${String(next.id)}-${next.commit.slice(0, 12)}`
  const prs = await pages(api, `/repos/${config.repository}/pulls?state=open&head=${encodeURIComponent(`${config.repository.split('/')[0]}:${branch}`)}&base=${config.defaultBranch}`)
  return operationPlan(config, 'adoption-prepare', { base, upstream: next, branch, desktopVersion: version, releaseKind: kind, priorDelivery: prior ?? null, previousLock: lock, previousLockDigest: digest(readFileSync(lockPath)), observations: observed, catchUp,  existingPullRequest: prs[0]?.html_url ?? null, nextAction: prs.length === 0 ? 'Prepare and review the isolated upstream merge; push only its exact seed branch.' : 'Review the existing adoption PR; do not duplicate it.' })
}
/** Prepare an isolated merge without giving candidate checks write credentials.
 * @param config - distribution.
 * @param root - local object database.
 * @param plan - reviewed adoption plan.
 * @param checkout - retained isolated working directory.
 * @param checks - credential-free checks; the CLI supplies repository commands.
 * @returns Conflict report or exact seed/finalization plan.
 */
export async function prepareAdoption(config: DeliveryConfig,
  root: string,
  plan: Record<string, unknown>,
  checkout: string,
  checks: (cwd: string,
    environment: NodeJS.ProcessEnv) => Promise<void>): Promise<Record<string, unknown>> {
  if (plan.operation !== 'adoption-prepare' || plan.repository !== config.repository) throw new Error('Adoption is already pending or plan does not match')
  const base = hex(plan.base, 40)
  const upstream = release(plan.upstream)
  const previous = sourceLock(plan.previousLock, config)
  if (digest(gitEvidence(root, base, config.sourceLockPath)) !== plan.previousLockDigest) throw new Error('Reviewed base source lock differs from plan')
  if (JSON.stringify(sourceLock(JSON.parse(gitEvidence(root, base, config.sourceLockPath).toString()) as unknown, config)) !== JSON.stringify(previous)) throw new Error('Fabricated prior source lock')
  const range = plan.releaseKind === 'catch-up' ? catchUpEvidence(plan.catchUp, (plan.observations as unknown[]).map(release)) : null
  if (range !== null && (!sameRelease(range.from, previous.release) || !sameRelease(range.to, upstream))) throw new Error('Catch-up plan identity changed')
  const home = resolve(`${checkout}-home`)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  const environment = { PATH: process.env.PATH, HOME: home, TMPDIR: process.env.TMPDIR, SYSTEMROOT: process.env.SYSTEMROOT, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_NAME: 'Desktop adoption seed', GIT_AUTHOR_EMAIL: 'desktop-adoption@users.noreply.github.com', GIT_COMMITTER_NAME: 'Desktop adoption seed', GIT_COMMITTER_EMAIL: 'desktop-adoption@users.noreply.github.com' }
  if (!existsSync(checkout)) {
    mkdirSync(dirname(checkout), { recursive: true })
    git(root, ['clone', '--no-checkout', '--no-hardlinks', root, checkout], environment)
    git(checkout, ['checkout', '--detach', base], environment)
    if (attempt('git', ['cat-file', '-e', `${upstream.commit}^{commit}`], { cwd: checkout, env: environment }).status !== 0) git(checkout, ['fetch', '--no-tags', `https://github.com/${config.upstreamRepository}.git`, upstream.commit], environment)
    const merged = ['upstream', 'catch-up'].includes(String(plan.releaseKind)) ? attempt('git', ['-c', 'core.hooksPath=/dev/null', 'merge', '--no-ff', '--no-commit', upstream.commit], { cwd: checkout, env: environment }) : { status: 0 }
    if (merged.status !== 0 && git(checkout, ['diff', '--name-only', '--diff-filter=U'], environment) === '') throw new Error('Upstream merge failed before creating a resolvable merge')
  }
  if (range !== null) for (const entry of [range.from, ...range.releases]) git(checkout, ['merge-base', '--is-ancestor', entry.commit, range.to.commit], environment)
  const conflicts = git(checkout, ['diff', '--name-only', '--diff-filter=U'], environment)
  if (conflicts !== '') return operationPlan(config, 'adoption-prepare', { state: 'blocked', blocker: `Resolve conflicts in retained checkout: ${conflicts}`, checkout })
  const mergeHead = attempt('git', ['rev-parse', '--verify', 'MERGE_HEAD'], { cwd: checkout, env: environment })
  if (mergeHead.status === 0 && mergeHead.stdout.trim() !== upstream.commit) throw new Error('Retained checkout merges a different upstream commit')
  if (mergeHead.status !== 0) git(checkout, ['merge-base', '--is-ancestor', upstream.commit, 'HEAD'], environment)
  git(checkout, ['merge-base', '--is-ancestor', base, 'HEAD'], environment)
  if (range !== null) assessmentFiles(range, config.sourceLockPath, path => localEvidence(checkout, path), false)
  await checks(checkout, environment)
  if (mergeHead.status === 0 || git(checkout, ['status', '--porcelain'], environment) !== '') {
    git(checkout, ['add', '--all'], environment)
    git(checkout, ['commit', '-m', `Prepare ${upstream.tag} for reviewed desktop adoption`], environment)
  }
  const seed = git(checkout, ['rev-parse', 'HEAD'], environment)
  const tree = git(checkout, ['rev-parse', 'HEAD^{tree}'], environment)
  if (range !== null) assessmentFiles(range, config.sourceLockPath, path => gitEvidence(checkout, seed, path), false)
  const advances = ['upstream', 'catch-up'].includes(String(plan.releaseKind))
  const proposedLock = { schemaVersion: 3,
    catchUp: range ?? (advances ? null : previous.catchUp ?? null),
    upstreamRepository: config.upstreamRepository,
    release: upstream,
    predecessor: advances ? previous.release : previous.predecessor,
    observed: advances ? plan.observations : previous.observed,
    adoptionSeed: { commit: seed, tree } }
  sourceLock(proposedLock, config)
  return operationPlan(config, 'adoption-apply', { base, releaseKind: plan.releaseKind, priorDelivery: plan.priorDelivery, branch: plan.branch, upstream, desktopVersion: plan.desktopVersion, seed, tree, proposedLock, previousLockDigest: plan.previousLockDigest, checkout, nextAction: 'Review and push this exact seed branch using maintainer credentials; dispatch bot finalization with this plan digest.' })
}

/** Finalize only the source lock using GitHub's authenticated bot identity.
 * @param config - repository and lock location.
 * @param plan - approved exact seed/finalization plan.
 * @param api - GitHub adapter executing as the Actions bot.
 * @param bootstrapSeedLockDigest - prevalidated initial-bootstrap exception; routine callers omit it.
 * @returns Existing or newly created PR; matching retries do not mutate.
 */
export async function applyAdoption(config: DeliveryConfig,
  plan: Record<string,
    unknown>,
  api: GitHub,
  bootstrapSeedLockDigest?: string): Promise<Record<string,
  unknown>> {
  validatePlan(plan, 'adoption-apply', config)
  const base = `/repos/${config.repository}`
  const branch = string(plan.branch)
  if (!/^desktop-adopt\/\d+-[a-f0-9]{12}$/u.test(branch)) throw new Error('Unexpected adoption branch')
  const seed = hex(plan.seed, 40)
  const tree = hex(plan.tree, 40)
  const lock = sourceLock(plan.proposedLock, config)
  if ((lock.schemaVersion !== 2 && lock.schemaVersion !== 3) || lock.adoptionSeed?.commit !== seed || lock.adoptionSeed.tree !== tree || !sameRelease(lock.release, release(plan.upstream))) throw new Error('Seed lock identity mismatch')
  const serialized = `${JSON.stringify(plan.proposedLock, null, 2)}\n`
  const reviewedBase = hex(plan.base, 40)
  const ancestry = object(await api.request('GET', `${base}/compare/${reviewedBase}...${seed}`))
  if (ancestry.status !== 'ahead' && ancestry.status !== 'identical') throw new Error('Seed lost reviewed downstream base')
  const currentMain = object(object(await api.request('GET', `${base}/git/ref/heads/${config.defaultBranch}`)).object)
  const mainRelation = object(await api.request('GET', `${base}/compare/${reviewedBase}...${hex(currentMain.sha, 40)}`))
  if (mainRelation.status !== 'ahead' && mainRelation.status !== 'identical') throw new Error('Reviewed downstream base is not on current main')
  const baseLock = await optional(api, `${base}/contents/${config.sourceLockPath}?ref=${reviewedBase}`)
  if (bootstrapSeedLockDigest === undefined && (baseLock === undefined || digest(Buffer.from(textField(baseLock.content), 'base64')) !== hex(plan.previousLockDigest))) throw new Error('Reviewed prior source lock changed')
  if (bootstrapSeedLockDigest !== undefined && baseLock !== undefined) throw new Error('Bootstrap absence conflicts with existing base lock')
  if (bootstrapSeedLockDigest === undefined) {
    const currentLock = object(await api.request('GET', `${base}/contents/${config.sourceLockPath}?ref=${hex(currentMain.sha, 40)}`))
    if (digest(Buffer.from(textField(currentLock.content), 'base64')) !== plan.previousLockDigest) throw new Error('Current main source-lock lineage moved')
    const previous = sourceLock(JSON.parse(Buffer.from(textField(currentLock.content), 'base64').toString()) as unknown, config)
    if (lock.catchUp !== undefined && lock.catchUp !== null) {
      const sameUpstream = sameRelease(previous.release, lock.release)
      if (sameUpstream ? !['desktop', 'replacement'].includes(String(plan.releaseKind)) : plan.releaseKind !== 'catch-up') throw new Error('Catch-up adoption kind disagrees with actual source advancement')
    }
    if (previous.observed.some(recorded => !lock.observed.some(entry => sameRelease(entry, recorded)))) throw new Error('Finalization discarded prior observations')
    deliveryPredecessor(sameRelease(previous.release, lock.release) ? 'desktop' : lock.catchUp === undefined || lock.catchUp === null ? 'upstream' : 'catch-up', lock, { upstream: previous.release })
    if (sameRelease(previous.release, lock.release) && JSON.stringify(previous.catchUp ?? null) !== JSON.stringify(lock.catchUp ?? null)) throw new Error('Same-upstream finalization changed catch-up evidence')
  }

  if (lock.catchUp !== undefined && lock.catchUp !== null) {
    if (bootstrapSeedLockDigest !== undefined) throw new Error('Catch-up cannot use bootstrap finalization')
    await verifyLiveCatchUp(config, api, lock.catchUp, lock.observed)
    await verifyRemoteAssessment(config, api, seed, lock.catchUp, false)
    if (plan.releaseKind === 'catch-up') {
      const prior = object(plan.priorDelivery)
      if (!sameRelease(release(prior.upstream), lock.catchUp.from)) throw new Error('Catch-up baseline differs from range start')
      await verifyCatchUpBaseline(config, prior, api)
    } else if (!['desktop', 'replacement'].includes(String(plan.releaseKind))) throw new Error('Catch-up requires explicit adoption kind')
  } else if (plan.releaseKind === 'catch-up') throw new Error('Missing catch-up evidence')
  const pendingPrs = await pages(api, `${base}/pulls?state=open&head=${encodeURIComponent(`${config.repository.split('/')[0]}:${branch}`)}&base=${config.defaultBranch}`)
  if (pendingPrs.length > 1 || pendingPrs.some(pr => object(pr.user).id !== config.botId || object(pr.user).type !== 'Bot')) throw new Error('Adoption PR identity is conflicting or not bot-authored')
  const headPath = `${base}/git/ref/heads/${branch}`
  const head = hex(object(object(await api.request('GET', headPath)).object).sha, 40)
  const finalized = async (commit: string): Promise<boolean> => {
    const metadata = object(await api.request('GET', `${base}/git/commits/${commit}`))
    if (!Array.isArray(metadata.parents) || metadata.parents.length !== 1 || object(metadata.parents[0]).sha !== seed) return false
    const file = await optional(api, `${base}/contents/${config.sourceLockPath}?ref=${commit}`)
    if (file === undefined || typeof file.content !== 'string' || Buffer.from(file.content, 'base64').toString() !== serialized) return false
    const changed = object(await api.request('GET', `${base}/compare/${seed}...${commit}`)).files
    return Array.isArray(changed) && changed.length === 1 && object(changed[0]).filename === config.sourceLockPath
  }
  if (head !== seed && !await finalized(head)) throw new Error('Adoption branch moved; a new reviewed seed is required')
  if (head === seed) {
    const metadata = object(await api.request('GET', `${base}/git/commits/${seed}`))
    if (object(metadata.tree).sha !== tree) throw new Error('Seed tree changed')
    const relation = object(await api.request('GET', `${base}/compare/${lock.release.commit}...${seed}`))
    if (relation.status !== 'ahead' && relation.status !== 'identical') throw new Error('Seed does not retain upstream ancestry')
    const prior = await optional(api, `${base}/contents/${config.sourceLockPath}?ref=${seed}`)
    if (prior !== undefined) {
      if (bootstrapSeedLockDigest !== undefined && digest(Buffer.from(textField(prior.content), 'base64')) !== bootstrapSeedLockDigest) throw new Error('Bootstrap seed lock bytes changed')
      const priorLock = sourceLock(JSON.parse(Buffer.from(textField(prior.content), 'base64').toString()) as unknown, config)
      const sameUpstream = sameRelease(priorLock.release, lock.release)
      if (!sameUpstream && (lock.predecessor === null || !sameRelease(priorLock.release, lock.predecessor))) throw new Error('Predecessor changed')
      if (sameUpstream && JSON.stringify(priorLock.catchUp ?? null) !== JSON.stringify(lock.catchUp ?? null)) throw new Error('Recovery changed catch-up evidence')
      if (sameUpstream && JSON.stringify(priorLock.predecessor) !== JSON.stringify(lock.predecessor)) throw new Error('Recovery changed predecessor')
      if (Buffer.from(textField(prior.content), 'base64').toString() === serialized) throw new Error('Source-lock finalization must be substantive')
    }
    const beforeWrite = object(object(await api.request('GET', `${base}/git/ref/heads/${config.defaultBranch}`)).object)
    if (beforeWrite.sha !== currentMain.sha || object(object(await api.request('GET', headPath)).object).sha !== seed) throw new Error('Remote movement before finalization')
    const blob = object(await api.request('POST', `${base}/git/blobs`, { content: serialized, encoding: 'utf-8' }))
    const newTree = object(await api.request('POST', `${base}/git/trees`, { base_tree: tree, tree: [{ path: config.sourceLockPath, mode: '100644', type: 'blob', sha: hex(blob.sha, 40) }] }))
    const commit = object(await api.request('POST', `${base}/git/commits`, { message: `Finalize source lock for ${lock.release.tag}`, tree: hex(newTree.sha, 40), parents: [seed] }))
    const commitSha = hex(commit.sha, 40)
    if (object(object(await api.request('GET', `${base}/git/ref/heads/${config.defaultBranch}`)).object).sha !== currentMain.sha || object(object(await api.request('GET', headPath)).object).sha !== seed) throw new Error('Remote movement before branch update')
    try { await api.request('PATCH', `${base}/git/refs/heads/${branch}`, { sha: commitSha, force: false }) }
    catch (error) { if (object(object(await api.request('GET', headPath)).object).sha !== commitSha) throw error }
  }
  const prs = await pages(api, `${base}/pulls?state=open&head=${encodeURIComponent(`${config.repository.split('/')[0]}:${branch}`)}&base=${config.defaultBranch}`)
  if (prs.length > 1) throw new Error('Duplicate adoption PRs require repair')
  let pr = prs[0]
  if (pr !== undefined && (object(pr.user).id !== config.botId || object(pr.user).type !== 'Bot')) throw new Error('Existing adoption PR is not authored by the Actions bot')
  if (pr === undefined) {
    try { pr = object(await api.request('POST', `${base}/pulls`, { title: `Adopt ${lock.release.tag}`, head: branch, base: config.defaultBranch, body: `Adopts ${lock.release.commit}. Desktop version: ${string(plan.desktopVersion)}. Merge with a merge commit to preserve upstream ancestry. Bot source-lock finalization must remain the last substantive push before owner review.` })) }
    catch (error) { pr = (await pages(api, `${base}/pulls?state=open&head=${encodeURIComponent(`${config.repository.split('/')[0]}:${branch}`)}&base=${config.defaultBranch}`))[0]; if (pr === undefined) throw error }
  }
  return operationPlan(config, 'adoption-apply', { state: 'prepared-for-review', pullRequest: pr.html_url, seed, nextAction: 'Manually dispatch desktop-ci.yml on this finalized branch/SHA and require Desktop source checks, then owner reviews and merges with a merge commit; no approval or merge was performed.' })
}

/** Validate bot finalization from local Git objects before native qualification.
 * @param root - clean candidate checkout.
 * @param config - lock path.
 * @param commit - exact candidate revision.
 * @returns Parsed source lock.
 */
export function verifyFinalization(root: string, config: DeliveryConfig, commit: string): ReturnType<typeof sourceLock> {
  const lock = sourceLock(JSON.parse(git(root, ['show', `${hex(commit, 40)}:${config.sourceLockPath}`])) as unknown, config)
  if ((lock.schemaVersion !== 2 && lock.schemaVersion !== 3) || lock.adoptionSeed === undefined) throw new Error('Production qualification requires schema2 bot finalization')
  const finalization = git(root, ['log', '-1', '--format=%H', commit, '--', config.sourceLockPath])
  const parent = git(root, ['show', '-s', '--format=%P', finalization])
  if (parent !== lock.adoptionSeed.commit || git(root, ['rev-parse', `${parent}^{tree}`]) !== lock.adoptionSeed.tree) throw new Error('Finalization seed parent/tree mismatch')
  if (git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', finalization]) !== config.sourceLockPath) throw new Error('Finalization changes more than its source lock')
  if (git(root, ['rev-parse', `${commit}^{tree}`]) !== git(root, ['rev-parse', `${finalization}^{tree}`])) throw new Error('Code changed after finalization; obtain a new substantive bot lock commit')
  git(root, ['merge-base', '--is-ancestor', lock.release.commit, commit])
  if (lock.catchUp !== undefined && lock.catchUp !== null) {
    for (const entry of [lock.catchUp.from, ...lock.catchUp.releases]) git(root, ['merge-base', '--is-ancestor', entry.commit, lock.catchUp.to.commit])
    assessmentFiles(lock.catchUp, config.sourceLockPath, path => gitEvidence(root, parent, path), false)
  }
  return lock
}
