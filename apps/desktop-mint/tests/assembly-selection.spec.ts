/** Frozen graph and actual npm inventory admission regressions. */
import { cpSync, appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { verifyOfficial } from '../../../scripts/desktop-assembly.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { officialSelection, type LockPackage, type RuntimeLock } from '../../../scripts/desktop-assembly-selection.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const host = { os: 'darwin', cpu: 'arm64' }
function fixture(extra: Record<string, LockPackage> = {}): { stage: string; lock: RuntimeLock; install: (paths: string[]) => void } {
  const stage = mkdtempSync(join(tmpdir(), 'mint-selection-')); roots.push(stage)
  const lock: RuntimeLock = { lockfileVersion: 3, packages: {
    '': { dependencies: { app: '1' } },
    'node_modules/app': { optionalDependencies: { excluded: '1', compatible: '1' }, dependencies: { shared: '1' } },
    'node_modules/excluded': { optional: true, os: ['linux'], dependencies: { child: '1' } },
    'node_modules/child': { optional: true, dependencies: { shared: '1' } },
    'node_modules/shared': {},
    'node_modules/compatible': { optional: true },
    ...extra,
  } }
  for (const [path, entry] of Object.entries(lock.packages)) if (path) Object.assign(entry, { version: '1', resolved: 'https://registry.npmjs.org/example/-/example-1.tgz', integrity: 'sha512-YQ==' })
  const install = (paths: string[]): void => {
    rmSync(join(stage, 'node_modules'), { recursive: true, force: true })
    mkdirSync(join(stage, 'node_modules'))
    for (const path of paths) { mkdirSync(join(stage, path), { recursive: true }); writeFileSync(join(stage, path, 'package.json'), '{}') }
    writeFileSync(join(stage, 'node_modules/.package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: Object.fromEntries(paths.map(path => [path, lock.packages[path]])) }))
  }
  install(['node_modules/app', 'node_modules/shared', 'node_modules/compatible'])
  return { stage, lock, install }
}
const selected = ['node_modules/app', 'node_modules/shared', 'node_modules/compatible']
describe('frozen optional platform selection', () => {
  it('admits pruned transitive optional packages and older npm retained descendants', () => {
    const { stage, lock, install } = fixture()
    expect(officialSelection(stage, lock, host).size).toBe(3)
    install([...selected, 'node_modules/child'])
    expect(officialSelection(stage, lock, host).size).toBe(4)
  })
  it.each(['shared', 'compatible', 'app'])('rejects absent selected %s even after hidden inventory removal', (name) => {
    const { stage, lock, install } = fixture()
    install(selected.filter(path => path !== `node_modules/${name}`))
    expect(() => officialSelection(stage, lock, host)).toThrow(/missing/u)
  })
  it('retains a shared child reached from another required parent', () => {
    const { stage, lock } = fixture()
    lock.packages['node_modules/app']!.dependencies!.child = '1'
    expect(() => officialSelection(stage, lock, host)).toThrow(/missing/u)
  })
  it('resolves scoped nested packages and terminates dependency cycles', () => {
    const { stage, lock, install } = fixture({
      'node_modules/app/node_modules/@scope/nested': { dependencies: { app: '1' } },
    })
    lock.packages['node_modules/app']!.dependencies!['@scope/nested'] = '1'
    install([...selected, 'node_modules/app/node_modules/@scope/nested'])
    expect(officialSelection(stage, lock, host).size).toBe(4)
  })
  it('rejects unresolved frozen dependencies and lock orphans', () => {
    const { stage, lock } = fixture()
    lock.packages['node_modules/child']!.dependencies!.missing = '1'
    expect(() => officialSelection(stage, lock, host)).toThrow('Missing frozen dependency')
    delete lock.packages['node_modules/child']!.dependencies!.missing
    lock.packages['node_modules/orphan'] = { optional: true }
    expect(() => officialSelection(stage, lock, host)).toThrow('Unreachable')
  })
  it('requires dependencies of retained optional descendants outside selected reachability', () => {
    const { stage, lock, install } = fixture({ 'node_modules/leaf': { optional: true } })
    lock.packages['node_modules/child']!.dependencies = { leaf: '1' }
    install([...selected, 'node_modules/child'])
    expect(() => officialSelection(stage, lock, host)).toThrow('Installed package dependency is missing')
  })
  it('rejects required incompatible targets and gives optional declarations precedence', () => {
    const { stage, lock } = fixture()
    lock.packages['node_modules/app']!.dependencies!.excluded = '1'
    expect(() => officialSelection(stage, lock, host)).not.toThrow()
    delete lock.packages['node_modules/app']!.optionalDependencies!.excluded
    expect(() => officialSelection(stage, lock, host)).toThrow('platform-incompatible')
  })
  it('permits absent optional peers without hiding a selected missing peer', () => {
    const { stage, lock, install } = fixture()
    lock.packages['node_modules/app']!.peerDependencies = { absent: '1', compatible: '1' }
    lock.packages['node_modules/app']!.peerDependenciesMeta = { absent: { optional: true }, compatible: { optional: true } }
    expect(() => officialSelection(stage, lock, host)).not.toThrow()
    install(selected.filter(path => path !== 'node_modules/compatible'))
    expect(() => officialSelection(stage, lock, host)).toThrow('missing')
  })
  it.each(['missing', 'corrupt', 'unknown', 'identity', 'disk', 'unlisted'])('rejects %s hidden inventory evidence', (mode) => {
    const { stage, lock } = fixture()
    const path = join(stage, 'node_modules/.package-lock.json')
    const hidden = JSON.parse(readFileSync(path, 'utf8')) as RuntimeLock
    if (mode === 'missing') rmSync(path)
    if (mode === 'corrupt') writeFileSync(path, '{')
    if (mode === 'unknown') { hidden.packages['node_modules/unknown'] = {}; writeFileSync(path, JSON.stringify(hidden)) }
    if (mode === 'identity') { hidden.packages['node_modules/app']!.integrity = 'changed'; writeFileSync(path, JSON.stringify(hidden)) }
    if (mode === 'disk') rmSync(join(stage, 'node_modules/compatible'), { recursive: true })
    if (mode === 'unlisted') { delete hidden.packages['node_modules/app']; writeFileSync(path, JSON.stringify(hidden)) }
    expect(() => officialSelection(stage, lock, host)).toThrow()
  })
  it('rejects unknown installed paths and unsafe lock paths', () => {
    const { stage, lock } = fixture()
    mkdirSync(join(stage, 'node_modules/unknown'))
    expect(() => officialSelection(stage, lock, host)).toThrow('Unknown installed')
    lock.packages['node_modules/../escape'] = {}
    expect(() => officialSelection(stage, lock, host)).toThrow('Unsafe frozen')
  })
  it('uses allow/exclude selectors and requires known explicit libc evidence', () => {
    const { stage, lock } = fixture()
    const entry = lock.packages['node_modules/excluded']!
    entry.os = ['!darwin']; expect(() => officialSelection(stage, lock, host)).not.toThrow()
    entry.os = ['darwin', '!darwin']; expect(() => officialSelection(stage, lock, host)).not.toThrow()
    entry.os = ['any']; entry.cpu = ['!arm64']; expect(() => officialSelection(stage, lock, host)).not.toThrow()
    entry.cpu = 'any'; entry.libc = ['musl']
    expect(() => officialSelection(stage, lock, host)).toThrow('Unknown host libc')
    expect(() => officialSelection(stage, lock, { ...host, libc: 'glibc' })).not.toThrow()
    expect(() => officialSelection(stage, lock, { ...host, libc: 'musl' })).toThrow('missing')
    entry.libc = ['invented']; expect(() => officialSelection(stage, lock, host)).toThrow('unknown libc')
  })
})


describe('retained official optional payload', () => {
  it('compares every installed optional byte against an authenticated tarball', () => {
    const { stage, lock, install } = fixture()
    lock.packages['node_modules/excluded']!.os = [`!${process.platform}`]
    const cache = join(stage, 'cache')
    const source = join(stage, 'package')
    mkdirSync(source)
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: 'fixture', version: '1' }))
    writeFileSync(join(source, 'payload.js'), 'export {}\n')
    const tarball = join(stage, 'fixture.tgz')
    execFileSync('tar', ['-czf', tarball, '-C', stage, 'package'])
    const bytes = readFileSync(tarball)
    const digest = createHash('sha512').update(bytes).digest()
    const hex = digest.toString('hex')
    const cached = join(cache, '_cacache/content-v2/sha512', hex.slice(0, 2), hex.slice(2, 4))
    mkdirSync(cached, { recursive: true }); writeFileSync(join(cached, hex.slice(4)), bytes)
    for (const entry of Object.values(lock.packages)) entry.integrity = `sha512-${digest.toString('base64')}`
    install([...selected, 'node_modules/child'])
    for (const path of [...selected, 'node_modules/child']) cpSync(source, join(stage, path), { recursive: true })
    const scratch = join(stage, 'scratch'); mkdirSync(scratch)
    expect(Object.keys(verifyOfficial(stage, lock, scratch, cache)).filter(path => path.startsWith('node_modules/'))).toHaveLength(4)
    appendFileSync(join(stage, 'node_modules/child/payload.js'), '// altered\n')
    expect(() => verifyOfficial(stage, lock, scratch, cache)).toThrow('Official installed payload differs: node_modules/child')
  })
})
