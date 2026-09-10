/** Parse and hash local shadow evidence; these records never authorize publication. */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'

/** Fixed markers shared by every shadow report. */
export const shadow = { schemaVersion: 1, purpose: 'desktop-delivery-shadow', signing: 'unsigned', publicationEligible: false } as const
/** Native macOS architectures required by a distribution. */
export type Architecture = 'arm64' | 'x64'
/** Distribution-specific values, independent of executable packaging commands. */
export interface Distribution {
  id: string
  upstreamRepository: string
  tagPrefix: string
  architectures: Architecture[]
  application: string
}
/** Immutable public release observation, including the resolved tag commit. */
export interface Release { id: number; tag: string; commit: string; publishedAt: string }
/** Supplied source evidence, with all previously observed selected releases. */
export interface SourceLock {
  schemaVersion: 1 | 2 | 3
  upstreamRepository: string
  release: Release
  predecessor: Release | null
  observed: Release[]
  adoptionSeed?: { commit: string; tree: string }
  catchUp?: CatchUp | null
}

/** Committed assessment file identity. */
export interface EvidenceReference { path: string; sha256: string }
/** Exact reviewed upstream interval retained through subsequent desktop fixes. */
export interface CatchUp {
  schemaVersion: 1
  from: Release
  to: Release
  releases: Release[]
  assessment: EvidenceReference
}

/** Validate a repository-relative evidence path without aliases or parent traversal.
 * @param value - external path.
 * @returns Canonical slash-separated relative path.
 */
export function evidencePath(value: unknown): string {
  const path = string(value)
  if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u.test(path) || path.split('/').some(part => part === '.' || part === '..' || part.toLowerCase() === '.git')) throw new Error('Unsafe assessment evidence path')
  return path
}
/** Parse exact range provenance, optionally checking its full observation interval.
 * @param value - non-null catch-up record.
 * @param observed - complete recorded observations when available.
 * @returns Validated range and assessment digest.
 */
export function catchUpEvidence(value: unknown, observed?: Release[]): CatchUp {
  const item = object(value)
  if (item.schemaVersion !== 1 || !Array.isArray(item.releases) || item.releases.length < 2) throw new Error('Catch-up requires at least two releases')
  const from = release(item.from)
  const to = release(item.to)
  const releases = item.releases.map(release)
  let previous = from
  const ids = new Set([from.id])
  const tags = new Set([from.tag])
  for (const entry of releases) {
    if (compareRelease(previous, entry) >= 0 || ids.has(entry.id) || tags.has(entry.tag)) throw new Error('Invalid catch-up range order or duplicate identity')
    ids.add(entry.id); tags.add(entry.tag); previous = entry
  }
  if (!sameRelease(previous, to)) throw new Error('Catch-up target differs from range')
  if (observed !== undefined) {
    const interval = observed.filter(entry => compareRelease(entry, from) > 0 && compareRelease(entry, to) <= 0).sort(compareRelease)
    if (!observed.some(entry => sameRelease(entry, from)) || interval.length !== releases.length || interval.some((entry, index) => !sameRelease(entry, release(releases[index])))) throw new Error('Catch-up range omits or changes observed releases')
  }
  const assessment = object(item.assessment)
  return { schemaVersion: 1, from, to, releases, assessment: { path: evidencePath(assessment.path), sha256: hex(assessment.sha256) } }
}

/** Require an object at an external JSON input.
 * @param value - parsed input.
 * @returns Input fields, or throws for other JSON values.
 */
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected JSON object')
  return value as Record<string, unknown>
}
/** Require a nonempty string field.
 * @param value - input value.
 * @returns Validated string.
 */
export function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || /[\r\n\0]/u.test(value)) throw new Error('Expected nonempty single-line string')
  return value
}
/** Validate prose or base64 content whose meaningful bytes may span lines.
 * @param value - external text field.
 * @returns Nonempty text without NUL bytes, preserving its original newlines.
 */
export function textField(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) throw new Error('Expected nonempty text')
  return value
}
/** Validate a hexadecimal digest or Git commit.
 * @param value - input value.
 * @param length - exact hex length.
 * @returns Validated lowercase hex.
 */
export function hex(value: unknown, length = 64): string {
  const text = string(value)
  if (text.length !== length || !/^[a-f0-9]+$/u.test(text)) throw new Error('Invalid digest or commit')
  return text
}
/** Parse one immutable release identity.
 * @param value - external release record.
 * @returns Validated release.
 */
export function release(value: unknown): Release {
  const item = object(value)
  if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0) throw new Error('Invalid release ID')
  const publishedAt = string(item.publishedAt)
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/u.test(publishedAt) || !Number.isFinite(Date.parse(publishedAt))) throw new Error('Invalid publication time')
  return { id: Number(item.id), tag: string(item.tag), commit: hex(item.commit, 40), publishedAt }
}
/** Parse distribution configuration without executable command strings.
 * @param value - external configuration.
 * @returns Validated distribution.
 */
export function distribution(value: unknown): Distribution {
  const item = object(value)
  const id = string(item.id)
  const upstreamRepository = string(item.upstreamRepository)
  const application = string(item.application)
  if (!/^[a-z0-9-]+$/u.test(id) || !/^[\w.-]+\/[\w.-]+$/u.test(upstreamRepository) || /[\/\\]/u.test(application)) throw new Error('Invalid distribution identity')
  if (!Array.isArray(item.architectures) || item.architectures.length === 0 || item.architectures.some(arch => arch !== 'arm64' && arch !== 'x64') || new Set(item.architectures).size !== item.architectures.length) throw new Error('Invalid architecture set')
  return { id, upstreamRepository, application, tagPrefix: string(item.tagPrefix), architectures: item.architectures as Architecture[] }
}
/** Parse a source lock and require internally consistent recorded identities.
 * @param value - external lock.
 * @param config - owning distribution.
 * @returns Validated source lock.
 */
export function sourceLock(value: unknown, config: Distribution): SourceLock {
  const item = object(value)
  if ((item.schemaVersion !== 1 && item.schemaVersion !== 2 && item.schemaVersion !== 3) || item.upstreamRepository !== config.upstreamRepository || !Array.isArray(item.observed)) throw new Error('Invalid source lock repository or schema')
  const current = release(item.release)
  const predecessor = item.predecessor === null ? null : release(item.predecessor)
  const observed = item.observed.map(release)
  if (!observed.every(entry => entry.tag.startsWith(config.tagPrefix)) || !observed.some(entry => sameRelease(entry, current))) throw new Error('Source lock current identity is not recorded')
  if (new Set(observed.map(entry => entry.id)).size !== observed.length || new Set(observed.map(entry => entry.tag)).size !== observed.length) throw new Error('Duplicate source lock identity')
  if (predecessor !== null && (!observed.some(entry => sameRelease(entry, predecessor)) || compareRelease(predecessor, current) >= 0)) throw new Error('Invalid predecessor identity')
  if (item.schemaVersion !== 3 && 'catchUp' in item) throw new Error('Historical source-lock schemas cannot carry catch-up evidence')
  const catchUp = item.schemaVersion === 3 ? (item.catchUp === null ? null : catchUpEvidence(item.catchUp, observed)) : undefined
  if (catchUp !== undefined && catchUp !== null && (predecessor === null || !sameRelease(catchUp.from, predecessor) || !sameRelease(catchUp.to, current))) throw new Error('Source-lock catch-up identity mismatch')
  const adoptionSeed = item.schemaVersion === 1 ? undefined : object(item.adoptionSeed)
  return {
    ...(catchUp === undefined ? {} : { catchUp }),
    schemaVersion: item.schemaVersion, upstreamRepository: config.upstreamRepository, release: current, predecessor, observed,
    ...(adoptionSeed === undefined ? {} : { adoptionSeed: { commit: hex(adoptionSeed.commit, 40), tree: hex(adoptionSeed.tree, 40) } }),
  }
}
/** Compare every immutable release field.
 * @param left - recorded release.
 * @param right - observed release.
 * @returns Whether the identities match.
 */
export function sameRelease(left: Release, right: Release): boolean {
  return left.id === right.id && left.tag === right.tag && left.commit === right.commit && left.publishedAt === right.publishedAt
}
/** Order releases by publication time, then numeric identity.
 * @param left - first release.
 * @param right - second release.
 * @returns Sorting order.
 */
export function compareRelease(left: Release, right: Release): number {
  return Date.parse(left.publishedAt) - Date.parse(right.publishedAt) || left.id - right.id
}
/** Hash exact evidence bytes.
 * @param bytes - serialized evidence or file data.
 * @returns SHA-256 digest.
 */
export function digest(bytes: string | Uint8Array): string { return createHash('sha256').update(bytes).digest('hex') }
/** Read external JSON.
 * @param path - local evidence file.
 * @returns Parsed JSON requiring validation by its consumer.
 */
export function readJson(path: string): unknown { return JSON.parse(readFileSync(path, 'utf8')) as unknown }
/** Resolve a contained regular artifact and reject paths crossing its directory.
 * @param directory - artifact root.
 * @param name - relative asset filename.
 * @returns Canonical regular-file path.
 */
export function assetPath(directory: string, name: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)) throw new Error('Unsafe artifact path')
  const root = realpathSync(directory)
  const path = resolve(root, name)
  if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile() || !realpathSync(path).startsWith(`${root}${sep}`)) throw new Error('Artifact must be a contained regular file')
  return path
}
/** Validate mandatory shadow markers on imported evidence.
 * @param value - parsed record.
 * @returns Validated record fields.
 */
export function shadowRecord(value: unknown): Record<string, unknown> {
  const item = object(value)
  for (const [key, expected] of Object.entries(shadow)) if (item[key] !== expected) throw new Error(`Invalid shadow marker: ${key}`)
  return item
}
