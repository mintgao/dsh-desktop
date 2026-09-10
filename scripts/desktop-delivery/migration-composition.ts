/** Inventory the approved Mint profile and every statically referenced built-in row. */
import { globSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCordisYaml } from '../cordis-yaml.ts'
import { digest, object } from './evidence.ts'

/** Source roots whose ordered profile and patches define the migration target. */
export const MIGRATION_COMPOSITION_ROOTS = [
  'packages/boot/app-boot/src/profile.ts',
  'packages/bundle/base/cordis.patch.yml',
  'packages/bundle/web-app/cordis.patch.yml',
  'packages/bundle/desktop-mint/cordis.patch.yml',
  'packages/preset/agent-presets/presets/standard/agent.cordis.yml',
] as const

/** Enumerate manifests and implementation sources for each built-in row, including subpath exports.
 * @param root - repository containing the selected target and downstream Mint sources.
 * @returns A unique sorted source inventory; unresolved row packages reject.
 */
export function compositionSourcePaths(root: string = fileURLToPath(new URL('../../', import.meta.url))): string[] {
  const packages = new Map<string, string>()
  for (const path of globSync(['packages/*/*/package.json', 'vendor/*/package.json'], { cwd: root })) {
    const manifest = object(JSON.parse(readFileSync(join(root, path), 'utf8')) as unknown)
    if (typeof manifest.name === 'string') packages.set(manifest.name, dirname(path))
  }
  const referenced = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) { for (const item of value) walk(item); return }
    if (typeof value !== 'object' || value === null) return
    const row = value as Record<string, unknown>
    if (typeof row.name === 'string' && row.name.startsWith('@deepseek-ai/')) referenced.add(row.name.split('/').slice(0, 2).join('/'))
    for (const child of Object.values(row)) walk(child)
  }
  for (const path of MIGRATION_COMPOSITION_ROOTS.filter(path => path.endsWith('.yml'))) walk(loadCordisYaml(readFileSync(join(root, path), 'utf8')))
  const paths = new Set<string>(MIGRATION_COMPOSITION_ROOTS)
  for (const name of referenced) {
    const directory = packages.get(name)
    if (directory === undefined) throw new Error(`Unresolved migration composition row: ${name}`)
    paths.add(`${directory}/package.json`)
    for (const path of globSync(`${directory}/src/**/*`, { cwd: root, withFileTypes: true })) {
      if (path.isFile()) paths.add(join(path.parentPath, path.name).slice(root.length + (root.endsWith('/') ? 0 : 1)))
    }
  }
  return [...paths].sort()
}

/** Hash the complete source recipe shared by the two native architecture executions.
 * @param paths - validated complete composition source inventory.
 * @param read - exact candidate source byte reader.
 * @returns Canonical JSON bytes retained as the composition input.
 */
export function compositionBytes(paths: readonly string[], read: (path: string) => Uint8Array): Buffer {
  return Buffer.from(JSON.stringify(paths.map(path => ({ path, sha256: digest(read(path)) }))))
}

/** Match the current candidate's complete recipe before accepting its generated reports.
 * @param root - exact candidate checkout used by the current aggregation job.
 * @param files - policy inventory bound by the candidate compatibility document.
 * @param read - exact candidate revision byte reader.
 * @returns Authenticated composition input bytes; missing or additional sources reject.
 */
export function checkedCompositionBytes(root: string, files: unknown, read: (path: string) => Uint8Array): Buffer {
  const bytes = compositionBytes(compositionSourcePaths(root), read)
  if (bytes.toString() !== JSON.stringify(files)) throw new Error('Candidate policy omits or changes built-in composition sources')
  return bytes
}
