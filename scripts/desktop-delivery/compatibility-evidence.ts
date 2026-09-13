/** Shared assessment-version dispatch for producers, local checks and publication. */
import { object, textField } from './evidence.ts'
import { migrationEvidence, type MigrationReader } from './migration-evidence.ts'
import { forwardPackage } from './forward-package.ts'
import type { ReleaseFile } from './manifest.ts'

/** Reject unknown versions and conflicting forward/legacy policy claims.
 * @param value - Parsed committed compatibility assessment.
 * @returns Explicit forward or legacy assessment mode.
 */
export function compatibilityKind(value: unknown): 'forward' | 'legacy' {
  const assessment = object(value)
  if (typeof assessment.persistedFormatsChanged !== 'boolean' || !Array.isArray(assessment.evidenceReferences) || assessment.evidenceReferences.length === 0
    || !Array.isArray(assessment.unsupportedDowngrades) || assessment.unsupportedDowngrades.length === 0) throw new Error('Missing data compatibility assessment')
  textField(assessment.assessment)
  if (assessment.schemaVersion === 1 && !('forwardPolicy' in assessment)) return 'legacy'
  if (assessment.schemaVersion === 2 && assessment.persistedFormatsChanged && 'forwardPolicy' in assessment && !('migrationPolicy' in assessment)) return 'forward'
  throw new Error('Unknown or conflicting compatibility assessment version')
}

/** Apply the same versioned compatibility rules to local and authenticated remote bytes.
 * @param manifest - Final qualification metadata.
 * @param read - Exact file reader.
 * @returns Relevant checked file descriptors.
 */
export function compatibilityEvidence(manifest: Record<string, unknown>, read: MigrationReader): ReleaseFile[] {
  const kind = compatibilityKind(JSON.parse(Buffer.from(read('data-compatibility.json')).toString()) as unknown)
  if (kind === 'forward') return forwardPackage(manifest, read)
  if (manifest.schemaVersion === 3 || 'forward' in manifest) throw new Error('Legacy assessment cannot claim forward acceptance')
  return migrationEvidence(manifest, read)
}
