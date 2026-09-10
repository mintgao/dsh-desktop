/** Observe real notification decisions without replacing permission, controller or presenter. */
import assert from 'node:assert/strict'
import ts from 'typescript'
import type { CDPSession, Page } from 'playwright'
import { digest, object } from './evidence.ts'

/** Locate real decision and presentation entries in the exact packaged client script.
 * @param source - Actual shipped notification client JavaScript.
 * @returns Unique first-statement locations; unsupported builds refuse.
 */
export function notificationLocations(source: string): Record<'notify' | 'show', { lineNumber: number; columnNumber: number }> {
  const file = ts.createSourceFile('notifications.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const found: Record<'notify' | 'show', number[]> = { notify: [], show: [] }
  const visit = (node: ts.Node): void => {
    if (ts.isMethodDeclaration(node) && node.body?.statements[0] && ts.isIdentifier(node.name)) {
      const name = node.name.text
      if ((name === 'notify' && node.body.getText(file).includes('this.state.getSnapshot()'))
        || (name === 'show' && node.body.getText(file).includes('new globalThis.Notification('))) {
        found[name].push(node.body.statements[0].getStart(file))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  const locate = (name: 'notify' | 'show') => {
    const position = found[name][0]
    if (found[name].length !== 1 || position === undefined) throw new Error(`Actual notification ${name} entry is ambiguous or absent`)
    const at = file.getLineAndCharacterOfPosition(position)
    return { lineNumber: at.line, columnNumber: at.character }
  }
  return { notify: locate('notify'), show: locate('show') }
}

/** Require a step completion in the exact observed invocation's caller stack.
 * @param pause - Actual protocol pause after the requested step-out.
 * @param callers - Caller frames captured at the observed entry.
 */
export function returnedToCaller(pause: Record<string, unknown>, callers: unknown[]): void {
  assert.ok(pause['reason'] === 'other' || pause['reason'] === 'step', 'Only a requested step-out completion is accepted')
  assert.deepEqual(pause['hitBreakpoints'] ?? [], [])
  assert.ok(Array.isArray(pause['callFrames']))
  const identities = (frames: unknown[]) => frames.map((value) => {
    const frame = object(value)
    return { functionName: frame['functionName'], functionLocation: frame['functionLocation'],
      scriptId: object(frame['location'])['scriptId'] }
  })
  assert.deepEqual(identities(pause['callFrames']), identities(callers), 'Step-out must return to this exact invocation caller stack')
}

/** Own temporary debugger observations for real selected-session completions. */
export class NativeNotificationObserver {
  private readonly queue: Record<string, unknown>[] = []
  private pending: ((value: Record<string, unknown>) => void) | undefined
  private readonly listener = (value: unknown): void => {
    const event = object(value)
    if (this.pending) { const resolve = this.pending; this.pending = undefined; resolve(event) }
    else this.queue.push(event)
  }
  private constructor(private readonly session: CDPSession, private readonly notifyId: string,
    private readonly showId: string, readonly sourceDigest: string) {
    session.on('Debugger.paused', this.listener)
  }

  /** Authenticate the actual renderer script before installing observation breakpoints.
   * @param page - Existing normal native renderer.
   * @param source - Bytes of this app's packaged notification client.
   * @returns Observer which must be closed after the real tasks finish.
   */
  static async create(page: Page, source: string): Promise<NativeNotificationObserver> {
    const session = await page.context().newCDPSession(page)
    const scripts: Array<{ scriptId: string; url: string }> = []
    const collect = (event: { scriptId: string; url: string }): void => { scripts.push(event) }
    session.on('Debugger.scriptParsed', collect)
    try {
      await session.send('Debugger.enable')
      const matches: string[] = []
      for (const script of scripts.filter(value => value.url.includes('ui-session-notifications'))) {
        const actual = await session.send('Debugger.getScriptSource', { scriptId: script.scriptId })
        if (actual.scriptSource === source) matches.push(script.scriptId)
      }
      assert.equal(matches.length, 1, 'One actual renderer script must match the packaged notification client bytes')
      const scriptId = matches[0]
      assert.ok(scriptId)
      const locations = notificationLocations(source)
      const notify = await session.send('Debugger.setBreakpoint', { location: { scriptId, ...locations.notify },
        condition: 'root.id === "qualification-native-selected"' })
      const show = await session.send('Debugger.setBreakpoint', { location: { scriptId, ...locations.show },
        condition: 'message.tag === "dsh-task-finished:qualification-native-selected"' })
      return new NativeNotificationObserver(session, notify.breakpointId, show.breakpointId, digest(source))
    } catch (error) { await session.detach(); throw error }
    finally { session.off('Debugger.scriptParsed', collect) }
  }

  private async paused(): Promise<Record<string, unknown>> {
    const queued = this.queue.shift()
    if (queued) return queued
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await new Promise((resolve, reject) => {
        this.pending = resolve
        timer = setTimeout(() => { this.pending = undefined; reject(new Error('Actual notification decision did not reach its debugger observation')) }, 15_000)
      })
    } finally { clearTimeout(timer) }
  }

  /** Observe the executed return or presenter call while releasing one actual active task.
   * @param mode - Preference already selected through actual Settings controls.
   * @param background - Observed normal window focus/visibility state before completion.
   * @param release - Release the deterministic provider's owned response gate.
   * @returns Actual controller snapshot and executed branch, excluding OS delivery.
   */
  async capture(mode: 'off' | 'background' | 'always', background: boolean, release: () => Promise<void>): Promise<Record<string, unknown>> {
    await release()
    const entry = await this.paused()
    assert.deepEqual(entry['hitBreakpoints'], [this.notifyId])
    assert.equal(entry['reason'], 'other')
    assert.ok(Array.isArray(entry['callFrames']))
    const frames = entry['callFrames'].map(object)
    const frame = frames[0]
    assert.ok(frame)
    assert.equal(frame['functionName'], 'notify')
    assert.equal(typeof frame['callFrameId'], 'string')
    const evaluated = await this.session.send('Debugger.evaluateOnCallFrame', { callFrameId: frame['callFrameId'] as string,
      expression: '({id:root.id,state:this.state.getSnapshot(),visibility:document.visibilityState,focused:document.hasFocus(),permission:globalThis.Notification?.permission})', returnByValue: true })
    if (evaluated.exceptionDetails) throw new Error(JSON.stringify(evaluated.exceptionDetails))
    const value = object(evaluated.result.value)
    assert.equal(value['id'], 'qualification-native-selected')
    assert.equal(object(value['state'])['mode'], mode)
    assert.equal(value['permission'], 'granted', `Actual permission prevents mode qualification: ${JSON.stringify(value)}`)
    assert.equal(value['visibility'] !== 'visible' || value['focused'] !== true, background)
    await this.session.send('Debugger.stepOut')
    const decision = await this.paused()
    const presented = Array.isArray(decision['hitBreakpoints']) && decision['hitBreakpoints'].includes(this.showId)
    assert.equal(presented, mode !== 'off' && (mode === 'always' || background))
    if (presented) {
      assert.equal(decision['reason'], 'other')
      assert.deepEqual(decision['hitBreakpoints'], [this.showId])
      assert.ok(Array.isArray(decision['callFrames']))
      const showFrames = decision['callFrames'].map(object)
      assert.equal(showFrames[0]?.['functionName'], 'show')
      assert.equal(object(showFrames[0]['location'])['scriptId'], object(frame['location'])['scriptId'])
      assert.deepEqual(showFrames.slice(1).map(item => item['functionLocation']), frames.map(item => item['functionLocation']))
      await this.session.send('Debugger.stepOut')
      returnedToCaller(await this.paused(), frames)
    } else returnedToCaller(decision, frames.slice(1))

    await this.session.send('Debugger.resume')
    return { mode, background, observation: value, presented, decision, sourceDigest: this.sourceDigest,
      scope: 'Executed normal controller return or real Web Notification presenter; no OS delivery assertion' }
  }

  /** Remove observation breakpoints and release a possible failed paused task before detaching. */
  async close(): Promise<void> {
    try {
      await this.session.send('Debugger.removeBreakpoint', { breakpointId: this.notifyId })
      await this.session.send('Debugger.removeBreakpoint', { breakpointId: this.showId })
      await this.session.send('Debugger.disable')
    } finally { this.session.off('Debugger.paused', this.listener); await this.session.detach() }
  }
}
