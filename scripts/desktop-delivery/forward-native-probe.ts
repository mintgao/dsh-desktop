/** Bounded ordinary-entry capability experiment; receipts never qualify an update. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { constants, tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeAccessibilityPreflight, nativeOrdinaryQuit, nativeRenderedOnboarding } from './migration-native-menu.ts'

const execute = promisify(execFile)
/** Observed process identity from the native process table. */
export interface ProbeProcess { pid: number; executable: string }
/** Narrow experiment operations, with cancellation including subprocess completion. */
export interface ProbeDriver {
  launch(signal: AbortSignal): Promise<void>
  processes(signal: AbortSignal): Promise<ProbeProcess[]>
  preflight(pid: number, signal: AbortSignal): Promise<string>
  rendered(pid: number, signal: AbortSignal): Promise<string>
  quit(pid: number, signal: AbortSignal): Promise<string>
  stop(process: ProbeProcess, signal: AbortSignal): Promise<void>
}
type ProbeOperation = 'process-inventory' | 'launch' | 'process-identity' | 'accessibility-preflight' | 'accessibility-rendered' | 'ordinary-quit' | 'owned-process-stop' | 'poll'
type FailureCategory = 'operation-error' | 'process-inventory-error' | 'process-missing' | 'process-replaced' | 'process-not-unique' | 'already-running' | 'subprocess-error' | 'subprocess-timeout' | 'unexpected-output' | 'deadline'
/** Last inventory observation; stale means a subsequent operation could have changed it. */
export interface ProbeMainPresence {
  freshness: 'unknown' | 'fresh' | 'stale'
  count?: number
  expectedPid?: number
  expectedIdentity?: 'present' | 'missing' | 'replaced'
}
/** Fixed failure fields exclude error text, process paths and subprocess output. */
export interface ProbeFailureDetails {
  operation: ProbeOperation
  category: FailureCategory
  subprocess?: { exitCode?: number; signal?: NodeJS.Signals; timeout: true | 'unknown' }
  mainPresence: ProbeMainPresence
}

function subprocessFailure(error: unknown): ProbeFailureDetails['subprocess'] {
  if (!(error instanceof Error)) return undefined
  const value = error as Error & { code?: unknown; signal?: unknown; killed?: unknown }
  const exitCode = typeof value.code === 'number' && Number.isSafeInteger(value.code) ? value.code : undefined
  const signal = typeof value.signal === 'string' && Object.hasOwn(constants.signals, value.signal) ? value.signal as NodeJS.Signals : undefined
  if (exitCode === undefined && signal === undefined && !(typeof value.code === 'string' && ['ERR_CHILD_PROCESS_STDIO_MAXBUFFER', 'ABORT_ERR', 'ENOENT', 'EACCES'].includes(value.code))) return undefined
  // execFile's fixed timeout kills with SIGTERM; maxBuffer failures carry a string code.
  const timeout = value.killed === true && value.code === null && signal === 'SIGTERM' ? true : 'unknown'
  return { ...(exitCode === undefined ? {} : { exitCode }), ...(signal === undefined ? {} : { signal }), timeout }
}

/** Capability observations contain no raw logs, profiles or credentials. */
export interface ProbeResult {
  purpose: 'desktop-forward-native-capability'
  qualificationEligible: false
  launchMode: 'LaunchServices'
  state: 'observed' | 'blocked'
  firstFailure?: string
  failureDetails?: ProbeFailureDetails
  cycles: { pid: number; rendered: string; quit: boolean }[]
  cleanup: { stopped: boolean; failure?: string; launchCompletionUnknown?: true; containment?: 'disposable-runner-teardown' }
}

/** Parse native process identities without admitting malformed PIDs.
 * @param output - ps pid and executable columns, with unlimited width.
 * @returns Exact process paths; arguments are not parsed as identity.
 */
export function probeProcesses(output: string): ProbeProcess[] {
  return output.split('\n').filter(line => line.trim()).map((line) => {
    const match = /^\s*([1-9][0-9]*)\s+(.+)$/u.exec(line)
    if (!match?.[1] || !match[2] || !Number.isSafeInteger(Number(match[1]))) throw new Error('Invalid native process identity')
    return { pid: Number(match[1]), executable: match[2] }
  })
}

/** Run two ordinary-entry observations with 30 seconds reserved for owned-process cleanup.
 * @param app - Unique private copied application path.
 * @param driver - Native operations; each honors its cancellation signal.
 * @param timeoutMs - Fixed 120-second experiment bound.
 * @returns Observation or blocked receipt, preserving the first failed phase.
 */
export async function runForwardProbe(app: string, driver: ProbeDriver, timeoutMs = 120_000): Promise<ProbeResult> {
  if (timeoutMs !== 120_000) throw new Error('Probe requires the fixed 120000 ms deadline')
  const result: ProbeResult = { purpose: 'desktop-forward-native-capability', qualificationEligible: false,
    launchMode: 'LaunchServices', state: 'blocked', cycles: [], cleanup: { stopped: false } }
  const work = AbortSignal.timeout(timeoutMs - 30_000)
  const cleanup = AbortSignal.timeout(timeoutMs)
  const main = join(app, 'Contents/MacOS/DSH Desktop')
  const owned = (entry: ProbeProcess) => entry.executable.startsWith(`${app}/Contents/`)
  let phase = 'initial-launch'
  let launchCompletionUnknown = false
  let operation: ProbeOperation = 'process-inventory'
  let category: FailureCategory | undefined
  let presence: ProbeMainPresence = { freshness: 'unknown' }
  let expectedPid: number | undefined
  const call = async <T>(name: ProbeOperation, action: () => Promise<T>): Promise<T> => {
    operation = name
    category = undefined
    if (presence.freshness === 'fresh') presence = { ...presence, freshness: 'stale' }
    return action()
  }
  const inventory = async (signal: AbortSignal): Promise<ProbeProcess[]> => {
    const entries = await call('process-inventory', () => driver.processes(signal))
    const expected = entries.find(entry => entry.pid === expectedPid)
    presence = { freshness: 'fresh', count: entries.filter(entry => entry.executable === main).length,
      ...(expectedPid === undefined ? {} : { expectedPid, expectedIdentity: expected === undefined ? 'missing' : expected.executable === main ? 'present' : 'replaced' }) }
    return entries
  }
  const refuse = (reason: FailureCategory): never => { category = reason; throw new Error(reason) }
  const details = (error: unknown, signal: AbortSignal): ProbeFailureDetails => {
    const subprocess = subprocessFailure(error)
    return { operation, category: signal.aborted ? 'deadline' : category ?? (operation === 'process-inventory' ? 'process-inventory-error'
      : subprocess?.timeout === true ? 'subprocess-timeout' : subprocess ? 'subprocess-error' : 'operation-error'),
    ...(subprocess === undefined ? {} : { subprocess }), mainPresence: { ...presence } }
  }
  const verify = async (pid: number, signal: AbortSignal): Promise<void> => {
    const entries = await inventory(signal)
    operation = 'process-identity'
    const current = entries.find(entry => entry.pid === pid)
    if (!current) refuse('process-missing')
    if (current?.executable !== main) refuse('process-replaced')
  }
  const wait = async <T>(observe: () => Promise<T | undefined>, signal: AbortSignal): Promise<T> => {
    for (;;) {
      signal.throwIfAborted()
      const value = await observe()
      if (value !== undefined) return value
      await call('poll', () => delay(100, undefined, { signal }))
    }
  }
  try {
    if ((await inventory(work)).some(owned)) refuse('already-running')
    for (const cycle of ['initial', 'reopen']) {
      phase = `${cycle}-launch`
      launchCompletionUnknown = true
      await call('launch', () => driver.launch(work))
      const pid = await wait(async () => {
        const matches = (await inventory(work)).filter(entry => entry.executable === main)
        if (matches.length > 1) refuse('process-not-unique')
        return matches[0]?.pid
      }, work)
      expectedPid = pid
      launchCompletionUnknown = false
      phase = `${cycle}-accessibility`
      await verify(pid, work)
      await call('accessibility-preflight', () => driver.preflight(pid, work))
      phase = `${cycle}-rendered-window`
      const rendered = await wait(async () => {
        await verify(pid, work)
        const observation = await call('accessibility-rendered', () => driver.rendered(pid, work))
        if (observation === 'absent') return undefined
        if (!observation.startsWith('rendered\tAX')) refuse('unexpected-output')
        return observation
      }, work)
      const observation = { pid, rendered, quit: false }
      result.cycles.push(observation)
      phase = `${cycle}-ordinary-quit`
      await verify(pid, work)
      if (await call('ordinary-quit', () => driver.quit(pid, work)) !== 'ordinary-menu-quit') refuse('unexpected-output')
      await wait(async () => (await inventory(work)).some(owned) ? undefined : true, work)
      observation.quit = true
    }
    result.state = 'observed'
  } catch (error) {
    result.failureDetails = details(error, work)
    result.firstFailure = `${phase}:${work.aborted ? 'deadline' : 'refused'}`
  } finally {
    try {
      await wait(async () => {
        const remaining = (await inventory(cleanup)).filter(owned)
        for (const entry of remaining) {
          const current = (await inventory(cleanup)).find(value => value.pid === entry.pid)
          if (current?.executable === entry.executable) await call('owned-process-stop', () => driver.stop(entry, cleanup))
        }
        return (await inventory(cleanup)).some(owned) ? undefined : true
      }, cleanup)
      result.cleanup.stopped = !launchCompletionUnknown
    } catch (error) {
      result.failureDetails ??= details(error, cleanup)
      result.cleanup.failure = cleanup.aborted ? 'deadline' : 'identity-or-termination-refused'
      result.firstFailure ??= 'cleanup:refused'
      result.state = 'blocked'
    }
    if (launchCompletionUnknown) {
      result.cleanup.launchCompletionUnknown = true
      result.cleanup.containment = 'disposable-runner-teardown'
      result.cleanup.failure ??= 'launch-completion-unknown'
      result.cleanup.stopped = false
      result.state = 'blocked'
    }
  }
  return result
}

/** Create a hosted-only driver with private roots and no inherited application credentials.
 * @param app - Authenticated unique copied app.
 * @returns Driver, declared roots and removal operation restricted to stopped experiments.
 */
export function hostedProbeDriver(app: string): { driver: ProbeDriver; roots: Record<string, string>; dispose(): void } {
  if (process.platform !== 'darwin' || process.arch !== 'x64' || process.env.GITHUB_ACTIONS !== 'true'
    || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw new Error('Probe requires native hosted x64 macOS')
  if (Object.keys(process.env).some(key => /(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)/u.test(key))) throw new Error('Probe environment contains credentials')
  const root = mkdtempSync(join(tmpdir(), 'dsh-forward-probe-'))
  const roots = { home: join(root, 'home'), agents: join(root, 'agents'), workspace: join(root, 'workspace'),
    tmp: join(root, 'tmp'), userData: join(root, 'userData'), dsh: join(root, 'dsh') }
  for (const path of Object.values(roots)) mkdirSync(path, { mode: 0o700 })
  const env = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: roots.home, CFFIXED_USER_HOME: roots.home,
    DSH_HOME: roots.dsh, DSH_AGENTS_HOME: roots.agents, TMPDIR: roots.tmp, MAC_CHROMIUM_TMPDIR: roots.tmp, SSH_AUTH_SOCK: '', DSH_TELEMETRY_DISABLED: '1' }
  const table = async (signal: AbortSignal) => probeProcesses((await execute('/bin/ps', ['-ww', '-axo', 'pid=,comm='], { signal, timeout: 5000 })).stdout)
  const driver: ProbeDriver = {
    async launch(signal) {
      await execute('/usr/bin/open', ['-n', '-a', app, ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
        '--args', `--user-data-dir=${roots.userData}`, roots.workspace], { env, cwd: roots.workspace, signal, timeout: 10_000 })
    },
    processes: table,
    preflight: nativeAccessibilityPreflight,
    rendered: nativeRenderedOnboarding,
    quit: nativeOrdinaryQuit,
    async stop(entry, signal) {
      signal.throwIfAborted()
      if (!(await table(signal)).some(current => current.pid === entry.pid && current.executable === entry.executable)) throw new Error('Cleanup identity changed')
      try { process.kill(entry.pid, 'SIGKILL') } catch (error) {
        // ESRCH means this verified process exited between observation and termination.
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    },
  }
  return { driver, roots: { data: root, ...roots }, dispose: () => { rmSync(root, { recursive: true }) } }
}
