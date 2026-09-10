/** Execute exact packaged migration qualification on an isolated native CI runner. */
import { spawnSync } from 'node:child_process'
import { basename, join, resolve } from 'node:path'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { capture } from '../release/process.ts'
import { readCandidate } from './candidate.ts'
import { checkedCompositionBytes } from './migration-composition.ts'
import { exerciseAgentMigration } from './migration-agent-run.ts'
import { exerciseNativeMigration } from './migration-native-run.ts'
import { runMigrationNegativeTests } from './migration-negative-tests.ts'
import { migrationObservation } from './migration-observations.ts'
import { migrationPolicy } from './migration-evidence.ts'
import { MIGRATION_SCENARIOS } from './migration-scenarios.ts'
import { validateApplicationRoot } from './smoke.ts'
import { runtimeInventory } from './runtime-inventory.ts'
import { assetPath, digest, hex, object, readJson, type Architecture } from './evidence.ts'
import type { ReleaseFile } from './manifest.ts'

/** Exact source, artifacts and workflow identity provided by the trusted orchestration job. */
export interface MigrationQualificationInput {
  root: string
  config: string
  candidate: string
  native: string
  baselineDmg: string
  targetDmg: string
  architecture: Architecture
  directory: string
  workflowCommit: string
  runId: number
  runAttempt: number
}

function command(name: string, args: string[], home: string): void {
  const result = spawnSync(name, args, { env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, CFFIXED_USER_HOME: home },
    encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 })
  if (result.status !== 0 || result.signal !== null || result.error) throw new Error(`${name} failed: ${String(result.error)} ${result.stderr}`)
}

async function withCopiedApp<T>(dmg: string, action: (app: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'dsh-migration-app-'))
  const mount = join(root, 'mount')
  const installation = join(root, 'installation')
  const home = join(root, 'home')
  for (const directory of [mount, installation, home]) mkdirSync(directory, { mode: 0o700 })
  let attached = false
  let stopped = false
  try {
    command('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg], home)
    attached = true
    const apps = readdirSync(mount).filter(name => name.endsWith('.app'))
    if (JSON.stringify(apps) !== JSON.stringify(['DSH Desktop.app'])) throw new Error('Migration DMG has an unexpected application')
    const original = join(mount, 'DSH Desktop.app')
    validateApplicationRoot(mount, original)
    const originalDigest = runtimeInventory(original).sha256
    const app = join(installation, 'DSH Desktop.app')
    command('/usr/bin/ditto', [original, app], home)
    validateApplicationRoot(installation, app)
    if (runtimeInventory(app).sha256 !== originalDigest) throw new Error('Copied migration runtime differs from DMG')
    command('/usr/bin/hdiutil', ['detach', mount], home)
    attached = false
    const result = await action(app)
    if (runtimeInventory(app).sha256 !== originalDigest) throw new Error('Migration modified its packaged runtime')
    stopped = true
    return result
  } finally {
    if (attached) command('/usr/bin/hdiutil', ['detach', mount], home)
    if (stopped) rmSync(root, { recursive: true })
    // Failed fixtures retain their application dependency until diagnostic assessment.
  }
}

/** Refuse dirty source or a clean checkout that moved during qualification.
 * @param root - Candidate checkout.
 * @param commit - Authorized downstream commit.
 */
export function assertMigrationCheckout(root: string, commit: string): void {
  if (capture('git', ['rev-parse', 'HEAD'], { cwd: root }) !== commit
    || capture('git', ['status', '--porcelain=v1', '--untracked-files=normal'], { cwd: root }) !== '') throw new Error('Migration candidate is not the exact clean checkout')
}

/** Generate real per-architecture qualification only after every fixed scenario executes.
 * @param input - Exact clean candidate, delivered DMG, candidate DMG and trusted workflow identity.
 * @returns Complete report; a missing, refused or blocked scenario throws before a passing report exists.
 */
export async function qualifyMigration(input: MigrationQualificationInput): Promise<Record<string, unknown>> {
  if (process.platform !== 'darwin' || process.arch !== input.architecture || process.env.GITHUB_ACTIONS !== 'true'
    || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw new Error('Migration qualification requires its disposable architecture-matched native CI runner')
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) if (process.env[name] !== undefined) throw new Error('Migration execution must not receive GitHub writer credentials')
  if (!Number.isSafeInteger(input.runId) || input.runId < 1 || !Number.isSafeInteger(input.runAttempt) || input.runAttempt < 1) throw new Error('Missing migration workflow run identity')
  const root = resolve(input.root)
  const candidate = readCandidate(input.candidate, input.config)
  if (candidate.record.qualificationEligible !== true) throw new Error('Migration candidate is ineligible')
  assertMigrationCheckout(root, hex(candidate.record.downstreamCommit, 40))
  const compatibilityBytes = readFileSync(join(root, '.github/desktop-delivery/data-compatibility.json'))
  const compatibility = object(JSON.parse(compatibilityBytes.toString()))
  if (compatibility.persistedFormatsChanged !== true) throw new Error('Migration qualification requires explicit changed-format assessment')
  const policyBytes = readFileSync(join(root, '.github/desktop-delivery/migration-policy.json'))
  if (digest(policyBytes) !== object(compatibility.migrationPolicy).sha256) throw new Error('Candidate migration policy digest mismatch')
  const policy = migrationPolicy(JSON.parse(policyBytes.toString()))
  const composition = checkedCompositionBytes(root, object(policy.composition).files, path => readFileSync(join(root, path)))
  const lock = readFileSync(join(root, '.github/desktop-delivery/source-lock.json'))
  if (digest(lock) !== candidate.record.sourceLockDigest || object(candidate.record.upstream).commit !== policy.targetUpstream) throw new Error('Migration source lock differs from candidate')
  const baseline = object(policy.baseline)
  const baselineArtifact = object(object(baseline.artifacts)[input.architecture])
  const baselineBytes = readFileSync(input.baselineDmg)
  if (basename(input.baselineDmg) !== baselineArtifact.name || baselineBytes.length !== baselineArtifact.size || digest(baselineBytes) !== baselineArtifact.sha256) throw new Error('Delivered baseline DMG differs from authoritative bytes')
  const native = object(readJson(input.native))
  const targetDigest = digest(readFileSync(input.targetDmg))
  if (native.architecture !== input.architecture || native.dmgDigest !== targetDigest || native.candidateDigest !== candidate.digest
    || native.qualificationEligible !== true || native.state !== 'native-checks-passed') throw new Error('Migration target DMG lacks matching isolated native evidence')
  const workflow = { path: '.github/workflows/desktop-delivery-qualify.yml', commit: hex(input.workflowCommit, 40), runId: input.runId, attempt: input.runAttempt }
  const identity = { architecture: input.architecture, candidateDigest: candidate.digest,
    downstreamCommit: candidate.record.downstreamCommit,
    sourceLockDigest: candidate.record.sourceLockDigest, dataCompatibilityDigest: digest(compatibilityBytes), workflow }
  const target = { upstream: policy.targetUpstream, dmgDigest: targetDigest, packagedRuntimeDigest: hex(native.packagedRuntimeDigest) }
  const delivered = { upstream: baseline.upstream, sourceCommit: baseline.sourceCommit, desktopTag: baseline.desktopTag,
    evidenceDigest: baseline.evidenceDigest, artifactDigest: baselineArtifact.sha256 }
  const work = join(input.directory, `migration-${input.architecture}-raw`)
  mkdirSync(work, { mode: 0o700 })
  return withCopiedApp(input.baselineDmg, baselineApp => withCopiedApp(input.targetDmg, async (targetApp) => {
    if (runtimeInventory(targetApp).sha256 !== target.packagedRuntimeDigest) throw new Error('Migration copied runtime differs from native smoke')
    const agent = await exerciseAgentMigration(baselineApp, targetApp, join(work, 'backend'), { confineWrites: false })
    const normal = await exerciseNativeMigration(baselineApp, targetApp, join(work, 'native'), input.architecture)
    const negative = await runMigrationNegativeTests(root, join(work, 'negative'))
    const put = (name: string, bytes: Uint8Array): ReleaseFile => {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(name)) throw new Error('Unsafe migration output name')
      const path = join(input.directory, name)
      if (existsSync(path)) {
        if (digest(readFileSync(assetPath(input.directory, name))) !== digest(bytes)) throw new Error(`Migration output already exists: ${name}`)
      } else writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' })
      return { name, size: bytes.length, sha256: digest(bytes) }
    }
    const json = (name: string, value: unknown) => put(name, Buffer.from(JSON.stringify(value)))
    const raw: ReleaseFile[] = []
    const retain = (directory: string, prefix: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) { if (!['home', 'tmp'].includes(entry.name)) retain(join(directory, entry.name), `${prefix}-${entry.name}`); continue }
        if (!entry.isFile()) throw new Error('Migration evidence payload must be a regular file')
        const bytes = readFileSync(join(directory, entry.name))
        if (bytes.length > 0) raw.push(put(`${prefix}-${entry.name}`, bytes))
      }
    }
    retain(work, `migration-${input.architecture}-raw`)
    const prefix = `migration-${input.architecture}`
    const compositionFile = put(`${prefix}-composition.json`, composition)
    const fixtures = json(`${prefix}-fixtures.json`, { backend: agent.fixtureManifest, native: normal.input, payloads: raw })
    const backup = json(`${prefix}-backup.json`, { backend: agent.backupManifest, native: normal.backupManifest })
    const scenarios = MIGRATION_SCENARIOS.map((id) => {
      const selected = migrationObservation(id, agent, normal, negative)
      const source = Object.hasOwn(object(negative.scenarios), id)
      const receipt = json(`${prefix}-${id}.json`, { schemaVersion: 1, purpose: 'desktop-migration-scenario', id, status: 'passed',
        ...identity, execution: source ? 'negative-tests' : 'packaged', baseline: delivered, target, ...selected })
      return { id, status: 'passed', evidenceFiles: [receipt, ...raw] }
    })
    if (digest(readFileSync(input.baselineDmg)) !== delivered.artifactDigest || digest(readFileSync(input.targetDmg)) !== targetDigest) throw new Error('Migration DMG bytes changed during execution')
    assertMigrationCheckout(root, hex(candidate.record.downstreamCommit, 40))
    return { schemaVersion: 1, purpose: 'desktop-data-migration-qualification', ...identity, baseline: delivered, target,
      compositionDigest: compositionFile.sha256, fixtureManifestDigest: fixtures.sha256, backupManifestDigest: backup.sha256,
      inputs: { composition: compositionFile, fixtures, backup }, scenarios }
  }))
}
