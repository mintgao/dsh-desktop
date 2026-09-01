/** Stage a self-contained, source-built dsh production tree for Electron. */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { capture, runConcurrent } from './release/process.ts'
import { releaseFamily, tarballName } from './release/families.ts'
import { tarballFiles } from './release/tarball.ts'

const LOCAL_PACKAGE_SECTIONS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const

interface PackedPackage {
  readonly name: string
  readonly version: string
  readonly tarball: string
  readonly manifest: Readonly<Record<string, unknown>>
}

/** Pack one release family from the current official build. */
function packFamily(root: string, family: 'dsh' | 'vendor', output: string): void {
  const release = releaseFamily(family)
  release.verifyBuildArtifacts(root)
  const members = release.publishOrder(release.members(root)).order
  release.verifyVersions(members)
  mkdirSync(output, { recursive: true })
  for (const [index, member] of members.entries()) {
    capture('pnpm', ['--dir', member.directory, 'pack', '--pack-destination', output], {
      cwd: root,
      env: process.env,
    })
    const tarball = join(output, tarballName(member))
    if (!existsSync(tarball)) throw new Error(`desktop stage: ${member.name} produced no tarball at ${tarball}`)
    release.validatePayload(member, tarballFiles(tarball))
    if ((index + 1) % 25 === 0 || index + 1 === members.length) {
      console.log(`desktop stage: packed ${String(index + 1)}/${String(members.length)} ${family} package(s)`)
    }
  }
}

/** Read an npm tarball's manifest without extracting its payload. */
function readPackedPackage(tarball: string): PackedPackage {
  const parsed: unknown = JSON.parse(capture('tar', ['-xOzf', tarball, 'package/package.json']))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`desktop stage: ${tarball} has no object package.json`)
  }
  const manifest = parsed as Record<string, unknown>
  const { name, version } = manifest
  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new Error(`desktop stage: ${tarball} has no package name or version`)
  }
  return { name, version, tarball, manifest }
}

/** Index every tarball emitted into the given family directories. */
function packedPackages(directories: readonly string[]): Map<string, PackedPackage> {
  const packages = new Map<string, PackedPackage>()
  for (const directory of directories) {
    for (const filename of readdirSync(directory).filter(name => name.endsWith('.tgz')).sort()) {
      const packed = readPackedPackage(join(directory, filename))
      if (packages.has(packed.name)) throw new Error(`desktop stage: duplicate packed package ${packed.name}`)
      packages.set(packed.name, packed)
    }
  }
  return packages
}

/** Select the local package closure needed by the dsh CLI. */
function runtimeClosure(packages: ReadonlyMap<string, PackedPackage>): PackedPackage[] {
  const selected = new Map<string, PackedPackage>()
  const pending = ['@deepseek-ai/dsh']
  while (pending.length > 0) {
    const name = pending.pop()
    if (name === undefined || selected.has(name)) continue
    const packed = packages.get(name)
    if (packed === undefined) throw new Error(`desktop stage: no local tarball for ${name}`)
    selected.set(name, packed)
    for (const section of LOCAL_PACKAGE_SECTIONS) {
      const dependencies = packed.manifest[section]
      if (dependencies === undefined) continue
      if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
        throw new Error(`desktop stage: ${packed.name} has an invalid ${section}`)
      }
      for (const dependency of Object.keys(dependencies)) {
        if (packages.has(dependency) && !selected.has(dependency)) pending.push(dependency)
      }
    }
  }
  return [...selected.values()].sort((left, right) => left.name.localeCompare(right.name))
}

/** Reject links that would make the packaged backend depend on the source checkout. */
function verifyContainedLinks(root: string, directory: string): void {
  const canonicalRoot = realpathSync(root)
  const allowedPrefix = `${canonicalRoot}${sep}`
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      const destination = realpathSync(path)
      if (destination !== canonicalRoot && !destination.startsWith(allowedPrefix)) {
        throw new Error(`desktop stage: ${path} resolves outside the staged backend to ${destination}`)
      }
    } else if (entry.isDirectory()) {
      verifyContainedLinks(root, path)
    }
  }
}

/** Pack the source tree and install its runtime closure into the Electron resource directory. */
async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '..')
  const target = join(root, 'apps', 'desktop', 'backend')
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-desktop-pack-'))
  try {
    const dshPacks = join(temporaryRoot, 'dsh')
    const vendorPacks = join(temporaryRoot, 'vendor')
    packFamily(root, 'dsh', dshPacks)
    packFamily(root, 'vendor', vendorPacks)
    const selected = runtimeClosure(packedPackages([dshPacks, vendorPacks]))
    const dshPackage = selected.find(packed => packed.name === '@deepseek-ai/dsh')
    if (dshPackage === undefined) throw new Error('desktop stage: dsh CLI was absent from its runtime closure')

    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'package.json'), `${JSON.stringify({
      name: 'dsh-desktop-backend',
      version: dshPackage.version,
      private: true,
      dependencies: Object.fromEntries(selected.map(packed => [packed.name, pathToFileURL(packed.tarball).href])),
    }, null, 2)}\n`)
    // Koffi carries its platform binary as an optional dependency, while npm
    // already skips optional packages whose os/cpu declarations exclude macOS.
    await runConcurrent('npm', ['install', '--no-audit', '--no-fund', '--package-lock=false'], {
      cwd: target,
      env: process.env,
    })
    const bin = join(target, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (!existsSync(bin)) throw new Error(`desktop stage: installed dsh CLI is missing ${bin}`)
    const version = capture(process.execPath, [bin, '--version'], { cwd: target, env: process.env })
    if (version !== dshPackage.version) {
      throw new Error(`desktop stage: installed dsh reported ${version}, expected ${dshPackage.version}`)
    }
    verifyContainedLinks(target, target)
    writeFileSync(join(target, 'package.json'), `${JSON.stringify({
      name: 'dsh-desktop-backend',
      version: dshPackage.version,
      private: true,
    }, null, 2)}\n`)
    console.log(`desktop stage: prepared ${String(selected.length)} local package(s) in ${target}`)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

await main()
