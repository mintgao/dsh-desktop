/** Inspector barriers stop the actual entrypoint until the fixture releases it. */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { MigrationDebugger } from '../migration-debugger.ts'

it('observes a real entrypoint pause and releases it without replacing application code', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-inspector-'))
  const marker = join(root, 'executed')
  const entry = join(root, 'entry.cjs')
  writeFileSync(entry, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed')\n`)
  const child = spawn(process.execPath, ['--inspect-brk=127.0.0.1:0', entry], { stdio: ['ignore', 'ignore', 'pipe'] })
  const closed = once(child, 'close')
  const deadline = AbortSignal.timeout(4000)
  let connection: MigrationDebugger | undefined
  try {
    const address = await new Promise<string>((resolve, reject) => {
      let stderr = ''
      const abort = (): void => { reject(new Error('Inspector endpoint deadline exceeded')) }
      deadline.addEventListener('abort', abort, { once: true })
      child.stderr.on('data', (bytes: Buffer) => {
        stderr += bytes.toString()
        const match = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/u.exec(stderr)
        if (match?.[1] !== undefined) { deadline.removeEventListener('abort', abort); resolve(match[1]) }
      })
      child.once('error', reject)
      child.once('close', (code) => { deadline.removeEventListener('abort', abort); reject(new Error(`Inspector child exited ${code}: ${stderr}`)) })
    })
    connection = await MigrationDebugger.connect(address, deadline)
    await connection.send('Debugger.enable', {}, deadline)
    await connection.send('Runtime.runIfWaitingForDebugger', {}, deadline)
    const paused = await connection.event('Debugger.paused', deadline)
    expect(paused['reason']).toBe('Break on start')
    expect(existsSync(marker)).toBe(false)
    const value = await connection.send('Runtime.evaluate', { expression: 'process.pid', returnByValue: true }, deadline)
    expect(value).toMatchObject({ result: { value: child.pid } })
    await connection.send('Debugger.resume', {}, deadline)
    await connection.close()
    connection = undefined
    expect(await closed).toEqual([0, null])
    expect(existsSync(marker)).toBe(true)
  } finally {
    await connection?.close()
    if (child.exitCode === null) child.kill('SIGKILL')
    await closed
    rmSync(root, { recursive: true, force: true })
  }
})
