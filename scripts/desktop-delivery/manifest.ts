/** Distinct production qualification over exact Git source and native copy-install evidence. */
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assessmentAsset, assessmentFiles, gitEvidence } from './catch-up.ts'
import { deliveryPredecessor, requireUnsignedVersion } from './lineage.ts'
import { checkArchitecture } from './artifacts.ts'
import { readCandidate } from './candidate.ts'
import { git, verifyFinalization } from './adoption.ts'
import { assetPath, catchUpEvidence, digest, hex, object, readJson, sameRelease, release, string, textField } from './evidence.ts'
import type { DeliveryConfig } from './operations.ts'

/** Exact trusted orchestration identity recorded by the qualification workflow. */
export interface QualificationRun { commit: string; id: number; attempt: number }
/** A downloadable file bound by its exact size and SHA256. */
export interface ReleaseFile { name: string; size: number; sha256: string }
/** Explicit inputs to final aggregation. */
export interface ManifestInput {
  root: string
  directory: string
  candidatePath: string
  nativeNames: string[]
  dmgNames: string[]
  version: string
  releaseKind: string
  notesPath: string
  compatibilityPath: string
  predecessorPath: string
  run: QualificationRun
}

function committed(root: string, commit: string, path: string): Buffer {
  if (path.startsWith('/') || path.split('/').includes('..')) throw new Error('Candidate document path must be repository-relative')
  const bytes = execFileSync('git', ['show', `${hex(commit, 40)}:${path}`], { cwd: root })
  if (!bytes.equals(readFileSync(join(root, path)))) throw new Error('Candidate document differs from committed bytes')
  return bytes
}
function file(directory: string, name: string): ReleaseFile {
  const path = assetPath(directory, name)
  const size = statSync(path).size
  if (size <= 0) throw new Error('Empty qualification file')
  return { name, size, sha256: digest(readFileSync(path)) }
}

/** Build a final manifest only from clean finalized source and both native installations.
 * @param config - distribution and repository.
 * @param configPath - exact configuration bytes.
 * @param input - candidate, native evidence and trusted run identity.
 * @returns Distinct production qualification, with no self-digest.
 */
export function releaseManifest(config: DeliveryConfig, configPath: string, input: ManifestInput): Record<string, unknown> {
  requireUnsignedVersion(input.version)
  const candidate = readCandidate(input.candidatePath, configPath)
  if (candidate.record.qualificationEligible !== true || git(input.root, ['status', '--porcelain']) !== '') throw new Error('Production candidate must be clean')
  const commit = hex(candidate.record.downstreamCommit, 40)
  if (git(input.root, ['rev-parse', 'HEAD']) !== commit) throw new Error('Qualification checkout identity changed')
  const lock = verifyFinalization(input.root, config, commit)
  if (digest(readFileSync(join(input.root, config.sourceLockPath))) !== candidate.record.sourceLockDigest) throw new Error('Candidate source-lock digest mismatch')
  if (input.nativeNames.length !== config.architectures.length || input.dmgNames.length !== config.architectures.length || new Set(input.nativeNames).size !== input.nativeNames.length || new Set(input.dmgNames).size !== input.dmgNames.length) throw new Error('Incomplete or duplicate native evidence')
  const architectures = new Set<string>()
  const native = input.nativeNames.map((name) => {
    const record = object(readJson(assetPath(input.directory, name)))
    const arch = string(record.architecture)
    if (record.schemaVersion !== 1 || record.purpose !== 'desktop-release-native-evidence' || record.mode !== 'unsigned-preview' || record.qualificationEligible !== true || record.candidateDigest !== candidate.digest || record.desktopVersion !== input.version || !config.architectures.includes(arch as 'arm64' | 'x64') || architectures.has(arch)) throw new Error('Shadow, stale or duplicate native evidence cannot qualify')
    for (const check of ['bootstrap', 'backendHttp', 'backendStopped', 'mountedReadOnly', 'detached', 'copiedInstallation', 'installationStopped', 'installationRemoved']) if (record[check] !== true) throw new Error(`Native qualification missing ${check}`)
    checkArchitecture(string(record.executableArchitectures), arch as 'arm64' | 'x64')
    architectures.add(arch)
    const dmg = input.dmgNames.find(filename => filename.endsWith(`-${input.version}-${arch}.dmg`))
    if (dmg === undefined || file(input.directory, dmg).sha256 !== record.dmgDigest) throw new Error('Native evidence does not match DMG bytes/version')
    return { architecture: arch, evidence: file(input.directory, name), dmg: file(input.directory, dmg) }
  })
  const notes = committed(input.root, commit, input.notesPath)
  textField(notes.toString())
  const compatibilityBytes = committed(input.root, commit, input.compatibilityPath)
  const compatibility = object(JSON.parse(compatibilityBytes.toString()) as unknown)
  if (compatibility.schemaVersion !== 1 || typeof compatibility.persistedFormatsChanged !== 'boolean' || !Array.isArray(compatibility.evidenceReferences) || compatibility.evidenceReferences.length === 0 || !Array.isArray(compatibility.unsupportedDowngrades) || compatibility.unsupportedDowngrades.length === 0) throw new Error('Missing data compatibility assessment')
  textField(compatibility.assessment)
  if (compatibility.persistedFormatsChanged) throw new Error('Persisted format changes require separate migration qualification; this path is unconfigured')
  for (const reference of compatibility.evidenceReferences) committed(input.root, commit, string(string(reference).split('#')[0]))
  for (const limitation of compatibility.unsupportedDowngrades) textField(limitation)
  const predecessorBytes = readFileSync(input.predecessorPath)
  const prior = object(JSON.parse(predecessorBytes.toString()) as unknown)
  if (prior.repository !== config.repository || !['desktop-legacy-baseline', 'desktop-release-qualification'].includes(String(prior.purpose))) throw new Error('Unknown delivery predecessor')
  const predecessor = deliveryPredecessor(input.releaseKind, lock, prior)
  if (Array.isArray(prior.unresolvedAdoption) && prior.unresolvedAdoption.length > 0) throw new Error('Baseline unresolved adoption must be reconciled before qualification')
  if (!Number.isSafeInteger(input.run.id) || input.run.id < 1 || !Number.isSafeInteger(input.run.attempt) || input.run.attempt < 1) throw new Error('Missing qualification run identity')
  hex(input.run.commit, 40)
  const rangeFiles = lock.catchUp === undefined || lock.catchUp === null ? []
    : assessmentFiles(lock.catchUp, config.sourceLockPath, path => gitEvidence(input.root, commit, path), true)
  for (const item of rangeFiles) writeFileSync(join(input.directory, assessmentAsset(item.reference)), item.bytes)
  const checksums = native.map(item => `${item.dmg.sha256}  ${item.dmg.name}`).sort().join('\n') + '\n'
  for (const [name, bytes] of [['release-notes.md', notes], ['data-compatibility.json', compatibilityBytes], ['SHA256SUMS.txt', Buffer.from(checksums)], ['candidate.json', readFileSync(input.candidatePath)], ['predecessor.json', predecessorBytes]] as const) writeFileSync(join(input.directory, name), bytes)
  return {
    schemaVersion: 2, catchUp: lock.catchUp ?? null, purpose: 'desktop-release-qualification', mode: 'unsigned-preview', repository: config.repository, repositoryId: config.repositoryId, distribution: config.id,
    releaseKind: input.releaseKind, ...(input.releaseKind === 'replacement' ? { supersedes: { tag: prior.tag, manifestDigest: digest(predecessorBytes) } } : {}), desktopVersion: input.version, tag: `desktop-v${input.version}`, upstream: lock.release, downstreamCommit: commit, sourceLockDigest: candidate.record.sourceLockDigest, configDigest: candidate.record.configDigest, componentVersions: candidate.record.components,
    workflow: { path: '.github/workflows/desktop-delivery-qualify.yml', commit: input.run.commit, runId: input.run.id, attempt: input.run.attempt },
    predecessor: input.releaseKind === 'replacement' ? predecessor : { ...predecessor, digest: digest(predecessorBytes) },
    native, candidateDigest: candidate.digest, releaseNotesDigest: digest(notes), dataCompatibilityDigest: digest(compatibilityBytes),
    files: [...rangeFiles.map(item => file(input.directory, assessmentAsset(item.reference))), ...native.flatMap(item => [item.dmg, item.evidence]), ...['release-notes.md', 'data-compatibility.json', 'SHA256SUMS.txt', 'candidate.json', 'predecessor.json'].map(name => file(input.directory, name))],
    nextAction: 'Review these exact manifest bytes before starting the protected publication operation.',
  }
}

/** Validate a final manifest and rehash every local payload file.
 * @param config - expected distribution.
 * @param path - exact final manifest bytes.
 * @param directory - complete payload directory.
 * @returns Manifest and exact approval digest.
 */
export function checkedManifest(config: DeliveryConfig,
  path: string,
  directory: string): { manifest: Record<string, unknown>
  digest: string
  files: ReleaseFile[] } {
  const manifest = object(readJson(path))
  if ((manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) || manifest.purpose !== 'desktop-release-qualification' || manifest.mode !== 'unsigned-preview' || manifest.repository !== config.repository || manifest.repositoryId !== config.repositoryId || manifest.distribution !== config.id) throw new Error('Invalid production qualification; signed-mode-unconfigured or shadow evidence')
  const range = manifestCatchUp(manifest)
  if (manifest.tag !== `desktop-v${string(manifest.desktopVersion)}`) throw new Error('Invalid unsigned desktop identity')
  requireUnsignedVersion(string(manifest.desktopVersion))
  hex(manifest.downstreamCommit, 40)
  hex(manifest.sourceLockDigest)
  release(manifest.upstream)
  const workflow = object(manifest.workflow)
  if (workflow.path !== '.github/workflows/desktop-delivery-qualify.yml' || !Number.isSafeInteger(workflow.runId) || !Number.isSafeInteger(workflow.attempt)) throw new Error('Invalid qualification workflow identity')
  hex(workflow.commit, 40)
  if (!Array.isArray(manifest.files) || !Array.isArray(manifest.native) || manifest.native.length !== config.architectures.length) throw new Error('Missing native qualification assets')
  const names = new Set<string>()
  const files = manifest.files.map((value) => {
    const expected = object(value)
    const name = string(expected.name)
    if (names.has(name) || name === 'manifest.json') throw new Error('Duplicate or self-referential release file')
    names.add(name)
    const actual = file(directory, name)
    if (actual.size !== expected.size || actual.sha256 !== hex(expected.sha256)) throw new Error(`Qualification file changed: ${name}`)
    return actual
  })
  for (const name of ['candidate.json', 'release-notes.md', 'data-compatibility.json', 'SHA256SUMS.txt', 'predecessor.json']) if (!names.has(name)) throw new Error(`Missing ${name}`)
  if (file(directory, 'candidate.json').sha256 !== manifest.candidateDigest || file(directory, 'release-notes.md').sha256 !== manifest.releaseNotesDigest || file(directory, 'data-compatibility.json').sha256 !== manifest.dataCompatibilityDigest) throw new Error('Manifest evidence digest mismatch')
  const candidate = object(readJson(assetPath(directory, 'candidate.json')))
  if (candidate.purpose !== 'desktop-delivery-shadow' || candidate.kind !== 'candidate' || candidate.qualificationEligible !== true || object(candidate.sourceDifference).status !== ''
    || candidate.downstreamCommit !== manifest.downstreamCommit || candidate.sourceLockDigest !== manifest.sourceLockDigest
    || candidate.configDigest !== manifest.configDigest || !sameRelease(release(candidate.upstream), release(manifest.upstream))
    || JSON.stringify(candidate.components) !== JSON.stringify(manifest.componentVersions)) throw new Error('Candidate source identity differs from final manifest')
  const checksum = manifest.native.map(object).map(entry => object(entry.dmg)).map(dmg => `${string(dmg.sha256)}  ${string(dmg.name)}`).sort().join('\n') + '\n'
  if (readFileSync(assetPath(directory, 'SHA256SUMS.txt'), 'utf8') !== checksum) throw new Error('Checksum convenience file differs from approved DMGs')
  const compatibility = object(readJson(assetPath(directory, 'data-compatibility.json')))
  if (compatibility.schemaVersion !== 1 || compatibility.persistedFormatsChanged !== false
    || !Array.isArray(compatibility.evidenceReferences)
    || compatibility.evidenceReferences.length === 0 || !Array.isArray(compatibility.unsupportedDowngrades) || compatibility.unsupportedDowngrades.length === 0) throw new Error('Compatibility assessment requires separate migration qualification')
  textField(compatibility.assessment)
  if (range !== null) {
    const rangeFiles = assessmentFiles(range, config.sourceLockPath, path => readFileSync(assetPath(directory, assessmentAsset({ path, sha256: '' }))), true)
    for (const item of rangeFiles) if (!names.has(assessmentAsset(item.reference))) throw new Error('Missing catch-up assessment asset')
    const expected = new Set(rangeFiles.map(item => assessmentAsset(item.reference)))
    if ([...names].some(name => name.startsWith('catch-up-') && !expected.has(name))) throw new Error('Unexpected catch-up assessment asset')
  } else if ([...names].some(name => name.startsWith('catch-up-'))) throw new Error('Catch-up assets without range evidence')
  for (const arch of config.architectures) {
    const entries = manifest.native.map(object).filter(item => item.architecture === arch)
    if (entries.length !== 1) throw new Error('Missing or duplicate native architecture')
    const entry = object(entries[0])
    const evidence = object(entry.evidence)
    const dmg = object(entry.dmg)
    if (!names.has(string(evidence.name)) || !names.has(string(dmg.name))) throw new Error('Native assets absent from manifest')
    for (const descriptor of [evidence, dmg]) {
      const actual = files.find(file => file.name === descriptor.name)
      if (actual?.size !== descriptor.size || actual?.sha256 !== descriptor.sha256) throw new Error('Nested native descriptor differs from rehashed files')
    }
    if (dmg.name !== `${config.assetPrefix}-${string(manifest.desktopVersion)}-${arch}.dmg`) throw new Error('DMG name does not match desktop release reader')
    const native = object(readJson(assetPath(directory, string(evidence.name))))
    if (native.schemaVersion !== 1 || native.mode !== 'unsigned-preview' || native.purpose !== 'desktop-release-native-evidence' || native.candidateDigest !== manifest.candidateDigest || native.dmgDigest !== dmg.sha256 || native.architecture !== arch || native.desktopVersion !== manifest.desktopVersion || native.qualificationEligible !== true) throw new Error('Native qualification identity mismatch')
    checkArchitecture(string(native.executableArchitectures), arch)
    for (const key of ['bootstrap', 'backendHttp', 'backendStopped', 'mountedReadOnly', 'detached', 'copiedInstallation', 'installationStopped', 'installationRemoved']) if (native[key] !== true) throw new Error('Native qualification check failed')
  }
  return { manifest, digest: digest(readFileSync(path)), files }
}

/** Validate versioned manifest provenance without discarding historical evidence.
 * @param manifest - parsed production manifest.
 * @returns Normalized range or null for ordinary/historical qualification.
 */
export function manifestCatchUp(manifest: Record<string, unknown>): ReturnType<typeof catchUpEvidence> | null {
  if (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2) throw new Error('Unknown production manifest schema')
  if (manifest.schemaVersion === 1 && 'catchUp' in manifest) throw new Error('Historical manifests cannot carry catch-up evidence')
  const range = manifest.schemaVersion === 1 || manifest.catchUp === null ? null : catchUpEvidence(manifest.catchUp)
  if (range !== null && !sameRelease(range.to, release(manifest.upstream))) throw new Error('Manifest catch-up target mismatch')
  if (manifest.releaseKind === 'catch-up' && range === null) throw new Error('Missing manifest catch-up evidence')
  if (range !== null && !['catch-up', 'desktop', 'replacement'].includes(String(manifest.releaseKind))) throw new Error('Invalid catch-up manifest kind')
  return range
}
