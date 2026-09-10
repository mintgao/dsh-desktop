/** Exact catch-up observations and committed compatibility evidence shared by trusted consumers. */
import { compareVersions } from 'compare-versions'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { catchUpEvidence, compareRelease, digest, evidencePath, hex, object, release, sameRelease, string, textField, type CatchUp, type EvidenceReference, type Release, type SourceLock } from './evidence.ts'
import { pages, type DeliveryConfig, type GitHub } from './operations.ts'

/** Select the exact explicit interval without changing scheduled discovery semantics.
 * @param lock - prior source lock.
 * @param values - complete selected observations.
 * @param tag - explicitly requested target tag.
 * @param commit - explicitly requested target commit.
 * @returns Ordered complete observations through the target.
 */
export function catchUpObservations(lock: SourceLock, values: unknown, tag: string, commit: string): Release[] {
  const input = object(values)
  if (input.complete !== true || !Array.isArray(input.releases)) throw new Error('Incomplete catch-up observations')
  hex(commit, 40)
  const observations = input.releases.map(release)
  if (new Set(observations.map(item => item.id)).size !== observations.length || new Set(observations.map(item => item.tag)).size !== observations.length) throw new Error('Duplicate or conflicting catch-up observations')
  const target = observations.find(item => item.tag === tag)
  if (target === undefined || target.commit !== commit || compareRelease(target, lock.release) <= 0) throw new Error('Absent, wrong or non-advancing catch-up target')
  const selected = observations.sort(compareRelease)
  for (const recorded of lock.observed) if (!selected.some(item => sameRelease(item, recorded))) throw new Error('Recorded catch-up observation changed or disappeared')
  for (const item of selected) if (compareRelease(item, lock.release) <= 0 && !lock.observed.some(recorded => sameRelease(recorded, item))) throw new Error('Unexpected earlier catch-up observation')
  if (selected.filter(item => compareRelease(item, lock.release) > 0 && compareRelease(item, target) <= 0).length < 2) throw new Error('Catch-up requires at least two releases; use upstream for one successor')
  return selected
}

/** Validate the assessment inventory and scenario outcomes before reading leaf evidence.
 * @param range - exact lock evidence.
 * @param bytes - assessment bytes.
 * @param lockPath - forbidden source-lock reference.
 * @param qualified - require verified upgrade scenarios for publication.
 * @returns Distinct assessment and leaf file identities.
 */
export function assessmentReferences(range: CatchUp, bytes: Uint8Array, lockPath: string, qualified: boolean): EvidenceReference[] {
  if (range.assessment.path === lockPath || digest(bytes) !== range.assessment.sha256) throw new Error('Catch-up assessment digest or source-lock reference is invalid')
  const assessment = object(JSON.parse(Buffer.from(bytes).toString()) as unknown)
  if (assessment.schemaVersion !== 1 || !sameRelease(release(assessment.from), range.from) || !sameRelease(release(assessment.to), range.to)
    || !Array.isArray(assessment.releases) || assessment.releases.length !== range.releases.length
    || assessment.releases.some((entry, index) => !sameRelease(release(entry), release(range.releases[index])))
    || !Array.isArray(assessment.edges) || assessment.edges.length !== range.releases.length) throw new Error('Assessment range or consecutive edges are incomplete')
  const references = new Map<string, EvidenceReference>([[range.assessment.path, range.assessment]])
  const edgeSources = [range.from, ...range.releases]
  for (const [index, value] of [...(assessment.edges as unknown[]), assessment.directUpgrade].entries()) {
    const scenario = object(value)
    const from = index === range.releases.length ? range.from : release(edgeSources[index])
    const to = index === range.releases.length ? range.to : release(range.releases[index])
    if (!sameRelease(release(scenario.from), from) || !sameRelease(release(scenario.to), to)) throw new Error('Assessment edge or direct upgrade identity mismatch')
    if (!['verified', 'blocked', 'unverified'].includes(String(scenario.status)) || (qualified && scenario.status !== 'verified')) throw new Error('Catch-up compatibility scenario is blocked or unverified')
    if (typeof scenario.persistedFormatsChanged !== 'boolean' || (qualified && scenario.persistedFormatsChanged)) throw new Error('Persisted format changes require separate migration qualification')
    if (!Array.isArray(scenario.unsupportedDowngrades) || scenario.unsupportedDowngrades.length === 0 || !Array.isArray(scenario.compatibilityFindings) || scenario.compatibilityFindings.length === 0 || !Array.isArray(scenario.evidenceReferences) || scenario.evidenceReferences.length === 0) throw new Error('Missing compatibility findings, downgrade limitations or evidence')
    const findings = [...(scenario.unsupportedDowngrades as unknown[]), ...(scenario.compatibilityFindings as unknown[])]
    for (const finding of findings) textField(finding)
    for (const value of scenario.evidenceReferences) {
      const entry = object(value)
      const reference = { path: evidencePath(entry.path), sha256: hex(entry.sha256) }
      if (reference.path === lockPath || reference.path === range.assessment.path) throw new Error('Self, cyclic or source-lock assessment reference')
      const prior = references.get(reference.path)
      if (prior !== undefined && prior.sha256 !== reference.sha256) throw new Error('Conflicting assessment reference digest')
      references.set(reference.path, reference)
    }
  }
  return [...references.values()]
}

/** Read a contained regular repository evidence file, rejecting symlink components.
 * @param root - repository directory.
 * @param path - canonical repository-relative path.
 * @returns Exact file bytes.
 */
export function localEvidence(root: string, path: string): Buffer {
  evidencePath(path)
  const directory = realpathSync(root)
  let current = directory
  for (const part of path.split('/')) {
    current = resolve(current, part)
    if (lstatSync(current).isSymbolicLink()) throw new Error('Assessment evidence cannot traverse symlinks')
  }
  if (!lstatSync(current).isFile() || !realpathSync(current).startsWith(`${directory}${sep}`)) throw new Error('Assessment evidence must be a contained regular file')
  return readFileSync(current)
}

/** Read a regular file from an exact Git tree, without executing candidate code.
 * @param root - Git repository.
 * @param commit - exact source commit.
 * @param path - relative evidence path.
 * @returns Committed file bytes.
 */
export function gitEvidence(root: string, commit: string, path: string): Buffer {
  hex(commit, 40); evidencePath(path)
  const entry = execFileSync('git', ['ls-tree', commit, '--', path], { cwd: root, encoding: 'utf8' })
  if (!/^100(?:644|755) blob [a-f0-9]{40}\t/u.test(entry)) throw new Error('Committed assessment evidence must be a regular file')
  return execFileSync('git', ['show', `${commit}:${path}`], { cwd: root })
}

/** Rehash the complete assessment inventory through a local or committed byte reader.
 * @param range - normalized range.
 * @param lockPath - forbidden lock path.
 * @param read - exact file reader.
 * @param qualified - whether every scenario must be verified.
 * @returns Exact inventory and bytes for retained bundles.
 */
export function assessmentFiles(range: CatchUp,
  lockPath: string,
  read: (path: string) => Uint8Array,
  qualified: boolean): { reference: EvidenceReference; bytes: Uint8Array }[] {
  const assessment = read(range.assessment.path)
  return assessmentReferences(range, assessment, lockPath, qualified).map((reference) => {
    const bytes = reference.path === range.assessment.path ? assessment : read(reference.path)
    if (digest(bytes) !== reference.sha256) throw new Error(`Catch-up evidence digest mismatch: ${reference.path}`)
    return { reference, bytes }
  })
}

/** Stable flat release-asset name for a repository evidence path.
 * @param reference - original repository identity.
 * @returns Collision-resistant artifact name.
 */
export function assessmentAsset(reference: EvidenceReference): string { return `catch-up-${digest(reference.path)}.bin` }

/** Read regular remote evidence at an exact commit using the authenticated GitHub reader.
 * @param config - owning repository.
 * @param api - trusted transport.
 * @param commit - exact source revision.
 * @param path - repository-relative path.
 * @returns Server-returned regular file bytes.
 */
export async function remoteEvidence(config: DeliveryConfig, api: GitHub, commit: string, path: string): Promise<Buffer> {
  hex(commit, 40); evidencePath(path)
  const commitRecord = object(await api.request('GET', `/repos/${config.repository}/git/commits/${commit}`))
  const tree = object(await api.request('GET', `/repos/${config.repository}/git/trees/${hex(object(commitRecord.tree).sha, 40)}?recursive=1`))
  if (tree.truncated !== false || !Array.isArray(tree.tree)) throw new Error('Incomplete remote evidence tree')
  const file = tree.tree.map(object).find(entry => entry.path === path)
  if (file?.type !== 'blob' || !['100644', '100755'].includes(String(file.mode))) throw new Error('Remote assessment evidence must be a regular Git file')
  const entry = object(await api.request('GET', `/repos/${config.repository}/contents/${path}?ref=${commit}`))
  if (entry.type !== 'file' || entry.encoding !== 'base64' || entry.path !== path || 'target' in entry || 'submodule_git_url' in entry) throw new Error('Remote assessment evidence must be a regular file')
  return Buffer.from(textField(entry.content), 'base64')
}

/** Verify exact seed assessment bytes with no candidate execution.
 * @param config - owning repository.
 * @param api - trusted reader.
 * @param commit - exact seed commit.
 * @param range - normalized provenance.
 * @param qualified - require verified direct and edge scenarios.
 */
export async function verifyRemoteAssessment(config: DeliveryConfig,
  api: GitHub,
  commit: string,
  range: CatchUp,
  qualified: boolean): Promise<void> {
  const bytes = await remoteEvidence(config, api, commit, range.assessment.path)
  for (const reference of assessmentReferences(range, bytes, config.sourceLockPath, qualified)) {
    if (digest(reference.path === range.assessment.path ? bytes : await remoteEvidence(config, api, commit, reference.path)) !== reference.sha256) throw new Error('Remote assessment evidence digest mismatch')
  }
}

/** Recompute the pinned interval from complete live public release observations and ancestry.
 * @param config - owning distribution.
 * @param api - trusted GitHub reader.
 * @param range - exact reviewed interval.
 * @param recorded - complete lock observations, including retained identities outside the interval.
 */
export async function verifyLiveCatchUp(config: DeliveryConfig, api: GitHub, range: CatchUp, recorded?: Release[]): Promise<void> {
  const base = `/repos/${config.upstreamRepository}`
  const observations: Release[] = []
  for (const item of await pages(api, `${base}/releases`)) {
    if (item.draft === true) continue
    if (typeof item.draft !== 'boolean' || typeof item.prerelease !== 'boolean') throw new Error('Malformed live catch-up release flags')
    const tag = string(item.tag_name)
    if (!tag.startsWith(config.tagPrefix)) continue
    let ref = object(object(await api.request('GET', `${base}/git/ref/tags/${encodeURIComponent(tag)}`)).object)
    for (let depth = 0; ref.type === 'tag' && depth < 5; depth++) ref = object(object(await api.request('GET', `${base}/git/tags/${hex(ref.sha, 40)}`)).object)
    if (ref.type !== 'commit') throw new Error('Catch-up tag does not resolve to a commit')
    observations.push(release({ id: item.id, tag, commit: ref.sha, publishedAt: item.published_at }))
  }
  if (new Set(observations.map(item => item.id)).size !== observations.length || new Set(observations.map(item => item.tag)).size !== observations.length) throw new Error('Duplicate live catch-up identities')
  catchUpEvidence(range, observations)
  if (recorded !== undefined) {
    for (const known of recorded) if (!observations.some(item => sameRelease(item, known))) throw new Error('Recorded live catch-up identity changed or disappeared')
    for (const item of observations) if (compareRelease(item, range.to) <= 0 && !recorded.some(known => sameRelease(item, known))) throw new Error('Newly inserted live catch-up identity before target')
  }
  for (const entry of [range.from, ...range.releases]) {
    const relation = object(await api.request('GET', `${base}/compare/${entry.commit}...${range.to.commit}`))
    if (relation.status !== 'ahead' && relation.status !== 'identical') throw new Error('Non-ancestral catch-up release range')
  }
}

/** Validate the actual public delivery tip before planning or finalizing a catch-up.
 * @param config - owning distribution.
 * @param prior - exact delivered manifest or activated legacy baseline.
 * @param api - trusted read transport.
 */
export async function verifyCatchUpBaseline(config: DeliveryConfig, prior: Record<string, unknown>, api: GitHub): Promise<void> {
  const tag = string(prior.desktopTag ?? prior.tag)
  if (prior.repository !== config.repository || prior.repositoryId !== config.repositoryId) throw new Error('Catch-up delivery baseline repository mismatch')
  const releases = (await pages(api, `/repos/${config.repository}/releases`)).filter(item => string(item.tag_name).startsWith('desktop-v'))
  const current = releases.find(item => item.tag_name === tag)
  if (current?.draft !== false) throw new Error('Catch-up delivery baseline is missing or withdrawn')
  if (releases.some(item => item.draft === false && compareVersions(string(item.tag_name).slice(9), tag.slice(9)) > 0)) throw new Error('Catch-up delivery baseline is not the public tip')
  let expected: Record<string, unknown>
  if (prior.purpose === 'desktop-legacy-baseline') {
    expected = object(JSON.parse(readFileSync(config.baselinePath, 'utf8')) as unknown)
    const activation = object(JSON.parse(readFileSync(config.activationPath, 'utf8')) as unknown)
    if (activation.active !== true || activation.repositoryId !== config.repositoryId || activation.botId !== config.botId || activation.baselineDigest !== digest(readFileSync(config.baselinePath)) || prior.releaseId !== current.id) throw new Error('Catch-up legacy baseline is not activated')
  } else if (prior.purpose === 'desktop-release-qualification') {
    const assets = await pages(api, `/repos/${config.repository}/releases/${String(current.id)}/assets`)
    const manifest = assets.filter(item => item.name === 'manifest.json')
    if (manifest.length !== 1) throw new Error('Catch-up baseline manifest is missing or conflicting')
    const bytes = await api.request('DOWNLOAD', `/repos/${config.repository}/releases/assets/${String(manifest[0]?.id)}`)
    if (!(bytes instanceof Uint8Array)) throw new Error('Catch-up baseline download failed')
    expected = object(JSON.parse(Buffer.from(bytes).toString()) as unknown)
    if (![1, 2].includes(Number(expected.schemaVersion)) || expected.mode !== 'unsigned-preview' || expected.distribution !== config.id) throw new Error('Invalid delivered baseline manifest')
  } else throw new Error('Unknown catch-up delivery baseline')
  if (Array.isArray(prior.unresolvedAdoption) && prior.unresolvedAdoption.length > 0) throw new Error('Unresolved delivery baseline adoption')
  if (JSON.stringify(expected) !== JSON.stringify(prior)) throw new Error('Catch-up baseline differs from verified delivery evidence')
  let ref = object(object(await api.request('GET', `/repos/${config.repository}/git/ref/tags/${encodeURIComponent(tag)}`)).object)
  for (let depth = 0; ref.type === 'tag' && depth < 5; depth++) ref = object(object(await api.request('GET', `/repos/${config.repository}/git/tags/${hex(ref.sha, 40)}`)).object)
  if (ref.type !== 'commit' || ref.sha !== (prior.sourceCommit ?? prior.downstreamCommit)) throw new Error('Catch-up baseline tag identity changed')
}
