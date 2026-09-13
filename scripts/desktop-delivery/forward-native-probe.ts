/** Bounded ordinary-entry capability experiment; receipts never qualify an update. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
/** Capability observations contain no raw logs, profiles or credentials. */
export interface ProbeResult {
  purpose: 'desktop-forward-native-capability'
  qualificationEligible: false
  launchMode: 'LaunchServices'
  state: 'observed' | 'blocked'
  firstFailure?: string
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
  const verify = async (pid: number, signal: AbortSignal): Promise<void> => {
    if (!(await driver.processes(signal)).some(entry => entry.pid === pid && entry.executable === main)) throw new Error('Native executable identity differs')
  }
  const wait = async <T>(observe: () => Promise<T | undefined>, signal: AbortSignal): Promise<T> => {
    for (;;) {
      signal.throwIfAborted()
      const value = await observe()
      if (value !== undefined) return value
      await delay(100, undefined, { signal })
    }
  }
  try {
    if ((await driver.processes(work)).some(owned)) throw new Error('Private application already running')
    for (const cycle of ['initial', 'reopen']) {
      phase = `${cycle}-launch`
      launchCompletionUnknown = true
      await driver.launch(work)
      const pid = await wait(async () => {
        const matches = (await driver.processes(work)).filter(entry => entry.executable === main)
        if (matches.length > 1) throw new Error('Native main process is not unique')
        return matches[0]?.pid
      }, work)
      launchCompletionUnknown = false
      phase = `${cycle}-accessibility`
      await verify(pid, work)
      await driver.preflight(pid, work)
      phase = `${cycle}-rendered-window`
      const rendered = await wait(async () => {
        await verify(pid, work)
        const observation = await driver.rendered(pid, work)
        if (observation === 'absent') return undefined
        if (!observation.startsWith('rendered\tAX')) throw new Error('Unexpected rendered observation')
        return observation
      }, work)
      const observation = { pid, rendered, quit: false }
      result.cycles.push(observation)
      phase = `${cycle}-ordinary-quit`
      await verify(pid, work)
      if (await driver.quit(pid, work) !== 'ordinary-menu-quit') throw new Error('Ordinary Quit was not observed')
      await wait(async () => (await driver.processes(work)).some(owned) ? undefined : true, work)
      observation.quit = true
    }
    result.state = 'observed'
  } catch {
    result.firstFailure = `${phase}:${work.aborted ? 'deadline' : 'refused'}`
  } finally {
    try {
      await wait(async () => {
        const remaining = (await driver.processes(cleanup)).filter(owned)
        for (const entry of remaining) {
          const current = (await driver.processes(cleanup)).find(value => value.pid === entry.pid)
          if (current?.executable === entry.executable) await driver.stop(entry, cleanup)
        }
        return (await driver.processes(cleanup)).some(owned) ? undefined : true
      }, cleanup)
      result.cleanup.stopped = !launchCompletionUnknown
    } catch {
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
