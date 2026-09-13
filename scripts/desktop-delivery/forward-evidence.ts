/** Fixed Apple Silicon forward policy and explicitly maintainer-attested observations. */
import { compareVersions } from 'compare-versions'
import { requireUnsignedVersion } from './lineage.ts'
import { TextDecoder } from 'node:util'
import { digest, hex, object, string, textField } from './evidence.ts'

/** Required manual scenarios; a successful CI build cannot satisfy them. */
export const FORWARD_SCENARIOS = [
  'artifact-identity', 'private-state-process-ownership', 'a-normal-entry', 'a-settings', 'a-quit-reopen',
  'quiescent-complete-backup', 'stopped-same-path-replacement', 'b-version-ui-keyless', 'b-quit-reopen',
  'declared-setting-retention', 'acquisition-failure-retry', 'incorrect-bytes-operator-refusal',
  'replacement-permission-recovery', 'incomplete-backup-refusal', 'full-recovery-normal-a', 'owned-cleanup',
] as const

function same(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && actual.every((value, i) => same(value, expected[i]))
  }
  if (expected !== null && typeof expected === 'object') {
    const target = object(expected), value = object(actual)
    return Object.keys(value).length === Object.keys(target).length && Object.entries(target).every(([key, item]) => same(value[key], item))
  }
  return actual === expected
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).length !== allowed.length || allowed.some(key => !(key in value))) throw new Error('Unknown or missing forward evidence fields')
}

/** Validate the fixed policy with no architecture or baseline substitution.
 * @param value - Parsed committed policy.
 * @returns Checked policy.
 */
export function forwardPolicy(value: unknown): Record<string, unknown> {
  const policy = object(value)
  keys(policy, ['schemaVersion', 'purpose', 'architecture', 'baseline', 'targetVersion', 'upstreamVersion', 'settings', 'scenarios'])
  if (policy.schemaVersion !== 1 || policy.purpose !== 'desktop-forward-policy' || policy.architecture !== 'arm64'
    || !same(policy.scenarios, FORWARD_SCENARIOS)) throw new Error('Forward policy differs from supported scenario scope')
  requireUnsignedVersion(string(policy.targetVersion))
  const baseline = object(policy.baseline)
  keys(baseline, ['sourceCommit', 'buildRunId', 'desktopVersion', 'archive', 'candidateDigest', 'dmg', 'runtimeDigest'])
  hex(baseline.sourceCommit, 40); hex(baseline.candidateDigest); hex(baseline.runtimeDigest)
  requireUnsignedVersion(string(baseline.desktopVersion))
  if (!Number.isSafeInteger(baseline.buildRunId) || Number(baseline.buildRunId) < 1 || compareVersions(string(policy.targetVersion), string(baseline.desktopVersion)) <= 0) throw new Error('Invalid forward baseline run or version order')
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(string(policy.upstreamVersion))) throw new Error('Invalid upstream version')
  for (const [kind, fields] of [['archive', ['id', 'name', 'size', 'sha256']], ['dmg', ['name', 'size', 'sha256']]] as const) {
    const file = object(baseline[kind]); keys(file, [...fields])
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(string(file.name)) || !Number.isSafeInteger(file.size) || Number(file.size) < 1) throw new Error('Invalid baseline artifact')
    hex(file.sha256)
    if (kind === 'archive' && (!Number.isSafeInteger(file.id) || Number(file.id) < 1)) throw new Error('Invalid baseline archive ID')
    if (kind === 'dmg' && !string(file.name).endsWith(`-${string(baseline.desktopVersion)}-arm64.dmg`)) throw new Error('Baseline DMG version/architecture mismatch')
  }
  if (!Array.isArray(policy.settings) || policy.settings.length !== 1) throw new Error('Missing declared theme setting')
  const setting = object(policy.settings[0]); keys(setting, ['name', 'value'])
  if (setting.name !== 'theme' || !['light', 'dark', 'system'].includes(string(setting.value))) throw new Error('Unsupported declared theme setting')
  return policy
}

/** Decode one bounded document without silently accepting malformed UTF-8 or base64.
 * @param encoded - Canonical base64 from an environment variable.
 * @param expectedDigest - SHA256 of decoded bytes.
 * @returns Exact authenticated bytes, never normalized JSON.
 */
export function decodeForwardObservation(encoded: string, expectedDigest: string): Buffer {
  if (encoded.length > 4 * Math.ceil(32768 / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) throw new Error('Invalid or oversized observation base64')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded || bytes.length === 0 || bytes.length > 32768 || digest(bytes) !== hex(expectedDigest)) throw new Error('Observation bytes or digest mismatch')
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  return bytes
}

/** Validate reported manual acceptance, without asserting the validator witnessed it.
 * @param bytes - Exact bounded UTF-8 observation document.
 * @param policy - Checked fixed policy.
 * @param buildDigest - Exact CI build receipt digest.
 * @param target - B artifact/runtime identity from CI.
 * @returns Checked local observation record.
 */
export function forwardObservation(
  bytes: Uint8Array, policy: Record<string, unknown>, buildDigest: string, target: Record<string, unknown>,
): Record<string, unknown> {
  if (bytes.byteLength === 0 || bytes.byteLength > 32768) throw new Error('Observation exceeds 32 KiB')
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)) as unknown }
  catch { throw new Error('Invalid observation JSON or UTF-8') }
  const record = object(parsed)
  keys(record, ['schemaVersion', 'purpose', 'phase', 'architecture', 'host', 'observer', 'startedAt', 'completedAt', 'buildReceiptDigest', 'baseline', 'target', 'privateRoots', 'installation', 'settings', 'scenarios', 'recovery', 'cleanup'])
  if (record.schemaVersion !== 1 || record.purpose !== 'maintainer-attested-local-observation' || record.phase !== 'prepublication'
    || record.architecture !== 'arm64' || record.buildReceiptDigest !== buildDigest || !same(record.baseline, policy.baseline) || !same(record.target, target)) throw new Error('Local observation identity mismatch or CI masquerading as observation')
  const host = object(record.host); keys(host, ['os', 'session', 'permission'])
  for (const value of Object.values(host)) textField(value)
  const observer = object(record.observer); keys(observer, ['identity', 'method'])
  textField(observer.identity)
  if (observer.method !== 'direct-ordinary-desktop-observation') throw new Error('Record reviewer cannot claim direct observation')
  const start = Date.parse(string(record.startedAt)), end = Date.parse(string(record.completedAt))
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('Invalid observation times')
  const roots = object(record.privateRoots); keys(roots, ['home', 'state', 'workspace', 'temp', 'backup', 'retainedB'])
  for (const value of Object.values(roots)) if (!string(value).startsWith('/') || value === '/') throw new Error('Missing declared private root')
  if (new Set(Object.values(roots)).size !== Object.keys(roots).length) throw new Error('Conflicting private roots')
  const installation = object(record.installation); keys(installation, ['path', 'samePath', 'private', 'writersStopped'])
  if (!string(installation.path).startsWith('/') || installation.path === '/' || installation.samePath !== true || installation.private !== true || installation.writersStopped !== true) throw new Error('Unproven private same-path replacement')
  if (!Array.isArray(record.settings) || !Array.isArray(policy.settings) || record.settings.length !== policy.settings.length) throw new Error('Missing retained settings')
  const seenSettings = new Set<string>()
  for (const value of record.settings) {
    const setting = object(value); keys(setting, ['name', 'a', 'b', 'restoredA'])
    const name = string(setting.name)
    const expected = policy.settings.map(object).find(value => value.name === name)
    if (expected === undefined || seenSettings.has(name)) throw new Error('Unknown or duplicate setting')
    seenSettings.add(name)
    if (setting.a !== expected.value) throw new Error('Forward baseline setting differs from declared policy')
    if (setting.a !== setting.b || setting.a !== setting.restoredA) throw new Error('Declared setting not retained')
  }
  if (!Array.isArray(record.scenarios) || record.scenarios.length !== FORWARD_SCENARIOS.length) throw new Error('Missing forward scenarios')
  const seen = new Set<string>()
  for (const value of record.scenarios) {
    const scenario = object(value); keys(scenario, ['id', 'action', 'result', 'source', 'status'])
    const id = string(scenario.id)
    if (!(FORWARD_SCENARIOS as readonly string[]).includes(id) || seen.has(id) || scenario.status !== 'passed'
      || scenario.source !== 'direct-local-observation') throw new Error('Unknown, duplicate, failed or nonlocal scenario')
    seen.add(id); textField(scenario.action); textField(scenario.result)
  }
  const recovery = object(record.recovery)
  keys(recovery, ['backupComplete', 'quiescent', 'retainedB', 'restoredPreBState', 'normalAObserved', 'usableA', 'settingsRetained', 'ordinaryQuit', 'noAOnBData'])
  if (Object.values(recovery).some(value => value !== true)) throw new Error('Incomplete or unobserved usable A recovery')
  const cleanup = object(record.cleanup); keys(cleanup, ['processOwnershipCertain', 'launchSubmissionCompleted', 'writersStopped', 'mountsDetached', 'recoveryComplete'])
  if (Object.values(cleanup).some(value => value !== true)) throw new Error('Uncertain native cleanup')
  return record
}
