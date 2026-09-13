/** Authenticate fixed retained inputs for a non-qualifying native capability observation. */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { digest, hex, object, string } from './evidence.ts'

interface FilePin { name: string; size: number; sha256: string }
/** Protected descriptor binds retrieval and the exact native runtime. */
export interface ForwardProbeSpec {
  schemaVersion: 1
  purpose: 'desktop-forward-native-capability'
  architecture: 'x64'
  repository: 'mintgao/dsh-desktop'
  repositoryId: number
  runId: number
  runAttempt: number
  artifactId: number
  workflow: string
  sourceCommit: string
  archive: { size: number; sha256: string }
  candidate: FilePin
  native: FilePin
  dmg: FilePin
  runtimeDigest: string
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Missing positive artifact identity')
  return value
}
function pin(value: unknown): FilePin {
  const item = object(value)
  const name = string(item.name)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)) throw new Error('Unsafe artifact filename')
  return { name, size: positive(item.size), sha256: hex(item.sha256) }
}
/** Refuse non-native, incomplete or substituted fixed descriptor inputs.
 * @param value - Untrusted JSON descriptor.
 * @returns Explicit validated identity fields.
 */
export function forwardProbeSpec(value: unknown): ForwardProbeSpec {
  const item = object(value)
  if (item.schemaVersion !== 1 || item.purpose !== 'desktop-forward-native-capability' || item.architecture !== 'x64'
    || item.repository !== 'mintgao/dsh-desktop' || item.repositoryId !== 1344813014
    || item.workflow !== '.github/workflows/desktop-delivery-qualify.yml') throw new Error('Unexpected probe source or architecture')
  const archive = object(item.archive)
  return { schemaVersion: 1, purpose: 'desktop-forward-native-capability', architecture: 'x64', repository: item.repository,
    repositoryId: item.repositoryId, workflow: item.workflow, runId: positive(item.runId), runAttempt: positive(item.runAttempt),
    artifactId: positive(item.artifactId), sourceCommit: hex(item.sourceCommit, 40),
    archive: { size: positive(archive.size), sha256: hex(archive.sha256) }, candidate: pin(item.candidate), native: pin(item.native),
    dmg: pin(item.dmg), runtimeDigest: hex(item.runtimeDigest) }
}
/** Bind downloaded bytes to their retained size and digest before extraction or launch.
 * @param bytes - Actual complete bytes.
 * @param expected - Reviewed immutable identity.
 */
export function verifyProbeBytes(bytes: Uint8Array, expected: { size: number; sha256: string }): void {
  if (bytes.length !== expected.size || digest(bytes) !== expected.sha256) throw new Error('Retained probe artifact bytes differ')
}
/** Check installer and origin reports before staging an application.
 * @param spec - Protected descriptor.
 * @param dmg - Exact installer path.
 * @param candidateBytes - Retained candidate report.
 * @param nativeBytes - Retained native report.
 */
export function verifyProbeInputs(spec: ForwardProbeSpec, dmg: string, candidateBytes: Buffer, nativeBytes: Buffer): void {
  if (basename(dmg) !== spec.dmg.name) throw new Error('Probe DMG filename differs')
  verifyProbeBytes(readFileSync(dmg), spec.dmg)
  verifyProbeBytes(candidateBytes, spec.candidate)
  verifyProbeBytes(nativeBytes, spec.native)
  const candidate = object(JSON.parse(candidateBytes.toString()))
  const native = object(JSON.parse(nativeBytes.toString()))
  if (candidate.downstreamCommit !== spec.sourceCommit || native.architecture !== spec.architecture
    || native.candidateDigest !== spec.candidate.sha256 || native.dmgDigest !== spec.dmg.sha256
    || native.packagedRuntimeDigest !== spec.runtimeDigest || native.state !== 'native-checks-passed') throw new Error('Retained native reports disagree with descriptor')
}

/** Authenticate API origin independently from the archive digest.
 * @param spec - Protected retained identity.
 * @param repository - Live repository response.
 * @param run - Exact live run-attempt response.
 * @param artifact - Live artifact response.
 */
export function verifyProbeOrigin(spec: ForwardProbeSpec, repository: Record<string, unknown>,
  run: Record<string, unknown>, artifact: Record<string, unknown>): void {
  if (repository.id !== spec.repositoryId || run.id !== spec.runId || run.run_attempt !== spec.runAttempt
    || run.head_sha !== spec.sourceCommit || run.path !== spec.workflow || run.status !== 'completed'
    || artifact.id !== spec.artifactId || artifact.expired !== false || artifact.size_in_bytes !== spec.archive.size
    || artifact.digest !== `sha256:${spec.archive.sha256}` || object(artifact.workflow_run).id !== spec.runId) throw new Error('Probe origin metadata differs')
}
