/** Hash packaged runtime bytes without following links outside their application. */
import { lstatSync, readFileSync, readlinkSync, readdirSync, realpathSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { digest } from './evidence.ts'

/** A deterministic entry in an application payload inventory. */
export interface RuntimeEntry {
  path: string
  kind: 'file' | 'symlink'
  mode: number
  size?: number
  sha256?: string
  target?: string
}

/** Inventory regular bytes and contained symbolic links in lexical path order.
 * @param root - real application directory, never a symbolic-link root.
 * @returns Canonical entries and their serialized digest.
 */
export function runtimeInventory(root: string): { entries: RuntimeEntry[]; sha256: string } {
  const metadata = lstatSync(root)
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Runtime inventory requires a real directory')
  const canonical = realpathSync(root)
  const entries: RuntimeEntry[] = []
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const entry = lstatSync(path)
      const logical = relative(root, path).split(sep).join('/')
      if (entry.isSymbolicLink()) {
        const destination = realpathSync(path)
        if (destination !== canonical && !destination.startsWith(`${canonical}${sep}`)) throw new Error('Runtime inventory link escapes application')
        entries.push({ path: logical, kind: 'symlink', mode: entry.mode & 0o777, target: readlinkSync(path) })
      } else if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) {
        const bytes = readFileSync(path)
        entries.push({ path: logical, kind: 'file', mode: entry.mode & 0o777, size: bytes.length, sha256: digest(bytes) })
      } else throw new Error('Runtime inventory contains a non-regular entry')
    }
  }
  visit(root)
  entries.sort((left, right) => left.path < right.path ? -1 : left.path === right.path ? 0 : 1)
  return { entries, sha256: digest(JSON.stringify(entries)) }
}
