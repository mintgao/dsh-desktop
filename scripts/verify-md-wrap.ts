/**
 * Reject Markdown prose paragraphs spanning multiple physical lines. The GFM
 * AST distinguishes paragraphs—including those in lists and blockquotes—from
 * multiline structural nodes. The checker never rewrites; symlinked instruction
 * files are deduped. VitePress frontmatter and custom-container delimiters are
 * masked before parsing. The owning convention is in `docs/AGENTS.md`.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { TextDecoder } from 'node:util'
import type { Nodes } from 'mdast'
import { parseMarkdown, visitMarkdown } from './markdown.ts'
import { isArchivedAgentNotePath, uniqueRepoFiles } from './repo-files.ts'

const root = resolve(import.meta.dirname, '..')

/** Files to check: doc-typecheck's scope, system-prompt expected outputs, and the AGENTS.md pair. */
const PATTERNS = [
  'README.md',
  'README.zh.md',
  '.agents/notes/**/*.md',
  'docs/**/*.md',
  'packages/*/*.md',
  'packages/*/*/*.md',
  'snapshots/**/system-prompt.expected.md',
  'packages/**/system-prompt.expected.md',
  'AGENTS.md',
  'packages/AGENTS.md',
  'snapshots/AGENTS.md',
]

const MANAGED_PATH = 'AGENTS.md#managed-block'
const MANAGED_START = '<!-- vibe-kit:managed:start -->'
const MANAGED_END = '<!-- vibe-kit:managed:end -->'
const LOWERCASE_SHA256 = /^[0-9a-f]{64}$/u

/** A located hard-wrap: a prose paragraph spanning more than one source line. */
interface Violation {
  file: string
  /** 1-based line where the hard-wrapped paragraph starts. */
  line: number
  text: string
}

interface SourceLine {
  text: string
  start: number
  end: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeUtf8(bytes: Uint8Array, subject: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw new Error(`AGENTS.md: ${subject} is not valid UTF-8`)
  }
}

function readManifest(repositoryRoot: string): Record<string, unknown> {
  let bytes: Buffer
  try {
    bytes = readFileSync(resolve(repositoryRoot, '.vibe/manifest.json'))
  } catch {
    throw new Error('AGENTS.md: .vibe/manifest.json is missing or unreadable')
  }

  let value: unknown
  try {
    value = JSON.parse(decodeUtf8(bytes, '.vibe/manifest.json'))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('AGENTS.md: .vibe/manifest.json is invalid JSON')
    }
    throw error
  }
  if (!isRecord(value)) throw new Error('AGENTS.md: .vibe/manifest.json must contain an object')
  return value
}

function physicalLines(source: string): SourceLine[] {
  const lines: SourceLine[] = []
  let start = 0
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (char !== '\r' && char !== '\n') continue
    lines.push({ text: source.slice(start, index), start, end: index })
    if (char === '\r' && source[index + 1] === '\n') index += 1
    start = index + 1
  }
  lines.push({ text: source.slice(start), start, end: source.length })
  return lines
}

function occurrenceCount(source: string, marker: string): number {
  let count = 0
  let offset = 0
  while (true) {
    const found = source.indexOf(marker, offset)
    if (found === -1) return count
    count += 1
    offset = found + marker.length
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function requireHash(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`AGENTS.md: ${field} is missing or is not a string`)
  if (!LOWERCASE_SHA256.test(value)) {
    throw new Error(`AGENTS.md: ${field} must be a lowercase SHA-256 value`)
  }
  return value
}

function maskManagedInstructions(source: string, repositoryRoot: string): string {
  const manifest = readManifest(repositoryRoot)
  const activation = manifest.activation
  if (!isRecord(activation)) {
    throw new Error('AGENTS.md: .vibe/manifest.json activation must contain an object')
  }
  const paths = activation.paths
  if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string')) {
    throw new Error('AGENTS.md: .vibe/manifest.json activation.paths must be an array of strings')
  }
  const pathHashes = activation.path_hashes
  if (!isRecord(pathHashes)) {
    throw new Error('AGENTS.md: .vibe/manifest.json activation.path_hashes must contain an object')
  }

  const claimsManagedRegion = paths.includes(MANAGED_PATH)
  const lines = physicalLines(source)
  const starts = lines.filter(line => line.text === MANAGED_START)
  const ends = lines.filter(line => line.text === MANAGED_END)
  if (occurrenceCount(source, MANAGED_START) !== starts.length
    || occurrenceCount(source, MANAGED_END) !== ends.length) {
    throw new Error('AGENTS.md: Vibe Kit managed markers must occupy exact full lines')
  }
  if (starts.length === 0 && ends.length === 0) {
    if (claimsManagedRegion) throw new Error('AGENTS.md: manifest-owned Vibe Kit managed markers are missing')
    return source
  }
  if (starts.length === 0 || ends.length === 0) {
    throw new Error('AGENTS.md: Vibe Kit managed markers are unmatched')
  }
  if (starts.length !== 1 || ends.length !== 1) {
    throw new Error('AGENTS.md: Vibe Kit managed markers must occur exactly once')
  }
  const start = starts[0]
  const end = ends[0]
  if (start === undefined || end === undefined) throw new Error('AGENTS.md: managed marker lookup failed')
  if (end.start < start.start) throw new Error('AGENTS.md: Vibe Kit managed markers are reversed')
  if (!claimsManagedRegion) {
    throw new Error(`AGENTS.md: .vibe/manifest.json activation.paths does not own ${MANAGED_PATH}`)
  }

  const pathHash = requireHash(pathHashes[MANAGED_PATH], `activation.path_hashes[${JSON.stringify(MANAGED_PATH)}]`)
  const blockHash = requireHash(manifest.agents_block_hash, 'agents_block_hash')
  if (pathHash !== blockHash) {
    throw new Error('AGENTS.md: managed-block manifest hashes are unequal')
  }

  const region = source.slice(start.start, end.end)
  const normalizedRegion = region.replace(/\r\n?|\n/gu, '\n')
  if (sha256(normalizedRegion) !== pathHash) {
    throw new Error('AGENTS.md: installed Vibe Kit managed content does not match its manifest hash')
  }
  const masked = region.replace(/[^\r\n]/gu, ' ')
  return `${source.slice(0, start.start)}${masked}${source.slice(end.end)}`
}

function maskVitePressStructure(source: string): string {
  const lines = source.split('\n')
  if (lines[0] === '---') {
    const closing = lines.indexOf('---', 1)
    if (closing !== -1) {
      for (let index = 0; index <= closing; index++) lines[index] = ''
    }
  }
  return lines.map(line => line.trimStart().startsWith(':::') ? '' : line).join('\n')
}

/**
 * Find every hard-wrapped prose paragraph in one Markdown file via its AST.
 * @param absPath - Absolute Markdown path to inspect.
 * @param repositoryRoot - Repository root used for diagnostics and managed-instruction authentication.
 * @returns Hard-wrapped paragraphs in source order.
 */
export function findViolations(absPath: string, repositoryRoot: string = root): Violation[] {
  const file = relative(repositoryRoot, absPath).replaceAll('\\', '/')
  const bytes = readFileSync(absPath)
  const source = file === 'AGENTS.md'
    ? decodeUtf8(bytes, 'source')
    : bytes.toString('utf8')
  const managedMaskedSource = file === 'AGENTS.md'
    ? maskManagedInstructions(source, repositoryRoot)
    : source
  const parsedSource = maskVitePressStructure(managedMaskedSource)
  const tree = parseMarkdown(parsedSource)
  const out: Violation[] = []

  visitMarkdown(tree, (node: Nodes): boolean | void => {
    if (node.type === 'paragraph' && node.position) {
      const { start, end } = node.position
      if (end.line > start.line) {
        const firstLine = physicalLines(source)[start.line - 1]?.text ?? ''
        out.push({ file, line: start.line, text: firstLine.trim() })
      }
      // Paragraph children are inline, so no further paragraph can be nested.
      return false
    }
  })
  return out
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) {
  try {
    const files = uniqueRepoFiles(root, PATTERNS, isArchivedAgentNotePath)
    const all = files.flatMap(file => findViolations(file.abs))
    const checked = files.length

    if (all.length === 0) {
      console.log(`verify-md-wrap: ${checked} file(s) checked, no hard-wrapped prose paragraphs.`)
    } else {
      console.error('verify-md-wrap: hard-wrapped prose paragraphs found (write one physical line per paragraph):')
      for (const v of all) {
        console.error(`  ${v.file}:${v.line}  ${v.text.slice(0, 80)}${v.text.length > 80 ? '…' : ''}`)
      }
      process.exitCode = 1
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`verify-md-wrap: ${message}`)
    process.exitCode = 1
  }
}
