/** Merge architecture-specific electron-builder metadata into one macOS feed. */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { dump, load } from 'js-yaml'

interface UpdateFile {
  readonly url: string
  readonly sha512: string
  readonly size?: number
}

interface ParsedMetadata {
  readonly version: string
  readonly files: readonly UpdateFile[]
  readonly releaseDate?: string
  readonly source: Readonly<Record<string, unknown>>
}

const OWNED_KEYS = new Set(['version', 'files', 'path', 'sha512', 'releaseDate'])

/** Merge validated per-architecture update documents for one desktop version. */
export function mergeDesktopUpdateMetadata(
  documents: readonly unknown[],
  expectedVersion: string,
): Readonly<Record<string, unknown>> {
  if (documents.length < 2) throw new Error('at least two architecture metadata documents are required')
  const parsed = documents.map((document, index) => parseMetadata(document, `document ${String(index + 1)}`))
  for (const metadata of parsed) {
    if (metadata.version !== expectedVersion) {
      throw new Error(`metadata version ${metadata.version} does not match expected ${expectedVersion}`)
    }
  }

  const indexedFiles = new Map<string, UpdateFile>()
  for (const metadata of parsed) {
    for (const file of metadata.files) {
      const existing = indexedFiles.get(file.url)
      if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(file)) {
        throw new Error(`conflicting metadata for ${file.url}`)
      }
      indexedFiles.set(file.url, file)
    }
  }
  const files = [...indexedFiles.values()].sort((left, right) => left.url.localeCompare(right.url))
  requireArchitectureZip(files, 'arm64')
  requireArchitectureZip(files, 'x64')
  const legacyFile = files.find(file => file.url.endsWith('-arm64.zip')) ?? files.find(file => file.url.endsWith('.zip'))
  if (legacyFile === undefined) throw new Error('merged metadata has no ZIP update artifact')

  const dates = parsed.flatMap(metadata => metadata.releaseDate === undefined ? [] : [metadata.releaseDate]).sort()
  const merged: Record<string, unknown> = {
    version: expectedVersion,
    files,
    path: legacyFile.url,
    sha512: legacyFile.sha512,
  }
  const releaseDate = dates.at(-1)
  if (releaseDate !== undefined) merged.releaseDate = releaseDate
  for (const [key, value] of identicalExtraEntries(parsed)) merged[key] = value
  return merged
}

/** Parse one electron-builder document at its file trust boundary. */
function parseMetadata(value: unknown, context: string): ParsedMetadata {
  const source = asRecord(value, context)
  const version = source.version
  if (typeof version !== 'string' || version === '') throw new Error(`${context} has no version`)
  const rawFiles = source.files
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) throw new Error(`${context} has no files`)
  const files = rawFiles.map((file, index) => parseUpdateFile(file, `${context} file ${String(index + 1)}`))
  const releaseDate = source.releaseDate
  if (releaseDate !== undefined && (typeof releaseDate !== 'string' || releaseDate === '')) {
    throw new Error(`${context} has an invalid releaseDate`)
  }
  return releaseDate === undefined ? { version, files, source } : { version, files, releaseDate, source }
}

/** Validate one update file entry without accepting implicit field coercion. */
function parseUpdateFile(value: unknown, context: string): UpdateFile {
  const source = asRecord(value, context)
  const { url, sha512, size } = source
  if (typeof url !== 'string' || url === '') throw new Error(`${context} has no url`)
  if (typeof sha512 !== 'string' || sha512 === '') throw new Error(`${context} has no sha512`)
  if (size !== undefined && (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0)) {
    throw new Error(`${context} has an invalid size`)
  }
  return size === undefined ? { url, sha512 } : { url, sha512, size }
}

/** Require an architecture-labelled ZIP so MacUpdater cannot cross-select. */
function requireArchitectureZip(files: readonly UpdateFile[], architecture: 'arm64' | 'x64'): void {
  if (!files.some(file => file.url.endsWith(`-${architecture}.zip`))) {
    throw new Error(`merged metadata has no ${architecture} ZIP update artifact`)
  }
}

/** Preserve publisher fields only when every architecture generated the same value. */
function identicalExtraEntries(parsed: readonly ParsedMetadata[]): [string, unknown][] {
  const first = parsed[0]
  if (first === undefined) return []
  return Object.entries(first.source).filter(([key, value]) => {
    if (OWNED_KEYS.has(key)) return false
    return parsed.every(metadata => JSON.stringify(metadata.source[key]) === JSON.stringify(value))
  })
}

/** Narrow YAML input to a mapping. */
function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be a YAML mapping`)
  }
  return value as Record<string, unknown>
}

/** Parse CLI inputs, merge metadata, and write a deterministic YAML feed. */
function main(): void {
  const args = process.argv.slice(2)
  const versionIndex = args.indexOf('--version')
  const outputIndex = args.indexOf('--output')
  const expectedVersion = versionIndex === -1 ? undefined : args[versionIndex + 1]
  const output = outputIndex === -1 ? undefined : args[outputIndex + 1]
  if (expectedVersion === undefined || output === undefined) {
    throw new Error('usage: merge-desktop-update-metadata --version <version> --output <path> <metadata...>')
  }
  const consumed = new Set([versionIndex, versionIndex + 1, outputIndex, outputIndex + 1])
  const inputs = args.filter((_argument, index) => !consumed.has(index))
  if (inputs.length < 2 || inputs.some(input => input.startsWith('--'))) {
    throw new Error('two architecture metadata paths are required after --version and --output')
  }
  const documents = inputs.map(path => load(readFileSync(resolve(path), 'utf8')))
  const merged = mergeDesktopUpdateMetadata(documents, expectedVersion)
  writeFileSync(resolve(output), dump(merged, { lineWidth: -1, noRefs: true, sortKeys: false }))
}

const entry = process.argv[1]
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  try {
    main()
  } catch (error) {
    console.error(`merge-desktop-update-metadata: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
