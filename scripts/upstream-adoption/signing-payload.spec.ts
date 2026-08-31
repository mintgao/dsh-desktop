import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const validator = resolve(root, 'scripts/upstream-adoption/signing_payload.py')
const python = '/usr/bin/python3'

describe('manifest-bound signing payload', () => {
  it('round-trips only the exact regular files and confined symlinks in the manifest', () => {
    const fixture = payloadFixture()
    const output = join(fixture.directory, 'output')

    createManifest(fixture)
    execFileSync(python, [
      validator,
      'verify-extract',
      '--artifact-dir', fixture.artifacts,
      '--archive', fixture.archive,
      '--manifest', fixture.manifest,
      '--output', output,
      '--architecture', 'arm64',
      '--source-commit', 'a'.repeat(40),
    ])

    expect(readFileSync(join(output, 'DSH Desktop.app/Contents/MacOS/dsh'), 'utf8')).toBe('payload\n')
  })

  it('rejects a symlink whose target escapes the application bundle', () => {
    const fixture = payloadFixture('../../../outside')

    expect(() => {
      createManifest(fixture)
    }).toThrow(/escaping symlink target/)
  })

  it('rejects an unexpected file added beside the manifest-bound archive', () => {
    const fixture = payloadFixture()
    createManifest(fixture)
    writeFileSync(join(fixture.artifacts, 'unbound.txt'), 'unexpected\n')

    expect(() => execFileSync(python, [
      validator,
      'verify-extract',
      '--artifact-dir', fixture.artifacts,
      '--archive', fixture.archive,
      '--manifest', fixture.manifest,
      '--output', join(fixture.directory, 'output'),
      '--architecture', 'arm64',
      '--source-commit', 'a'.repeat(40),
    ], { stdio: 'pipe' })).toThrow(/unexpected artifact members/)
  })
})

interface Fixture {
  readonly directory: string
  readonly artifacts: string
  readonly archive: string
  readonly manifest: string
}

function payloadFixture(linkTarget = 'A'): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-signing-payload-'))
  const source = join(directory, 'source')
  const artifacts = join(directory, 'artifacts')
  const app = join(source, 'DSH Desktop.app')
  mkdirSync(join(app, 'Contents/MacOS'), { recursive: true })
  mkdirSync(join(app, 'Contents/Versions/A'), { recursive: true })
  writeFileSync(join(app, 'Contents/MacOS/dsh'), 'payload\n', { mode: 0o755 })
  symlinkSync(linkTarget, join(app, 'Contents/Versions/Current'))
  mkdirSync(artifacts)
  const archive = join(artifacts, 'unsigned-app-arm64.tar.gz')
  const manifest = join(artifacts, 'unsigned-app-arm64.manifest.json')
  execFileSync('env', ['COPYFILE_DISABLE=1', 'tar', '-C', source, '-czf', archive, 'DSH Desktop.app'])
  return { directory, artifacts, archive, manifest }
}

function createManifest(fixture: Fixture): void {
  execFileSync(python, [
    validator,
    'create',
    '--archive', fixture.archive,
    '--manifest', fixture.manifest,
    '--architecture', 'arm64',
    '--source-commit', 'a'.repeat(40),
  ], { stdio: 'pipe' })
}
