/** Bind shadow qualification to checked-out source and existing workspace version checks. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { capture } from '../release/process.ts'
import { MINT_PACKAGES, officialLock, verifyMintCoupling } from '../desktop-assembly.ts'
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
  verifyMintCoupling(root)
  const components: Record<string, string> = {}
  const sourceComponents: Record<string, string> = {}
  const mintNames = MINT_PACKAGES.map(path => string(object(readJson(resolve(root, path, 'package.json'))).name))
  for (const id of ['dsh', 'vendor']) {
    const family = releaseFamily(id)
    const members = family.members(root)
    if (members.length === 0) throw new Error(`No ${id} workspace members`)
    family.verifyVersions(members.filter(member => !mintNames.includes(member.name)))
    for (const member of members) sourceComponents[member.name] = member.version
  }
  const desktopVersion = string(object(readJson(resolve(root, 'package.json'))).version)
  const inputPath = resolve(root, 'apps/desktop-mint/runtime/assembly-input.json')
  const input = object(readJson(inputPath))
  const lockBytes = readFileSync(resolve(root, 'apps/desktop-mint/runtime/package-lock.json'), 'utf8')
  officialLock(lockBytes, {
    runtimeVersion: string(input.runtimeVersion), upstreamCommit: string(input.upstreamCommit), cliIntegrity: string(input.cliIntegrity),
  })
  if (input.upstreamCommit !== lock.release.commit || `dsh-v${string(input.runtimeVersion)}` !== lock.release.tag) {
    throw new Error('Official assembly input differs from source-lock target; finalize the reviewed adoption first')
  }
  components['@deepseek-ai/dsh'] = string(input.runtimeVersion)
  for (const name of mintNames) components[name] = string(sourceComponents[name])
  const assemblyInput = {
    descriptorDigest: digest(readFileSync(inputPath)), lockDigest: digest(lockBytes), runtimeVersion: input.runtimeVersion,
  }
  capture(process.execPath, ['--import', 'tsx', resolve(root, 'scripts/check-workspace-constraints.ts')], { cwd: root })
  capture(process.execPath, ['--import', 'tsx', resolve(root, 'scripts/verify-package-dependencies.ts')], { cwd: root })
  const status = capture('git', ['status', '--porcelain=v1', '--untracked-files=normal'], { cwd: root })
  const trackedDiff = capture('git', ['diff', 'HEAD', '--binary'], { cwd: root })
  return { ...shadow, kind: 'candidate', distribution: config.id, configDigest: digest(readFileSync(configPath)), sourceLockDigest: digest(readFileSync(lockPath)), downstreamCommit: commit, upstream: lock.release, desktopVersion, components, sourceComponents, assemblyInput, qualificationEligible: status === '', sourceDifference: { status, trackedDiffDigest: digest(trackedDiff), scope: 'tracked diff and untracked path summary; ignored content is not fingerprinted' }, nextAction: status === '' ? 'Run unsigned native architecture checks for this candidate.' : 'Diagnostic checkout only; commit reviewed source before CI qualification.' }
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
  requireAssemblyInput(config, record)
  const difference = object(record.sourceDifference)
  if (typeof difference.status !== 'string' || record.qualificationEligible !== (difference.status === '')) throw new Error('Inconsistent source difference evidence')
  hex(difference.trackedDiffDigest)
  string(record.desktopVersion)
  const components = object(record.components)
  if (Object.keys(components).length === 0 || Object.values(components).some(value => typeof value !== 'string' || value === '')) throw new Error('Missing component versions')
  if (record.assemblyInput !== undefined) {
    const assembly = object(record.assemblyInput)
    hex(assembly.descriptorDigest); hex(assembly.lockDigest)
    if (assembly.runtimeVersion !== components['@deepseek-ai/dsh'] || `dsh-v${string(assembly.runtimeVersion)}` !== object(record.upstream).tag) throw new Error('Candidate assembly input differs')
  }
  if ((record.assemblyInput === undefined && components['@deepseek-ai/dsh'] !== record.desktopVersion) || typeof record.qualificationEligible !== 'boolean') throw new Error('Invalid candidate qualification or versions')
  return { record, digest: digest(readFileSync(path)) }
}

/** Match required candidate versions to observed installed components.
 * @param candidate - source candidate and declared assembly inputs.
 * @param observed - actual installed versions, or historical source inventory.
 * @returns Whether all candidate-owned identities match.
 */
export function candidateComponentsMatch(candidate: Record<string, unknown>, observed: unknown): boolean {
  const components = object(observed)
  if (candidate.assemblyInput === undefined) return JSON.stringify(candidate.components) === JSON.stringify(components)
  return Object.entries(object(candidate.components)).every(([name, version]) => components[name] === version)
}

/** Require observed assembly identities for a versioned candidate.
 * @param candidate - source candidate and frozen input digests.
 * @param native - actual packaged smoke evidence.
 * @param versions - installed versions included in the release manifest.
 */
export function validateCandidateAssembly(candidate: Record<string, unknown>, native: Record<string, unknown>, versions: unknown): void {
  if (candidate.assemblyInput === undefined) return
  const expected = object(candidate.assemblyInput), actual = object(native.assembly)
  hex(actual.digest)
  if (actual.lockDigest !== expected.lockDigest || actual.descriptorDigest !== expected.descriptorDigest) throw new Error('Native assembly input differs from candidate')
  const observed = Object.fromEntries(Object.entries(object(actual.components)).filter(([name]) => !name.startsWith('node_modules/')).map(([name, value]) => {
    const component = object(value)
    if (component.source !== 'official' && component.source !== 'mint') throw new Error('Missing component provenance')
    if (!/^sha512-[A-Za-z0-9+/]+=*$/u.test(string(component.integrity))) throw new Error('Missing component integrity')
    return [name, string(component.version)]
  }))
  if (JSON.stringify(observed) !== JSON.stringify(versions) || !candidateComponentsMatch(candidate, observed)) throw new Error('Observed component versions differ from manifest')
}

/** Enforce the current distribution policy without rewriting historical records.
 * @param config - protected distribution policy.
 * @param candidate - source candidate selected for new qualification.
 */
export function requireAssemblyInput(config: { assemblyRequired?: boolean }, candidate: Record<string, unknown>): void {
  if (config.assemblyRequired === true && candidate.assemblyInput === undefined) throw new Error('Missing required versioned assembly inputs')
}
