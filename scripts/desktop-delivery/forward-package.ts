/** Deterministic assembly of CI-owned build bytes and bounded manual acceptance. */
import { checkArchitecture } from './artifacts.ts'
import { assessmentAsset, assessmentFiles } from './catch-up.ts'
import { catchUpEvidence, digest, hex, object, string } from './evidence.ts'
import { forwardObservation, forwardPolicy } from './forward-evidence.ts'
import type { ReleaseFile } from './manifest.ts'
import type { MigrationReader } from './migration-evidence.ts'

/** Exact serialization used for build receipts and derived manifests.
 * @param value - Validated record.
 * @returns Stable formatted JSON bytes with a trailing newline.
 */
export function forwardBytes(value: unknown): Buffer { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`) }

/** Rehash a flat inventory, refusing duplicate, unsafe or altered entries.
 * @param value - File descriptors.
 * @param read - Exact payload reader.
 * @returns Checked descriptors.
 */
export function forwardFiles(value: unknown, read: MigrationReader): ReleaseFile[] {
  if (!Array.isArray(value)) throw new Error('Missing forward file inventory')
  const seen = new Set<string>()
  return value.map((value) => {
    const file = object(value), name = string(file.name)
    if (Object.keys(file).length !== 3 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name) || seen.has(name) || !Number.isSafeInteger(file.size) || Number(file.size) < 1) throw new Error('Invalid forward file descriptor')
    seen.add(name)
    const bytes = read(name)
    if (bytes.byteLength !== file.size || digest(bytes) !== hex(file.sha256)) throw new Error(`Forward file changed: ${name}`)
    return { name, size: file.size, sha256: hex(file.sha256) }
  })
}

/** Validate a build-only receipt and its fixed CI-owned artifact set.
 * @param value - Build receipt record, never GUI qualification.
 * @param read - Authenticated archive or local payload reader.
 * @returns Validated receipt and policy.
 */
export function forwardBuild(value: unknown, read: MigrationReader): {
  build: Record<string, unknown>
  policy: Record<string, unknown>
  target: Record<string, unknown>
} {
  const build = object(value)
  const fields = ['schemaVersion', 'catchUp', 'purpose', 'mode', 'repository', 'repositoryId', 'distribution', 'releaseKind',
    'desktopVersion', 'tag', 'upstream', 'downstreamCommit', 'sourceLockDigest', 'configDigest', 'componentVersions', 'workflow',
    'predecessor', 'native', 'candidateDigest', 'releaseNotesDigest', 'dataCompatibilityDigest', 'files', 'nextAction', 'assetPrefix',
    'sourceLockPath', 'publicationEligible', 'policyDigest', ...build.releaseKind === 'replacement' ? ['supersedes'] : []]
  if (Object.keys(build).length !== fields.length || fields.some(key => !(key in build))) throw new Error('Unknown or missing forward build fields')
  if (build.schemaVersion !== 1 || build.purpose !== 'desktop-forward-build' || build.mode !== 'unsigned-preview' || build.publicationEligible !== false
    || 'forward' in build || 'migration' in build || !Array.isArray(build.native) || build.native.length !== 1) throw new Error('Invalid forward build receipt')
  const policyBytes = read('forward-policy.json')
  const policy = forwardPolicy(JSON.parse(Buffer.from(policyBytes).toString()) as unknown)
  const compatibility = object(JSON.parse(Buffer.from(read('data-compatibility.json')).toString()) as unknown)
  if (compatibility.schemaVersion !== 2 || compatibility.persistedFormatsChanged !== true || 'migrationPolicy' in compatibility
    || object(compatibility.forwardPolicy).path !== '.github/desktop-delivery/forward-update-policy.json'
    || object(compatibility.forwardPolicy).sha256 !== digest(policyBytes) || build.policyDigest !== digest(policyBytes)
    || build.desktopVersion !== policy.targetVersion || object(build.componentVersions)['@deepseek-ai/dsh'] !== policy.upstreamVersion) throw new Error('Forward build assessment, policy or version mismatch')
  const native = object(build.native[0]), dmg = object(native.dmg), evidence = object(native.evidence)
  if (Object.keys(native).length !== 3 || Object.keys(dmg).length !== 3 || Object.keys(evidence).length !== 3
    || native.architecture !== 'arm64' || dmg.name !== `${string(build.assetPrefix)}-${string(policy.targetVersion)}-arm64.dmg` || evidence.name !== 'native-arm64.json') throw new Error('Forward build requires exact arm64 native files')
  const files = forwardFiles(build.files, read)
  const expected = ['forward-policy.json', 'candidate.json', 'data-compatibility.json', 'release-notes.md', 'predecessor.json', 'SHA256SUMS.txt', string(dmg.name), string(evidence.name)]
  if (build.catchUp !== null) {
    const range = catchUpEvidence(build.catchUp)
    expected.push(...assessmentFiles(range, string(build.sourceLockPath), path => read(assessmentAsset({ path, sha256: '' })), false).map(item => assessmentAsset(item.reference)))
  }
  if (files.length !== expected.length || expected.some(name => !files.some(file => file.name === name))) throw new Error('Forward build-owned inventory cannot be reclassified or extended')
  for (const descriptor of [dmg, evidence]) {
    const actual = files.find(file => file.name === descriptor.name)
    if (actual?.sha256 !== descriptor.sha256 || actual?.size !== descriptor.size) throw new Error('Forward native descriptor mismatch')
  }
  for (const [name, field] of [['candidate.json', 'candidateDigest'], ['data-compatibility.json', 'dataCompatibilityDigest'], ['release-notes.md', 'releaseNotesDigest']] as const) {
    if (digest(read(name)) !== build[field]) throw new Error('Forward build identity digest mismatch')
  }
  const candidate = object(JSON.parse(Buffer.from(read('candidate.json')).toString()) as unknown)
  if (candidate.purpose !== 'desktop-delivery-shadow' || candidate.kind !== 'candidate' || candidate.qualificationEligible !== true
    || object(candidate.sourceDifference).status !== '' || candidate.downstreamCommit !== build.downstreamCommit
    || candidate.sourceLockDigest !== build.sourceLockDigest || candidate.configDigest !== build.configDigest
    || JSON.stringify(candidate.components) !== JSON.stringify(build.componentVersions) || JSON.stringify(candidate.upstream) !== JSON.stringify(build.upstream)) throw new Error('Forward candidate differs from build')
  const report = object(JSON.parse(Buffer.from(read(string(evidence.name))).toString()) as unknown)
  if (report.schemaVersion !== 1 || report.purpose !== 'desktop-release-native-evidence' || report.mode !== 'unsigned-preview'
    || report.qualificationEligible !== true || report.architecture !== 'arm64' || report.candidateDigest !== build.candidateDigest
    || report.desktopVersion !== build.desktopVersion || report.dmgDigest !== dmg.sha256) throw new Error('Forward native smoke identity mismatch')
  checkArchitecture(string(report.executableArchitectures), 'arm64')
  for (const name of ['bootstrap', 'backendHttp', 'backendStopped', 'mountedReadOnly', 'detached', 'copiedInstallation', 'installationStopped', 'installationRemoved']) {
    if (report[name] !== true) throw new Error('Forward native smoke is incomplete')
  }
  return { build, policy, target: { desktopVersion: build.desktopVersion, sourceCommit: build.downstreamCommit,
    candidateDigest: build.candidateDigest, dmg, runtimeDigest: hex(report.packagedRuntimeDigest) } }
}

/** Turn one verified producer result into a build-only receipt.
 * @param result - Source/native producer fields, without local acceptance.
 * @param policyDigest - Exact committed forward-policy digest.
 * @param read - Complete build payload reader.
 * @returns Build receipt that refuses direct publication.
 */
export function forwardBuildReceipt(result: Record<string, unknown>, policyDigest: string, read: MigrationReader): Record<string, unknown> {
  const receipt = { ...result, schemaVersion: 1, purpose: 'desktop-forward-build', publicationEligible: false, policyDigest,
    nextAction: 'Observe these exact build bytes locally, then assemble and approve the final package.' }
  forwardBuild(receipt, read)
  return receipt
}

/** Assemble an immutable schema-3 package without a future mutation-run identity.
 * @param receiptBytes - Exact CI build receipt bytes.
 * @param observationBytes - Exact bounded manual observation bytes.
 * @param read - Complete build payload reader.
 * @returns Final manifest; public-delivery acceptance remains separate.
 */
export function assembleForwardPackage(
  receiptBytes: Uint8Array, observationBytes: Uint8Array, read: MigrationReader,
): Record<string, unknown> {
  const { build, policy, target } = forwardBuild(JSON.parse(Buffer.from(receiptBytes).toString()) as unknown, read)
  forwardObservation(observationBytes, policy, digest(receiptBytes), target)
  const descriptor = (name: string, bytes: Uint8Array): ReleaseFile => ({ name, size: bytes.byteLength, sha256: digest(bytes) })
  const { publicationEligible: _publicationEligible, policyDigest: _policyDigest, ...fields } = build
  return { ...fields, schemaVersion: 3, purpose: 'desktop-release-qualification',
    forward: { schemaVersion: 1, buildReceipt: descriptor('build-receipt.json', receiptBytes), localObservation: descriptor('local-observation.json', observationBytes),
      evidenceClass: 'maintainer-attested-local-observation', publicDelivery: 'pending' },
    files: [...build.files as ReleaseFile[], descriptor('build-receipt.json', receiptBytes), descriptor('local-observation.json', observationBytes)],
    nextAction: 'Environment approval accepts this exact local observation as limited manual acceptance and authorizes the named release operation.' }
}

/** Reassemble every derived byte relationship before accepting a final forward manifest.
 * @param manifest - Schema-3 final manifest.
 * @param read - Exact retained payload reader.
 * @returns CI-owned descriptors, including its receipt but excluding derived evidence.
 */
export function forwardPackage(manifest: Record<string, unknown>, read: MigrationReader): ReleaseFile[] {
  if (manifest.schemaVersion !== 3) throw new Error('Forward evidence requires schema 3')
  forwardFiles(manifest.files, read)
  const receipt = read('build-receipt.json'), observation = read('local-observation.json')
  const assembled = assembleForwardPackage(receipt, observation, read)
  if (!forwardBytes(assembled).equals(forwardBytes(manifest))) throw new Error('Forward manifest differs from deterministic reassembly')
  const build = object(JSON.parse(Buffer.from(receipt).toString()) as unknown)
  return [...build.files as ReleaseFile[], { name: 'build-receipt.json', size: receipt.byteLength, sha256: digest(receipt) }]
}

/** Require exact limited acceptance to be repeated by promote/restore approval.
 * @param plan - Digest-approved operation plan.
 * @param manifest - Reassembled manifest.
 */
export function forwardApproval(plan: Record<string, unknown>, manifest: Record<string, unknown>): void {
  if (manifest.schemaVersion === 3 && plan.operation !== 'withdraw'
    && (plan.localObservationDigest !== object(object(manifest.forward).localObservation).sha256 || plan.acceptance !== FORWARD_APPROVAL)) {
    throw new Error('Approved local observation or acceptance meaning changed')
  }
}
/** The limited meaning displayed in the existing protected environment approval. */
export const FORWARD_APPROVAL = 'Environment approval accepts the exact maintainer-attested local observation as limited manual acceptance and authorizes this named release operation.'
