/** Hash private fixture data while preserving the profile's immutable runtime links. */
import { chmodSync, cpSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { digest } from './evidence.ts'

/** One immutable observation of a fixture file or runtime link. */
export interface MigrationDataEntry {
  path: string
  kind: 'file' | 'symlink' | 'directory'
  mode: number
  sha256: string
  size: number
}

/** Inventory fixture data without following its package-resolution links.
 * @param root - real fixture root after every writer has closed.
 * @param runtimeRoots - exact immutable packaged applications allowed as link targets.
 * @returns Sorted entries binding bytes, permissions and literal symlink targets.
 */
export function migrationDataInventory(root: string, runtimeRoots: readonly string[]): MigrationDataEntry[] {
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()) throw new Error('Migration data root must be a real directory')
  const canonical = realpathSync(root)
  const runtimes = runtimeRoots.map(path => realpathSync(path))
  const entries: MigrationDataEntry[] = [{ path: '.', kind: 'directory', mode: lstatSync(root).mode & 0o777, size: 0, sha256: digest('') }]
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const info = lstatSync(path)
      if (info.isDirectory()) {
        entries.push({ path: relative(root, path).split(sep).join('/'), kind: 'directory', mode: info.mode & 0o777, size: 0, sha256: digest('') })
        visit(path)
        continue
      }
      let bytes: Buffer
      if (info.isSymbolicLink()) {
        const target = realpathSync(path)
        if (!runtimes.some(runtime => target === runtime || target.startsWith(`${runtime}${sep}`))
          && target !== canonical && !target.startsWith(`${canonical}${sep}`)) throw new Error('Migration data link escapes fixture and selected runtimes')
        bytes = Buffer.from(readlinkSync(path))
      } else if (info.isFile()) bytes = readFileSync(path)
      else throw new Error('Migration data contains an unsupported filesystem entry')
      entries.push({ path: relative(root, path).split(sep).join('/'), kind: info.isSymbolicLink() ? 'symlink' : 'file',
        mode: info.mode & 0o777, size: bytes.length, sha256: digest(bytes) })
    }
  }
  visit(root)
  return entries.sort((left, right) => left.path < right.path ? -1 : left.path === right.path ? 0 : 1)
}

/** Copy quiescent fixture data and verify the complete destination against its source inventory.
 * @param source - owned stopped fixture data root.
 * @param destination - absent destination under a private fixture directory.
 * @param runtimeRoots - immutable runtime link targets permitted in the backup.
 * @param expected - previously captured inventory; damaged or changed source refuses before copying.
 * @returns The verified destination inventory.
 */
export function copyMigrationData(
  source: string, destination: string, runtimeRoots: readonly string[], expected: readonly MigrationDataEntry[],
): MigrationDataEntry[] {
  if (JSON.stringify(migrationDataInventory(source, runtimeRoots)) !== JSON.stringify(expected)) throw new Error('Migration backup integrity mismatch before copy')
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
  mkdirSync(destination, { mode: 0o700 })
  cpSync(source, destination, { recursive: true, verbatimSymlinks: true, force: false, errorOnExist: true })
  // Recursive cp creates directories with its defaults rather than their source modes.
  for (const entry of [...expected].reverse()) {
    if (entry.kind !== 'directory') continue
    const path = join(destination, entry.path)
    if (!lstatSync(path).isDirectory()) throw new Error('Migration backup directory changed kind')
    chmodSync(path, entry.mode)
  }
  const copied = migrationDataInventory(destination, runtimeRoots)
  if (JSON.stringify(copied) !== JSON.stringify(expected)) throw new Error('Migration backup copy changed data')
  return copied
}
