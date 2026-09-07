import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const validator = resolve(root, 'scripts/upstream-adoption/signing_payload.py')
const python = '/usr/bin/python3'
const CHILD_TIMEOUT_MS = 60_000
const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('manifest-bound signing payload', () => {
  it('round-trips only the exact regular files and confined symlinks in the manifest', { timeout: 90_000 }, () => {
    const fixture = payloadFixture()
    const output = join(fixture.directory, 'output')

    createManifest(fixture)
    expectChildSuccess(runChild(python, [
      validator,
      'verify-extract',
      '--artifact-dir', fixture.artifacts,
      '--archive', fixture.archive,
      '--manifest', fixture.manifest,
      '--output', output,
      '--architecture', 'arm64',
      '--source-commit', 'a'.repeat(40),
    ]))

    expect(readFileSync(join(output, 'DSH Desktop.app/Contents/MacOS/dsh'), 'utf8')).toBe('payload\n')
  })

  it('rejects a symlink whose target escapes the application bundle', { timeout: 90_000 }, () => {
    const fixture = payloadFixture('../../../outside')
    const result = runCreateManifest(fixture)
    const diagnostic = childDiagnostic(result)

    expectChildCompletion(result)
    expect(result.status, diagnostic).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`, diagnostic).toMatch(/escaping symlink target/)
  })

  it('rejects an unexpected file added beside the manifest-bound archive', { timeout: 90_000 }, () => {
    const fixture = payloadFixture()
    createManifest(fixture)
    writeFileSync(join(fixture.artifacts, 'unbound.txt'), 'unexpected\n')
    const result = runChild(python, [
      validator,
      'verify-extract',
      '--artifact-dir', fixture.artifacts,
      '--archive', fixture.archive,
      '--manifest', fixture.manifest,
      '--output', join(fixture.directory, 'output'),
      '--architecture', 'arm64',
      '--source-commit', 'a'.repeat(40),
    ])
    const diagnostic = childDiagnostic(result)

    expectChildCompletion(result)
    expect(result.status, diagnostic).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`, diagnostic).toMatch(/unexpected artifact members/)
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
  directories.push(directory)
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
  expectChildSuccess(runChild('env', [
    'COPYFILE_DISABLE=1',
    'tar',
    '-C', source,
    '-czf', archive,
    'DSH Desktop.app',
  ]))
  return { directory, artifacts, archive, manifest }
}

function createManifest(fixture: Fixture): void {
  expectChildSuccess(runCreateManifest(fixture))
}

function runCreateManifest(fixture: Fixture) {
  return runChild(python, [
    validator,
    'create',
    '--archive', fixture.archive,
    '--manifest', fixture.manifest,
    '--architecture', 'arm64',
    '--source-commit', 'a'.repeat(40),
  ])
}

function runChild(command: string, args: readonly string[]) {
  return spawnSync(command, [...args], {
    encoding: 'utf8',
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: CHILD_TIMEOUT_MS,
  })
}

function childDiagnostic(result: ReturnType<typeof runChild>): string {
  return [
    `error=${result.error?.message ?? 'none'}`,
    `status=${String(result.status)}`,
    `signal=${String(result.signal)}`,
    `stdout=${result.stdout}`,
    `stderr=${result.stderr}`,
  ].join('\n')
}

function expectChildCompletion(result: ReturnType<typeof runChild>): void {
  const diagnostic = childDiagnostic(result)
  expect(result.error, diagnostic).toBeUndefined()
  expect(result.signal, diagnostic).toBeNull()
}

function expectChildSuccess(result: ReturnType<typeof runChild>): void {
  const diagnostic = childDiagnostic(result)
  expectChildCompletion(result)
  expect(result.status, diagnostic).toBe(0)
}
