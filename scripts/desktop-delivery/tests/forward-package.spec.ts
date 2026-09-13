/** Real source-finalized producer and payload tests; synthetic records are parser fixtures only. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { main } from '../cli.ts'
import { releaseManifest, checkedManifest } from '../manifest.ts'
import { assembleForwardPackage, forwardBuild, forwardBytes, forwardPackage } from '../forward-package.ts'
import { decodeForwardObservation, FORWARD_SCENARIOS, forwardPolicy } from '../forward-evidence.ts'
import { compatibilityKind } from '../compatibility-evidence.ts'
import { digest, object, shadow } from '../evidence.ts'
import { deliveryConfig } from '../operations.ts'
import { mutateRelease, preparePublication, promotionPlan, retainedBundle, verifyQualification } from '../publication.ts'
import type { GitHub } from '../operations.ts'

const configPath = resolve('.github/desktop-delivery/mint.json')
const config = deliveryConfig(configPath)
const owned: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const path of owned.splice(0)) rmSync(path, { recursive: true, force: true }) })
function temp(): string { const path = mkdtempSync(join(tmpdir(), 'dsh-forward-producer-')); owned.push(path); return path }
function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function fixture() {
  const root = temp(), directory = temp()
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.email', 'fixture@example.invalid'); git(root, 'config', 'user.name', 'Fixture')
  writeFileSync(join(root, 'source'), 'upstream')
  git(root, 'add', '.'); git(root, 'commit', '-m', 'upstream')
  const upstream = { id: 1, tag: 'dsh-v0.1.5-alpha.2', commit: git(root, 'rev-parse', 'HEAD'), publishedAt: '2026-09-01T00:00:00Z' }
  mkdirSync(join(root, '.github/desktop-delivery'), { recursive: true })
  const policy = object(JSON.parse(readFileSync('.github/desktop-delivery/forward-update-policy.json', 'utf8')))
  const assessment = { schemaVersion: 2, persistedFormatsChanged: true, assessment: 'Synthetic parser fixture, no observed GUI.',
    evidenceReferences: ['source'], unsupportedDowngrades: ['Never A on B data'],
    forwardPolicy: { path: '.github/desktop-delivery/forward-update-policy.json', sha256: digest(forwardBytes(policy)) } }
  const put = (path: string, value: unknown) => { writeFileSync(path, forwardBytes(value)) }
  put(join(root, assessment.forwardPolicy.path), policy)
  put(join(root, '.github/desktop-delivery/data-compatibility.json'), assessment)
  writeFileSync(join(root, '.github/desktop-delivery/release-notes.md'), 'Fixture release notes\n')
  const initial = { schemaVersion: 1, upstreamRepository: config.upstreamRepository,
    release: upstream, predecessor: null, observed: [upstream] }
  put(join(root, config.sourceLockPath), initial)
  git(root, 'add', '.'); git(root, 'commit', '-m', 'reviewed seed')
  const seed = { commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}') }
  const lock = { ...initial, schemaVersion: 2, adoptionSeed: seed }
  put(join(root, config.sourceLockPath), lock)
  git(root, 'commit', '-am', 'lock-only finalization')
  const commit = git(root, 'rev-parse', 'HEAD')
  const candidate = { ...shadow, kind: 'candidate', distribution: config.id, qualificationEligible: true, downstreamCommit: commit,
    configDigest: digest(readFileSync(configPath)), sourceLockDigest: digest(forwardBytes(lock)), upstream,
    desktopVersion: policy.upstreamVersion, components: { '@deepseek-ai/dsh': policy.upstreamVersion },
    sourceDifference: { status: '', trackedDiffDigest: digest('') } }
  put(join(directory, 'input-candidate.json'), candidate)
  const dmgName = `${config.assetPrefix}-${String(policy.targetVersion)}-arm64.dmg`
  writeFileSync(join(directory, dmgName), 'synthetic DMG')
  const native = { schemaVersion: 1, purpose: 'desktop-release-native-evidence', mode: 'unsigned-preview', qualificationEligible: true,
    candidateDigest: digest(forwardBytes(candidate)), desktopVersion: policy.targetVersion, architecture: 'arm64', executableArchitectures: 'arm64',
    dmgDigest: digest('synthetic DMG'), packagedRuntimeDigest: digest('synthetic runtime'),
    ...Object.fromEntries(['bootstrap', 'backendHttp', 'backendStopped', 'mountedReadOnly', 'detached', 'copiedInstallation', 'installationStopped', 'installationRemoved'].map(key => [key, true])) }
  put(join(directory, 'native-arm64.json'), native)
  put(join(directory, 'baseline.json'), { purpose: 'desktop-legacy-baseline', repository: config.repository, upstream,
    desktopTag: 'desktop-v0.1.5-alpha.2.unsigned.1', desktopVersion: '0.1.5-alpha.2.unsigned.1', releaseId: 1, sourceCommit: upstream.commit, assets: [] })
  const input = { root, directory, candidatePath: join(directory, 'input-candidate.json'), nativeNames: ['native-arm64.json'], dmgNames: [dmgName],
    version: String(policy.targetVersion), releaseKind: 'desktop', notesPath: '.github/desktop-delivery/release-notes.md',
    compatibilityPath: '.github/desktop-delivery/data-compatibility.json', predecessorPath: join(directory, 'baseline.json'),
    run: { commit, id: 10, attempt: 1 } }
  const build = releaseManifest(config, configPath, input)
  const read = (name: string) => readFileSync(join(directory, name))
  const target = forwardBuild(build, read).target
  const observation = { schemaVersion: 1, purpose: 'maintainer-attested-local-observation', phase: 'prepublication', architecture: 'arm64',
    host: { os: 'Synthetic macOS', session: 'private fixture', permission: 'operator facts' },
    observer: { identity: 'parser fixture only', method: 'direct-ordinary-desktop-observation' },
    startedAt: '2026-09-13T01:00:00Z', completedAt: '2026-09-13T02:00:00Z', buildReceiptDigest: digest(forwardBytes(build)), baseline: policy.baseline, target,
    privateRoots: Object.fromEntries(['home', 'state', 'workspace', 'temp', 'backup', 'retainedB'].map(name => [name, `/private/fixture/${name}`])),
    installation: { path: '/private/fixture/App.app', samePath: true, private: true, writersStopped: true },
    settings: [{ name: 'theme', a: 'light', b: 'light', restoredA: 'light' }],
    scenarios: FORWARD_SCENARIOS.map(id => ({ id, action: 'synthetic test action', result: 'synthetic test result', source: 'direct-local-observation', status: 'passed' })),
    recovery: Object.fromEntries(['backupComplete', 'quiescent', 'retainedB', 'restoredPreBState', 'normalAObserved', 'usableA', 'settingsRetained', 'ordinaryQuit', 'noAOnBData'].map(name => [name, true])),
    cleanup: Object.fromEntries(['processOwnershipCertain', 'launchSubmissionCompleted', 'writersStopped', 'mountsDetached', 'recoveryComplete'].map(name => [name, true])) }
  put(join(directory, 'build-receipt.json'), build)
  put(join(directory, 'local-observation.json'), observation)
  const assemble = (value: unknown = observation) => assembleForwardPackage(forwardBytes(build), forwardBytes(value), read)
  const manifest = assemble()
  put(join(directory, 'manifest.json'), manifest)
  return { root, directory, policy, assessment, input, build, observation, manifest, read, assemble, commit, lock, seed, put }
}

it('produces a build-only receipt from real finalized Git, then validates deterministic local acceptance', () => {
  const f = fixture()
  expect(f.build.purpose).toBe('desktop-forward-build')
  f.put(join(f.directory, 'build-as-manifest.json'), f.build)
  expect(() => checkedManifest(config, join(f.directory, 'build-as-manifest.json'), f.directory)).toThrow()
  expect(checkedManifest(config, join(f.directory, 'manifest.json'), f.directory).manifest.schemaVersion).toBe(3)
  expect(forwardPackage(f.manifest, f.read).map(file => file.name)).not.toContain('local-observation.json')
  expect(() => releaseManifest(config, configPath, { ...f.input, migrationNames: ['migration-arm64.json'] })).toThrow('without legacy')
  expect(() => releaseManifest(config, configPath, { ...f.input, version: '0.1.5-alpha.2.unsigned.3' })).toThrow()
  writeFileSync(join(f.root, 'source'), 'dirty')
  expect(() => releaseManifest(config, configPath, f.input)).toThrow('clean')
})

it('rejects incomplete observations, uncertain recovery and changed approved bytes', () => {
  const f = fixture()
  for (const mutate of [
    (x: typeof f.observation) => { x.scenarios.pop() },
    (x: typeof f.observation) => { x.scenarios[1] = x.scenarios[0]! },
    (x: typeof f.observation) => { x.scenarios[0]!.status = 'failed' },
    (x: typeof f.observation) => { x.purpose = 'desktop-forward-build' },
    (x: typeof f.observation) => { x.architecture = 'x64' },
    (x: typeof f.observation) => { x.buildReceiptDigest = 'f'.repeat(64) },
    (x: typeof f.observation) => { x.recovery.normalAObserved = false },
    (x: typeof f.observation) => { x.cleanup.launchSubmissionCompleted = false },
  ]) {
    const changed = structuredClone(f.observation); mutate(changed)
    expect(() => f.assemble(changed)).toThrow()
  }
  expect(() => f.assemble({ ...f.observation, attachments: ['secret'] })).toThrow()
  const changed = structuredClone(f.manifest); object(changed.forward).publicDelivery = 'passed'
  expect(() => forwardPackage(changed, f.read)).toThrow('reassembly')
  expect(() => forwardBuild({ ...f.build, guiQualified: true }, f.read)).toThrow('fields')
  const reclassified = structuredClone(f.build); object((reclassified.files as unknown[])[0]).owner = 'derived'
  expect(() => forwardBuild(reclassified, f.read)).toThrow('descriptor')
  const missing = structuredClone(f.build); missing.files = (missing.files as { name: string }[]).filter(file => file.name !== 'candidate.json')
  expect(() => forwardBuild(missing, f.read)).toThrow('inventory')
  writeFileSync(join(f.directory, 'local-observation.json'), forwardBytes({ ...f.observation, observer: { ...f.observation.observer, identity: 'another observer' } }))
  expect(() => checkedManifest(config, join(f.directory, 'manifest.json'), f.directory)).toThrow('changed')
})

it('strictly decodes canonical bounded UTF-8 without accepting alternate byte encodings', () => {
  const bytes = Buffer.from('{"synthetic":true}')
  expect(decodeForwardObservation(bytes.toString('base64'), digest(bytes))).toEqual(bytes)
  for (const encoded of [bytes.toString('base64') + '\n', 'Zh==', '%%%']) expect(() => decodeForwardObservation(encoded, digest(bytes))).toThrow()
  for (const bytes of [Buffer.alloc(32769), Buffer.from([0xff])]) expect(() => decodeForwardObservation(bytes.toString('base64'), digest(bytes))).toThrow()
})

it('reuses the policy schema for another source/version/artifact without Mint identity constants', () => {
  const policy = object(JSON.parse(readFileSync('.github/desktop-delivery/forward-update-policy.json', 'utf8')))
  const baseline = object(policy.baseline)
  baseline.sourceCommit = 'e'.repeat(40); baseline.desktopVersion = '1.0.0-alpha.1.unsigned.1'
  object(baseline.dmg).name = 'Other-Desktop-1.0.0-alpha.1.unsigned.1-arm64.dmg'
  baseline.buildRunId = 42; object(baseline.archive).id = 123
  policy.targetVersion = '1.0.0-alpha.1.unsigned.2'; policy.upstreamVersion = '1.0.0-alpha.1'
  policy.settings = [{ name: 'theme', value: 'dark' }]
  expect(forwardPolicy(policy)).toBe(policy)
  expect(() => compatibilityKind({ schemaVersion: 99 })).toThrow()
})

function remote(f: ReturnType<typeof fixture>) {
  const descriptors = object(f.manifest).files as { name: string; size: number; sha256: string }[]
  const assetNames = ['manifest.json', ...descriptors.map(file => file.name)]
  const archiveRoot = temp(), archivePath = join(archiveRoot, 'build.zip')
  const buildFiles = [...f.build.files as { name: string }[], { name: 'build-receipt.json' }]
  for (const file of buildFiles) writeFileSync(join(archiveRoot, file.name), f.read(file.name))
  execFileSync('zip', ['-q', archivePath, ...buildFiles.map(file => file.name)], { cwd: archiveRoot })
  let expired = false, writes = 0, changedArchive = false
  const api: GitHub = { async request(method, path) {
    if (!['GET', 'DOWNLOAD'].includes(method)) { writes++; throw new Error('Unexpected remote write') }
    const route = path.replace(`/repos/${config.repository}`, '')
    if (route === '/actions/runs/10') return { event: 'workflow_dispatch', head_branch: 'main', path: '.github/workflows/desktop-delivery-qualify.yml',
      head_sha: f.commit, run_attempt: 1, status: 'completed', conclusion: 'success', repository: { id: config.repositoryId } }
    if (route.startsWith('/actions/runs/10/artifacts')) return { artifacts: expired ? [] : [{ id: 1, name: 'desktop-release-bundle', expired: false }] }
    if (route === '/actions/artifacts/1/zip') return changedArchive ? Buffer.from('altered archive') : readFileSync(archivePath)
    if (route === '/git/ref/heads/main') return { object: { sha: f.commit } }
    if (route.startsWith('/compare/')) return { status: 'identical', files: [{ filename: config.sourceLockPath }] }
    if (route.startsWith('/contents/')) {
      const filename = route.slice('/contents/'.length).split('?ref=')[0]!
      return { content: readFileSync(join(f.root, filename)).toString('base64') }
    }
    if (route.startsWith('/commits?')) return [{ sha: f.commit }]
    if (route.startsWith('/git/commits/')) {
      const commit = route.slice('/git/commits/'.length)
      return { tree: { sha: git(f.root, 'rev-parse', `${commit}^{tree}`) }, parents: [{ sha: f.seed.commit }] }
    }
    if (route.startsWith('/releases?')) return [{ id: 2, tag_name: f.manifest.tag, draft: true, prerelease: true }]
    if (route.startsWith('/releases/2/assets')) return assetNames.map((name, index) => ({ id: index + 1, name, size: f.read(name).length }))
    if (route.startsWith('/releases/assets/')) return f.read(assetNames[Number(route.slice('/releases/assets/'.length)) - 1]!)
    throw new Error(`Unexpected fixture request ${method} ${route}`)
  } }
  return { api, descriptors, writes: () => writes, expire: () => { expired = true }, alterArchive: () => { changedArchive = true } }
}

it('authenticates only fixed CI files, restores the original retained observation after expiry, and withdraws without it', async () => {
  const f = fixture(), server = remote(f)
  await verifyQualification(config, f.manifest, server.api, server.descriptors, false, f.read)
  server.expire()
  const recovered = temp()
  await retainedBundle(config, String(f.manifest.tag), recovered, server.api)
  expect(readFileSync(join(recovered, 'local-observation.json'))).toEqual(f.read('local-observation.json'))
  const plan = await promotionPlan(config, join(recovered, 'manifest.json'), recovered, 'restore', { id: 20, attempt: 1, commit: f.commit }, server.api)
  expect(plan.localObservationDigest).toBe(digest(f.read('local-observation.json')))
  rmSync(join(f.directory, 'local-observation.json'))
  await promotionPlan(config, join(f.directory, 'manifest.json'), f.directory, 'withdraw', { id: 20, attempt: 1, commit: f.commit }, server.api)
  expect(server.writes()).toBe(0)
})

it('refuses altered archive bytes and malformed forward evidence before preparing any tag or draft', async () => {
  const f = fixture(), server = remote(f)
  server.alterArchive()
  await expect(verifyQualification(config, f.manifest, server.api, server.descriptors, false, f.read)).rejects.toThrow()
  f.put(join(f.directory, 'local-observation.json'), { ...f.observation, phase: 'public' })
  await expect(promotionPlan(config, join(f.directory, 'manifest.json'), f.directory, 'promote', { id: 20, attempt: 1, commit: f.commit }, server.api)).rejects.toThrow()
  await expect(preparePublication(config, { operation: 'promote' }, join(f.directory, 'manifest.json'), f.directory, server.api)).rejects.toThrow()
  expect(server.writes()).toBe(0)
})

it('rejects approval-plan observation substitution before tag/draft preparation', async () => {
  const f = fixture(), server = remote(f)
  const plan = await promotionPlan(config, join(f.directory, 'manifest.json'), f.directory, 'restore', { id: 20, attempt: 1, commit: f.commit }, server.api)
  plan.operation = 'promote'
  plan.localObservationDigest = 'f'.repeat(64)
  await expect(preparePublication(config, plan, join(f.directory, 'manifest.json'), f.directory, server.api)).rejects.toThrow()
  expect(server.writes()).toBe(0)
})


it('assembles through the actual CLI environment input and rejects observation inputs for legacy or recovery', async () => {
  const f = fixture()
  const bytes = f.read('local-observation.json')
  rmSync(join(f.directory, 'local-observation.json')); rmSync(join(f.directory, 'manifest.json'))
  vi.stubEnv('FORWARD_OBSERVATION_BASE64', bytes.toString('base64'))
  vi.stubEnv('FORWARD_OBSERVATION_SHA256', digest(bytes))
  const output = join(temp(), 'status.json')
  const args = ['assemble-forward', '--config', configPath, '--directory', f.directory, '--operation', 'promote', '--out', output]
  expect(await main(args)).toBe(0)
  expect(f.read('manifest.json')).toEqual(forwardBytes(f.manifest))
  expect(await main(args.map(value => value === 'promote' ? 'restore' : value))).toBe(1)
  rmSync(join(f.directory, 'build-receipt.json'))
  expect(await main(args)).toBe(1)
})

it('executes schema 3 restoration and withdrawal with exact approved and retained bytes', async () => {
  const f = fixture(), server = remote(f)
  server.expire()
  const localConfig = { ...config, baselinePath: join(f.directory, 'baseline.json') }
  const release = { id: 2, tag_name: f.manifest.tag, draft: true, prerelease: true,
    body: `${f.read('release-notes.md').toString()}\n\nManifest SHA-256: ${digest(f.read('manifest.json'))}\n` }
  let approved: Record<string, unknown> = {}, patches = 0
  const api: GitHub = { async request(method, path, body) {
    const route = path.replace(`/repos/${config.repository}`, '')
    if (route === '/actions/runs/20') return { event: 'workflow_dispatch', head_branch: 'main', path: '.github/workflows/desktop-delivery-mutate.yml', head_sha: f.commit, run_attempt: 1, status: 'in_progress', repository: { id: config.repositoryId } }
    if (route === '/actions/runs/20/pending_deployments') return []
    if (route.startsWith('/actions/runs/20/artifacts')) return { artifacts: [{ id: 20, name: 'desktop-approved-plan', expired: false }] }
    if (route === '/actions/artifacts/20/zip') {
      const directory = temp(), archive = join(directory, 'approved.zip')
      f.put(join(directory, 'approved-plan.json'), approved)
      execFileSync('zip', ['-q', archive, 'approved-plan.json'], { cwd: directory })
      return readFileSync(archive)
    }
    if (route.startsWith('/git/ref/tags/')) return { object: { type: 'commit', sha: route.endsWith(String(f.manifest.tag)) ? f.commit : f.lock.release.commit } }
    if (route.startsWith('/releases?')) return [release, { id: 1, tag_name: 'desktop-v0.1.5-alpha.2.unsigned.1', draft: false }]
    if (route.startsWith('/releases/1/assets')) return []
    if (route === '/releases/2') {
      if (method === 'PATCH') { patches++; Object.assign(release, object(body)) }
      return release
    }
    return server.api.request(method, path, body)
  } }
  const manifestPath = join(f.directory, 'manifest.json'), baselineDigest = digest(f.read('baseline.json'))
  approved = await promotionPlan(localConfig, manifestPath, f.directory, 'restore', { id: 20, attempt: 1, commit: f.commit }, api)
  expect((await mutateRelease(localConfig, approved, manifestPath, f.directory, baselineDigest, api)).state).toBe('published-and-verified')
  expect(release.draft).toBe(false)
  expect(approved.localObservationDigest).toBe(digest(f.read('local-observation.json')))
  approved = await promotionPlan(localConfig, manifestPath, f.directory, 'withdraw', { id: 20, attempt: 1, commit: f.commit }, api)
  expect((await mutateRelease(localConfig, approved, manifestPath, f.directory, baselineDigest, api)).state).toBe('withdrawn')
  expect(release.draft).toBe(true)
  expect(patches).toBe(2)
})
