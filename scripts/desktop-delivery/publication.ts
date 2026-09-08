/** Digest-approved publication and recovery over immutable tags and an existing matching draft. */
import { compareVersions } from 'compare-versions'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assetPath, digest, hex, object, sameRelease, release, string, textField } from './evidence.ts'
import { deliveryPredecessor, requireNewVersion } from './lineage.ts'
import { sourceLock } from './evidence.ts'
import { checkedManifest, type ReleaseFile } from './manifest.ts'
import { operationPlan, pages, validatePlan, type DeliveryConfig, type GitHub } from './operations.ts'
import { tagCommit } from './migration.ts'

function withdrawalManifest(config: DeliveryConfig, path: string): ReturnType<typeof checkedManifest> {
  const bytes = readFileSync(path)
  const manifest = object(JSON.parse(bytes.toString()) as unknown)
  if (manifest.schemaVersion !== 1 || manifest.purpose !== 'desktop-release-qualification' || manifest.mode !== 'unsigned-preview'
    || manifest.repository !== config.repository || manifest.repositoryId !== config.repositoryId || manifest.distribution !== config.id
    || manifest.tag !== `desktop-v${string(manifest.desktopVersion)}` || !Array.isArray(manifest.files)) throw new Error('Withdrawal manifest identity mismatch')
  hex(manifest.downstreamCommit, 40)
  hex(manifest.sourceLockDigest)
  release(manifest.upstream)
  return { manifest,
    digest: digest(bytes),
    files: manifest.files.map((value) => { const file = object(value); return { name: string(file.name),
      size: Number(file.size),
      sha256: hex(file.sha256) } }) }
}
async function findRelease(config: DeliveryConfig, tag: string, api: GitHub): Promise<Record<string, unknown> | undefined> {
  const matches = (await pages(api, `/repos/${config.repository}/releases`)).filter(item => item.tag_name === tag)
  if (matches.length > 1) throw new Error('Conflicting duplicate releases for tag')
  return matches[0]
}
async function downloaded(api: GitHub, path: string): Promise<Uint8Array> {
  const bytes = await api.request('DOWNLOAD', path)
  if (!(bytes instanceof Uint8Array)) throw new Error('GitHub download did not return bytes')
  return bytes
}
async function archiveFiles(api: GitHub, repository: string, artifactId: number, expected: ReleaseFile[]): Promise<void> {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-release-archive-'))
  try {
    const path = join(temporary, 'bundle.zip')
    writeFileSync(path, await downloaded(api, `/repos/${repository}/actions/artifacts/${String(artifactId)}/zip`))
    const names = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' }).trim().split('\n')
    if (names.length !== expected.length || new Set(names).size !== names.length || names.some(name => !expected.some(file => file.name === name))) throw new Error('Qualification archive file set differs')
    for (const file of expected) {
      const bytes = execFileSync('unzip', ['-p', path, file.name], { maxBuffer: file.size + 1024 })
      if (bytes.length !== file.size || digest(bytes) !== file.sha256) throw new Error('Qualification archive bytes differ from approved local payload')
    }
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}

/** Verify server-owned qualification identity and, when needed, its exact artifact archive.
 * @param config - owning repository.
 * @param manifest - final qualification metadata.
 * @param api - GitHub reads.
 * @param files - exact local payload including manifest, absent when retained release assets are authoritative.
 */
export async function verifyQualification(config: DeliveryConfig,
  manifest: Record<string, unknown>,
  api: GitHub,
  files?: ReleaseFile[]): Promise<void> {
  const identity = object(manifest.workflow)
  const run = object(await api.request('GET', `/repos/${config.repository}/actions/runs/${String(identity.runId)}`))
  if (run.event !== 'workflow_dispatch' || run.head_branch !== config.defaultBranch || run.path !== identity.path || run.head_sha !== identity.commit || run.run_attempt !== identity.attempt || run.status !== 'completed' || run.conclusion !== 'success' || object(run.repository).id !== config.repositoryId) throw new Error('Qualification run identity, attempt or conclusion changed')
  const main = object(await api.request('GET', `/repos/${config.repository}/git/ref/heads/${config.defaultBranch}`))
  const relation = object(await api.request('GET', `/repos/${config.repository}/compare/${hex(manifest.downstreamCommit, 40)}...${hex(object(main.object).sha, 40)}`))
  if (relation.status !== 'ahead' && relation.status !== 'identical') throw new Error('Candidate is not reachable from protected main')
  const orchestration = object(await api.request('GET', `/repos/${config.repository}/compare/${hex(identity.commit, 40)}...${hex(object(main.object).sha, 40)}`))
  if (!['ahead', 'identical'].includes(String(orchestration.status))) throw new Error('Orchestration revision is not on protected main')
  const source = object(await api.request('GET', `/repos/${config.repository}/contents/${config.sourceLockPath}?ref=${string(manifest.downstreamCommit)}`))
  const bytes = Buffer.from(textField(source.content), 'base64')
  if (digest(bytes) !== manifest.sourceLockDigest) throw new Error('Qualified source-lock bytes changed')
  const lock = object(JSON.parse(bytes.toString()) as unknown)
  const seed = object(lock.adoptionSeed)
  const seedCommit = object(await api.request('GET', `/repos/${config.repository}/git/commits/${hex(seed.commit, 40)}`))
  if (lock.schemaVersion !== 2 || object(seedCommit.tree).sha !== seed.tree || !sameRelease(release(lock.release), release(manifest.upstream))) throw new Error('Qualified source-lock seed is inconsistent')
  const history = await api.request('GET', `/repos/${config.repository}/commits?sha=${string(manifest.downstreamCommit)}&path=${config.sourceLockPath}&per_page=1`)
  if (!Array.isArray(history) || history.length !== 1) throw new Error('Missing source-lock finalization history')
  const finalization = object(await api.request('GET', `/repos/${config.repository}/git/commits/${hex(object(history[0]).sha, 40)}`))
  if (!Array.isArray(finalization.parents) || finalization.parents.length !== 1 || object(finalization.parents[0]).sha !== seed.commit) throw new Error('Finalization lost its sole seed parent')
  const candidateCommit = object(await api.request('GET', `/repos/${config.repository}/git/commits/${string(manifest.downstreamCommit)}`))
  if (object(candidateCommit.tree).sha !== object(finalization.tree).sha) throw new Error('Source changed after lock finalization')
  const changes = object(await api.request('GET', `/repos/${config.repository}/compare/${string(seed.commit)}...${string(object(history[0]).sha)}`)).files
  if (!Array.isArray(changes) || changes.length !== 1 || object(changes[0]).filename !== config.sourceLockPath) throw new Error('Finalization changed more than the source lock')
  for (const [path, expected] of [['release-notes.md', manifest.releaseNotesDigest], ['data-compatibility.json', manifest.dataCompatibilityDigest]]) {
    const document = object(await api.request('GET', `/repos/${config.repository}/contents/.github/desktop-delivery/${String(path)}?ref=${string(manifest.downstreamCommit)}`))
    if (digest(Buffer.from(textField(document.content), 'base64')) !== expected) throw new Error('Published assessment differs from candidate source')
  }
  if (files !== undefined) {
    const artifacts = (await pages(api, `/repos/${config.repository}/actions/runs/${String(identity.runId)}/artifacts`, 'artifacts')).filter(item => item.name === 'desktop-release-bundle')
    if (artifacts.length !== 1 || artifacts[0]?.expired !== false) throw new Error('Missing or expired qualification artifact bundle')
    await archiveFiles(api, config.repository, Number(artifacts[0].id), files)
  }
}

async function verifyAssets(config: DeliveryConfig,
  remote: Record<string, unknown>,
  files: ReleaseFile[],
  api: GitHub,
  allowMissing: boolean): Promise<ReleaseFile[]> {
  const assets = await pages(api, `/repos/${config.repository}/releases/${String(remote.id)}/assets`)
  const seen = new Set<string>()
  for (const asset of assets) {
    const name = string(asset.name)
    const expected = files.find(file => file.name === name)
    if (seen.has(name) || expected === undefined || asset.size !== expected.size) throw new Error('Conflicting release asset set')
    seen.add(name)
    const bytes = await downloaded(api, `/repos/${config.repository}/releases/assets/${String(asset.id)}`)
    if (bytes.length !== expected.size || digest(bytes) !== expected.sha256) throw new Error(`Release asset bytes conflict: ${name}`)
  }
  const missing = files.filter(file => !seen.has(file.name))
  if (!allowMissing && missing.length !== 0) throw new Error('Release is missing approved assets')
  return missing
}
function payload(manifestPath: string, files: ReleaseFile[]): ReleaseFile[] {
  const bytes = readFileSync(manifestPath)
  return [...files, { name: 'manifest.json', size: bytes.length, sha256: digest(bytes) }]
}
function releaseBody(directory: string, manifestDigest: string): string {
  return `${textField(readFileSync(assetPath(directory, 'release-notes.md'), 'utf8'))}\n\nManifest SHA-256: ${manifestDigest}\n`
}
async function verifyDelivery(config: DeliveryConfig,
  manifest: Record<string, unknown>,
  directory: string,
  manifestDigest: string,
  api: GitHub): Promise<void> {
  const retained = (await pages(api, `/repos/${config.repository}/releases`)).filter(item => string(item.tag_name).startsWith('desktop-v'))
  const matching = retained.find(item => item.tag_name === manifest.tag)
  if (matching !== undefined && matching.body !== releaseBody(directory, manifestDigest)) throw new Error('Desktop tag is already reserved by another manifest')
  if (matching?.draft === false) return
  requireNewVersion(string(manifest.desktopVersion), retained, matching === undefined ? undefined : string(manifest.tag))
  const priorBytes = readFileSync(assetPath(directory, 'predecessor.json'))
  const prior = object(JSON.parse(priorBytes.toString()) as unknown)
  const source = object(await api.request('GET', `/repos/${config.repository}/contents/${config.sourceLockPath}?ref=${string(manifest.downstreamCommit)}`))
  const lock = sourceLock(JSON.parse(Buffer.from(textField(source.content), 'base64').toString()) as unknown, config)
  const expected = deliveryPredecessor(string(manifest.releaseKind), lock, prior)
  if (manifest.releaseKind === 'replacement') {
    const supersedes = object(manifest.supersedes)
    if (supersedes.tag !== prior.tag || supersedes.manifestDigest !== digest(priorBytes) || JSON.stringify(expected) !== JSON.stringify(manifest.predecessor)) throw new Error('Replacement lineage changed')
    const withdrawn = retained.find(item => item.tag_name === supersedes.tag)
    if (withdrawn?.draft !== true) throw new Error('Replacement requires a withdrawn tip')
    const withdrawnAssets = await pages(api, `/repos/${config.repository}/releases/${String(withdrawn.id)}/assets`)
    const oldManifest = withdrawnAssets.filter(item => item.name === 'manifest.json')
    if (oldManifest.length !== 1 || digest(await downloaded(api, `/repos/${config.repository}/releases/assets/${String(oldManifest[0]?.id)}`)) !== supersedes.manifestDigest) throw new Error('Withdrawn replacement manifest differs')
    for (const item of retained.filter(item => item.tag_name !== manifest.tag && item.tag_name !== supersedes.tag)) {
      const assets = await pages(api, `/repos/${config.repository}/releases/${String(item.id)}/assets`)
      const asset = assets.find(value => value.name === 'manifest.json')
      if (asset === undefined) continue
      const published = object(JSON.parse(Buffer.from(await downloaded(api, `/repos/${config.repository}/releases/assets/${String(asset.id)}`)).toString()) as unknown)
      if (object(published.predecessor).tag === supersedes.tag) throw new Error('Replacement cannot discard a published successor')
    }
  } else if (object(manifest.predecessor).digest !== digest(priorBytes) || object(manifest.predecessor).tag !== expected.tag) throw new Error('Delivery predecessor evidence changed')
  const publicOther = retained.filter(item => item.draft === false && item.tag_name !== manifest.tag)
  const immediateTag = manifest.releaseKind === 'replacement' ? object(manifest.predecessor).tag : prior.desktopTag ?? prior.tag
  publicOther.sort((left, right) => compareVersions(string(right.tag_name).slice('desktop-v'.length), string(left.tag_name).slice('desktop-v'.length)))
  if (publicOther[0]?.tag_name !== immediateTag) throw new Error('Delivery predecessor is not the public tip')
}
async function verifyLineage(config: DeliveryConfig,
  manifest: Record<string, unknown>,
  api: GitHub,
  baselineDigest: string): Promise<void> {
  let predecessor = object(manifest.predecessor)
  const seen = new Set<string>()
  for (let depth = 0; depth < 100; depth++) {
    const tag = string(predecessor.tag)
    if (seen.has(tag)) throw new Error('Cyclic release lineage')
    seen.add(tag)
    const remote = await findRelease(config, tag, api)
    if (remote === undefined || remote.draft !== false) throw new Error('Missing or withdrawn predecessor blocks delivery')
    if (predecessor.kind === 'desktop-legacy-baseline') {
      if (predecessor.digest !== baselineDigest) throw new Error('Lineage does not reach activated legacy baseline')
      const baselineBytes = readFileSync(config.baselinePath)
      const baseline = object(JSON.parse(baselineBytes.toString()) as unknown)
      if (digest(baselineBytes) !== baselineDigest || baseline.releaseId !== remote.id || baseline.desktopTag !== tag
        || await tagCommit(config, tag, api) !== baseline.sourceCommit || !Array.isArray(baseline.assets)) throw new Error('Activated baseline identity changed')
      const baselineFiles = baseline.assets.map((value) => { const entry = object(value); return { name: string(entry.name),
        size: Number(entry.size),
        sha256: hex(entry.sha256) } })
      await verifyAssets(config, remote, baselineFiles, api, false)
      return
    }
    if (predecessor.kind !== 'desktop-release-qualification') throw new Error('Unknown predecessor evidence')
    const assets = await pages(api, `/repos/${config.repository}/releases/${String(remote.id)}/assets`)
    const manifests = assets.filter(asset => asset.name === 'manifest.json')
    if (manifests.length !== 1) throw new Error('Predecessor manifest is missing or conflicting')
    const bytes = await downloaded(api, `/repos/${config.repository}/releases/assets/${String(manifests[0]?.id)}`)
    if (digest(bytes) !== predecessor.digest) throw new Error('Predecessor manifest digest changed')
    const previous = object(JSON.parse(Buffer.from(bytes).toString()) as unknown)
    if (previous.repository !== config.repository || previous.tag !== tag || !sameRelease(release(previous.upstream), release(predecessor.upstream))) throw new Error('Predecessor identity changed')
    if (previous.purpose !== 'desktop-release-qualification' || previous.repositoryId !== config.repositoryId || previous.distribution !== config.id
      || !Array.isArray(previous.files) || await tagCommit(config, tag, api) !== previous.downstreamCommit) throw new Error('Predecessor qualification changed')
    const priorFiles = previous.files.map((value) => { const entry = object(value); return { name: string(entry.name),
      size: Number(entry.size),
      sha256: hex(entry.sha256) } })
    await verifyAssets(config, remote, [...priorFiles, { name: 'manifest.json', size: bytes.length, sha256: digest(bytes) }], api, false)
    predecessor = object(previous.predecessor)
  }
  throw new Error('Release lineage exceeds bounded verification')
}

/** Produce the exact plan shown before protected-environment approval.
 * @param config - distribution.
 * @param manifestPath - candidate manifest.
 * @param directory - approved bundle files.
 * @param operation - promote, withdraw or restore.
 * @param mutationRun - exact pending mutation workflow run identity.
 * @param api - read-only transport.
 * @returns Immutable local operation plan.
 */
export async function promotionPlan(config: DeliveryConfig,
  manifestPath: string,
  directory: string,
  operation: string,
  mutationRun: { id: number; attempt: number; commit: string },
  api: GitHub): Promise<Record<string, unknown>> {
  if (!['promote', 'withdraw', 'restore'].includes(operation)) throw new Error('Unsupported release mutation')
  const checked = operation === 'withdraw' ? withdrawalManifest(config, manifestPath) : checkedManifest(config, manifestPath, directory)
  await verifyQualification(config, checked.manifest, api, operation === 'promote' ? payload(manifestPath, checked.files) : undefined)
  if (operation === 'promote') await verifyDelivery(config, checked.manifest, directory, checked.digest, api)
  return operationPlan(config, operation, { manifestDigest: checked.digest, tag: checked.manifest.tag, candidate: checked.manifest.downstreamCommit, qualification: checked.manifest.workflow, mutationRun, nextAction: 'Review the exact plan; prepare its immutable tag and empty draft while this workflow waits for approval.' })
}
async function verifyMutationRun(config: DeliveryConfig, plan: Record<string, unknown>, api: GitHub, pending: boolean): Promise<void> {
  const identity = object(plan.mutationRun)
  const run = object(await api.request('GET', `/repos/${config.repository}/actions/runs/${String(identity.id)}`))
  if (run.event !== 'workflow_dispatch' || run.head_branch !== config.defaultBranch || run.path !== '.github/workflows/desktop-delivery-mutate.yml' || run.head_sha !== identity.commit || run.run_attempt !== identity.attempt || !['waiting', 'in_progress'].includes(String(run.status)) || object(run.repository).id !== config.repositoryId) throw new Error('Mutation run is cancelled, completed or has different identity')
  const main = object(object(await api.request('GET', `/repos/${config.repository}/git/ref/heads/${config.defaultBranch}`)).object)
  const ancestry = object(await api.request('GET', `/repos/${config.repository}/compare/${hex(identity.commit, 40)}...${hex(main.sha, 40)}`))
  if (!['ahead', 'identical'].includes(String(ancestry.status))) throw new Error('Mutation orchestration is not on protected main')
  const deployments = await api.request('GET', `/repos/${config.repository}/actions/runs/${String(identity.id)}/pending_deployments`)
  if (!Array.isArray(deployments) || (pending ? !deployments.some(value => object(object(value).environment).name === config.releaseEnvironment) : deployments.length !== 0)) throw new Error('Mutation environment approval state does not match operation')
  const planBytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`)
  const artifacts = (await pages(api, `/repos/${config.repository}/actions/runs/${String(identity.id)}/artifacts`, 'artifacts')).filter(item => item.name === 'desktop-approved-plan')
  if (artifacts.length !== 1 || artifacts[0]?.expired !== false) throw new Error('Pending workflow plan artifact is absent or expired')
  await archiveFiles(api, config.repository, Number(artifacts[0].id), [{ name: 'approved-plan.json', size: planBytes.length, sha256: digest(planBytes) }])
}

/** Maintainer-only tag/draft preparation while the corresponding run waits for approval.
 * @param config - repository.
 * @param plan - exact reviewed publication plan.
 * @param manifestPath - approved manifest bytes.
 * @param directory - complete payload.
 * @param api - maintainer-authenticated GitHub transport.
 * @returns Prepared draft identity, never a published release.
 */
export async function preparePublication(config: DeliveryConfig,
  plan: Record<string, unknown>,
  manifestPath: string,
  directory: string,
  api: GitHub): Promise<Record<string, unknown>> {
  validatePlan(plan, 'promote', config)
  const checked = checkedManifest(config, manifestPath, directory)
  if (plan.candidate !== checked.manifest.downstreamCommit || plan.operation !== 'promote' || checked.digest !== plan.manifestDigest || checked.manifest.tag !== plan.tag) throw new Error('Approved publication plan differs')
  await verifyMutationRun(config, plan, api, true)
  await verifyQualification(config, checked.manifest, api, payload(manifestPath, checked.files))
  await verifyDelivery(config, checked.manifest, directory, checked.digest, api)
  const tag = string(plan.tag)
  const candidate = hex(plan.candidate, 40)
  const existing = await tagCommit(config, tag, api)
  if (existing !== undefined && existing !== candidate) throw new Error('Immutable tag points to a conflicting commit')
  if (existing === undefined) {
    try { await api.request('POST', `/repos/${config.repository}/git/refs`, { ref: `refs/tags/${tag}`, sha: candidate }) }
    catch (error) { if (await tagCommit(config, tag, api) !== candidate) throw error }
  }
  await verifyMutationRun(config, plan, api, true)
  const body = releaseBody(directory, checked.digest)
  let remote = await findRelease(config, tag, api)
  if (remote === undefined) {
    try { remote = object(await api.request('POST', `/repos/${config.repository}/releases`, { tag_name: tag, target_commitish: candidate, name: tag, body, draft: true, prerelease: true })) }
    catch (error) { remote = await findRelease(config, tag, api); if (remote === undefined) throw error }
  }
  if (remote.body !== body || remote.prerelease !== true) throw new Error('Prepared release metadata conflicts')
  await verifyAssets(config, remote, payload(manifestPath, checked.files), api, true)
  return operationPlan(config, 'prepare-publication', { state: remote.draft === true ? 'draft-prepared' : 'already-public', tag, releaseId: remote.id, manifestDigest: checked.digest, nextAction: 'Approve the same waiting workflow run after inspecting its exact prepared draft.' })
}

/** Apply an approved mutation without creating tags, overwriting conflicts or rebuilding.
 * @param config - repository.
 * @param plan - approved operation and run identity.
 * @param manifestPath - exact manifest bytes.
 * @param directory - complete local artifact bundle.
 * @param baselineDigest - activated baseline anchor.
 * @param api - protected workflow GitHub transport.
 * @returns Verified publication, withdrawal or restoration result.
 */
export async function mutateRelease(config: DeliveryConfig,
  plan: Record<string, unknown>,
  manifestPath: string,
  directory: string,
  baselineDigest: string,
  api: GitHub): Promise<Record<string, unknown>> {
  validatePlan(plan, string(plan.operation), config)
  const checked = plan.operation === 'withdraw' ? withdrawalManifest(config, manifestPath) : checkedManifest(config, manifestPath, directory)
  if (checked.digest !== plan.manifestDigest || checked.manifest.tag !== plan.tag || checked.manifest.downstreamCommit !== plan.candidate) throw new Error('Manifest differs from protected approval')
  await verifyMutationRun(config, plan, api, false)
  await verifyQualification(config, checked.manifest, api, plan.operation === 'promote' ? payload(manifestPath, checked.files) : undefined)
  if (await tagCommit(config, string(plan.tag), api) !== plan.candidate) throw new Error('Publisher cannot create or substitute the approved tag')
  let remote = await findRelease(config, string(plan.tag), api)
  if (remote === undefined || (plan.operation === 'withdraw' ? !textField(remote.body).includes(`Manifest SHA-256: ${checked.digest}`) : remote.body !== releaseBody(directory, checked.digest)) || remote.prerelease !== true) throw new Error('Existing matching draft or release is required')
  const files = payload(manifestPath, checked.files)
  if (plan.operation === 'withdraw') {
    let assetBlocker: string | null = null
    try { await verifyAssets(config, remote, files, api, false) }
    catch (error) { assetBlocker = error instanceof Error ? error.message : 'Asset verification unavailable' }
    if (remote.draft !== true) {
      try { await api.request('PATCH', `/repos/${config.repository}/releases/${String(remote.id)}`, { draft: true }) }
      catch (error) { if ((await findRelease(config, string(plan.tag), api))?.draft !== true) throw error }
    }
    return operationPlan(config, 'withdraw', { state: 'withdrawn', assetBlocker, tag: plan.tag, manifestDigest: checked.digest, nextAction: 'Retained assets may be restored only after exact-byte verification.' })
  }
  if (plan.operation !== 'promote' && plan.operation !== 'restore') throw new Error('Unsupported mutation')
  if (plan.operation === 'promote') await verifyDelivery(config, checked.manifest, directory, checked.digest, api)
  await verifyLineage(config, checked.manifest, api, baselineDigest)
  const missing = await verifyAssets(config, remote, files, api, plan.operation === 'promote' && remote.draft === true)
  for (const file of missing) {
    const bytes = readFileSync(file.name === 'manifest.json' ? manifestPath : assetPath(directory, file.name))
    try { await api.request('POST', `https://uploads.github.com/repos/${config.repository}/releases/${String(remote.id)}/assets?name=${encodeURIComponent(file.name)}`, bytes) }
    catch (error) { if ((await verifyAssets(config, remote, files, api, true)).some(item => item.name === file.name)) throw error }
  }
  await verifyAssets(config, remote, files, api, false)
  if (remote.draft === true) {
    try { await api.request('PATCH', `/repos/${config.repository}/releases/${String(remote.id)}`, { draft: false, prerelease: true, make_latest: 'false' }) }
    catch (error) { if ((await findRelease(config, string(plan.tag), api))?.draft !== false) throw error }
  }
  remote = await findRelease(config, string(plan.tag), api)
  if (remote === undefined || remote.draft !== false) throw new Error('Publication could not be verified')
  try { await verifyAssets(config, remote, files, api, false) }
  catch (error) {
    try { await api.request('PATCH', `/repos/${config.repository}/releases/${String(remote.id)}`, { draft: true }) }
    catch (withdrawError) { if ((await findRelease(config, string(plan.tag), api))?.draft !== true) throw withdrawError }
    throw new Error(`Public mismatch caused withdrawal: ${error instanceof Error ? error.message : 'asset verification failed'}`)
  }
  return operationPlan(config, string(plan.operation), { state: 'published-and-verified', tag: plan.tag, manifestDigest: checked.digest, nextAction: 'Users may choose this single unsigned desktop update; no installed application was replaced.' })
}

/** Recover exact retained release files when the original Actions artifact has expired.
 * @param config - repository and distribution.
 * @param tag - retained release tag.
 * @param directory - caller-created empty output directory.
 * @param api - read-only GitHub adapter.
 * @param metadataOnly - withdrawal can hide corrupt assets using its retained manifest identity.
 * @returns Rehashed release manifest, without modifying release visibility.
 */
export async function retainedBundle(config: DeliveryConfig,
  tag: string,
  directory: string,
  api: GitHub,
  metadataOnly = false): Promise<Record<string,
  unknown>> {
  const remote = await findRelease(config, tag, api)
  if (remote === undefined) throw new Error('Retained release is missing')
  const assets = await pages(api, `/repos/${config.repository}/releases/${String(remote.id)}/assets`)
  const manifestAsset = assets.filter(asset => asset.name === 'manifest.json')
  if (manifestAsset.length !== 1) throw new Error('Retained manifest is missing or conflicting')
  const bytes = await downloaded(api, `/repos/${config.repository}/releases/assets/${String(manifestAsset[0]?.id)}`)
  const manifest = object(JSON.parse(Buffer.from(bytes).toString()) as unknown)
  if (manifest.tag !== tag || manifest.repository !== config.repository || !Array.isArray(manifest.files)) throw new Error('Retained manifest identity mismatch')
  for (const value of metadataOnly ? [] : manifest.files) {
    const file = object(value)
    const name = string(file.name)
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name) || name === 'manifest.json') throw new Error('Unsafe retained payload name')
    const matches = assets.filter(asset => asset.name === name)
    if (matches.length !== 1) throw new Error('Retained payload is missing or duplicated')
    const content = await downloaded(api, `/repos/${config.repository}/releases/assets/${String(matches[0]?.id)}`)
    if (content.length !== file.size || digest(content) !== file.sha256) throw new Error('Retained payload differs from manifest')
    writeFileSync(join(directory, name), content, { flag: 'wx' })
  }
  writeFileSync(join(directory, 'manifest.json'), bytes, { flag: 'wx' })
  if (metadataOnly) withdrawalManifest(config, join(directory, 'manifest.json'))
  else checkedManifest(config, join(directory, 'manifest.json'), directory)
  return operationPlan(config, 'release-bundle', { state: 'retained-bytes-verified', tag, manifestDigest: digest(bytes) })
}

/** Verify protected approval before an attempted mutation may emit outcome notifications.
 * @param config - repository and distribution.
 * @param plan - exact reviewed operation plan.
 * @param manifestPath - digest-bound manifest bytes.
 * @param api - server-owned approval evidence.
 */
export async function verifyMutationApproval(
  config: DeliveryConfig, plan: Record<string, unknown>, manifestPath: string, api: GitHub,
): Promise<void> {
  validatePlan(plan, string(plan.operation), config)
  if (!['promote', 'withdraw', 'restore'].includes(string(plan.operation))) throw new Error('Unsupported approved mutation')
  const checked = withdrawalManifest(config, manifestPath)
  if (checked.digest !== plan.manifestDigest || checked.manifest.tag !== plan.tag || checked.manifest.downstreamCommit !== plan.candidate) throw new Error('Manifest differs from protected approval')
  await verifyMutationRun(config, plan, api, false)
}
