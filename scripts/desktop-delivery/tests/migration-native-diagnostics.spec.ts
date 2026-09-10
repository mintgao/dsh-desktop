/** Failure diagnostics preserve acquired observations before transport teardown. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, it } from 'vitest'
import { migrationAbortReason } from '../migration-debugger.ts'

const source = readFileSync(new URL('../migration-native.ts', import.meta.url), 'utf8')
const syntax = ts.createSourceFile('native.ts', source, ts.ScriptTarget.Latest, true)
const owner = syntax.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'executeMigrationNative')
assert.ok(owner && ts.isFunctionDeclaration(owner))
const cleanup = owner.body?.statements.find(ts.isTryStatement)?.finallyBlock
assert.ok(cleanup)

it.each([false, true])('retains acquired state before cleanup even when diagnostics fail to write: %s', async (writeFails) => {
  const controller = new AbortController()
  controller.abort(new Error('Native stdout exceeds fixture limit'))
  const operations = [{ operation: 'send Runtime.evaluate', state: 'aborted' }]
  const acquired = { pauseReason: 'Break on start', ready: { ready: true, url: 'http://127.0.0.1:1234/' } }
  const writes = new Map<string, string>()
  const order: string[] = []
  const finalize = runInNewContext(ts.transpileModule(`(async()=>${cleanup.getText(syntax)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    join, controller, migrationAbortReason, phase: 'visitor-actions', acquired,
    root: '/synthetic-owned-root', timer: undefined, clearTimeout, setTimeout,
    debuggerConnection: { diagnostics: () => operations.map(value => ({ ...value })), async close() { order.push('close'); operations.length = 0 } },
    child: {}, closed: Promise.resolve([0, null]), stdout: '', stderr: '',
    writeFileSync(path: string, bytes: string) {
      order.push(path)
      if (writeFails && path.endsWith('inspector-diagnostics.json')) throw new Error('Diagnostic filesystem refusal')
      writes.set(path, bytes)
    },
  }) as () => Promise<void>
  const original = new Error('Original native failure')
  await expect((async () => { try { throw original } finally { await finalize() } })()).rejects.toBe(original)
  expect(order[0]).toBe('/synthetic-owned-root/inspector-diagnostics.json')
  expect(order).toContain('close')
  expect(writes.has('/synthetic-owned-root/stderr.log')).toBe(true)
  if (!writeFails) {
    expect(JSON.parse(writes.get('/synthetic-owned-root/inspector-diagnostics.json')!)).toEqual({
      qualification: false, phase: 'visitor-actions', acquired,
      operations: [{ operation: 'send Runtime.evaluate', state: 'aborted' }], abortReason: 'Native stdout exceeds fixture limit',
    })
  }
})

it('redacts cancellation reasons outside the fixture-owned vocabulary', () => {
  const controller = new AbortController()
  controller.abort(new Error('synthetic-secret'))
  expect(migrationAbortReason(controller.signal)).toBe('Unrecognized cancellation reason (redacted)')
})
