import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import { createUserMessage, LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  launchWebScaffold, watchConsole, type WebScaffold,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, REPO_ROOT, saveFailureShot } from './support.ts'

const HOLD_PROVIDER = 'task-notification-hold'
const HOLD_MODEL = 'hold'
const MINT_PATCH_PATH = join(REPO_ROOT, 'packages/bundle/desktop-mint/cordis.patch.yml')

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => {}
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

/** Model adapter that holds one real Agent turn until the browser observes it running. */
class HoldingAdapter extends LlmAdapter {
  private readonly startedGate = deferred()
  private readonly finishGate = deferred()
  readonly started = this.startedGate.promise

  finish(): void { this.finishGate.resolve() }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const signal = options.signal
    if (signal === undefined) throw new Error('task-notification adapter requires a turn signal')
    this.startedGate.resolve()
    await Promise.race([
      this.finishGate.promise,
      new Promise<never>((_resolve, reject) => {
        const abort = (): void => {
          reject(signal.reason instanceof Error ? signal.reason : new Error('task-notification turn aborted'))
        }
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      }),
    ])
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe('web e2e: task completion notifications', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let handle: AgentHandle
  let adapter: HoldingAdapter
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: MINT_PATCH_PATH })
    adapter = new HoldingAdapter()
    scaffold.ctx.effect(
      () => scaffold.ctx.llm.registerAdapter([HOLD_PROVIDER], adapter),
      'task notification holding adapter',
    )
    const cwd = join(scaffold.workspaceCwd, 'workspace')
    await mkdir(cwd)
    handle = await scaffold.ctx.agents.create({
      sessionId: SessionId('task-notification'),
      meta: { cwd },
      agentOptions: { provider: HOLD_PROVIDER, model: HOLD_MODEL },
    })

    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.addInitScript(() => {
      interface CapturedNotification {
        title: string
        body: string
        tag: string
        activate(): void
      }
      const captured: CapturedNotification[] = []
      ;(window as unknown as { __dshTaskNotifications: CapturedNotification[] }).__dshTaskNotifications = captured
      Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false })
      class FakeNotification {
        static permission: NotificationPermission = 'granted'
        static requestPermission(): Promise<NotificationPermission> { return Promise.resolve('granted') }
        onclick: (() => void) | null = null
        onclose: (() => void) | null = null

        constructor(title: string, options: NotificationOptions = {}) {
          captured.push({
            title,
            body: options.body ?? '',
            tag: options.tag ?? '',
            activate: () => { this.onclick?.() },
          })
        }

        close(): void { this.onclose?.() }
      }
      Object.defineProperty(window, 'Notification', { configurable: true, value: FakeNotification })
    })
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    const workspace = await scaffold.ctx.workspaceRegistry.resolveByPath(cwd)
    if (workspace === undefined) throw new Error('connected Web workspace was not registered')
    await workspace.attachSession(handle.agent.session.id)
    await page.getByRole('treeitem').filter({ hasText: 'workspace' }).first().waitFor({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings' })
    await settings.getByText('Task completion notifications', { exact: true }).waitFor({ timeout: 10_000 })
    await settings.getByRole('button', { name: 'Background only', exact: true }).waitFor({ timeout: 10_000 })
    await page.keyboard.press('Escape')
  }, 60_000)

  afterAll(async () => {
    const failures: unknown[] = []
    adapter?.finish()
    if (handle?.agent.status === 'running') {
      handle.agent.cancel({ kind: 'user' })
      await handle.agent.whenIdle().catch((error: unknown) => failures.push(error))
    }
    await browser?.close().catch((error: unknown) => failures.push(error))
    await handle?.dispose().catch((error: unknown) => failures.push(error))
    await scaffold?.close().catch((error: unknown) => failures.push(error))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'task-notification teardown failed')
  })

  it('notifies once after a real task transition and opens the task on activation', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-task-notifications'))
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Hold until the browser observes this task.' }],
      source: { kind: 'user' },
    }))
    await adapter.started
    await page.locator('[role="treeitem"] [data-state="ongoing"]').first().waitFor({ timeout: 10_000 })
    adapter.finish()
    await handle.agent.whenIdle()

    await expect.poll(async () => await page.evaluate(() => (
      window as unknown as { __dshTaskNotifications: unknown[] }
    ).__dshTaskNotifications.length), { timeout: 10_000 }).toBe(1)
    const captured = await page.evaluate(() => (
      window as unknown as {
        __dshTaskNotifications: Array<{ title: string; body: string; tag: string }>
      }
    ).__dshTaskNotifications.map(({ title, body, tag }) => ({ title, body, tag })))
    expect(captured).toMatchInlineSnapshot(`
      [
        {
          "body": "Task finished",
          "tag": "dsh-task-finished:task-notification",
          "title": "Hold until the browser observes",
        },
      ]
    `)

    await page.evaluate(() => {
      const notification = (window as unknown as {
        __dshTaskNotifications: Array<{ activate(): void }>
      }).__dshTaskNotifications[0]
      notification?.activate()
    })
    await page.locator('[role="treeitem"][aria-selected="true"]')
      .filter({ hasText: 'Hold until the browser observes' }).waitFor({ timeout: 10_000 })
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)
})
