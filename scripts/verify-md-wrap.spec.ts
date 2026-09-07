import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findViolations } from './verify-md-wrap.ts'

const MANAGED_PATH = 'AGENTS.md#managed-block'
const START = '<!-- vibe-kit:managed:start -->'
const END = '<!-- vibe-kit:managed:end -->'
const MANAGED_LINES = [START, 'managed first line', 'managed second line', END]
const MISSING_MANIFEST = Symbol('missing manifest')

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function validManifest(hash = sha256(MANAGED_LINES.join('\n'))): Record<string, unknown> {
  return {
    activation: {
      paths: [MANAGED_PATH],
      path_hashes: { [MANAGED_PATH]: hash },
    },
    agents_block_hash: hash,
  }
}

function fixture(
  source: string | Buffer,
  manifest: unknown = validManifest(),
): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-md-wrap-'))
  roots.push(root)
  writeFileSync(join(root, 'AGENTS.md'), source)
  if (manifest !== MISSING_MANIFEST) {
    mkdirSync(join(root, '.vibe'), { recursive: true })
    writeFileSync(
      join(root, '.vibe/manifest.json'),
      Buffer.isBuffer(manifest) ? manifest : JSON.stringify(manifest),
    )
  }
  return root
}

function errorsFor(
  source: string,
  manifest: unknown,
): () => ReturnType<typeof findViolations> {
  const root = fixture(source, manifest)
  return () => findViolations(join(root, 'AGENTS.md'), root)
}

describe('authenticated root managed instructions', () => {
  it.each(['\n', '\r\n'])('masks an authenticated %j region and preserves following line numbers', (eol) => {
    const source = [...MANAGED_LINES, '', 'after first line', 'after second line', ''].join(eol)
    const root = fixture(source)
    expect(findViolations(join(root, 'AGENTS.md'), root)).toEqual([{
      file: 'AGENTS.md',
      line: 6,
      text: 'after first line',
    }])
  })

  it('checks project-owned prose before and after the managed region', () => {
    const source = [
      'before first line',
      'before second line',
      '',
      ...MANAGED_LINES,
      '',
      'after first line',
      'after second line',
      '',
    ].join('\n')
    const root = fixture(source)
    expect(findViolations(join(root, 'AGENTS.md'), root).map(({ line, text }) => ({ line, text }))).toEqual([
      { line: 1, text: 'before first line' },
      { line: 9, text: 'after first line' },
    ])
  })

  it('hashes only the marker-to-marker span and normalizes CRLF like Python text reads', () => {
    const normalizedSpan = MANAGED_LINES.join('\n')
    const digest = sha256(normalizedSpan)
    expect(sha256(`\n${normalizedSpan}`)).not.toBe(digest)
    expect(sha256(`${normalizedSpan}\n`)).not.toBe(digest)
    for (const eol of ['\n', '\r\n']) {
      const source = ['prefix', ...MANAGED_LINES, 'suffix', ''].join(eol)
      const root = fixture(source, validManifest(digest))
      expect(findViolations(join(root, 'AGENTS.md'), root)).toEqual([])
    }
  })

  it('does not exempt identical markers in another Markdown file', () => {
    const root = fixture(MANAGED_LINES.join('\n'))
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'docs/other.md'), [START, 'first line', 'second line', END, ''].join('\n'))
    expect(findViolations(join(root, 'docs/other.md'), root)).toEqual([{
      file: 'docs/other.md',
      line: 2,
      text: 'first line',
    }])
  })

  it('checks the complete root file when neither ownership nor markers exist', () => {
    const manifest = { activation: { paths: [], path_hashes: {} } }
    const root = fixture('first line\nsecond line\n', manifest)
    expect(findViolations(join(root, 'AGENTS.md'), root)).toEqual([{
      file: 'AGENTS.md',
      line: 1,
      text: 'first line',
    }])
  })
})

describe('managed-instruction ownership failures', () => {
  it.each([
    ['missing manifest', MISSING_MANIFEST, /manifest\.json is missing or unreadable/u],
    ['invalid manifest JSON', Buffer.from('{'), /manifest\.json is invalid JSON/u],
    ['non-object manifest JSON', [], /manifest\.json must contain an object/u],
    ['missing activation', {}, /activation must contain an object/u],
    ['missing activation.paths', { activation: { path_hashes: {} } }, /activation\.paths must be an array of strings/u],
    ['wrong-type activation.paths', { activation: { paths: MANAGED_PATH, path_hashes: {} } }, /activation\.paths must be an array of strings/u],
    ['non-string activation.paths entry', { activation: { paths: [1], path_hashes: {} } }, /activation\.paths must be an array of strings/u],
    ['missing activation.path_hashes', { activation: { paths: [MANAGED_PATH] } }, /activation\.path_hashes must contain an object/u],
    ['wrong-type activation.path_hashes', { activation: { paths: [MANAGED_PATH], path_hashes: [] } }, /activation\.path_hashes must contain an object/u],
  ] as const)('rejects %s', (_label, manifest, diagnostic) => {
    expect(errorsFor(MANAGED_LINES.join('\n'), manifest)).toThrow(diagnostic)
  })

  it('strictly decodes the root document and manifest as UTF-8', () => {
    const invalid = Buffer.from([0xff])
    const sourceRoot = fixture(invalid, validManifest())
    expect(() => findViolations(join(sourceRoot, 'AGENTS.md'), sourceRoot)).toThrow(/AGENTS\.md: source is not valid UTF-8/u)
    expect(errorsFor(MANAGED_LINES.join('\n'), invalid)).toThrow(/manifest\.json is not valid UTF-8/u)
  })

  it.each([
    ['absent path hash', { activation: { paths: [MANAGED_PATH], path_hashes: {} }, agents_block_hash: '0'.repeat(64) }, /activation\.path_hashes/u],
    ['absent block hash', { activation: { paths: [MANAGED_PATH], path_hashes: { [MANAGED_PATH]: '0'.repeat(64) } } }, /agents_block_hash is missing/u],
    ['uppercase hashes', validManifest('A'.repeat(64)), /lowercase SHA-256/u],
    ['nonhex hashes', validManifest('g'.repeat(64)), /lowercase SHA-256/u],
    ['unequal hashes', { activation: { paths: [MANAGED_PATH], path_hashes: { [MANAGED_PATH]: '0'.repeat(64) } }, agents_block_hash: '1'.repeat(64) }, /hashes are unequal/u],
  ] as const)('rejects %s', (_label, manifest, diagnostic) => {
    expect(errorsFor(MANAGED_LINES.join('\n'), manifest)).toThrow(diagnostic)
  })

  it('rejects managed content that does not match the recorded digest', () => {
    const root = fixture([START, 'changed', END].join('\n'))
    expect(() => findViolations(join(root, 'AGENTS.md'), root)).toThrow(/managed content does not match/u)
  })

  it('rejects markers that lack manifest ownership', () => {
    const manifest = { activation: { paths: [], path_hashes: {} } }
    expect(errorsFor(MANAGED_LINES.join('\n'), manifest)).toThrow(/does not own AGENTS\.md#managed-block/u)
  })
})

describe('managed-instruction marker failures', () => {
  it.each([
    ['missing', 'project prose', /managed markers are missing/u],
    ['unmatched start', START, /markers are unmatched/u],
    ['unmatched end', END, /markers are unmatched/u],
    ['duplicate start', [START, START, END].join('\n'), /must occur exactly once/u],
    ['duplicate end', [START, END, END].join('\n'), /must occur exactly once/u],
    ['reversed', [END, START].join('\n'), /markers are reversed/u],
    ['non-exact start', [` ${START}`, END].join('\n'), /must occupy exact full lines/u],
    ['non-exact end', [START, `${END} `].join('\n'), /must occupy exact full lines/u],
  ] as const)('rejects %s markers', (_label, source, diagnostic) => {
    expect(errorsFor(source, validManifest())).toThrow(diagnostic)
  })
})

describe('root instruction word budget', () => {
  it('counts the managed words inside the exact frozen 2858-word ceiling', () => {
    const repositoryRoot = resolve(import.meta.dirname, '..')
    const source = readFileSync(join(repositoryRoot, 'AGENTS.md'), 'utf8')
    const budgets = JSON.parse(readFileSync(join(repositoryRoot, 'scripts/doc-budgets.manifest.json'), 'utf8')) as Record<string, number>
    const start = source.indexOf(START)
    const end = source.indexOf(END, start) + END.length
    const count = (text: string): number => text.split(/\s+/u).filter(Boolean).length

    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(count(source.slice(start, end))).toBe(909)
    expect(count(`${source.slice(0, start)}${source.slice(end)}`)).toBe(1949)
    expect(count(source)).toBe(2858)
    expect(budgets['AGENTS.md']).toBe(2858)
  })
})
