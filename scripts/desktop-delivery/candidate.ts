/** Bind shadow qualification to checked-out source and existing workspace version checks. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { capture } from '../release/process.ts'
import { releaseFamily } from '../release/families.ts'
import { digest, distribution, hex, object, readJson, release, shadow, shadowRecord, sourceLock, string } from './evidence.ts'

/** Validate checkout identity and versions before any packaging operation.
 * @param root - repository root.
 * @param configPath - explicit distribution JSON path.
 * @param lockPath - supplied source lock path.
 * @param expectedCommit - exact downstream revision expected by the caller.
 * @returns Candidate record; dirty checkouts remain diagnostic only.
 */
export function candidate(root: string, configPath: string, lockPath: string, expectedCommit: string): Record<string, unknown> {
  const config = distribution(readJson(configPath))
  const lock = sourceLock(readJson(lockPath), config)
  const commit = capture('git', ['rev-parse', 'HEAD'], { cwd: root })
  if (commit !== hex(expectedCommit, 40)) throw new Error('Downstream checkout does not match expected commit')
  capture('git', ['merge-base', '--is-ancestor', lock.release.commit, commit], { cwd: root })
  const components: Record<string, string> = {}
  for (const id of ['dsh', 'vendor']) {
    const family = releaseFamily(id)
    const members = family.members(root)
    if (members.length === 0) throw new Error(`No ${id} workspace members`)
    family.verifyVersions(members)
    for (const member of members) components[member.name] = member.version
  }
  const desktopVersion = string(object(readJson(resolve(root, 'package.json'))).version)
  if (components['@deepseek-ai/dsh'] !== desktopVersion) throw new Error('Root desktop version does not match dsh version')
  capture(process.execPath, ['--import', 'tsx', resolve(root, 'scripts/check-workspace-constraints.ts')], { cwd: root })
  capture(process.execPath, ['--import', 'tsx', resolve(root, 'scripts/verify-package-dependencies.ts')], { cwd: root })
  const status = capture('git', ['status', '--porcelain=v1', '--untracked-files=normal'], { cwd: root })
  const trackedDiff = capture('git', ['diff', 'HEAD', '--binary'], { cwd: root })
  return { ...shadow, kind: 'candidate', distribution: config.id, configDigest: digest(readFileSync(configPath)), sourceLockDigest: digest(readFileSync(lockPath)), downstreamCommit: commit, upstream: lock.release, desktopVersion, components, qualificationEligible: status === '', sourceDifference: { status, trackedDiffDigest: digest(trackedDiff), scope: 'tracked diff and untracked path summary; ignored content is not fingerprinted' }, nextAction: status === '' ? 'Run unsigned native architecture checks for this candidate.' : 'Diagnostic checkout only; commit reviewed source before CI qualification.' }
}

/** Validate imported candidate bytes against the selected distribution.
 * @param path - candidate JSON file.
 * @param configPath - configuration JSON file.
 * @returns Parsed candidate and its exact serialized digest.
 */
export function readCandidate(path: string, configPath: string): { record: Record<string, unknown>; digest: string } {
  const record = shadowRecord(readJson(path))
  const config = distribution(readJson(configPath))
  if (record.kind !== 'candidate' || record.distribution !== config.id || record.configDigest !== digest(readFileSync(configPath))) throw new Error('Candidate does not match distribution')
  hex(record.downstreamCommit, 40)
  hex(record.sourceLockDigest)
  release(record.upstream)
  const difference = object(record.sourceDifference)
  if (typeof difference.status !== 'string' || record.qualificationEligible !== (difference.status === '')) throw new Error('Inconsistent source difference evidence')
  hex(difference.trackedDiffDigest)
  string(record.desktopVersion)
  const components = object(record.components)
  if (Object.keys(components).length === 0 || Object.values(components).some(value => typeof value !== 'string' || value === '')) throw new Error('Missing component versions')
  if (components['@deepseek-ai/dsh'] !== record.desktopVersion || typeof record.qualificationEligible !== 'boolean') throw new Error('Invalid candidate qualification or versions')
  return { record, digest: digest(readFileSync(path)) }
}
