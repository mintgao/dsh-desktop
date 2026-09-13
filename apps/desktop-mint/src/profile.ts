/** Initialize Mint profiles through the installed public DSH profile API. */
import { existsSync, lstatSync, readlinkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AssemblyRecord } from './assembly.ts'

const BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-desktop-mint']
interface ProfileApi {
  resolveDshHome(): string
  initProfile(directory: string, bundles: readonly string[], reload: 'live'): void
  loadProfile(label: string, name: string, anchor: string, home: string): unknown
  healProfilesModuleFallback(options: { installAnchor: string; profile: unknown; home: string }): Promise<void>
}

/** Preserve existing user files and atomically initialize a fresh Mint profile.
 * @param cliPath - verified installed CLI.
 * @param record - verified component identities.
 * @returns Settlement after effective plugin resolution matches the assembly.
 */
export async function prepareMintProfile(cliPath: string, record: AssemblyRecord): Promise<void> {
  const anchor = join(dirname(dirname(cliPath)), 'package.json')
  const resolver = createRequire(anchor)
  const api = await import(pathToFileURL(resolver.resolve('@deepseek-ai/dsh-app-boot')).href) as ProfileApi
  const homeApi = await import(pathToFileURL(resolver.resolve('@deepseek-ai/dsh-home-paths')).href) as Pick<ProfileApi, 'resolveDshHome'>
  const home = homeApi.resolveDshHome()
  const profiles = join(home, 'profiles')
  const target = join(profiles, 'desktop-mint')
  mkdirSync(profiles, { recursive: true })
  const lock = join(profiles, '.desktop-mint-initialization')
  try { mkdirSync(lock) } catch (error) {
    throw new Error('Mint profile initialization is active or interrupted. Inspect .desktop-mint-initialization before retrying.', { cause: error })
  }
  try {
    if (!existsSync(target)) {
      const temporary = mkdtempSync(join(lock, 'profile-'))
      const prepared = join(temporary, 'desktop-mint')
      api.initProfile(prepared, BUNDLES, 'live')
      renameSync(prepared, target)
    }
    // A pre-existing directory without all public initialization files is ambiguous.
    for (const name of ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml']) {
      if (!existsSync(join(target, name))) throw new Error(`Incomplete existing Mint profile: missing ${name}; user files were preserved`)
    }
    const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }
    if (!BUNDLES.every(name => manifest.dsh?.profile?.bundles?.includes(name))) throw new Error('Existing Mint profile does not select required Base, Web and Mint bundles; user files were preserved')
    const names = Object.keys(record.components).filter(name => name.startsWith('@deepseek-ai/'))
    const required = new Set<string>()
    for (const [name, component] of Object.entries(record.components)) {
      if (component.source !== 'mint') continue
      const packed = JSON.parse(readFileSync(resolver.resolve(`${name}/package.json`), 'utf8')) as {
        dependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
        dsh?: { client?: { inject?: string[] } }
      }
      const dependencies = [...Object.keys(packed.dependencies ?? {}), ...Object.keys(packed.peerDependencies ?? {}),
        ...(packed.dsh?.client?.inject ?? [])]
      for (const dependency of dependencies) required.add(dependency)
    }
    for (const name of names) {
      const local = join(target, 'node_modules', name)
      if (!existsSync(local)) continue
      const stat = lstatSync(local)
      const owned = join(target, '.dsh-module-fallback/node_modules', name)
      if (stat.isSymbolicLink() && resolve(dirname(local), readlinkSync(local)) === owned) continue
      if (realpathSync(local) !== dirname(realpathSync(resolver.resolve(`${name}/package.json`)))) throw new Error(`Profile dependency conflicts with the verified assembly: ${name}; user files were preserved`)
    }
    const profile = api.loadProfile('desktop-mint', 'desktop-mint', anchor, home)
    await api.healProfilesModuleFallback({ installAnchor: anchor, profile, home })
    const profileResolver = createRequire(join(target, 'package.json'))
    for (const name of required) {
      const expected = resolver.resolve(`${name}/package.json`)
      const actual = profileResolver.resolve(`${name}/package.json`)
      if (realpathSync(expected) !== realpathSync(actual)) throw new Error(`Profile dependency conflicts with the verified assembly: ${name}; user files were preserved`)
    }
  } finally { rmSync(lock, { recursive: true, force: true }) }
}
