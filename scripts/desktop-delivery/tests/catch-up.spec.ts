/** Catch-up range and committed assessment rejection scenarios through public validators and CLI. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { assessmentFiles, assessmentReferences, catchUpObservations, gitEvidence, localEvidence, verifyLiveCatchUp } from '../catch-up.ts'
import { catchUpEvidence, digest, object, sourceLock, type CatchUp, type Release } from '../evidence.ts'
import { deliveryConfig, type GitHub } from '../operations.ts'
import { manifestCatchUp } from '../manifest.ts'
import { deliveryPredecessor } from '../lineage.ts'

const configPath = resolve('.github/desktop-delivery/mint.json')
const config = deliveryConfig(configPath)
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function temporary(): string { const root = mkdtempSync(join(tmpdir(), 'delivery-catch-up-')); roots.push(root); return root }
function releaseAt(index: number): Release { return { id: index + 1, tag: `dsh-v1.0.0-alpha.${String(index + 1)}`, commit: String(index + 1).repeat(40), publishedAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z` } }
const releases = Array.from({ length: 9 }, (_, index) => releaseAt(index))
const from = releaseAt(0)
const to = releaseAt(7)
const lock = sourceLock({ schemaVersion: 1,
  upstreamRepository: config.upstreamRepository,
  release: from, predecessor: null, observed: [from] }, config)
function assessment() {
  const reference = { path: 'docs/compatibility.md', sha256: digest('verified fixture') }
  const scenario = (source: Release, target: Release) => ({ from: source, to: target, status: 'verified', persistedFormatsChanged: false, unsupportedDowngrades: ['Downgrades are unsupported'], compatibilityFindings: ['Fixture upgrade opens copied data'], evidenceReferences: [reference] })
  const rangeReleases = releases.slice(1, 8)
  const record = { schemaVersion: 1, from, to, releases: rangeReleases,
    edges: rangeReleases.map((target, index) => scenario(releaseAt(index), target)),
    directUpgrade: scenario(from, to) }
  const bytes = Buffer.from(JSON.stringify(record))
  const range = catchUpEvidence({ schemaVersion: 1, from, to, releases: rangeReleases, assessment: { path: 'docs/catch-up.json', sha256: digest(bytes) } }, releases)
  return { record, bytes, range, reference }
}
function rangeLock(range: CatchUp) { return sourceLock({ ...lock, schemaVersion: 3, release: to, predecessor: from, observed: releases, adoptionSeed: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }, catchUp: range }, config) }

it('pins seven releases and retains prior observations beyond the target', () => {
  const previous = { ...lock, observed: [from, releaseAt(8)] }
  const selected = catchUpObservations(previous, { complete: true, releases }, to.tag, to.commit)
  expect(selected).toEqual(releases)
  expect(rangeLock(assessment().range).catchUp?.releases).toHaveLength(7)
  expect(() => catchUpObservations(previous, { complete: true, releases: releases.slice(0, 8) }, to.tag, to.commit)).toThrow('disappeared')
  expect(() => catchUpObservations(previous, { complete: true, releases: [...releases.slice(0, 8), { ...releaseAt(8), commit: 'a'.repeat(40) }] }, to.tag, to.commit)).toThrow('changed')
})

it.each([
  ['incomplete', { complete: false, releases }, to.tag, to.commit],
  ['duplicate', { complete: true, releases: [...releases, to] }, to.tag, to.commit],
  ['conflicting', { complete: true, releases: [...releases, { ...to, commit: 'f'.repeat(40) }] }, to.tag, to.commit],
  ['absent', { complete: true, releases }, 'dsh-v9', to.commit],
  ['wrong commit', { complete: true, releases }, to.tag, 'f'.repeat(40)],
  ['non-advancing', { complete: true, releases }, from.tag, from.commit],
  ['one successor', { complete: true, releases }, releaseAt(1).tag, releaseAt(1).commit],
] as const)('rejects %s catch-up selection', (_name, observations, tag, commit) => {
  expect(() => catchUpObservations(lock, observations, tag, commit)).toThrow()
})

it('rejects malformed ranges and catch-up authority in historical or unknown schemas', () => {
  const { range } = assessment()
  expect(() => sourceLock({ ...lock, catchUp: range }, config)).toThrow('Historical')
  expect(() => sourceLock({ ...lock, schemaVersion: 2, adoptionSeed: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }, catchUp: range }, config)).toThrow('Historical')
  expect(() => sourceLock({ ...rangeLock(range), schemaVersion: 4 }, config)).toThrow('schema')
  expect(() => sourceLock({ ...rangeLock(range), catchUp: undefined }, config)).toThrow()
  expect(() => catchUpEvidence({ ...range, releases: range.releases.slice(1) }, releases)).toThrow('omits')
  expect(() => catchUpEvidence({ ...range, releases: [...range.releases].reverse() }, releases)).toThrow('order')
  expect(() => catchUpEvidence({ ...range, from: releaseAt(1) }, releases)).toThrow()
  expect(manifestCatchUp({ schemaVersion: 1, releaseKind: 'desktop' })).toBeNull()
  expect(() => manifestCatchUp({ schemaVersion: 1, catchUp: range })).toThrow('Historical')
  expect(() => manifestCatchUp({ schemaVersion: 2, catchUp: null, releaseKind: 'catch-up' })).toThrow('Missing')
  expect(() => manifestCatchUp({ schemaVersion: 2, catchUp: range, upstream: from, releaseKind: 'catch-up' })).toThrow('target')
})

it('binds every consecutive edge and direct upgrade while preserving truthful unqualified assessments', () => {
  const { record, bytes, range } = assessment()
  expect(assessmentReferences(range, bytes, config.sourceLockPath, true)).toHaveLength(2)
  for (const mutate of [
    () => { record.edges.pop() },
    () => { record.directUpgrade.from = releaseAt(1) },
    () => { record.directUpgrade.evidenceReferences = [] },
  ]) {
    const original = JSON.stringify(record)
    mutate()
    const changed = Buffer.from(JSON.stringify(record))
    const changedRange = { ...range, assessment: { ...range.assessment, sha256: digest(changed) } }
    expect(() => assessmentReferences(changedRange, changed, config.sourceLockPath, false)).toThrow()
    Object.assign(record, JSON.parse(original) as unknown)
  }
  record.directUpgrade.persistedFormatsChanged = true
  record.directUpgrade.status = 'unverified'
  const changed = Buffer.from(JSON.stringify(record))
  const changedRange = { ...range, assessment: { ...range.assessment, sha256: digest(changed) } }
  expect(assessmentReferences(changedRange, changed, config.sourceLockPath, false)).toHaveLength(2)
  expect(() => assessmentReferences(changedRange, changed, config.sourceLockPath, true)).toThrow('blocked or unverified')
  record.directUpgrade.status = 'verified'
  const formats = Buffer.from(JSON.stringify(record))
  expect(() => assessmentReferences({ ...range, assessment: { ...range.assessment, sha256: digest(formats) } }, formats, config.sourceLockPath, true)).toThrow('migration')
})

it('rejects missing, altered, escaping, cyclic and symlink evidence in local and committed readers', () => {
  const root = temporary()
  mkdirSync(join(root, 'docs'))
  const { record, bytes, range } = assessment()
  writeFileSync(join(root, range.assessment.path), bytes)
  writeFileSync(join(root, 'docs/compatibility.md'), 'verified fixture')
  expect(assessmentFiles(range, config.sourceLockPath, path => localEvidence(root, path), true)).toHaveLength(2)
  writeFileSync(join(root, 'docs/compatibility.md'), 'changed')
  expect(() => assessmentFiles(range, config.sourceLockPath, path => localEvidence(root, path), true)).toThrow('digest')
  for (const path of ['../escape', '/escape', 'docs/../escape', config.sourceLockPath, range.assessment.path]) {
    record.directUpgrade.evidenceReferences[0] = { path, sha256: digest('fixture') }
    const changed = Buffer.from(JSON.stringify(record))
    const changedRange = { ...range, assessment: { ...range.assessment, sha256: digest(changed) } }
    expect(() => assessmentReferences(changedRange, changed, config.sourceLockPath, false)).toThrow()
  }
  expect(() => localEvidence(root, 'docs/missing.md')).toThrow()
  if (process.platform === 'win32') return // Windows symlink creation requires host privileges outside this fixture.
  symlinkSync(join(root, 'docs/compatibility.md'), join(root, 'linked.md'))
  expect(() => localEvidence(root, 'linked.md')).toThrow('symlink')
  const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' }).trim()
  git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('add', '.'); git('commit', '-m', 'evidence')
  expect(() => gitEvidence(root, git('rev-parse', 'HEAD'), 'linked.md')).toThrow('regular')
})

it('revalidates live intervals, permits releases after target and rejects inserted or non-ancestral identities', async () => {
  const { range } = assessment()
  let observed = [...releases]
  let ancestral = true
  const api: GitHub = { async request(_method, path) {
    if (path.includes('/releases?')) return observed.map(item => ({ id: item.id, tag_name: item.tag, published_at: item.publishedAt, draft: false, prerelease: true }))
    if (path.includes('/git/ref/tags/')) return { object: { type: 'commit', sha: observed.find(item => path.endsWith(encodeURIComponent(item.tag)))?.commit } }
    if (path.includes('/compare/')) return { status: ancestral ? 'ahead' : 'diverged' }
    throw new Error(`Unexpected read ${path}`)
  } }
  await verifyLiveCatchUp(config, api, range)
  observed = [...releases, { id: 20, tag: 'dsh-v1.0.0-extra', publishedAt: '2026-01-03T12:00:00Z', commit: 'a'.repeat(40) }]
  await expect(verifyLiveCatchUp(config, api, range)).rejects.toThrow('omits')
  observed = releases.slice(1)
  await expect(verifyLiveCatchUp(config, api, range)).rejects.toThrow('omits')
  observed = [...releases, { id: 21, tag: 'dsh-v0.9', publishedAt: '2025-01-01T00:00:00Z', commit: 'b'.repeat(40) }]
  await expect(verifyLiveCatchUp(config, api, range, releases)).rejects.toThrow('inserted')
  observed = [...releases]; ancestral = false
  await expect(verifyLiveCatchUp(config, api, range)).rejects.toThrow('Non-ancestral')
})

it('checks the range start only for catch-up and preserves provenance for same-upstream fixes and replacements', () => {
  const current = rangeLock(assessment().range)
  const baseline = { purpose: 'desktop-legacy-baseline', upstream: from, desktopTag: 'desktop-v1.unsigned.1' }
  expect(deliveryPredecessor('catch-up', current, baseline).upstream).toEqual(from)
  expect(() => deliveryPredecessor('catch-up', current, { ...baseline, upstream: to })).toThrow('baseline')
  const delivered = { purpose: 'desktop-release-qualification', upstream: to, tag: 'desktop-v2.unsigned.1', predecessor: baseline }
  expect(deliveryPredecessor('desktop', current, delivered).upstream).toEqual(to)
  expect(deliveryPredecessor('replacement', current, delivered)).toEqual(baseline)
  const successor = sourceLock({ ...current, catchUp: null, release: releaseAt(8), predecessor: to }, config)
  expect(deliveryPredecessor('upstream', successor, delivered).upstream).toEqual(to)
})

it.each(['target-tag', 'target-commit', 'assessment'])('rejects a missing --%s through the actual adoption-plan CLI', (missing) => {
  const root = temporary()
  const out = join(root, 'out.json')
  const options = { 'target-tag': to.tag, 'target-commit': to.commit, assessment: 'docs/catch-up.json' }
  const result = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/desktop-delivery/cli.ts'), 'adoption-plan', '--config', configPath, '--root', root, '--lock', resolve('.github/desktop-delivery/source-lock.json'), '--fixture', resolve('scripts/desktop-delivery/tests/fixtures/releases.json'), '--base', 'a'.repeat(40), '--version', '1.0.0-alpha.2.unsigned.1', '--kind', 'catch-up', '--out', out, ...Object.entries(options).filter(([key]) => key !== missing).flatMap(([key, value]) => [`--${key}`, value])], { encoding: 'utf8', timeout: 30_000 })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  expect(result.status).toBe(1)
  expect(object(JSON.parse(readFileSync(out, 'utf8')) as unknown).state).toBe('blocked')
  expect(object(JSON.parse(readFileSync(out, 'utf8')) as unknown).blocker).toBe(`Missing --${missing}`)
  expect(result.stderr).not.toContain('Unknown option')
})
