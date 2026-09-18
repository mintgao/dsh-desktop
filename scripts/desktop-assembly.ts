/** Stage official frozen npm artifacts and separate Mint tarballs. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { officialSelection, type RuntimeLock } from './desktop-assembly-selection.ts'
import { capture } from './release/process.ts'
import { assemblyDigest, assemblyFiles, type AssemblyRecord } from '../apps/desktop-mint/src/assembly.ts'

/** Mint-owned packages allowed to augment the official installation. */
export const MINT_PACKAGES = ['packages/bundle/desktop-mint', 'packages/client/ui-session-notifications'] as const
interface AssemblyInput { runtimeVersion: string; upstreamCommit: string; cliIntegrity: string }

/** Read the Mint package names from the Mint-owned manifests.
 * @param root - development checkout.
 * @returns The manifest names of every Mint-owned package.
 */
export function mintPackageNames(root: string): Set<string> {
  return new Set(MINT_PACKAGES.map(path => (JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8')) as { name: string }).name))
}

/** Reject upstream runtime dependencies on Mint-owned packages.
 * @param root - development checkout.
 */
export function verifyMintCoupling(root: string): void {
  const mint = mintPackageNames(root)
  const scan = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || ['node_modules', 'lib', 'backend', 'dist'].includes(entry.name)) continue
      const path = join(directory, entry.name)
      const manifestPath = join(path, 'package.json')
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }
        if (!mint.has(manifest.name ?? '') && Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }).some(name => mint.has(name))) throw new Error(`Upstream runtime depends on Mint: ${manifestPath}`)
      }
      scan(path)
    }
  }
  scan(join(root, 'apps'))
  scan(join(root, 'packages'))
  if (readFileSync(join(root, 'packages/boot/app-boot/src/profile.ts'), 'utf8').includes('desktop-mint')) throw new Error('Upstream profile template contains Mint')
}

/** Validate the complete npm lock before any acquisition.
 * @param bytes - frozen package-lock.json.
 * @param input - reviewed exact runtime version, upstream commit and CLI integrity.
 * @returns Exact official package records.
 */
export function officialLock(bytes: string, input: AssemblyInput): RuntimeLock {
  const lock = JSON.parse(bytes) as RuntimeLock
  if (lock.packages['node_modules/@deepseek-ai/dsh']?.integrity !== input.cliIntegrity
    || lock.packages['node_modules/@deepseek-ai/dsh'].version !== input.runtimeVersion) throw new Error('Official CLI lock identity differs')
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '') continue
    if (!path.startsWith('node_modules/') || path.includes('..') || !/^https:\/\/registry\.npmjs\.org\//u.test(entry.resolved ?? '')
      || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(entry.integrity ?? '') || !entry.version) throw new Error(`Unfrozen official dependency: ${path}`)
  }
  return lock
}

/** Compare each selected official package to its integrity-checked npm tarball.
 * @param stage - official-only installed backend directory.
 * @param lock - validated frozen npm lock.
 * @param scratch - private directory for temporary extraction.
 * @param cache - npm content cache used during acquisition.
 * @returns Actual installed component identities.
 */
export function verifyOfficial(stage: string, lock: RuntimeLock, scratch: string, cache: string): AssemblyRecord['components'] {
  const installed = officialSelection(stage, lock)
  const components: AssemblyRecord['components'] = {}
  for (const path of installed) {
    const entry = lock.packages[path]
    assert(entry, `Missing frozen package: ${path}`)
    if (!entry.integrity || !entry.version) throw new Error(`Unfrozen official dependency: ${path}`)
    const hex = Buffer.from(entry.integrity.slice(7), 'base64').toString('hex')
    const tarball = join(cache, '_cacache/content-v2/sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4))
    const bytes = readFileSync(tarball)
    if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== entry.integrity) throw new Error(`Official artifact integrity differs: ${path}`)
    const unpacked = join(scratch, 'verify')
    mkdirSync(unpacked)
    try {
      capture('tar', ['-xzf', tarball, '--strip-components=1', '-C', unpacked])
      const expected = Object.fromEntries(Object.entries(assemblyFiles(unpacked)).filter(([key]) => !key.startsWith('node_modules/')))
      const actual = Object.fromEntries(Object.entries(assemblyFiles(join(stage, path))).filter(([key]) => !key.startsWith('node_modules/')))
      // npm may nest another independently locked dependency beneath a package.
      if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Official installed payload differs: ${path}`)
      const manifest = JSON.parse(readFileSync(join(stage, path, 'package.json'), 'utf8')) as { name: string; version: string }
      if (manifest.version !== entry.version) throw new Error(`Installed package version differs: ${path}`)
      components[path] = { version: entry.version, integrity: entry.integrity, source: 'official' }
      if (path === `node_modules/${manifest.name}`) components[manifest.name] = { version: entry.version, integrity: entry.integrity, source: 'official' }
    } finally { rmSync(unpacked, { recursive: true }) }
  }
  return components
}


/** Verify Mint's runtime dependencies and exported payloads resolve inside the stage.
 * @param stage - installed backend directory.
 * @param names - explicit Mint package identities.
 */
export function verifyMintPackages(stage: string, names: readonly string[]): void {
  for (const name of names) {
    const anchor = join(stage, 'node_modules', name, 'package.json')
    const manifest = JSON.parse(readFileSync(anchor, 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      exports?: Record<string, unknown>
    }
    const resolver = createRequire(anchor)
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
      const target = realpathSync(resolver.resolve(`${dependency}/package.json`))
      if (!target.startsWith(`${realpathSync(stage)}${sep}`)) throw new Error(`Mint dependency resolves outside assembly: ${dependency}`)
    }
    const check = (value: unknown): void => {
      if (typeof value === 'string' && !value.includes('*')) {
        if (!value.startsWith('./') || !existsSync(join(stage, 'node_modules', name, value))) throw new Error(`Missing Mint export: ${name} ${value}`)
      } else if (value !== null && typeof value === 'object') for (const target of Object.values(value)) check(target)
    }
    check(manifest.exports)
  }
}

/** Replace the current stage only after frozen official and packed Mint inputs verify.
 * @param root - development checkout.
 */
export function prepareDesktopAssembly(root: string): void {
  verifyMintCoupling(root)
  const input = join(root, 'apps/desktop-mint/runtime')
  const lockBytes = readFileSync(join(input, 'package-lock.json'), 'utf8')
  const descriptor = JSON.parse(readFileSync(join(input, 'assembly-input.json'), 'utf8')) as AssemblyInput
  const lock = officialLock(lockBytes, descriptor)
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-assembly-'))
  const target = join(root, 'apps/desktop-mint/backend')
  const stage = `${target}.pending`
  if (existsSync(stage) || existsSync(`${target}.previous`)) throw new Error('Interrupted backend preparation requires inspection of pending/previous stage')
  mkdirSync(stage)
  try {
    for (const name of ['package.json', 'package-lock.json']) cpSync(join(input, name), join(stage, name))
    capture('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stage, env: process.env })
    const components = verifyOfficial(stage, lock, scratch, capture('npm', ['config', 'get', 'cache']))
    for (const path of MINT_PACKAGES) {
      const manifest = JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8')) as { name: string; version: string }
      const destination = join(stage, 'node_modules', manifest.name)
      if (existsSync(destination)) throw new Error(`Mint package collides with official runtime: ${manifest.name}`)
      const packed = capture('pnpm', ['--dir', join(root, path), 'pack', '--pack-destination', scratch], { cwd: root, env: process.env })
      const tarball = join(scratch, readdirSync(scratch).find(name => name.endsWith('.tgz')) ?? '')
      if (!tarball.endsWith('.tgz')) throw new Error(`Mint pack missing: ${packed}`)
      mkdirSync(destination, { recursive: true })
      capture('tar', ['-xzf', tarball, '--strip-components=1', '-C', destination])
      components[manifest.name] = { version: manifest.version, integrity: `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`, source: 'mint' }
      rmSync(tarball)
    }
    verifyMintPackages(stage, Object.entries(components).filter(([, value]) => value.source === 'mint').map(([name]) => name))
    const shellVersion = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version
    const shellSourceDigest = assemblyDigest(JSON.stringify(assemblyFiles(join(root, 'apps/desktop-mint/src'))))
    const record: AssemblyRecord = { schema: 1, runtimeVersion: descriptor.runtimeVersion, lockDigest: assemblyDigest(lockBytes), descriptorDigest: assemblyDigest(readFileSync(join(input, 'assembly-input.json'))), shellVersion, shellSourceDigest, components, files: assemblyFiles(stage) }
    writeFileSync(join(stage, 'assembly.json'), `${JSON.stringify(record, null, 2)}\n`)
    if (existsSync(target)) renameSync(target, `${target}.previous`)
    renameSync(stage, target)
    rmSync(`${target}.previous`, { recursive: true, force: true })
    console.log(`desktop assembly: verified ${Object.keys(lock.packages).length - 1} locked inputs; installed ${Object.keys(components).filter(key => key.startsWith('node_modules/')).length} official packages and ${MINT_PACKAGES.length} Mint packages`)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
    rmSync(stage, { recursive: true, force: true })
  }
}
