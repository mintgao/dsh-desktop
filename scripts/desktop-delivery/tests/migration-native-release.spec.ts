import assert from 'node:assert/strict'
/** The release transport fixture changes only the existing constructor input. */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { MigrationDebugger } from '../migration-debugger.ts'
import { returnedToCaller } from '../migration-native-notifications.ts'
import { NativeReleaseFixture, releaseConstructorLocation } from '../migration-native-release.ts'

it('requires one identifiable release constructor in bundled source', () => {
  expect(releaseConstructorLocation('var GitHubReleaseDriver = class { constructor(options) { this.fetch = options.fetch } }')).toEqual({ lineNumber: 0, columnNumber: 57 })
  expect(() => releaseConstructorLocation('class Unrelated {}')).toThrow(/one release reader/)
  expect(() => releaseConstructorLocation('class GitHubReleaseDriver { constructor() { run() } }; var GitHubReleaseDriver = class { constructor() { run() } }')).toThrow(/one release reader/)
})

it('injects at a real constructor pause and records the exact GET without executing the original transport', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-native-release-'))
  const entry = join(root, 'entry.cjs')
  const output = join(root, 'response.json')
  const source = `process.stdin.resume();
class GitHubReleaseDriver {
  constructor(options) { this.fetch = options.fetch }
}
const driver = new GitHubReleaseDriver({architecture:'arm64',currentVersion:'0.1.2',fetch:()=>{throw new Error('Original transport must not execute')}});
globalThis.done = driver.fetch('https://api.github.com/repos/mintgao/dsh-desktop/releases?per_page=20',{method:'GET',headers:{Accept:'application/vnd.github+json'}})
.then(async response=>{
  const releases=await response.json(),refusals=[];
  for(const [url,method] of [['https://fixture.invalid/not-releases','GET'],['https://api.github.com/repos/mintgao/dsh-desktop/releases?per_page=20','POST']]) {
    try {await driver.fetch(url,{method});refusals.push('unexpected success')}
    catch(error) {refusals.push(error.message)}
  }
  require('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify({releases,refusals}));
  process.stdout.write('transport-complete\\n');
});
`
  writeFileSync(entry, source)
  const child = spawn(process.execPath, ['--inspect-brk=127.0.0.1:0', entry], { stdio: ['pipe', 'pipe', 'pipe'] })
  const closed = once(child, 'close')
  const signal = AbortSignal.timeout(4000)
  let connection: MigrationDebugger | undefined
  let stderr = ''
  const protocol: string[] = []
  try {
    const address = await new Promise<string>((resolve, reject) => {
      const abort = (): void => { reject(new Error('Release inspector endpoint deadline')) }
      signal.addEventListener('abort', abort, { once: true })
      child.stderr.on('data', (bytes: Buffer) => {
        stderr += bytes.toString()
        const match = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/u.exec(stderr)
        if (match?.[1] !== undefined) { signal.removeEventListener('abort', abort); resolve(match[1]) }
      })
      child.once('error', reject)
      child.once('close', (code) => { signal.removeEventListener('abort', abort); reject(new Error(`Inspector exited ${code}: ${stderr}`)) })
    })
    connection = await MigrationDebugger.connect(address, signal)
    const send = connection.send.bind(connection)
    connection.send = async (method, parameters, cancellation) => {
      protocol.push(`start ${method}`)
      try {
        const result = await send(method, parameters, cancellation)
        protocol.push(`done ${method} ${JSON.stringify(result)}`)
        return result
      } catch (error) { protocol.push(`error ${method} ${String(error)}`); throw error }
    }
    await connection.send('Debugger.enable', {}, signal)
    await connection.send('Runtime.runIfWaitingForDebugger', {}, signal)
    const pause = await connection.event('Debugger.paused', signal)
    const frames = pause['callFrames'] as { location: { scriptId: string } }[]
    assert.ok(frames[0])
    const fixture = new NativeReleaseFixture()
    await fixture.install(connection, { scriptId: frames[0].location.scriptId, source }, 'arm64', signal)
    const completed = new Promise<void>((resolve, reject) => {
      const abort = (): void => { reject(new Error('Transport completion deadline')) }
      signal.addEventListener('abort', abort, { once: true })
      child.stdout.once('data', (bytes: Buffer) => {
        signal.removeEventListener('abort', abort)
        if (bytes.toString() === 'transport-complete\n') resolve()
        else reject(new Error(`Unexpected transport output: ${bytes.toString()}`))
      })
      child.once('close', (code) => { signal.removeEventListener('abort', abort); reject(new Error(`Transport child exited ${code}: ${stderr}`)) })
    })
    await connection.send('Debugger.resume', {}, signal)
    await completed
    const receipt = await fixture.observe(connection, signal)
    expect(receipt).toMatchObject({ installation: { installed: true, architecture: 'arm64' }, observed: { status: 200, requests: [{ method: 'GET' }] } })
    await connection.close()
    connection = undefined
    child.stdin.end()
    expect(await closed).toEqual([0, null])
    expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({ releases: [{ tag_name: 'desktop-v9.9.9' }],
      refusals: ['Unexpected release fixture request', 'Unexpected release fixture request'] })
  } catch (error) {
    throw new Error(`Release inspector fixture failed: ${String(error)}\n${stderr}\n${protocol.join('\n')}`, { cause: error })
  } finally {
    await connection?.close()
    if (child.exitCode === null) child.kill('SIGKILL')
    await closed
    rmSync(root, { recursive: true, force: true })
  }
})

it('attributes real step-out to its caller and refuses unrelated pauses', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-notification-step-'))
  const entry = join(root, 'entry.cjs')
  writeFileSync(entry, `process.stdin.resume();
function notify(){ debugger; return false }
function caller(){ const value=notify(); globalThis.result=value }
caller();
`)
  const child = spawn(process.execPath, ['--inspect-brk=127.0.0.1:0', entry], { stdio: ['pipe', 'pipe', 'pipe'] })
  const closed = once(child, 'close')
  const signal = AbortSignal.timeout(4000)
  let connection: MigrationDebugger | undefined
  let stderr = ''
  try {
    const address = await new Promise<string>((resolve, reject) => {
      const abort = (): void => { reject(new Error('Notification inspector endpoint deadline')) }
      signal.addEventListener('abort', abort, { once: true })
      child.stderr.on('data', (bytes: Buffer) => {
        stderr += bytes.toString()
        const match = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/u.exec(stderr)
        if (match?.[1]) { signal.removeEventListener('abort', abort); resolve(match[1]) }
      })
      child.once('error', reject)
      child.once('close', () => { signal.removeEventListener('abort', abort); reject(new Error(stderr)) })
    })
    connection = await MigrationDebugger.connect(address, signal)
    await connection.send('Debugger.enable', {}, signal)
    await connection.send('Runtime.runIfWaitingForDebugger', {}, signal)
    await connection.event('Debugger.paused', signal)
    await connection.send('Debugger.resume', {}, signal)
    const paused = await connection.event('Debugger.paused', signal)
    assert.ok(Array.isArray(paused['callFrames']))
    const callers = paused['callFrames'].slice(1)
    await connection.send('Debugger.stepOut', {}, signal)
    const returned = await connection.event('Debugger.paused', signal)
    returnedToCaller(returned, callers)
    expect(() => returnedToCaller({ ...returned, reason: 'exception' }, callers)).toThrow()
    expect(() => returnedToCaller({ ...returned, hitBreakpoints: ['unrelated'] }, callers)).toThrow()
    expect(() => returnedToCaller(returned, callers.slice(1))).toThrow()
    await connection.send('Debugger.resume', {}, signal)
    await connection.close()
    connection = undefined
    child.stdin.end()
    expect(await closed).toEqual([0, null])
  } finally {
    await connection?.close()
    if (child.exitCode === null) child.kill('SIGKILL')
    await closed
    rmSync(root, { recursive: true, force: true })
  }
})
