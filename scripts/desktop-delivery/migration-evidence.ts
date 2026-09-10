/** Validate candidate-bound packaged migration evidence for publication and retained recovery. */
import { readFileSync } from 'node:fs'
import { digest, hex, object, string, type Architecture } from './evidence.ts'
import { MIGRATION_COMPOSITION_ROOTS } from './migration-composition.ts'
import { MIGRATION_SCENARIOS } from './migration-scenarios.ts'
import type { ReleaseFile } from './manifest.ts'

/** Read exact contained payload bytes; callers enforce regular-file or authenticated-archive ownership. */
export type MigrationReader = (name: string) => Uint8Array

function parsed(bytes: Uint8Array): Record<string, unknown> {
  return object(JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown)
}
function record(value: unknown): ReleaseFile {
  const row = object(value)
  const name = string(row.name)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name) || !Number.isSafeInteger(row.size) || Number(row.size) < 1) throw new Error('Invalid migration evidence file')
  return { name, size: Number(row.size), sha256: hex(row.sha256) }
}
function bytesFor(descriptor: ReleaseFile, read: MigrationReader): Uint8Array {
  const bytes = read(descriptor.name)
  if (bytes.byteLength !== descriptor.size || digest(bytes) !== descriptor.sha256) throw new Error(`Migration evidence bytes changed: ${descriptor.name}`)
  return bytes
}
function equalFields(actual: Record<string, unknown>, expected: Record<string, unknown>, label: string): void {
  for (const [key, value] of Object.entries(expected)) if (actual[key] !== value) throw new Error(`Migration ${label} identity mismatch: ${key}`)
}

/** Check the fixed policy before admitting any generated runtime report.
 * @param value - candidate policy JSON bound by its compatibility assessment.
 * @returns The policy after mandatory inventory and exact baseline validation.
 */
export function migrationPolicy(value: unknown): Record<string, unknown> {
  const policy = object(value)
  if (policy.schemaVersion !== 1 || policy.purpose !== 'desktop-data-migration-policy'
    || policy.targetUpstream !== 'b2e3b2a0125854567a4a5fcba75782e42fe84901'
    || JSON.stringify(policy.architectures) !== JSON.stringify(['arm64', 'x64'])
    || !Array.isArray(policy.scenarios) || policy.scenarios.length !== MIGRATION_SCENARIOS.length
    || new Set(policy.scenarios).size !== policy.scenarios.length
    || MIGRATION_SCENARIOS.some(id => !(policy.scenarios as unknown[]).includes(id))) throw new Error('Migration policy does not cover the fixed target and scenario registry')
  const baseline = object(policy.baseline)
  equalFields(baseline, { upstream: 'dd6322d604e00eec1ba5e0c8541159906a21094a', sourceCommit: '67406fc6af451f7f68874cb31c2d0f3242c0c8ad', desktopTag: 'desktop-v0.1.2-alpha.3.unsigned.1' }, 'baseline')
  const legacyBytes = readFileSync(new URL('../../.github/desktop-delivery/legacy-baseline.json', import.meta.url))
  const legacy = parsed(legacyBytes)
  if (baseline.evidenceDigest !== digest(legacyBytes) || !Array.isArray(legacy.assets)) throw new Error('Migration baseline differs from the authoritative delivered baseline')
  for (const arch of ['arm64', 'x64']) {
    const selected = record(object(baseline.artifacts)[arch])
    const assets = legacy.assets.map(object).filter(asset => asset.name === selected.name)
    if (assets.length !== 1 || !selected.name.endsWith(`-${arch}.dmg`)) throw new Error('Migration baseline artifact is not authoritative')
    equalFields({ ...selected }, { ...record(assets[0]) }, 'baseline artifact')
  }
  const composition = object(policy.composition)
  if (composition.profile !== 'desktop-mint' || composition.patchReload !== 'live' || composition.notificationDefault !== 'background'
    || JSON.stringify(composition.bundles) !== JSON.stringify(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-desktop-mint'])) throw new Error('Migration policy changes the approved Mint composition')
  if (!Array.isArray(composition.files)) throw new Error('Missing composition source inventory')
  const paths = composition.files.map((value) => {
    const file = object(value)
    const path = string(file.path)
    if (!/^(packages|vendor)\/[A-Za-z0-9_./-]+$/u.test(path) || path.split('/').includes('..')) throw new Error('Invalid composition source path')
    hex(file.sha256)
    return path
  })
  if (new Set(paths).size !== paths.length || MIGRATION_COMPOSITION_ROOTS.some(path => !paths.includes(path))) throw new Error('Migration policy omits required composition sources')
  return policy
}

/** Validate both architecture reports and every referenced payload against the final manifest.
 * @param manifest - exact candidate, native DMGs, run identity and complete file inventory.
 * @param read - contained or authenticated exact-byte reader.
 * @returns Distinct policy, reports and scenario files that the manifest must retain.
 */
export function migrationEvidence(manifest: Record<string, unknown>, read: MigrationReader): ReleaseFile[] {
  const compatibility = parsed(read('data-compatibility.json'))
  if (compatibility.persistedFormatsChanged !== true) {
    if ('migration' in manifest) throw new Error('Migration reports require an explicit changed-format assessment')
    return []
  }
  const descriptor = object(compatibility.migrationPolicy)
  if (descriptor.path !== '.github/desktop-delivery/migration-policy.json') throw new Error('Missing fixed migration policy reference')
  const policyBytes = read('migration-policy.json')
  if (digest(policyBytes) !== hex(descriptor.sha256)) throw new Error('Migration policy differs from candidate assessment')
  const policy = migrationPolicy(parsed(policyBytes))
  if (object(manifest.upstream).commit !== policy.targetUpstream) throw new Error('Migration target differs from candidate')
  const expected = new Map<string, ReleaseFile>()
  if (!Array.isArray(manifest.files)) throw new Error('Missing migration file inventory')
  for (const value of manifest.files) {
    const file = record(value)
    if (expected.has(file.name)) throw new Error('Duplicate migration inventory file')
    expected.set(file.name, file)
  }
  const selected = new Map<string, ReleaseFile>()
  const retain = (file: ReleaseFile): Uint8Array => {
    const listed = expected.get(file.name)
    if (listed?.size !== file.size || listed.sha256 !== file.sha256) throw new Error('Migration payload absent or inconsistent in manifest inventory')
    selected.set(file.name, file)
    return bytesFor(file, read)
  }
  const policyFile = expected.get('migration-policy.json')
  if (policyFile === undefined) throw new Error('Migration policy omitted from manifest')
  retain(policyFile)
  const migration = object(manifest.migration)
  if (migration.schemaVersion !== 1 || migration.policyDigest !== digest(policyBytes)
    || !Array.isArray(migration.reports) || migration.reports.length !== 2 || !Array.isArray(manifest.native)) throw new Error('Incomplete architecture migration reports')
  const seen = new Set<string>()
  for (const value of migration.reports) {
    const entry = object(value)
    const arch = string(entry.architecture) as Architecture
    if (!['arm64', 'x64'].includes(arch) || seen.has(arch)) throw new Error('Duplicate or unknown migration architecture')
    seen.add(arch)
    const report = parsed(retain(record(entry.evidence)))
    if (report.schemaVersion !== 1 || report.purpose !== 'desktop-data-migration-qualification') throw new Error('Invalid migration report purpose')
    equalFields(report, { architecture: arch, candidateDigest: manifest.candidateDigest, downstreamCommit: manifest.downstreamCommit, sourceLockDigest: manifest.sourceLockDigest, dataCompatibilityDigest: manifest.dataCompatibilityDigest }, 'candidate')
    const workflow = object(manifest.workflow)
    if (workflow.path !== '.github/workflows/desktop-delivery-qualify.yml' || !Number.isSafeInteger(workflow.runId) || Number(workflow.runId) < 1 || !Number.isSafeInteger(workflow.attempt) || Number(workflow.attempt) < 1) throw new Error('Missing migration workflow identity')
    hex(workflow.commit, 40)
    equalFields(object(report.workflow), workflow, 'workflow')
    const baseline = object(policy.baseline)
    equalFields(object(report.baseline), { upstream: baseline.upstream, sourceCommit: baseline.sourceCommit, desktopTag: baseline.desktopTag, evidenceDigest: baseline.evidenceDigest, artifactDigest: record(object(baseline.artifacts)[arch]).sha256 }, 'baseline')
    const native = manifest.native.map(object).filter(row => row.architecture === arch)
    if (native.length !== 1) throw new Error('Migration report lacks matching native evidence')
    const nativeRecord = parsed(bytesFor(record(native[0]?.evidence), read))
    const runtimeDigest = hex(nativeRecord.packagedRuntimeDigest)
    equalFields(object(report.target), { upstream: policy.targetUpstream, dmgDigest: record(native[0]?.dmg).sha256, packagedRuntimeDigest: runtimeDigest }, 'target')
    const inputs = object(report.inputs)
    for (const [field, name] of [['compositionDigest', 'composition'], ['fixtureManifestDigest', 'fixtures'], ['backupManifestDigest', 'backup']] as const) {
      const evidence = record(inputs[name])
      if (evidence.sha256 !== hex(report[field])) throw new Error(`Migration ${name} digest has no matching payload`)
      retain(evidence)
    }
    if (report.compositionDigest !== digest(JSON.stringify(object(policy.composition).files))) throw new Error('Migration composition differs from authenticated candidate policy')
    if (report.compositionDigest !== migration.compositionDigest) throw new Error('Migration composition differs from committed candidate')
    if (!Array.isArray(report.scenarios) || report.scenarios.length !== MIGRATION_SCENARIOS.length) throw new Error('Incomplete migration scenario inventory')
    const scenarios = new Set<string>()
    for (const value of report.scenarios) {
      const scenario = object(value)
      const id = string(scenario.id)
      if (!(MIGRATION_SCENARIOS as readonly string[]).includes(id) || scenarios.has(id) || scenario.status !== 'passed'
        || !Array.isArray(scenario.evidenceFiles) || scenario.evidenceFiles.length === 0) throw new Error('Missing, duplicate, skipped or failed migration scenario')
      scenarios.add(id)
      const names = new Set<string>()
      const receipt = parsed(retain(record(scenario.evidenceFiles[0])))
      if (receipt.schemaVersion !== 1 || receipt.purpose !== 'desktop-migration-scenario' || receipt.id !== id || receipt.status !== 'passed') throw new Error('Missing scenario execution receipt')
      equalFields(receipt, { candidateDigest: report.candidateDigest, downstreamCommit: report.downstreamCommit, sourceLockDigest: report.sourceLockDigest, dataCompatibilityDigest: report.dataCompatibilityDigest }, 'scenario candidate')
      equalFields(object(receipt.workflow), workflow, 'scenario workflow')
      const negative = ['session-interruption-retry', 'session-source-drift', 'session-invalid-highest', 'session-exclusive-writer', 'credentials-invalid-refusal', 'env-bootstrap-refusal', 'workspace-interrupted-mutation', 'workspace-path-refusal', 'projection-invalid-backup', 'attachments-conflict-interruption', 'restore-integrity-refusal', 'settings-pi-write-validation']
      if (receipt.execution === 'negative-tests') {
        if (!negative.includes(id) || ![arch, 'shared'].includes(String(receipt.architecture))) throw new Error('Source negative evidence cannot replace packaged execution')
      } else {
        if (receipt.execution !== 'packaged' || receipt.architecture !== arch) throw new Error('Packaged scenario must execute on its own architecture')
        equalFields(object(receipt.target), object(report.target), 'scenario target')
        equalFields(object(receipt.baseline), object(report.baseline), 'scenario baseline')
      }
      if (!Array.isArray(receipt.assertions) || receipt.assertions.length === 0 || receipt.assertions.some(value => typeof value !== 'string' || value.length === 0) || new Set(receipt.assertions).size !== receipt.assertions.length) throw new Error('Scenario receipt has no distinct executed assertions')
      for (const evidence of scenario.evidenceFiles) {
        const file = record(evidence)
        if (names.has(file.name)) throw new Error('Duplicate scenario evidence')
        names.add(file.name)
        retain(file)
      }
    }
  }
  return [...selected.values()]
}
