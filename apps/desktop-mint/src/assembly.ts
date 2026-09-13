/** Verify the immutable backend payload before native launch. */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/** Exact identities and payload bytes of one assembled backend. */
export interface AssemblyRecord {
  schema: 1
  runtimeVersion: string
  lockDigest: string
  descriptorDigest: string
  shellVersion: string
  shellSourceDigest: string
  components: Record<string, { version: string; integrity: string; source: 'official' | 'mint' }>
  files: Record<string, string>
}

/** Hash bytes using the assembly digest algorithm.
 * @param bytes - exact file contents.
 * @returns SHA256 hex digest.
 */
export function assemblyDigest(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Enumerate payload files and reject links outside the installation.
 * @param root - backend installation directory.
 * @returns File digests and literal symlink targets, excluding the receipt itself.
 */
export function assemblyFiles(root: string): Record<string, string> {
  const canonical = realpathSync(root)
  const files: Record<string, string> = {}
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const key = relative(root, path).split(sep).join('/')
      if (key === 'assembly.json') continue
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) {
        const target = realpathSync(path)
        if (!target.startsWith(`${canonical}${sep}`)) throw new Error(`Assembly link escapes installation: ${key}`)
        files[key] = `link:${readlinkSync(path)}`
      } else if (stat.isDirectory()) visit(path)
      else if (stat.isFile()) files[key] = assemblyDigest(readFileSync(path))
      else throw new Error(`Unsupported assembly entry: ${key}`)
    }
  }
  visit(root)
  return files
}

/** Validate all installed payload bytes against the packaged receipt.
 * @param root - immutable backend directory.
 * @param expectedDigest - receipt digest embedded in the independently built native shell.
 * @returns Verified assembly identities.
 */
export function verifyAssembly(root: string, expectedDigest: string): AssemblyRecord {
  const bytes = readFileSync(join(root, 'assembly.json'))
  if (assemblyDigest(bytes) !== expectedDigest) throw new Error('Assembly receipt differs from native shell identity')
  const record = JSON.parse(bytes.toString()) as Omit<AssemblyRecord, 'schema'> & { schema: number }
  if (record.schema !== 1 || record.components['@deepseek-ai/dsh']?.version !== record.runtimeVersion
    || record.components['@deepseek-ai/dsh'].source !== 'official') throw new Error('Invalid official runtime identity')
  if (JSON.stringify(assemblyFiles(root)) !== JSON.stringify(record.files)) throw new Error('Assembly payload is missing, changed, or substituted')
  return record as AssemblyRecord
}
