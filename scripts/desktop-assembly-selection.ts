/** Interpret frozen npm installation paths; see the versioned assembly decision. */
import assert from 'node:assert/strict'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join, posix } from 'node:path'

/** Frozen package identity and dependency declarations. */
export interface LockPackage {
  version?: string
  resolved?: string
  integrity?: string
  optional?: boolean
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  os?: string | string[]
  cpu?: string | string[]
  libc?: string | string[]
}
/** npm v3 lock, keyed by installation location. */
export interface RuntimeLock { lockfileVersion: number; packages: Record<string, LockPackage> }
/** Actual acquisition host; unknown libc cannot authorize a declared selector. */
export interface AssemblyPlatform { os: string; cpu: string; libc?: string }
const packageName = /^(?:@[a-zA-Z0-9_~.-]+\/)?[a-zA-Z0-9_~.-]+$/u
const packageSegment = '(?:@[a-zA-Z0-9_~-][a-zA-Z0-9_~.-]*/)?[a-zA-Z0-9_~-][a-zA-Z0-9_~.-]*'
const packagePath = new RegExp(`^node_modules/${packageSegment}(?:/node_modules/${packageSegment})*$`, 'u')
const selectors = {
  os: new Set([
    'any', 'aix', 'android', 'darwin', 'freebsd', 'haiku', 'linux', 'openbsd', 'sunos', 'win32', 'cygwin', 'netbsd',
  ]),
  cpu: new Set(['any', 'arm', 'arm64', 'ia32', 'loong64', 'mips', 'mipsel', 'ppc', 'ppc64', 'riscv64', 's390', 's390x', 'x64', 'wasm32']),
  libc: new Set(['any', 'glibc', 'musl']),
}

function isRecord(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function matches(value: string | undefined, declaration: string | string[] | undefined, kind: keyof typeof selectors): boolean {
  if (declaration === undefined) return true
  const list = typeof declaration === 'string' ? [declaration] : declaration
  if (!Array.isArray(list) || list.length === 0 || list.some(item => typeof item !== 'string' || !selectors[kind].has(item.replace(/^!/u, '')))) throw new Error(`Malformed or unknown ${kind} selector`)
  if (value === undefined) throw new Error(`Unknown host ${kind} for declared selector`)
  if (list.length === 1 && list[0] === 'any') return true
  return !list.includes(`!${value}`) && (list.every(item => item.startsWith('!')) || list.includes(value))
}

function resolvePackage(packages: RuntimeLock['packages'], from: string, name: string): string | undefined {
  if (!packageName.test(name) || name === '.' || name === '..') throw new Error(`Unsafe dependency name: ${name}`)
  let directory = from
  for (;;) {
    if (posix.basename(directory) !== 'node_modules') {
      const candidate = posix.join(directory, 'node_modules', name)
      if (Object.hasOwn(packages, candidate)) return candidate
    }
    if (!directory) return undefined
    directory = posix.dirname(directory)
    if (directory === '.') directory = ''
  }
}

interface Edge { target: string; optional: boolean; optionalPeer: boolean }
function edges(packages: RuntimeLock['packages'], path: string): Edge[] {
  const entry = packages[path]
  assert(entry, `Missing frozen package: ${path}`)
  const result: Edge[] = []
  for (const declarations of [entry.dependencies, entry.optionalDependencies, entry.peerDependencies]) {
    if (declarations !== undefined && (!isRecord(declarations) || Object.values(declarations).some(value => typeof value !== 'string'))) throw new Error(`Malformed dependency declarations: ${path}`)
  }
  const names = new Set([
    ...Object.keys(entry.dependencies ?? {}), ...Object.keys(entry.peerDependencies ?? {}),
    ...Object.keys(entry.optionalDependencies ?? {}),
  ])
  for (const name of names) {
    const optional = Object.hasOwn(entry.optionalDependencies ?? {}, name)
    const optionalPeer = !optional && !Object.hasOwn(entry.dependencies ?? {}, name)
      && entry.peerDependenciesMeta?.[name]?.optional === true
    const target = resolvePackage(packages, path, name)
    if (target === undefined) {
      if (optionalPeer) continue
      throw new Error(`Missing frozen dependency: ${path} -> ${name}`)
    }
    result.push({ target, optional, optionalPeer })
  }
  return result
}

/** Reconcile platform-pruned reachability with npm's inventory and real directories.
 * @param stage - official-only npm installation before adding Mint packages.
 * @param lock - immutable reviewed npm lock.
 * @param platform - actual acquisition host selectors.
 * @returns Installed paths admitted for subsequent complete tarball comparison.
 */
export function officialSelection(
  stage: string, lock: RuntimeLock, platform: AssemblyPlatform = { os: process.platform, cpu: process.arch },
): Set<string> {
  if (lock.lockfileVersion !== 3 || !isRecord(lock.packages) || !Object.hasOwn(lock.packages, '')) throw new Error('Invalid frozen npm v3 lock')
  const graph = new Map<string, Edge[]>()
  const compatible = new Map<string, boolean>()
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path !== '' && !packagePath.test(path)) throw new Error(`Unsafe frozen package path: ${path}`)
    if (!isRecord(entry)) throw new Error(`Invalid frozen package: ${path}`)
    const os = matches(platform.os, entry.os, 'os')
    const cpu = matches(platform.cpu, entry.cpu, 'cpu')
    const libc = matches(platform.libc, entry.libc, 'libc')
    compatible.set(path, os && cpu && libc)
    graph.set(path, edges(lock.packages, path))
  }
  const reachable = (selected: boolean): Set<string> => {
    const visited = new Set([''])
    for (const path of visited) for (const edge of graph.get(path) ?? []) {
      if (selected && !compatible.get(edge.target)) {
        if (edge.optional) continue
        throw new Error(`Required dependency is platform-incompatible: ${path} -> ${edge.target}`)
      }
      visited.add(edge.target)
    }
    return visited
  }
  const full = reachable(false)
  const selected = reachable(true)
  const hidden = JSON.parse(readFileSync(join(stage, 'node_modules/.package-lock.json'), 'utf8')) as RuntimeLock
  if (!isRecord(hidden) || hidden.lockfileVersion !== 3 || !isRecord(hidden.packages)) throw new Error('Invalid hidden npm installation inventory')
  const installed = new Set<string>()
  const scan = (directory: string): void => {
    if (!existsSync(join(stage, directory))) return
    if (!lstatSync(join(stage, directory)).isDirectory()) throw new Error(`Invalid installed package directory: ${directory}`)
    for (const item of readdirSync(join(stage, directory), { withFileTypes: true })) {
      if (item.name === '.bin' || (directory === 'node_modules' && item.name === '.package-lock.json')) continue
      const path = `${directory}/${item.name}`
      if (item.name.startsWith('@')) { scan(path); continue }
      if (!item.isDirectory() || !packagePath.test(path) || !Object.hasOwn(lock.packages, path)) throw new Error(`Unknown installed package: ${path}`)
      installed.add(path)
      scan(`${path}/node_modules`)
    }
  }
  scan('node_modules')
  for (const [path, identity] of Object.entries(hidden.packages)) {
    const frozen = lock.packages[path]
    if (!packagePath.test(path) || !Object.hasOwn(lock.packages, path) || !installed.has(path)) throw new Error(`Hidden inventory differs from installation: ${path}`)
    assert(frozen, `Unknown hidden package: ${path}`)
    if (!isRecord(identity) || ['version', 'resolved', 'integrity'].some(key => identity[key as keyof LockPackage] !== frozen[key as keyof LockPackage])) throw new Error(`Hidden inventory identity differs: ${path}`)
  }
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '') continue
    if (!full.has(path)) throw new Error(`Unreachable frozen package: ${path}`)
    if (installed.has(path)) {
      if (!Object.hasOwn(hidden.packages, path)) throw new Error(`Installed package missing from hidden inventory: ${path}`)
      for (const edge of graph.get(path) ?? []) {
        if (!edge.optional && installed.has(edge.target) && !compatible.get(edge.target)) throw new Error(`Required dependency is platform-incompatible: ${path} -> ${edge.target}`)
        if (!edge.optional && !installed.has(edge.target) && !(edge.optionalPeer && !selected.has(edge.target))) throw new Error(`Installed package dependency is missing: ${path} -> ${edge.target}`)
      }
    } else if (entry.optional !== true || selected.has(path) || Object.hasOwn(hidden.packages, path)) throw new Error(`Required official package is missing: ${path}`)
  }
  return installed
}
