/** Exercise immutable payload checks using isolated assembly fixtures. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assemblyDigest, assemblyFiles, verifyAssembly } from '../src/assembly.ts'
import { requireAssemblyInput, validateCandidateAssembly } from '../../../scripts/desktop-delivery/candidate.ts'
import { officialLock, verifyMintCoupling, verifyMintPackages } from '../../../scripts/desktop-assembly.ts'

const roots: string[] = []
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })
function fixture(): { root: string; digest: string } {
  const root = mkdtempSync(join(tmpdir(), 'mint-assembly-test-')); roots.push(root)
  writeFileSync(join(root, 'runtime.js'), 'export {}\n')
  const record = { schema: 1, runtimeVersion: '1', components: { '@deepseek-ai/dsh': { version: '1', source: 'official' } }, files: assemblyFiles(root) }
  const bytes = JSON.stringify(record); writeFileSync(join(root, 'assembly.json'), bytes)
  return { root, digest: assemblyDigest(bytes) }
}
describe('versioned assembly', () => {
  it('accepts matching bytes and rejects modified or missing payloads and substituted receipts', () => {
    const { root, digest } = fixture()
    expect(verifyAssembly(root, digest).runtimeVersion).toBe('1')
    writeFileSync(join(root, 'runtime.js'), 'changed')
    expect(() => verifyAssembly(root, digest)).toThrow('payload')
    rmSync(join(root, 'runtime.js'))
    expect(() => verifyAssembly(root, digest)).toThrow('payload')
    writeFileSync(join(root, 'assembly.json'), '{}')
    expect(() => verifyAssembly(root, digest)).toThrow('receipt')
  })
  it('rejects links escaping the immutable installation', () => {
    const { root } = fixture()
    symlinkSync(tmpdir(), join(root, 'escape'))
    expect(() => assemblyFiles(root)).toThrow('escapes')
  })
  it('requires exact official CLI integrity and frozen transitive locations', () => {
    const directory = resolve('apps/desktop-mint/runtime')
    const input = JSON.parse(readFileSync(join(directory, 'assembly-input.json'), 'utf8')) as { runtimeVersion: string; upstreamCommit: string; cliIntegrity: string }
    const bytes = readFileSync(join(directory, 'package-lock.json'), 'utf8')
    expect(Object.keys(officialLock(bytes, input).packages).length).toBeGreaterThan(500)
    expect(() => officialLock(bytes, { ...input, cliIntegrity: 'changed' })).toThrow('identity')
    expect(() => officialLock(bytes.replace('https://registry.npmjs.org/', 'file:../'), input)).toThrow('Unfrozen')
  })
  it('rejects missing declared Mint runtime dependencies and exports', () => {
    const { root } = fixture()
    const packageRoot = join(root, 'node_modules/mint')
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ dependencies: { 'unavailable-mint-dependency': '1' } }))
    expect(() => { verifyMintPackages(root, ['mint']) }).toThrow('Cannot find module')
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ exports: { '.': './missing.js' } }))
    expect(() => { verifyMintPackages(root, ['mint']) }).toThrow('Missing Mint export')
  })
  it('binds installed component provenance to the candidate and refuses missing evidence', () => {
    const expected = { descriptorDigest: 'a'.repeat(64), lockDigest: 'b'.repeat(64) }
    const candidate = { assemblyInput: expected, components: { '@deepseek-ai/dsh': '1' } }
    const components = { '@deepseek-ai/dsh': { version: '1', source: 'official', integrity: 'sha512-YWJjZA==' } }
    const native = { assembly: { ...expected, digest: 'c'.repeat(64), components } }
    expect(() => { validateCandidateAssembly(candidate, native, candidate.components) }).not.toThrow()
    expect(() => { validateCandidateAssembly(candidate, {}, candidate.components) }).toThrow()
    expect(() => { requireAssemblyInput({ assemblyRequired: true }, { components: candidate.components }) }).toThrow('Missing required')
    expect(() => { validateCandidateAssembly(candidate, { assembly: { ...native.assembly, lockDigest: 'd'.repeat(64) } }, candidate.components) }).toThrow('input differs')
    expect(() => { validateCandidateAssembly(candidate, native, { '@deepseek-ai/dsh': '2' }) }).toThrow('versions differ')
  })
  it('rejects a representative shared runtime dependency on Mint', () => {
    const { root } = fixture()
    for (const path of ['apps/cli', 'packages/boot/app-boot/src', 'packages/bundle/desktop-mint', 'packages/client/ui-session-notifications']) mkdirSync(join(root, path), { recursive: true })
    writeFileSync(join(root, 'packages/boot/app-boot/src/profile.ts'), 'export {}')
    for (const [path, name] of [['bundle/desktop-mint', 'mint'], ['client/ui-session-notifications', 'notifications']]) writeFileSync(join(root, 'packages', path!, 'package.json'), JSON.stringify({ name }))
    writeFileSync(join(root, 'apps/cli/package.json'), JSON.stringify({ name: 'cli', dependencies: { mint: '1' } }))
    expect(() => { verifyMintCoupling(root) }).toThrow('depends on Mint')
  })
})
