/**
 * One WeChat account's provider: attaching from the account's stored login, the
 * token lock, the poll wiring, the send path, and every reported failure.
 */

import { chmod, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelConversationId } from '@deepseek-ai/dsh-channel'
import type { ChannelInboundMessage, ChannelProviderControl } from '@deepseek-ai/dsh-channel'
import { accountSlug, lockFileNameForSlug } from '../src/accounts.ts'
import type { Config } from '../src/config.ts'
import { acquireTokenLock } from '../src/lock.ts'
import {
  WEIXIN_STALE_AT_START_DIAGNOSTIC,
  WEIXIN_TAKEN_AWAY_DIAGNOSTIC,
  WEIXIN_UNREADABLE_DIAGNOSTIC,
  WeixinAccountProvider,
} from '../src/provider.ts'
import type { WeixinProviderAccount } from '../src/provider.ts'
import { WeixinApiError } from '../src/transport.ts'
import type { WeixinTransport, WeixinUpdateBatch } from '../src/transport.ts'

/** The login product one confirmed scan yields. */
const GRANT = { accountId: 'bot@im.bot', token: 'token-1', baseUrl: 'https://shard.example', userId: 'user-1' }

/** The one account these tests serve: the scanning identity names its slug and its lock. */
const ACCOUNT: WeixinProviderAccount = { slug: accountSlug(GRANT.userId), identity: GRANT.userId, grant: GRANT }

/** The token-lock file this account's provider contends for. */
const LOCK_FILE = lockFileNameForSlug(ACCOUNT.slug)

/** One publishable raw update. */
function update(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    from_user_id: 'sender-1',
    message_id: 'm-1',
    context_token: 'ctx-1',
    item_list: [{ type: 1, text_item: { text: 'hello' } }],
    ...overrides,
  }
}

/** Let the background connection work through a few turns, including filesystem calls. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn += 1) {
    await new Promise((resolve) => { setTimeout(resolve, 0) })
  }
}

/** Wait until the background connection satisfies one assertion. */
async function until(assertion: () => void | Promise<void>): Promise<void> {
  await vi.waitFor(assertion, { timeout: 5_000, interval: 10 })
}

let roots: string[] = []

afterEach(async () => {
  for (const root of roots) {
    await chmod(root, 0o700).catch(() => undefined)
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
  roots = []
})

/** One temporary lock directory. */
async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-channel-weixin-provider-'))
  roots.push(root)
  return root
}

/** One scripted transport: the batches a test feeds it and the sends it records. */
function scriptedTransport(): {
  readonly transport: WeixinTransport
  readonly polls: Array<{ cursor: string; timeoutMs: number }>
  readonly sends: Array<{ conversationId: string; text: string; contextToken: string | undefined }>
  readonly batches: Array<WeixinUpdateBatch | Error>
  readonly deliver: (batch: WeixinUpdateBatch) => void
  readonly fail: (error: Error) => void
  readonly failSend: (error: Error | undefined) => void
} {
  const polls: Array<{ cursor: string; timeoutMs: number }> = []
  const sends: Array<{ conversationId: string; text: string; contextToken: string | undefined }> = []
  const batches: Array<WeixinUpdateBatch | Error> = []
  const waiters: Array<() => void> = []
  let sendError: Error | undefined
  const wake = (): void => { waiters.shift()?.() }
  const transport: WeixinTransport = {
    async fetchQr() { throw new Error('unreachable') },
    async qrStatus() { throw new Error('unreachable') },
    async getUpdates(request) {
      polls.push({ cursor: request.cursor, timeoutMs: request.timeoutMs })
      for (;;) {
        const next = batches.shift()
        if (next instanceof Error) throw next
        if (next !== undefined) return next
        // An exhausted script is the long poll: it waits for a delivery or for disposal.
        await new Promise<void>((resolve, reject) => {
          if (request.signal.aborted) {
            reject(request.signal.reason)
            return
          }
          request.signal.addEventListener('abort', () => { reject(request.signal.reason) }, { once: true })
          waiters.push(resolve)
        })
      }
    },
    async sendMessage(request) {
      if (sendError !== undefined) throw sendError
      sends.push({ conversationId: request.conversationId, text: request.text, contextToken: request.contextToken })
    },
  }
  return {
    transport,
    polls,
    sends,
    batches,
    deliver: (batch) => { batches.push(batch); wake() },
    fail: (error) => { batches.push(error); wake() },
    failSend: (error) => { sendError = error },
  }
}

/** One provider over a scripted transport, with the observations a test asserts against. */
function build(options: {
  readonly lockDirectory: string
  readonly account?: WeixinProviderAccount
  readonly cursors?: readonly string[]
  readonly config?: Partial<Config>
}): {
  readonly provider: WeixinAccountProvider
  readonly scripted: ReturnType<typeof scriptedTransport>
  readonly warns: string[]
  readonly published: ChannelInboundMessage[]
  readonly changed: () => number
  readonly attach: () => void
  readonly abort: (reason?: unknown) => void
} {
  const scripted = scriptedTransport()
  const warns: string[] = []
  const provider = new WeixinAccountProvider({
    pollTimeoutMs: 30,
    pollRetryAttempts: 1,
    pollBackoffMs: 1,
    sendRetryAttempts: 2,
    sendBackoffMs: 1,
    throttleDelayMs: 1,
    breakerThreshold: 2,
    chunkLength: 10,
    lockDirectory: options.lockDirectory,
    ...options.config,
  }, options.account ?? ACCOUNT, {
    resumeCursors: () => options.cursors ?? [],
    warn: (message) => { warns.push(message) },
    transport: scripted.transport,
    delay: async () => {},
  })
  const controller = new AbortController()
  const published: ChannelInboundMessage[] = []
  let changes = 0
  const control = {
    signal: controller.signal,
    publish: (message: ChannelInboundMessage) => { published.push(message) },
    changed: () => { changes += 1 },
  } as unknown as ChannelProviderControl
  return {
    provider,
    scripted,
    warns,
    published,
    changed: () => changes,
    attach: () => { provider.attach(control) },
    abort: (reason) => { controller.abort(reason) },
  }
}

describe('WeixinAccountProvider', () => {
  it('registers an account without a stored login as unavailable and never polls', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory, account: { slug: ACCOUNT.slug } })
    expect(test.provider.id).toBe(`weixin:${ACCOUNT.slug}`)
    expect(test.provider.displayName).toBe(ACCOUNT.slug)
    expect(test.provider.accountView).toEqual({ slug: ACCOUNT.slug })
    expect(test.provider.state).toEqual({ status: 'unavailable', diagnostic: WEIXIN_UNREADABLE_DIAGNOSTIC })
    test.attach()
    await settle()
    expect(test.provider.state).toEqual({ status: 'unavailable', diagnostic: WEIXIN_UNREADABLE_DIAGNOSTIC })
    expect(test.changed()).toBe(0)
    expect(test.warns).toEqual([])
    expect(test.scripted.polls).toEqual([])
    test.abort(new Error('disposed'))
    await test.provider.quiesce()
    expect(await readdir(lockDirectory)).toEqual([])
  })

  it('connects from a stored login, publishes through the control, and sends with the reply context', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory })
    expect(test.provider.id).toBe('weixin:user-1')
    expect(test.provider.displayName).toBe('bot@im.bot')
    expect(test.provider.accountView).toBe(ACCOUNT)
    test.scripted.deliver({ updates: [update()], cursor: 'cursor-2' })
    test.attach()
    await until(() => { expect(test.provider.state).toEqual({ status: 'connected' }) })
    expect(test.changed()).toBe(2)
    expect(test.scripted.polls[0]).toEqual({ cursor: '', timeoutMs: 30 })
    expect(test.published).toHaveLength(1)
    expect(test.published[0]).toMatchObject({
      channel: `weixin:${ACCOUNT.slug}`,
      conversationId: 'sender-1',
      sender: 'sender-1',
      messageId: 'm-1',
      text: 'hello',
      event: { kind: 'weixin', messageType: 'text' },
    })
    expect(Number.isFinite(test.published[0]?.receivedAt)).toBe(true)
    await until(async () => { expect(await readdir(lockDirectory)).toEqual([LOCK_FILE]) })

    const receipt = await test.provider.send(ChannelConversationId('sender-1'), { text: 'a reply' }, new AbortController().signal)
    expect(test.scripted.sends).toEqual([{ conversationId: 'sender-1', text: 'a reply', contextToken: 'ctx-1' }])
    expect(receipt.platformMessageId).toMatch(/^dsh-weixin-/)

    test.abort(new Error('disposed'))
    await test.provider.quiesce()
    expect(await readdir(lockDirectory)).toHaveLength(0)
  })

  it('splits a reply that exceeds the configured chunk length', async () => {
    const test = build({ lockDirectory: await tempRoot() })
    test.scripted.deliver({ updates: [update()] })
    test.attach()
    await settle()
    await test.provider.send(ChannelConversationId('sender-1'), { text: 'one two three four' }, new AbortController().signal)
    expect(test.scripted.sends.map(send => send.text)).toEqual(['one two', 'three four'])
    test.abort(new Error('disposed'))
    await test.provider.quiesce()
  })

  it('refuses to send without a readable login', async () => {
    const test = build({ lockDirectory: await tempRoot(), account: { slug: ACCOUNT.slug } })
    await expect(test.provider.send(ChannelConversationId('sender-1'), { text: 'hello' }, new AbortController().signal))
      .rejects.toThrow('this WeChat account has no readable login; connect it again')
  })

  it('reports unavailable when another client holds the token', async () => {
    const lockDirectory = await tempRoot()
    await acquireTokenLock({
      directory: lockDirectory,
      fileName: LOCK_FILE,
      holderId: 'holder-a',
      staleMs: 60_000,
      now: () => Date.now() + 60_000,
    })
    const test = build({ lockDirectory })
    test.attach()
    await until(() => {
      expect(test.provider.state).toEqual({
        status: 'unavailable',
        diagnostic: "another client holds this account's token (holder holder-a)",
      })
    })
    expect(test.scripted.polls).toEqual([])
  })

  it('warns when it overrides a stale token lock', async () => {
    const lockDirectory = await tempRoot()
    await acquireTokenLock({ directory: lockDirectory, fileName: LOCK_FILE, holderId: 'holder-a', staleMs: 60_000, now: () => 0 })
    const test = build({ lockDirectory })
    test.attach()
    await until(() => { expect(test.warns).toEqual(['channel-weixin overrode the stale token lock of holder-a']) })
    expect(test.provider.state).toEqual({ status: 'connecting' })
    test.abort(new Error('disposed'))
    await test.provider.quiesce()
  })

  it('dedupes a repeated connecting report and leaves a superseded lock alone', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory })
    test.attach()
    await until(() => { expect(test.provider.state).toEqual({ status: 'connecting' }) })
    expect(test.changed()).toBe(1)
    await until(async () => { expect(await readdir(lockDirectory)).toEqual([LOCK_FILE]) })
    await writeFile(join(lockDirectory, LOCK_FILE), JSON.stringify({ holder: 'holder-b', heartbeatAt: 0 }))
    test.attach()
    await settle()
    expect(test.changed()).toBe(1)
    expect(test.warns).toEqual(['channel-weixin overrode the stale token lock of holder-b'])
    test.abort(new Error('disposed'))
    await test.provider.quiesce()
  })

  it('reports unavailable when the session was taken away after a completed cycle', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory })
    test.scripted.deliver({ updates: [update()] })
    test.attach()
    await until(() => { expect(test.provider.state).toEqual({ status: 'connected' }) })
    test.scripted.fail(new WeixinApiError('stale', { ret: -14 }))
    await until(() => {
      expect(test.provider.state).toEqual({ status: 'unavailable', diagnostic: WEIXIN_TAKEN_AWAY_DIAGNOSTIC })
    })
    await until(async () => { expect(await readdir(lockDirectory)).toHaveLength(0) })
  })

  it('reports unavailable when the stored session was already unusable at start', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory })
    test.scripted.fail(new WeixinApiError('stale', { ret: -14 }))
    test.attach()
    await until(() => {
      expect(test.provider.state).toEqual({ status: 'unavailable', diagnostic: WEIXIN_STALE_AT_START_DIAGNOSTIC })
    })
    await until(async () => { expect(await readdir(lockDirectory)).toHaveLength(0) })
  })

  it('reports unavailable when the breaker opens after repeated failures', async () => {
    const test = build({ lockDirectory: await tempRoot() })
    test.scripted.fail(new Error('down'))
    test.scripted.fail(new Error('down'))
    test.attach()
    await until(() => {
      expect(test.provider.state).toEqual({
        status: 'unavailable',
        diagnostic: 'the WeChat poll stopped after repeated failures: down',
      })
    })
    expect(test.warns).toEqual(['channel-weixin poll failed (1/2): down'])
  })

  it('resumes from the earliest recorded cursor', async () => {
    const test = build({
      lockDirectory: await tempRoot(),
      cursors: ['cursor-b', 'cursor-a'],
    })
    test.attach()
    await until(() => { expect(test.scripted.polls[0]).toEqual({ cursor: 'cursor-a', timeoutMs: 30 }) })
    test.abort(new Error('disposed'))
    await test.provider.quiesce()

    const ascending = build({
      lockDirectory: await tempRoot(),
      cursors: ['cursor-a', 'cursor-b'],
    })
    ascending.attach()
    await until(() => { expect(ascending.scripted.polls[0]).toEqual({ cursor: 'cursor-a', timeoutMs: 30 }) })
    ascending.abort(new Error('disposed'))
    await ascending.provider.quiesce()
  })

  it('builds its own transport when none is injected', async () => {
    const provider = new WeixinAccountProvider({
      pollTimeoutMs: 30,
      pollRetryAttempts: 1,
      pollBackoffMs: 1,
      sendRetryAttempts: 1,
      sendBackoffMs: 1,
      throttleDelayMs: 1,
      breakerThreshold: 2,
      chunkLength: 10,
      lockDirectory: await tempRoot(),
    }, { slug: ACCOUNT.slug }, {
      resumeCursors: () => [],
      warn: () => {},
    })
    const controller = new AbortController()
    provider.attach({
      signal: controller.signal,
      publish: () => {},
      changed: () => {},
    } as unknown as ChannelProviderControl)
    await settle()
    expect(provider.state).toEqual({ status: 'unavailable', diagnostic: WEIXIN_UNREADABLE_DIAGNOSTIC })
    controller.abort(new Error('disposed'))
    await provider.quiesce()
  })

  it('reports a lock taken over mid-run through the connection diagnostic', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory })
    test.attach()
    await until(() => { expect(test.scripted.polls.length).toBeGreaterThan(0) })
    await writeFile(join(lockDirectory, LOCK_FILE), JSON.stringify({ holder: 'holder-b', heartbeatAt: Date.now() }))
    test.scripted.deliver({ updates: [] })
    await until(() => {
      expect(test.provider.state).toEqual({
        status: 'unavailable',
        diagnostic: 'the token lock was taken over by holder-b',
      })
    })
    await settle()
    expect(await readdir(lockDirectory)).toEqual([LOCK_FILE])
  })

  it('stays silent when a lock takeover lands on a disposed connection', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory })
    test.attach()
    await until(() => { expect(test.scripted.polls.length).toBeGreaterThan(0) })
    const padding = 'x'.repeat(5_000_000)
    await writeFile(join(lockDirectory, LOCK_FILE), JSON.stringify({ holder: 'holder-b', heartbeatAt: Date.now(), padding }))
    test.scripted.deliver({ updates: [] })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    test.abort(new Error('disposed during the heartbeat'))
    await settle()
    expect(test.provider.state).toEqual({ status: 'connected' })
    await settle()
    expect(test.provider.state).toEqual({ status: 'connected' })
  })

  it('reports a lock acquisition failure as the connection diagnostic', async () => {
    const root = await tempRoot()
    const test = build({ lockDirectory: join(root, 'locks'), config: { pollTimeoutMs: 30 } })
    await chmod(root, 0o500)
    test.attach()
    await until(() => { expect(test.provider.state.status).toBe('unavailable') })
    await chmod(root, 0o700)
  })

  it('warns when the token lock cannot be released', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory })
    test.attach()
    await until(() => { expect(test.scripted.polls.length).toBeGreaterThan(0) })
    await chmod(lockDirectory, 0o500)
    test.abort(new Error('disposed'))
    await until(() => {
      expect(test.warns.some(message => message.includes('could not release the token lock'))).toBe(true)
    })
    await chmod(lockDirectory, 0o700)
  })

  it('returns before connecting when the signal is already aborted', async () => {
    const controller = new AbortController()
    const scripted = scriptedTransport()
    const warns: string[] = []
    const provider = new WeixinAccountProvider({
      pollTimeoutMs: 30,
      pollRetryAttempts: 1,
      pollBackoffMs: 1,
      sendRetryAttempts: 1,
      sendBackoffMs: 1,
      throttleDelayMs: 1,
      breakerThreshold: 2,
      chunkLength: 10,
      lockDirectory: await tempRoot(),
    }, ACCOUNT, {
      resumeCursors: () => [],
      warn: (message) => { warns.push(message) },
      transport: scripted.transport,
      delay: async () => {},
    })
    controller.abort(new Error('disposed before the start'))
    provider.attach({
      signal: controller.signal,
      publish: () => {},
      changed: () => {},
    } as unknown as ChannelProviderControl)
    await settle()
    expect(warns).toEqual([])
    expect(scripted.polls).toEqual([])
    expect(provider.state).toEqual({ status: 'idle' })
  })

  it('returns silently when the connection start is aborted mid-flight', async () => {
    const lockDirectory = await tempRoot()
    await acquireTokenLock({ directory: lockDirectory, fileName: LOCK_FILE, holderId: 'holder-a', staleMs: 60_000, now: () => 0 })
    const scripted = scriptedTransport()
    const controller = new AbortController()
    const warns: string[] = []
    const provider = new WeixinAccountProvider({
      pollTimeoutMs: 30,
      pollRetryAttempts: 1,
      pollBackoffMs: 1,
      sendRetryAttempts: 1,
      sendBackoffMs: 1,
      throttleDelayMs: 1,
      breakerThreshold: 2,
      chunkLength: 10,
      lockDirectory,
    }, ACCOUNT, {
      resumeCursors: () => [],
      warn: (message) => {
        warns.push(message)
        controller.abort(new Error('disposed during the start'))
        throw new Error('the warn sink gave up')
      },
      transport: scripted.transport,
      delay: async () => {},
    })
    provider.attach({
      signal: controller.signal,
      publish: () => {},
      changed: () => {},
    } as unknown as ChannelProviderControl)
    await settle()
    expect(warns).toEqual(['channel-weixin overrode the stale token lock of holder-a'])
    expect(scripted.polls).toEqual([])
    expect(provider.state).toEqual({ status: 'connecting' })
    await provider.quiesce()
    expect(await readdir(lockDirectory)).toEqual([])
  })

  it('reports an eviction and rethrows when a send meets the expired session', async () => {
    const test = build({ lockDirectory: await tempRoot(), config: { sendRetryAttempts: 1 } })
    test.scripted.failSend(new WeixinApiError('stale', { ret: -14 }))
    await expect(test.provider.send(ChannelConversationId('sender-1'), { text: 'a reply' }, new AbortController().signal))
      .rejects.toThrow('stale')
    expect(test.provider.state).toEqual({ status: 'unavailable', diagnostic: WEIXIN_STALE_AT_START_DIAGNOSTIC })
  })

  it('replaces an unavailable report with the eviction diagnostic when a send meets the expired session', async () => {
    const lockDirectory = await tempRoot()
    await acquireTokenLock({
      directory: lockDirectory,
      fileName: LOCK_FILE,
      holderId: 'holder-a',
      staleMs: 60_000,
      now: () => Date.now() + 60_000,
    })
    const test = build({ lockDirectory, config: { sendRetryAttempts: 1 } })
    test.scripted.failSend(new WeixinApiError('stale', { ret: -14 }))
    test.attach()
    await until(() => {
      expect(test.provider.state).toEqual({
        status: 'unavailable',
        diagnostic: "another client holds this account's token (holder holder-a)",
      })
    })
    expect(test.changed()).toBe(2)
    await expect(test.provider.send(ChannelConversationId('sender-1'), { text: 'a reply' }, new AbortController().signal))
      .rejects.toThrow('stale')
    await settle()
    expect(test.provider.state).toEqual({ status: 'unavailable', diagnostic: WEIXIN_STALE_AT_START_DIAGNOSTIC })
    expect(test.changed()).toBe(3)
    test.abort(new Error('disposed'))
    await test.provider.quiesce()
  })

  it('leaves the state alone when a send fails for another reason', async () => {
    const test = build({ lockDirectory: await tempRoot(), config: { sendRetryAttempts: 1 } })
    test.scripted.failSend(new Error('down'))
    await expect(test.provider.send(ChannelConversationId('sender-1'), { text: 'a reply' }, new AbortController().signal))
      .rejects.toThrow('down')
    test.scripted.failSend(new WeixinApiError('rejected'))
    await expect(test.provider.send(ChannelConversationId('sender-1'), { text: 'a reply' }, new AbortController().signal))
      .rejects.toThrow('rejected')
    expect(test.provider.state).toEqual({ status: 'idle' })
  })
})
