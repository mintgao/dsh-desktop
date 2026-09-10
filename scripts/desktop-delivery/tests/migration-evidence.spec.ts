/** Parser fixtures exercise report rejection; these records are never migration execution evidence. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { digest, object } from '../evidence.ts'
import { migrationEvidence, migrationPolicy } from '../migration-evidence.ts'
import { MIGRATION_SCENARIOS } from '../migration-scenarios.ts'
import * as composition from '../migration-composition.ts'

function fixture(historicalPolicy?: Record<string, unknown>) {
  const bytes = new Map<string, Uint8Array>()
  const files: { name: string; size: number; sha256: string }[] = []
  const put = (name: string, value: unknown) => {
    const content = Buffer.from(JSON.stringify(value))
    bytes.set(name, content)
    const file = { name, size: content.length, sha256: digest(content) }
    const index = files.findIndex(entry => entry.name === name)
    if (index < 0) files.push(file); else files[index] = file
    return file
  }
  const policy = migrationPolicy(historicalPolicy ?? JSON.parse(readFileSync('.github/desktop-delivery/migration-policy.json', 'utf8')) as unknown)
  const policyFile = put('migration-policy.json', policy)
  const compatibility = put('data-compatibility.json', { persistedFormatsChanged: true, migrationPolicy: { path: '.github/desktop-delivery/migration-policy.json', sha256: policyFile.sha256 } })
  const composition = put('composition.json', object(policy.composition).files)
  const workflow = { path: '.github/workflows/desktop-delivery-qualify.yml', commit: 'c'.repeat(40), runId: 123, attempt: 1 }
  const identity = { candidateDigest: 'a'.repeat(64), downstreamCommit: 'b'.repeat(40), sourceLockDigest: 'd'.repeat(64), dataCompatibilityDigest: compatibility.sha256 }
  const reports: Record<string, unknown>[] = []
  const entries: { architecture: string; evidence: { name: string; size: number; sha256: string } }[] = []
  const native = []
  for (const architecture of ['arm64', 'x64']) {
    const dmg = put(`${architecture}.dmg`, { fixture: architecture })
    const evidence = put(`native-${architecture}.json`, { packagedRuntimeDigest: 'e'.repeat(64) })
    native.push({ architecture, dmg, evidence })
    const fixtures = put(`fixtures-${architecture}.json`, { fixture: 'baseline-data' })
    const backup = put(`backup-${architecture}.json`, { fixture: 'backup' })
    const baseline = object(policy.baseline)
    const report = { schemaVersion: 1, purpose: 'desktop-data-migration-qualification', architecture, ...identity, workflow: { ...workflow },
      baseline: { upstream: baseline.upstream, sourceCommit: baseline.sourceCommit, desktopTag: baseline.desktopTag,
        evidenceDigest: baseline.evidenceDigest, artifactDigest: object(object(baseline.artifacts)[architecture]).sha256 },
      target: { upstream: policy.targetUpstream, dmgDigest: dmg.sha256, packagedRuntimeDigest: 'e'.repeat(64) },
      compositionDigest: composition.sha256, fixtureManifestDigest: fixtures.sha256, backupManifestDigest: backup.sha256,
      inputs: { composition, fixtures, backup },
      scenarios: [] as { id: string; status: string; evidenceFiles: { name: string; size: number; sha256: string }[] }[] }
    report.scenarios = MIGRATION_SCENARIOS.map(id => ({ id, status: 'passed', evidenceFiles: [put(`scenario-${architecture}-${id}.json`, {
      schemaVersion: 1, purpose: 'desktop-migration-scenario', id, status: 'passed', execution: 'packaged', architecture,
      ...identity, workflow, baseline: report.baseline, target: report.target, assertions: ['parser fixture only'],
    })] }))
    reports.push(report)
    entries.push({ architecture, evidence: put(`migration-${architecture}.json`, report) })
  }
  const manifest = { ...identity, upstream: { commit: policy.targetUpstream }, workflow, native, files,
    migration: { schemaVersion: 1, policyDigest: policyFile.sha256, compositionDigest: composition.sha256, reports: entries } }
  return { manifest, reports, bytes, put, read: (name: string) => {
    const content = bytes.get(name)
    if (content === undefined) throw new Error('Missing fixture payload')
    return content
  }, refresh: () =>{  reports.forEach((report, i) => { entries[i]!.evidence = put(`migration-${String(report.architecture)}.json`, report) }) } }
}

it('requires the exact fixed registry and rehashes both architecture report payloads', () => {
  const data = fixture()
  expect(migrationEvidence(data.manifest, data.read)).toHaveLength(120)
  const source = readFileSync('docs/decisions/20260910-desktop-mint-migration-registry.md', 'utf8')
  for (const id of MIGRATION_SCENARIOS) expect(source).toContain(id)
  expect(MIGRATION_SCENARIOS).toHaveLength(56)
})

it.each(['missing-architecture', 'duplicate-architecture', 'missing-id', 'duplicate-id', 'skipped', 'wrong-run', 'wrong-baseline', 'wrong-dmg', 'wrong-runtime', 'wrong-input', 'missing-input'])('rejects %s even after report files are rehashed', (change) => {
  const data = fixture()
  const report = data.reports[0]!
  const scenarios = report.scenarios as Record<string, unknown>[]
  switch (change) {
    case 'missing-architecture': data.manifest.migration.reports.pop(); break
    case 'duplicate-architecture': data.manifest.migration.reports[1]!.architecture = 'arm64'; break
    case 'missing-id': scenarios.pop(); break
    case 'duplicate-id': scenarios[1]!.id = scenarios[0]!.id; break
    case 'skipped': scenarios[0]!.status = 'skipped'; break
    case 'wrong-run': object(report.workflow).attempt = 2; break
    case 'wrong-baseline': object(report.baseline).sourceCommit = '0'.repeat(40); break
    case 'wrong-dmg': object(report.target).dmgDigest = '0'.repeat(64); break
    case 'wrong-runtime': object(report.target).packagedRuntimeDigest = '0'.repeat(64); break
    case 'wrong-input': report.backupManifestDigest = '0'.repeat(64); break
    case 'missing-input': delete object(report.inputs).backup; break
  }
  if (change !== 'missing-architecture') data.refresh()
  expect(() => migrationEvidence(data.manifest, data.read)).toThrow()
})

it('rejects a changed leaf, an unlisted evidence file and a reduced policy checklist', () => {
  const data = fixture()
  data.bytes.set('scenario-arm64-session-direct-upgrade.json', Buffer.from('replaced'))
  expect(() => migrationEvidence(data.manifest, data.read)).toThrow('bytes changed')
  const missing = fixture()
  missing.manifest.files.splice(missing.manifest.files.findIndex(file => file.name === 'backup-x64.json'), 1)
  expect(() => migrationEvidence(missing.manifest, missing.read)).toThrow('inventory')
  const policy = JSON.parse(readFileSync('.github/desktop-delivery/migration-policy.json', 'utf8')) as Record<string, unknown>
  policy.scenarios = []
  expect(() => migrationPolicy(policy)).toThrow('fixed target')
})

it('rejects internally substituted baseline authority and missing built-in source rows', () => {
  for (const field of ['evidenceDigest', 'artifactDigest', 'composition']) {
    const policy = JSON.parse(readFileSync('.github/desktop-delivery/migration-policy.json', 'utf8')) as Record<string, unknown>
    if (field === 'evidenceDigest') object(policy.baseline).evidenceDigest = '0'.repeat(64)
    else if (field === 'artifactDigest') object(object(object(policy.baseline).artifacts).arm64).sha256 = '0'.repeat(64)
    else object(policy.composition).files = []
    expect(() => migrationPolicy(policy)).toThrow()
  }
})

it('rejects a rehashed scenario receipt from another architecture or workflow', () => {
  for (const changed of ['architecture', 'run']) {
    const data = fixture()
    const scenarios = data.reports[0]!.scenarios as { id: string; evidenceFiles: { name: string; size: number; sha256: string }[] }[]
    const scenario = scenarios.find(row => row.id === 'session-direct-upgrade')!
    const descriptor = scenario.evidenceFiles[0]!
    const receipt = object(JSON.parse(Buffer.from(data.read(descriptor.name)).toString()) as unknown)
    if (changed === 'architecture') receipt.architecture = 'x64'
    else object(receipt.workflow).attempt = 2
    scenario.evidenceFiles[0] = data.put(descriptor.name, receipt)
    data.refresh()
    expect(() => migrationEvidence(data.manifest, data.read)).toThrow()
  }
})

it('rejects current inventory drift while restoring historical evidence from a newer validator checkout', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-composition-revision-'))
  const put = (path: string, bytes: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), bytes)
  }
  const read = (path: string) => readFileSync(join(root, path))
  const enumerate = composition.compositionSourcePaths
  try {
    for (const path of composition.MIGRATION_COMPOSITION_ROOTS) put(path, path.endsWith('.yml') ? '[]\n' : '// fixture\n')
    put('packages/bundle/base/cordis.patch.yml', "- insert:\n    - name: '@deepseek-ai/dsh-fixture'\n")
    put('packages/example/fixture/package.json', JSON.stringify({ name: '@deepseek-ai/dsh-fixture' }))
    put('packages/example/fixture/src/index.ts', 'export const value = 1\n')
    const oldFiles = JSON.parse(composition.compositionBytes(enumerate(root), read).toString()) as unknown[]
    expect(composition.checkedCompositionBytes(root, oldFiles, read).toString()).toBe(JSON.stringify(oldFiles))
    expect(() => composition.checkedCompositionBytes(root, oldFiles.slice(1), read)).toThrow('composition sources')
    expect(() => composition.checkedCompositionBytes(root, [...oldFiles, { path: 'extra', sha256: '0'.repeat(64) }], read))
      .toThrow('composition sources')
    put('packages/example/fixture/src/newer.ts', 'export const newer = 2\n')
    expect(enumerate(root)).toContain('packages/example/fixture/src/newer.ts')
    expect(() => composition.checkedCompositionBytes(root, oldFiles, read)).toThrow('composition sources')
    const policy = object(JSON.parse(readFileSync('.github/desktop-delivery/migration-policy.json', 'utf8')) as unknown)
    object(policy.composition).files = oldFiles
    const data = fixture(policy)
    const currentCheckout = vi.spyOn(composition, 'compositionSourcePaths').mockImplementation(() => enumerate(root))
    try {
      expect(migrationEvidence(data.manifest, data.read)).toHaveLength(120)
      expect(currentCheckout).not.toHaveBeenCalled()
    } finally { currentCheckout.mockRestore() }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it.each(['allowed', 'packaged-only', 'stale-run', 'duplicate-payload'])('enforces shared negative evidence limits: %s', (mode) => {
  const data = fixture()
  const id = mode === 'packaged-only' ? 'session-direct-upgrade' : 'session-interruption-retry'
  const scenarios = data.reports.map(report => (report.scenarios as {
    id: string
    evidenceFiles: { name: string; size: number; sha256: string }[]
  }[]).find(row => row.id === id)!)
  const original = scenarios[0]!.evidenceFiles[0]!
  const receipt = object(JSON.parse(Buffer.from(data.read(original.name)).toString()) as unknown)
  receipt.execution = 'negative-tests'
  receipt.architecture = 'shared'
  if (mode === 'stale-run') object(receipt.workflow).runId = 999
  const shared = data.put('shared-negative.json', receipt)
  for (const scenario of scenarios) scenario.evidenceFiles = mode === 'duplicate-payload' ? [shared, shared] : [shared]
  data.refresh()
  if (mode === 'allowed') expect(migrationEvidence(data.manifest, data.read)).toHaveLength(119)
  else expect(() => migrationEvidence(data.manifest, data.read)).toThrow()
})
