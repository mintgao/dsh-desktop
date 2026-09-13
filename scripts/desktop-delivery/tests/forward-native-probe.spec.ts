/** Native capability tests observe refusal, ordinary quit and cleanup independently. */
import { readFileSync } from 'node:fs'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { expect, it, vi } from 'vitest'
import { forwardProbeSpec, verifyProbeBytes, verifyProbeOrigin } from '../forward-native-probe-input.ts'
import { probeProcesses, runForwardProbe, type ProbeDriver, type ProbeProcess } from '../forward-native-probe.ts'

const app = '/private/probe/DSH Desktop.app'
const main = `${app}/Contents/MacOS/DSH Desktop`
const spec = JSON.parse(readFileSync('.github/desktop-delivery/forward-probe-x64.json', 'utf8')) as Record<string, unknown>
function fixture(): { driver: ProbeDriver; live: ProbeProcess[]; actions: string[] } {
  const live: ProbeProcess[] = []
  const actions: string[] = []
  let pid = 100
  return { live, actions, driver: {
    async launch() { actions.push('launch'); live.push({ pid: ++pid, executable: main }) },
    async processes() { return live.map(entry => ({ ...entry })) },
    async preflight() { actions.push('preflight'); return 'identity' },
    async rendered() { actions.push('rendered'); return 'rendered\tAXStaticText\tInternal Testing Notice' },
    async quit() { actions.push('quit'); live.length = 0; return 'ordinary-menu-quit' },
    async stop(entry) { actions.push(`stop:${entry.pid}`); live.splice(live.findIndex(value => value.pid === entry.pid), 1) },
  } }
}
it('refuses substituted architectures, origins, missing pins and corrupted bytes', () => {
  expect(forwardProbeSpec(spec).architecture).toBe('x64')
  for (const patch of [{ architecture: 'arm64' }, { repositoryId: 1 }, { sourceCommit: '' }, { candidate: {} }, { runAttempt: 0 }]) {
    expect(() => forwardProbeSpec({ ...spec, ...patch })).toThrow()
  }
  expect(() => { verifyProbeBytes(Buffer.from('corrupt'), forwardProbeSpec(spec).archive) }).toThrow('bytes differ')
})
it('parses exact executable paths with spaces and rejects ambiguous process records', () => {
  expect(probeProcesses(` 101 ${main}\n 1 launchd\n`)).toEqual([{ pid: 101, executable: main }, { pid: 1, executable: 'launchd' }])
  expect(() => probeProcesses('0 /other')).toThrow('Invalid')
})
it('observes rendered windows and ordinary quit on both normal entries', async () => {
  const fixture = makeFixture()
  const result = await runForwardProbe(app, fixture.driver)
  expect(result).toMatchObject({ state: 'observed', qualificationEligible: false, cleanup: { stopped: true } })
  expect(result.cycles.map(value => value.quit)).toEqual([true, true])
  expect(fixture.actions).toEqual(['launch', 'preflight', 'rendered', 'quit', 'launch', 'preflight', 'rendered', 'quit'])
})
const makeFixture = fixture
it('preserves the first observation refusal when cleanup also fails', async () => {
  const state = fixture()
  state.driver.rendered = async () => { throw new Error('AX denied') }
  state.driver.stop = async () => { throw new Error('cannot terminate') }
  const result = await runForwardProbe(app, state.driver)
  expect(result).toMatchObject({ state: 'blocked', firstFailure: 'initial-rendered-window:refused', cleanup: { stopped: false, failure: 'identity-or-termination-refused' } })
})
it('refuses changed PID identity before an Accessibility action and never kills its replacement', async () => {
  const state = fixture()
  state.driver.preflight = async () => { state.live[0]!.executable = '/unrelated/app'; return 'identity' }
  const result = await runForwardProbe(app, state.driver)
  expect(result.firstFailure).toBe('initial-rendered-window:refused')
  expect(state.actions).not.toContain('rendered')
  expect(state.actions.some(action => action.startsWith('stop:'))).toBe(false)
  expect(state.live[0]?.executable).toBe('/unrelated/app')
})
it('cleans up owned backend processes after an observation refusal', async () => {
  const state = fixture()
  state.driver.rendered = async () => {
    state.live.push({ pid: 202, executable: `${app}/Contents/Resources/node` }, { pid: 303, executable: '/other/node' })
    throw new Error('no rendered content')
  }
  const result = await runForwardProbe(app, state.driver)
  expect(result.cleanup.stopped).toBe(true)
  expect(state.live).toEqual([{ pid: 303, executable: '/other/node' }])
  expect(state.actions).toContain('stop:202')
})
it('reserves cleanup after the work deadline and does not retry launch', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  const work = new AbortController()
  const cleanup = new AbortController()
  timeout.mockReturnValueOnce(work.signal).mockReturnValueOnce(cleanup.signal)
  try {
    const state = fixture()
    state.driver.rendered = async () => { work.abort(); work.signal.throwIfAborted(); return 'absent' }
    const result = await runForwardProbe(app, state.driver)
    expect(timeout.mock.calls).toEqual([[90000], [120000]])
    expect(result).toMatchObject({ firstFailure: 'initial-rendered-window:deadline', cleanup: { stopped: true } })
    expect(state.actions.filter(action => action === 'launch')).toHaveLength(1)
    expect(cleanup.signal.aborted).toBe(false)
  } finally { timeout.mockRestore() }
})
it('reports exhausted cleanup without replacing the initial failure', async () => {
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  const work = new AbortController()
  const cleanup = new AbortController()
  timeout.mockReturnValueOnce(work.signal).mockReturnValueOnce(cleanup.signal)
  try {
    const state = fixture()
    state.driver.rendered = async () => { throw new Error('AX denied') }
    state.driver.processes = async (signal) => {
      if (signal === cleanup.signal) cleanup.abort()
      signal.throwIfAborted()
      return state.live
    }
    const result = await runForwardProbe(app, state.driver)
    expect(result).toMatchObject({ firstFailure: 'initial-rendered-window:refused', cleanup: { stopped: false, failure: 'deadline' } })
  } finally { timeout.mockRestore() }
})
it('refuses altered experiment deadline before launch', async () => {
  const state = fixture()
  await expect(runForwardProbe(app, state.driver, 120001)).rejects.toThrow('fixed')
  expect(state.actions).toEqual([])
})

it('refuses substituted run attempts and expired or foreign retained artifacts', () => {
  const selected = forwardProbeSpec(spec)
  const repository = { id: selected.repositoryId }
  const run = { id: selected.runId, run_attempt: selected.runAttempt, head_sha: selected.sourceCommit,
    path: selected.workflow, status: 'completed' }
  const artifact = { id: selected.artifactId, expired: false, size_in_bytes: selected.archive.size,
    digest: `sha256:${selected.archive.sha256}`, workflow_run: { id: selected.runId } }
  expect(() => { verifyProbeOrigin(selected, repository, run, artifact) }).not.toThrow()
  for (const patch of [{ run_attempt: 2 }, { head_sha: 'f'.repeat(40) }, { status: 'in_progress' }]) {
    expect(() => { verifyProbeOrigin(selected, repository, { ...run, ...patch }, artifact) }).toThrow('origin')
  }
  for (const patch of [{ expired: true }, { workflow_run: { id: 42 } }, { digest: 'sha256:wrong' }]) {
    expect(() => { verifyProbeOrigin(selected, repository, run, { ...artifact, ...patch }) }).toThrow('origin')
  }
})

it('retains uncertain cleanup when a rejected launch activates on the next event-loop turn', async () => {
  const state = fixture()
  let activation: Promise<void> | undefined
  state.driver.launch = async () => {
    activation = nextTurn().then(() => { state.live.push({ pid: 100, executable: main }) })
    throw new Error('open refused after handing activation to LaunchServices')
  }
  const result = await runForwardProbe(app, state.driver)
  await activation
  expect(state.live).toEqual([{ pid: 100, executable: main }])
  expect(result).toMatchObject({ state: 'blocked', firstFailure: 'initial-launch:refused', cleanup: {
    stopped: false, failure: 'launch-completion-unknown', launchCompletionUnknown: true, containment: 'disposable-runner-teardown',
  } })
})
it('terminates visible owned processes without resolving a rejected launch', async () => {
  const state = fixture()
  state.driver.launch = async () => {
    state.live.push({ pid: 100, executable: main })
    throw new Error('open refused after activation')
  }
  const result = await runForwardProbe(app, state.driver)
  expect(state.live).toEqual([])
  expect(state.actions).toContain('stop:100')
  expect(result.cleanup).toMatchObject({ stopped: false, failure: 'launch-completion-unknown', launchCompletionUnknown: true })
})
it('keeps launch completion unknown when successful open cannot observe a unique main process', async () => {
  const state = fixture()
  state.driver.launch = async () => {
    state.live.push({ pid: 100, executable: main }, { pid: 101, executable: main })
  }
  const result = await runForwardProbe(app, state.driver)
  expect(result.firstFailure).toBe('initial-launch:refused')
  expect(result.cleanup).toMatchObject({ stopped: false, launchCompletionUnknown: true })
  expect(state.live).toEqual([])
})
