/** Exact artifact and recovery behavior with real local payloads and injected GitHub transport. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { selectRelease } from '../../../apps/desktop-mint/src/github-releases.ts'
import { reviewedMutation } from '../reviewed-cli.ts'
import { assessmentAsset } from '../catch-up.ts'
import { MIGRATION_SCENARIOS } from '../migration-scenarios.ts'
import { checkedManifest } from '../manifest.ts'
import { catchUpEvidence, digest, object } from '../evidence.ts'
import { deliveryConfig, operationPlan, type GitHub } from '../operations.ts'
import { mutateRelease, promotionPlan, retainedBundle, preparePublication } from '../publication.ts'

const config = deliveryConfig(resolve('.github/desktop-delivery/mint.json'))
const temporary: string[] = []
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }) })
function directory(): string { const path = mkdtempSync(join(tmpdir(), 'delivery-payload-')); temporary.push(path); return path }
function json(value: unknown): Buffer { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`) }
function fixture(version = '1.2.3-alpha.1.unsigned.2', catchUp = false, migration = false) {
  const policy = object(JSON.parse(readFileSync('.github/desktop-delivery/migration-policy.json', 'utf8')))
  const path = directory()
  const upstream = { id: 1, tag: 'dsh-v0.1.0-alpha.1', commit: migration ? String(policy.targetUpstream) : 'a'.repeat(40), publishedAt: '2026-01-01T00:00:00Z' }
  const earlier = Array.from({ length: 7 }, (_, index) => ({ id: index + 10, tag: `dsh-v0.0.9-alpha.${String(index)}`, commit: String(index + 2).repeat(40), publishedAt: `2025-12-${String(index + 20)}T00:00:00Z` }))
  const from = earlier[0]
  if (from === undefined) throw new Error('Fixture baseline missing')
  const rangeReleases = [...earlier.slice(1), upstream]
  const leaf = { path: 'docs/upgrade.md', sha256: digest('Verified copied-home fixture') }
  const scenario = (source: unknown, target: unknown) => ({ from: source, to: target, status: 'verified', persistedFormatsChanged: false, unsupportedDowngrades: ['Unsupported'], compatibilityFindings: ['Verified copied-home fixture'], evidenceReferences: [leaf] })
  const assessment = { schemaVersion: 1, from, to: upstream, releases: rangeReleases,
    edges: rangeReleases.map((to, index) => scenario(earlier[index], to)),
    directUpgrade: scenario(from, upstream) }
  const range = catchUp ? catchUpEvidence({ schemaVersion: 1, from, to: upstream, releases: rangeReleases, assessment: { path: 'docs/catch-up.json', sha256: digest(json(assessment)) } }) : null
  const catchUpFiles = range === null ? [] : [{ reference: range.assessment, bytes: json(assessment) }, { reference: leaf, bytes: Buffer.from('Verified copied-home fixture') }]
  const lock = { schemaVersion: catchUp ? 3 : 2, ...(catchUp ? { catchUp: range } : {}), upstreamRepository: config.upstreamRepository, release: upstream, predecessor: catchUp ? from : null, observed: catchUp ? [...earlier, upstream] : [upstream], adoptionSeed: { commit: 'b'.repeat(40), tree: 'c'.repeat(40) } }
  const candidate = { purpose: 'desktop-delivery-shadow', kind: 'candidate', qualificationEligible: true, sourceDifference: { status: '' }, downstreamCommit: 'd'.repeat(40), sourceLockDigest: digest(json(lock)), configDigest: 'e'.repeat(64), upstream, components: { dsh: '0.1.0-alpha.1' } }
  const baseline = { schemaVersion: 1, purpose: 'desktop-legacy-baseline', repository: config.repository, repositoryId: config.repositoryId, upstream: catchUp ? from : upstream, desktopTag: 'desktop-v1.2.3-alpha.1.unsigned.1', sourceCommit: 'f'.repeat(40), releaseId: 1, assets: [] }
  const localConfig = { ...config, baselinePath: join(path, 'baseline.json') }
  writeFileSync(localConfig.baselinePath, json(baseline))
  const file = (name: string,
    content: Uint8Array | string) => { writeFileSync(join(path,
    name),
  content); const bytes = readFileSync(join(path,
    name)); return { name,
    size: bytes.length,
    sha256: digest(bytes) } }
  const native = config.architectures.map((architecture) => {
    const dmg = file(`DSH-Desktop-Mint-${version}-${architecture}.dmg`, `DMG fixture ${architecture}`)
    const evidence = file(`native-${architecture}.json`, json({ schemaVersion: 1, purpose: 'desktop-release-native-evidence', mode: 'unsigned-preview', qualificationEligible: true, candidateDigest: digest(json(candidate)), desktopVersion: version, architecture, dmgDigest: dmg.sha256, packagedRuntimeDigest: 'e'.repeat(64), executableArchitectures: architecture === 'x64' ? 'x86_64' : architecture, bootstrap: true, backendHttp: true, backendStopped: true, mountedReadOnly: true, detached: true, copiedInstallation: true, installationStopped: true, installationRemoved: true }))
    return { architecture, evidence, dmg }
  })
  const notes = 'Unsigned preview / 未签名预览\nNo automatic installation.\n'
  const compatibility = { schemaVersion: 1, persistedFormatsChanged: migration, ...(migration ? { migrationPolicy: { path: '.github/desktop-delivery/migration-policy.json', sha256: digest(json(policy)) } } : {}), assessment: 'Fixture data assessment', evidenceReferences: ['verification.md'], unsupportedDowngrades: ['Not tested'] }
  const files = [...catchUpFiles.map(item => file(assessmentAsset(item.reference), item.bytes)), ...native.flatMap(item => [item.dmg, item.evidence]), file('candidate.json', json(candidate)), file('release-notes.md', notes), file('data-compatibility.json', json(compatibility)), file('predecessor.json', json(baseline)), file('SHA256SUMS.txt', native.map(item => `${item.dmg.sha256}  ${item.dmg.name}`).sort().join('\n') + '\n')]
  const manifest = { schemaVersion: catchUp ? 2 : 1, ...(catchUp ? { catchUp: range } : {}), purpose: 'desktop-release-qualification', mode: 'unsigned-preview', repository: config.repository, repositoryId: config.repositoryId, distribution: config.id, desktopVersion: version, tag: `desktop-v${version}`, releaseKind: catchUp ? 'catch-up' : 'desktop', upstream, downstreamCommit: candidate.downstreamCommit, sourceLockDigest: candidate.sourceLockDigest, configDigest: candidate.configDigest, componentVersions: candidate.components, workflow: { path: '.github/workflows/desktop-delivery-qualify.yml', commit: '1'.repeat(40), runId: 10, attempt: 1 }, predecessor: { tag: baseline.desktopTag, digest: digest(json(baseline)), kind: baseline.purpose, upstream: baseline.upstream }, native, candidateDigest: digest(json(candidate)), releaseNotesDigest: digest(notes), dataCompatibilityDigest: digest(json(compatibility)), files }
  if (migration) {
    const put = (name: string, value: unknown) => { const entry = file(name, json(value)); files.push(entry); return entry }
    put('migration-policy.json', policy)
    const composition = file('migration-composition.json', JSON.stringify(object(policy.composition).files))
    files.push(composition)
    const reports = native.map((entry) => {
      const architecture = entry.architecture
      const fixtures = put(`migration-fixtures-${architecture}.json`, { parserFixture: true })
      const backup = put(`migration-backup-${architecture}.json`, { parserFixture: true })
      const delivered = object(policy.baseline)
      const identity = { architecture, candidateDigest: manifest.candidateDigest, downstreamCommit: manifest.downstreamCommit,
        sourceLockDigest: manifest.sourceLockDigest, dataCompatibilityDigest: manifest.dataCompatibilityDigest,
        workflow: manifest.workflow }
      const baseline = { upstream: delivered.upstream, sourceCommit: delivered.sourceCommit, desktopTag: delivered.desktopTag,
        evidenceDigest: delivered.evidenceDigest, artifactDigest: object(object(delivered.artifacts)[architecture]).sha256 }
      const target = { upstream: policy.targetUpstream, dmgDigest: entry.dmg.sha256, packagedRuntimeDigest: 'e'.repeat(64) }
      const scenarios = MIGRATION_SCENARIOS.map(id => ({ id, status: 'passed', evidenceFiles: [put(`migration-${architecture}-${id}.json`, {
        schemaVersion: 1, purpose: 'desktop-migration-scenario', id, status: 'passed', execution: 'packaged',
        ...identity, baseline, target, assertions: ['Publication parser fixture only; never execution evidence'],
      })] }))
      return { architecture, evidence: put(`migration-${architecture}.json`, { schemaVersion: 1, purpose: 'desktop-data-migration-qualification',
        ...identity, baseline, target, compositionDigest: composition.sha256, fixtureManifestDigest: fixtures.sha256,
        backupManifestDigest: backup.sha256,
        inputs: { composition, fixtures, backup }, scenarios }) }
    })
    Object.assign(manifest, { migration: { schemaVersion: 1, policyDigest: digest(json(policy)),
      compositionDigest: composition.sha256, reports } })
  }
  const manifestPath = join(path, 'manifest.json')
  writeFileSync(manifestPath, json(manifest))
  return { path, localConfig, manifestPath, manifest, lock, notes, compatibility, baseline, files, catchUpFiles }
}

it('rehashes native descriptors and source evidence and emits desktop assets accepted by both client architectures', () => {
  const data = fixture()
  checkedManifest(data.localConfig, data.manifestPath, data.path)
  for (const arch of config.architectures) expect(selectRelease([{ tag_name: data.manifest.tag,
    draft: false,
    prerelease: true,
    assets: data.files }],
  arch)?.version).toBe(data.manifest.desktopVersion)
  const dmg = data.manifest.files.find(file => file.name.endsWith('arm64.dmg'))
  if (dmg === undefined) throw new Error('Fixture DMG missing')
  writeFileSync(join(data.path, dmg.name), 'changed bytes')
  dmg.size = 'changed bytes'.length
  dmg.sha256 = digest('changed bytes')
  writeFileSync(data.manifestPath, json(data.manifest))
  expect(() => checkedManifest(data.localConfig, data.manifestPath, data.path)).toThrow()
  const dirty = fixture()
  const candidateFile = join(dirty.path, 'candidate.json')
  const candidate = object(JSON.parse(readFileSync(candidateFile, 'utf8')) as unknown)
  candidate.qualificationEligible = false
  writeFileSync(candidateFile, json(candidate))
  const descriptor = dirty.manifest.files.find(file => file.name === 'candidate.json')
  if (descriptor === undefined) throw new Error('Fixture candidate missing')
  descriptor.sha256 = digest(json(candidate)); descriptor.size = json(candidate).length
  dirty.manifest.candidateDigest = descriptor.sha256
  writeFileSync(dirty.manifestPath, json(dirty.manifest))
  expect(() => checkedManifest(dirty.localConfig, dirty.manifestPath, dirty.path)).toThrow('Candidate source identity')
})

function server(data: ReturnType<typeof fixture>) {
  const manifestDigest = digest(readFileSync(data.manifestPath))
  const release = { id: 2, tag_name: data.manifest.tag, draft: true, prerelease: true, body: `${data.notes}\n\nManifest SHA-256: ${manifestDigest}\n`, published_at: '2026-01-02T00:00:00Z' }
  const assets = new Map<number, { name: string; bytes: Uint8Array }>()
  const otherReleases: Record<string, unknown>[] = []
  const otherAssets = new Map<number, Array<{ id: number; name: string; bytes: Uint8Array }>>()
  const issues: Record<string, unknown>[] = []
  let nextAsset = 1
  let plan: Record<string, unknown> = {}
  let expire = false
  let event = 'workflow_dispatch'
  let waiting = false
  let loseUpload = true
  let writes = 0
  const archive = (name: string, files: Record<string, Uint8Array>): Buffer => {
    const root = directory(); const zip = join(root, `${name}.zip`)
    for (const [file, bytes] of Object.entries(files)) writeFileSync(join(root, file), bytes)
    execFileSync('zip', ['-q', zip, ...Object.keys(files)], { cwd: root })
    return readFileSync(zip)
  }
  const api: GitHub = { async request(method, path, body) {
    if (method !== 'GET' && method !== 'DOWNLOAD') writes++
    if (path.startsWith(`/repos/${config.upstreamRepository}/releases?`)) return data.lock.observed.map(item => ({ id: item.id, tag_name: item.tag, published_at: item.publishedAt, draft: false, prerelease: true }))
    if (path.startsWith(`/repos/${config.upstreamRepository}/git/ref/tags/`)) return { object: { type: 'commit', sha: data.lock.observed.find(item => path.endsWith(encodeURIComponent(item.tag)))?.commit } }
    if (path.startsWith(`/repos/${config.upstreamRepository}/compare/`)) return { status: 'ahead' }
    const relative = path.replace(`https://uploads.github.com/repos/${config.repository}`, '').replace(`/repos/${config.repository}`, '')
    if (relative.startsWith('/issues')) {
      if (method === 'POST') { issues.push({ ...object(body), user: { id: config.botId, type: 'Bot' }, number: 200 }); return issues[0] }
      if (method === 'PATCH') { Object.assign(issues[0] ?? {}, object(body)); return issues[0] }
      return issues
    }
    if (relative.startsWith('/actions/runs/10/artifacts')) return { artifacts: expire ? [] : [{ id: 100, name: 'desktop-release-bundle', expired: false }] }
    if (relative.startsWith('/actions/runs/20/artifacts')) return { artifacts: [{ id: 200, name: 'desktop-approved-plan', expired: false }] }
    if (relative === '/actions/artifacts/100/zip') return archive('qualification', Object.fromEntries([...data.files.map(file => [file.name, readFileSync(join(data.path, file.name))]), ['manifest.json', readFileSync(data.manifestPath)]]) as Record<string, Uint8Array>)
    if (relative === '/actions/artifacts/200/zip') return archive('approval', { 'approved-plan.json': json(plan) })
    if (relative.endsWith('/pending_deployments')) return waiting ? [{ environment: { name: config.releaseEnvironment } }] : []
    if (relative === '/actions/runs/10') return { event, head_branch: 'main', path: data.manifest.workflow.path, head_sha: data.manifest.workflow.commit, run_attempt: 1, status: 'completed', conclusion: 'success', repository: { id: config.repositoryId } }
    if (relative === '/actions/runs/20') return { event, head_branch: 'main', path: '.github/workflows/desktop-delivery-mutate.yml', head_sha: '1'.repeat(40), run_attempt: 1, status: 'in_progress', repository: { id: config.repositoryId } }
    if (relative === '/git/ref/heads/main') return { object: { sha: '1'.repeat(40) } }
    if (relative.startsWith('/git/ref/tags/')) return { object: { type: 'commit', sha: relative.includes(data.baseline.desktopTag) ? data.baseline.sourceCommit : data.manifest.downstreamCommit } }
    if (relative.startsWith('/compare/')) return { status: 'ahead', files: [{ filename: config.sourceLockPath }] }
    if (relative.startsWith('/git/trees/')) return { truncated: false, tree: data.catchUpFiles.map(item => ({ path: item.reference.path, type: 'blob', mode: '100644' })) }
    if (relative.startsWith('/contents/docs/')) {
      const file = data.catchUpFiles.find(item => relative === `/contents/${item.reference.path}?ref=${data.lock.adoptionSeed.commit}`)
      if (file === undefined) throw new Error('Missing fixture catch-up file')
      return { type: 'file', encoding: 'base64', path: file.reference.path, content: Buffer.from(file.bytes).toString('base64') }
    }
    if (relative.startsWith('/contents/')) return { content: (relative.includes('source-lock') ? json(data.lock) : relative.includes('release-notes') ? Buffer.from(data.notes) : json(data.compatibility)).toString('base64') }
    if (relative.startsWith('/commits?')) return [{ sha: '2'.repeat(40) }]
    if (relative.startsWith('/git/commits/')) return { tree: { sha: relative.endsWith(data.lock.adoptionSeed.commit) ? data.lock.adoptionSeed.tree : '3'.repeat(40) }, parents: [{ sha: data.lock.adoptionSeed.commit }] }
    if (relative.startsWith('/releases?')) return [{ id: 1, tag_name: data.baseline.desktopTag, draft: false, published_at: '2026-01-01T00:00:00Z' }, release, ...otherReleases]
    for (const [id, list] of otherAssets) {
      if (relative.startsWith(`/releases/${String(id)}/assets`)) return list.map(item => ({ id: item.id, name: item.name, size: item.bytes.length }))
      const asset = list.find(item => relative === `/releases/assets/${String(item.id)}`)
      if (asset !== undefined) return asset.bytes
    }
    if (relative.startsWith('/releases/1/assets')) return []
    if (relative.startsWith('/releases/2/assets') && method === 'GET') {
      const page = Number(new URL(`https://example.invalid${relative}`).searchParams.get('page') ?? 1)
      return [...assets].slice((page - 1) * 100, page * 100).map(([id, value]) => ({ id, name: value.name, size: value.bytes.length }))
    }
    if (relative.startsWith('/releases/assets/')) { const asset = assets.get(Number(relative.split('/').at(-1))); if (asset === undefined) throw new Error('Fixture asset missing'); return asset.bytes }
    if (relative.startsWith('/releases/2/assets?') && method === 'POST') {
      const name = new URL(`https://example.invalid${relative}`).searchParams.get('name')
      if (name === null || !(body instanceof Uint8Array)) throw new Error('Fixture upload malformed')
      assets.set(nextAsset++, { name, bytes: body })
      if (loseUpload) { loseUpload = false; throw new Error('Ambiguous upload response') }
      return {}
    }
    if (relative === '/releases/2') {
      if (method === 'PATCH') {
        const patch = object(body)
        expect(patch.tag_name).toBe(data.manifest.tag)
        expect(patch.prerelease).toBe(true)
        expect(patch).not.toHaveProperty('target_commitish')
        if (patch.draft === false) expect(patch.make_latest).toBe('false')
        Object.assign(release, patch)
      }
      return release
    }
    throw new Error(`Unhandled publication fixture: ${method} ${relative}`)
  } }
  return { api,
    otherReleases, otherAssets, issues,
    release,
    assets,
    setPlan(value: Record<string,
      unknown>) { plan = value },
    setExpired() { expire = true },
    setEvent(value: string) { event = value },
    setWaiting() { waiting = true },
    writes: () => writes }
}

it.each([false, true])('publishes and restores exact payloads after artifact expiry (migration=%s)', async (migration) => {
  const data = fixture(undefined, false, migration); const remote = server(data)
  const plan = await promotionPlan(data.localConfig, data.manifestPath, data.path, 'promote', { id: 20, attempt: 1, commit: '1'.repeat(40) }, remote.api)
  remote.setPlan(plan)
  expect((await mutateRelease(data.localConfig, plan, data.manifestPath, data.path, data.manifest.predecessor.digest, remote.api)).state).toBe('published-and-verified')
  const writes = remote.writes()
  await mutateRelease(data.localConfig, plan, data.manifestPath, data.path, data.manifest.predecessor.digest, remote.api)
  expect(remote.writes()).toBe(writes)
  remote.setExpired()
  const withdrawal = { ...plan, operation: 'withdraw' }; remote.setPlan(withdrawal)
  await mutateRelease(data.localConfig, withdrawal, data.manifestPath, data.path, data.manifest.predecessor.digest, remote.api)
  expect(remote.release.draft).toBe(true)
  const retained = directory()
  await retainedBundle(data.localConfig, data.manifest.tag, retained, remote.api)
  const restore = { ...plan, operation: 'restore' }; remote.setPlan(restore)
  await mutateRelease(data.localConfig, restore, join(retained, 'manifest.json'), retained, data.manifest.predecessor.digest, remote.api)
  expect(remote.release.draft).toBe(false)
  const corrupt = [...remote.assets.values()].find(asset => asset.name.endsWith('.dmg'))
  if (corrupt === undefined) throw new Error('Missing published DMG')
  corrupt.bytes = Buffer.from('corrupted')
  remote.setPlan(withdrawal)
  const result = await mutateRelease(data.localConfig,
    withdrawal,
    data.manifestPath,
    data.path,
    data.manifest.predecessor.digest,
    remote.api)
  expect(result.assetBlocker).toBeTruthy()
  expect(remote.release.draft).toBe(true)
  remote.setPlan(restore)
  await expect(mutateRelease(data.localConfig, restore, data.manifestPath, data.path, data.manifest.predecessor.digest, remote.api)).rejects.toThrow('asset')
})

it('rejects stale run origins and a preparation plan with a substituted candidate before writing', async () => {
  const data = fixture(); const remote = server(data)
  remote.setEvent('push')
  await expect(promotionPlan(data.localConfig, data.manifestPath, data.path, 'promote', { id: 20, attempt: 1, commit: '1'.repeat(40) }, remote.api)).rejects.toThrow('run identity')
  const substituted = operationPlan(config, 'promote', { candidate: 'f'.repeat(40), tag: data.manifest.tag, manifestDigest: digest(readFileSync(data.manifestPath)) })
  await expect(preparePublication(data.localConfig, substituted, data.manifestPath, data.path, remote.api)).rejects.toThrow('differs')
  expect(remote.writes()).toBe(0)
})

it.each([false, true])('qualifies a withdrawn-tip replacement and preserves catch-up provenance (%s)', async (catchUp) => {
  const data = fixture('1.2.3-alpha.1.unsigned.5', catchUp)
  const withdrawn = fixture('1.2.3-alpha.1.unsigned.2', catchUp)
  const priorBytes = json(withdrawn.manifest)
  writeFileSync(join(data.path, 'predecessor.json'), priorBytes)
  const descriptor = data.manifest.files.find(item => item.name === 'predecessor.json')
  if (descriptor === undefined) throw new Error('Missing fixture predecessor')
  descriptor.sha256 = digest(priorBytes); descriptor.size = priorBytes.length
  Object.assign(data.manifest, { releaseKind: 'replacement', supersedes: { tag: withdrawn.manifest.tag, manifestDigest: digest(priorBytes) } })
  writeFileSync(data.manifestPath, json(data.manifest))
  const remote = server(data)
  remote.otherReleases.push({ id: 3, tag_name: withdrawn.manifest.tag, draft: true, published_at: '2026-01-02T00:00:00Z' })
  remote.otherAssets.set(3, [{ id: 900, name: 'manifest.json', bytes: priorBytes }])
  const identity = { id: 20, attempt: 1, commit: '1'.repeat(40) }
  expect((await promotionPlan(data.localConfig, data.manifestPath, data.path, 'promote', identity, remote.api)).state).toBe('planned')
  remote.otherReleases.push({ id: 4, tag_name: 'desktop-v1.2.3-alpha.1.unsigned.3', draft: false })
  remote.otherAssets.set(4, [{ id: 901, name: 'manifest.json', bytes: json({ predecessor: { tag: withdrawn.manifest.tag } }) }])
  await expect(promotionPlan(data.localConfig, data.manifestPath, data.path, 'promote', identity, remote.api)).rejects.toThrow('published successor')
  expect(remote.writes()).toBe(0)
})

it('CLI mutation handling reports an approved blocker once and never notifies for invalid approval', async () => {
  const data = fixture(); const remote = server(data)
  const plan = await promotionPlan(data.localConfig, data.manifestPath, data.path, 'promote', { id: 20, attempt: 1, commit: '1'.repeat(40) }, remote.api)
  remote.setPlan(plan)
  remote.assets.set(999, { name: data.files[0]?.name ?? 'missing', bytes: Buffer.from('conflicting bytes') })
  const result = await reviewedMutation(data.localConfig, plan, data.manifestPath, data.path, data.manifest.predecessor.digest, remote.api)
  expect(result.state).toBe('blocked')
  expect(result.blocker).toBe(`Release asset bytes conflict: ${String(data.files[0]?.name)}`)
  expect(remote.issues).toHaveLength(1)
  expect(remote.issues[0]?.body).toContain(`Release asset bytes conflict: ${String(data.files[0]?.name)}`)
  const writes = remote.writes()
  await reviewedMutation(data.localConfig, plan, data.manifestPath, data.path, data.manifest.predecessor.digest, remote.api)
  expect(remote.writes()).toBe(writes)
  await expect(reviewedMutation(data.localConfig, { ...plan, manifestDigest: '0'.repeat(64) }, data.manifestPath, data.path, data.manifest.predecessor.digest, remote.api)).rejects.toThrow('protected approval')
  expect(remote.writes()).toBe(writes)
  expect(remote.assets.get(999)?.bytes).toEqual(Buffer.from('conflicting bytes'))
})

it('blocks successful publication identity drift without a recovery PATCH', async () => {
  for (const drift of [{ id: 99 }, { tag_name: 'temporary-server-tag' }, { prerelease: false }, { draft: true }, { body: 'Foreign body' }]) {
    const data = fixture(); const remote = server(data)
    const plan = await promotionPlan(data.localConfig, data.manifestPath, data.path, 'promote', { id: 20, attempt: 1, commit: '1'.repeat(40) }, remote.api)
    remote.setPlan(plan)
    let patches = 0
    const api: GitHub = { async request(method, path, body) {
      const result = await remote.api.request(method, path, body)
      if (method === 'PATCH') { patches++; Object.assign(remote.release, drift) }
      return result
    } }
    await expect(mutateRelease(data.localConfig, plan, data.manifestPath, data.path, data.manifest.predecessor.digest, api)).rejects.toThrow('maintainer recovery')
    expect(patches).toBe(1)
  }
})

it('withdraws a post-publication byte mismatch using the same approved release identity', async () => {
  const data = fixture(); const remote = server(data)
  const plan = await promotionPlan(data.localConfig, data.manifestPath, data.path, 'promote', { id: 20, attempt: 1, commit: '1'.repeat(40) }, remote.api)
  remote.setPlan(plan)
  const patches: unknown[] = []
  const api: GitHub = { async request(method, path, body) {
    const result = await remote.api.request(method, path, body)
    if (method === 'PATCH') {
      patches.push(body)
      if (object(body).draft === false) {
        const asset = [...remote.assets.values()][0]
        if (asset === undefined) throw new Error('Missing fixture asset')
        asset.bytes = Buffer.from('Corrupt after publication')
      }
    }
    return result
  } }
  await expect(mutateRelease(data.localConfig, plan, data.manifestPath, data.path, data.manifest.predecessor.digest, api)).rejects.toThrow('Public mismatch caused withdrawal')
  expect(patches.map(value => object(value).draft)).toEqual([false, true])
  for (const patch of patches) expect(patch).toMatchObject({ tag_name: data.manifest.tag, prerelease: true })
  expect(remote.release.draft).toBe(true)
})


it('publishes and restores a seven-release bundle without intermediate desktop manifests', async () => {
  const data = fixture('1.2.3-alpha.1.unsigned.8', true)
  const remote = server(data)
  checkedManifest(data.localConfig, data.manifestPath, data.path)
  const identity = { id: 20, attempt: 1, commit: '1'.repeat(40) }
  const plan = await promotionPlan(data.localConfig, data.manifestPath, data.path, 'promote', identity, remote.api)
  remote.setPlan(plan)
  await mutateRelease(data.localConfig, plan, data.manifestPath, data.path, data.manifest.predecessor.digest, remote.api)
  expect(remote.release.draft).toBe(false)
  const writes = remote.writes()
  await mutateRelease(data.localConfig, plan, data.manifestPath, data.path, data.manifest.predecessor.digest, remote.api)
  expect(remote.writes()).toBe(writes)
  const withdrawal = { ...plan, operation: 'withdraw' }; remote.setPlan(withdrawal)
  await mutateRelease(data.localConfig, withdrawal, data.manifestPath, data.path, data.manifest.predecessor.digest, remote.api)
  const retained = directory()
  await retainedBundle(data.localConfig, data.manifest.tag, retained, remote.api)
  expect(object(JSON.parse(readFileSync(join(retained, 'manifest.json'), 'utf8')) as unknown).catchUp).toEqual(data.manifest.catchUp)
  const restore = { ...plan, operation: 'restore' }; remote.setPlan(restore)
  await mutateRelease(data.localConfig, restore, join(retained, 'manifest.json'), retained, data.manifest.predecessor.digest, remote.api)
  expect(remote.release.draft).toBe(false)
})

it('blocks changed live ranges after approval and rejects missing or altered retained catch-up assets', async () => {
  const data = fixture('1.2.3-alpha.1.unsigned.8', true)
  const remote = server(data)
  const plan = await promotionPlan(data.localConfig, data.manifestPath, data.path, 'promote', { id: 20, attempt: 1, commit: '1'.repeat(40) }, remote.api)
  remote.setPlan(plan)
  const inserted = { id: 99, tag_name: 'dsh-v0.0.9-extra', published_at: '2025-12-23T12:00:00Z', draft: false, prerelease: true }
  const changed: GitHub = { async request(method, path, body) {
    if (path.startsWith(`/repos/${config.upstreamRepository}/releases?`)) return [...await remote.api.request(method, path) as unknown[], inserted]
    if (path.endsWith('/git/ref/tags/dsh-v0.0.9-extra')) return { object: { type: 'commit', sha: '9'.repeat(40) } }
    return remote.api.request(method, path, body)
  } }
  await expect(mutateRelease(data.localConfig, plan, data.manifestPath, data.path, data.manifest.predecessor.digest, changed)).rejects.toThrow('omits')
  expect(remote.writes()).toBe(0)
  const rangeFile = data.catchUpFiles[0]
  if (rangeFile === undefined) throw new Error('Missing fixture assessment')
  writeFileSync(join(data.path, assessmentAsset(rangeFile.reference)), 'tampered')
  expect(() => checkedManifest(data.localConfig, data.manifestPath, data.path)).toThrow('file changed')
})
