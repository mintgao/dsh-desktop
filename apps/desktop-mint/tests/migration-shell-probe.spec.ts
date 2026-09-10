/** Exercise the observer's requests with the real collector; no packaged qualification is claimed. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { OutputCollector } from '../../../packages/subprocess/subprocess-local/src/spawn.ts'

const source = readFileSync(new URL('../../../scripts/desktop-delivery/fixtures/migration-agent-observer.mjs', import.meta.url), 'utf8')
const syntax = ts.createSourceFile('observer.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const declaration = syntax.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'shellSettings')
assert.ok(declaration, 'The regression must execute the actual observer function')

function collect(text: string, maxBytes: number) {
  // Spilling is disabled: this collector acquires no files or other host resources.
  const collector = new OutputCollector(maxBytes, undefined, 'pwd-probe', '')
  collector.push(Buffer.from(text))
  return collector.finalize()
}

for (const cwd of ['/private/var/runner/' + 'workspace-'.repeat(10), '/private/var/runner/' + '工作目录'.repeat(12)]) {
  it.each(['populate', 'upgrade'])('keeps the full cwd in %s without changing the small overflow limit', async (stage) => {
    const cap = stage === 'populate' ? 64 : 80
    const full = `${cwd}\n`
    expect(Buffer.byteLength(full)).toBeGreaterThan(cap)
    const old = collect(full, cap)
    expect(old.truncated).toBe(true)
    expect(() => { assert.equal(old.text.trim(), cwd) }).toThrow()

    let settings = { cwd, timeoutMs: 5000, maxTimeoutMs: 10000, maxOutputBytes: 64 }
    const prior = { shell: { settings: { ...settings } } }
    const run = runInNewContext(`(${declaration.getText(syntax)})`, {
      assert, Buffer, join, process: { cwd: () => cwd, env: { DSH_HOME: '/synthetic-not-accessed' } },
      readFileSync: () => Buffer.from(JSON.stringify(settings)),
      sha256: (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex'),
    }) as (ctx: object, stage: string, prior: object) => Promise<Record<string, unknown>>
    const requests: Array<{ command: string; stdoutMaxBytes: number }> = []
    const result = await run({
      settings: {
        get: () => settings,
        async update(_namespace: string, next: typeof settings) {
          if (next.timeoutMs === 0 || 'graceMs' in next) throw new Error('Invalid fixture settings')
          settings = { ...next }
        },
      },
      shell: {
        resolve(request: { command: string; stdoutMaxBytes?: number; timeoutMs?: number }) {
          return { ...request, workdir: settings.cwd,
            timeoutMs: Math.min(request.timeoutMs ?? settings.timeoutMs, settings.maxTimeoutMs),
            stdoutMaxBytes: request.stdoutMaxBytes ?? settings.maxOutputBytes }
        },
        run(request: { command: string; stdoutMaxBytes: number }) {
          requests.push(request)
          const overflow = request.command.startsWith('printf')
          return { exitCode: 0, stdout: collect(request.command === 'pwd' ? full : overflow ? 'x'.repeat(256) : '', request.stdoutMaxBytes),
            stderr: collect(overflow ? 'e'.repeat(256) : '', request.stdoutMaxBytes),
            sandbox: { mode: 'workspace-write', denied: false, enforcement: 'unit-only' } }
        },
      },
    }, stage, prior)
    expect(result).toMatchObject({ settings: { maxOutputBytes: cap }, pwdSpec: { stdoutMaxBytes: cap },
      pwd: { stdout: { text: full, truncated: false } },
      output: { stdout: { text: 'x'.repeat(cap), truncated: true }, stderr: { text: 'e'.repeat(cap), truncated: true } } })
    expect(requests.find(request => request.command === 'pwd')?.stdoutMaxBytes).toBe(Buffer.byteLength(full))
    expect(settings.maxOutputBytes).toBe(cap)
  })
}
