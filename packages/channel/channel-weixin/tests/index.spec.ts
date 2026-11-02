/**
 * The WeChat provider: attaching from the stored login, the token lock, the
 * poll wiring, the QR login surface, the send path, and every reported failure.
 */

import { chmod, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelConversationId } from '@deepseek-ai/dsh-channel'
import type { ChannelInboundMessage, ChannelProviderControl } from '@deepseek-ai/dsh-channel'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { WeixinChannelProvider } from '../src/index.ts'
import type { Config } from '../src/index.ts'
import { acquireTokenLock } from '../src/lock.ts'
import { WeixinApiError } from '../src/transport.ts'
import type { WeixinQrChallenge, WeixinQrStatus, WeixinTransport, WeixinUpdateBatch } from '../src/transport.ts'

/** The login product one confirmed scan yields. */
const GRANT = { accountId: 'bot@im.bot', token: 'token-1', baseUrl: 'https://shard.example', userId: 'user-1' }

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

/** One scripted transport: the batches and QR statuses a test feeds it. */
function scriptedTransport(): {
  readonly transport: WeixinTransport
  readonly polls: Array<{ cursor: string; timeoutMs: number }>
  readonly sends: Array<{ conversationId: string; text: string; contextToken: string | undefined }>
  readonly batches: Array<WeixinUpdateBatch | Error>
  readonly statuses: Array<WeixinQrStatus | Error>
  readonly challenge: { code: string; url: string }
  readonly deliver: (batch: WeixinUpdateBatch) => void
  readonly fail: (error: Error) => void
} {
  const polls: Array<{ cursor: string; timeoutMs: number }> = []
  const sends: Array<{ conversationId: string; text: string; contextToken: string | undefined }> = []
  const batches: Array<WeixinUpdateBatch | Error> = []
  const statuses: Array<WeixinQrStatus | Error> = []
  const waiters: Array<() => void> = []
  const challenge = { code: 'code-1', url: 'https://liteapp.example/1' }
  const wake = (): void => { waiters.shift()?.() }
  const transport: WeixinTransport = {
    async fetchQr(): Promise<WeixinQrChallenge> { return challenge },
    async qrStatus() {
      const next = statuses.shift()
      if (next === undefined) throw new Error('the QR script is exhausted')
      if (next instanceof Error) throw next
      return next
    },
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
      sends.push({ conversationId: request.conversationId, text: request.text, contextToken: request.contextToken })
    },
  }
  return {
    transport,
    polls,
    sends,
    batches,
    statuses,
    challenge,
    deliver: (batch) => { batches.push(batch); wake() },
    fail: (error) => { batches.push(error); wake() },
  }
}

/** A credentials stand-in over one in-memory record. */
function fakeCredentials(record: { kind: string; payload: unknown } | undefined): {
  readonly service: CredentialProvider
  readonly written: Array<{ kind: string; payload: unknown }>
} {
  const written: Array<{ kind: string; payload: unknown }> = []
  let current = record
  const service = {
    async readRecord() { return current },
    async modifyRecord(_key: unknown, mutate: (existing: unknown) => Promise<{ kind: string; payload: unknown }>) {
      const next = await mutate(current)
      written.push(next)
      current = next
      return next
    },
  } as unknown as CredentialProvider
  return { service, written }
}

/** One provider over a scripted transport, with the observations a test asserts against. */
function build(options: {
  readonly lockDirectory: string
  readonly record?: { kind: string; payload: unknown } | undefined
  readonly cursors?: readonly string[]
  readonly config?: Partial<Config>
}): {
  readonly provider: WeixinChannelProvider
  readonly scripted: ReturnType<typeof scriptedTransport>
  readonly warns: string[]
  readonly written: Array<{ kind: string; payload: unknown }>
  readonly published: ChannelInboundMessage[]
  readonly changed: () => number
  readonly attach: () => void
  readonly abort: (reason?: unknown) => void
} {
  const scripted = scriptedTransport()
  const warns: string[] = []
  const credentials = fakeCredentials(options.record)
  const provider = new WeixinChannelProvider({
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
  }, {
    credentials: credentials.service,
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
    written: credentials.written,
    published,
    changed: () => changes,
    attach: () => { provider.attach(control) },
    abort: (reason) => { controller.abort(reason) },
  }
}

describe('WeixinChannelProvider', () => {
  it('attaches without a stored login and stays idle without an announcement', async () => {
    const test = build({ lockDirectory: await tempRoot() })
    test.attach()
    await settle()
    expect(test.provider.state).toEqual({ status: 'idle' })
    expect(test.changed()).toBe(0)
    expect(test.scripted.polls).toEqual([])
  })

  it('connects from a stored login, publishes through the control, and sends with the reply context', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory, record: { kind: 'grant', payload: GRANT } })
    test.scripted.batches.push({ updates: [update()], cursor: 'cursor-2' })
    test.attach()
    await until(() => { expect(test.provider.state).toEqual({ status: 'connected' }) })
    expect(test.changed()).toBe(2)
    expect(test.scripted.polls[0]).toEqual({ cursor: '', timeoutMs: 30 })
    expect(test.published).toHaveLength(1)
    expect(test.published[0]).toMatchObject({
      channel: 'weixin',
      conversationId: 'sender-1',
      sender: 'sender-1',
      messageId: 'm-1',
      text: 'hello',
      event: { kind: 'weixin', messageType: 'text' },
    })
    expect(Number.isFinite(test.published[0]?.receivedAt)).toBe(true)
    await until(async () => { expect(await readdir(lockDirectory)).toHaveLength(1) })

    const receipt = await test.provider.send(ChannelConversationId('sender-1'), { text: 'a reply' }, new AbortController().signal)
    expect(test.scripted.sends).toEqual([{ conversationId: 'sender-1', text: 'a reply', contextToken: 'ctx-1' }])
    expect(receipt.platformMessageId).toMatch(/^dsh-weixin-/)

    test.abort(new Error('disposed'))
    await settle()
    expect(await readdir(lockDirectory)).toHaveLength(0)
  })

  it('splits a reply that exceeds the configured chunk length', async () => {
    const test = build({ lockDirectory: await tempRoot(), record: { kind: 'grant', payload: GRANT } })
    test.scripted.batches.push({ updates: [update()] })
    test.attach()
    await settle()
    await test.provider.send(ChannelConversationId('sender-1'), { text: 'one two three four' }, new AbortController().signal)
    expect(test.scripted.sends.map(send => send.text)).toEqual(['one two', 'three four'])
    test.abort(new Error('disposed'))
    await settle()
  })

  it('refuses to send before a login exists', async () => {
    const test = build({ lockDirectory: await tempRoot() })
    await expect(test.provider.send(ChannelConversationId('sender-1'), { text: 'hello' }, new AbortController().signal))
      .rejects.toThrow('the WeChat channel has no login; connect it first')
  })

  it('reports unavailable when another client holds the token', async () => {
    const lockDirectory = await tempRoot()
    await acquireTokenLock({ directory: lockDirectory, holderId: 'holder-a', staleMs: 60_000 })
    const test = build({ lockDirectory, record: { kind: 'grant', payload: GRANT } })
    test.attach()
    await until(() => {
      expect(test.provider.state).toEqual({
        status: 'unavailable',
        diagnostic: "another client holds this bot's token (holder holder-a)",
      })
    })
    expect(test.scripted.polls).toEqual([])
  })

  it('warns when it overrides a stale token lock', async () => {
    const lockDirectory = await tempRoot()
    await acquireTokenLock({ directory: lockDirectory, holderId: 'holder-a', staleMs: 60_000, now: () => 0 })
    const test = build({ lockDirectory, record: { kind: 'grant', payload: GRANT } })
    test.attach()
    await until(() => { expect(test.warns).toEqual(['channel-weixin overrode the stale token lock of holder-a']) })
    expect(test.provider.state).toEqual({ status: 'connecting' })
    test.abort(new Error('disposed'))
    await settle()
  })

  it('dedupes a repeated connecting report and leaves a superseded lock alone', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory, record: { kind: 'grant', payload: GRANT } })
    test.attach()
    await until(() => { expect(test.provider.state).toEqual({ status: 'connecting' }) })
    expect(test.changed()).toBe(1)
    await until(async () => { expect(await readdir(lockDirectory)).toEqual(['weixin-token.lock']) })
    await writeFile(join(lockDirectory, 'weixin-token.lock'), JSON.stringify({ holder: 'holder-b', heartbeatAt: 0 }))
    test.attach()
    await settle()
    expect(test.changed()).toBe(1)
    expect(test.warns).toEqual(['channel-weixin overrode the stale token lock of holder-b'])
    test.abort(new Error('disposed'))
    await until(async () => { expect(await readdir(lockDirectory)).toHaveLength(0) })
  })

  it('reports unavailable when the session expired', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory, record: { kind: 'grant', payload: GRANT } })
    test.scripted.batches.push(new WeixinApiError('stale', { ret: -14 }))
    test.attach()
    await until(() => {
      expect(test.provider.state).toEqual({ status: 'unavailable', diagnostic: 'the WeChat session expired; scan a new QR code' })
    })
    await until(async () => { expect(await readdir(lockDirectory)).toHaveLength(0) })
  })

  it('reports unavailable when the breaker opens after repeated failures', async () => {
    const test = build({ lockDirectory: await tempRoot(), record: { kind: 'grant', payload: GRANT } })
    test.scripted.batches.push(new Error('down'), new Error('down'))
    test.attach()
    await until(() => {
      expect(test.provider.state).toEqual({
        status: 'unavailable',
        diagnostic: 'the WeChat poll stopped after repeated failures: down',
      })
    })
    expect(test.warns).toEqual(['channel-weixin poll failed (1/2): down'])
  })

  it('treats an unreadable stored record as no login', async () => {
    const lockDirectory = await tempRoot()
    const payloads: unknown[] = [
      null,
      { accountId: '', token: 'token-1', baseUrl: 'https://shard.example', userId: 'user-1' },
      { accountId: 'bot@im.bot', token: 5, baseUrl: 'https://shard.example', userId: 'user-1' },
      { accountId: 'bot@im.bot', token: '', baseUrl: 'https://shard.example', userId: 'user-1' },
      { accountId: 'bot@im.bot', token: 'token-1', baseUrl: '', userId: 'user-1' },
      { accountId: 'bot@im.bot', token: 'token-1', baseUrl: 'https://shard.example', userId: 5 },
    ]
    for (const payload of payloads) {
      const test = build({ lockDirectory, record: { kind: 'grant', payload } })
      test.attach()
      await until(() => {
        expect(test.warns).toEqual(['channel-weixin: the stored login record is not readable; a new scan is required'])
      })
      expect(test.provider.state).toEqual({ status: 'idle' })
    }
    const other = build({ lockDirectory, record: { kind: 'api-key', payload: GRANT } })
    other.attach()
    await settle()
    expect(other.warns).toEqual([])
    expect(other.provider.state).toEqual({ status: 'idle' })
  })

  it('resumes from the earliest recorded cursor', async () => {
    const test = build({
      lockDirectory: await tempRoot(),
      record: { kind: 'grant', payload: GRANT },
      cursors: ['cursor-b', 'cursor-a'],
    })
    test.attach()
    await until(() => { expect(test.scripted.polls[0]).toEqual({ cursor: 'cursor-a', timeoutMs: 30 }) })
    test.abort(new Error('disposed'))
    await settle()

    const ascending = build({
      lockDirectory: await tempRoot(),
      record: { kind: 'grant', payload: GRANT },
      cursors: ['cursor-a', 'cursor-b'],
    })
    ascending.attach()
    await until(() => { expect(ascending.scripted.polls[0]).toEqual({ cursor: 'cursor-a', timeoutMs: 30 }) })
    ascending.abort(new Error('disposed'))
    await settle()
  })

  it('builds its own transport when none is injected', async () => {
    const provider = new WeixinChannelProvider({
      pollTimeoutMs: 30,
      pollRetryAttempts: 1,
      pollBackoffMs: 1,
      sendRetryAttempts: 1,
      sendBackoffMs: 1,
      throttleDelayMs: 1,
      breakerThreshold: 2,
      chunkLength: 10,
      lockDirectory: await tempRoot(),
    }, {
      credentials: fakeCredentials(undefined).service,
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
    expect(provider.state).toEqual({ status: 'idle' })
  })

  it('reports a lock taken over mid-run through the connection diagnostic', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory, record: { kind: 'grant', payload: GRANT } })
    test.attach()
    await until(() => { expect(test.scripted.polls.length).toBeGreaterThan(0) })
    await writeFile(join(lockDirectory, 'weixin-token.lock'), JSON.stringify({ holder: 'holder-b', heartbeatAt: Date.now() }))
    test.scripted.deliver({ updates: [] })
    await until(() => {
      expect(test.provider.state).toEqual({
        status: 'unavailable',
        diagnostic: 'the token lock was taken over by holder-b',
      })
    })
    await settle()
    expect(await readdir(lockDirectory)).toEqual(['weixin-token.lock'])
  })

  it('stays silent when a lock takeover lands on a disposed connection', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory, record: { kind: 'grant', payload: GRANT } })
    test.attach()
    await until(() => { expect(test.scripted.polls.length).toBeGreaterThan(0) })
    const padding = 'x'.repeat(5_000_000)
    await writeFile(join(lockDirectory, 'weixin-token.lock'), JSON.stringify({ holder: 'holder-b', heartbeatAt: Date.now(), padding }))
    test.scripted.deliver({ updates: [] })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    test.abort(new Error('disposed during the heartbeat'))
    await settle()
    expect(test.provider.state).toEqual({ status: 'connected' })
    await settle()
    expect(test.provider.state).toEqual({ status: 'connected' })
  })

  it('runs the QR login, stores the grant, and reconnects', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory })
    test.attach()
    await settle()
    test.scripted.statuses.push({ status: 'confirmed', grant: GRANT })
    await expect(test.provider.beginLogin()).resolves.toEqual({ phase: 'waiting', qrUrl: 'https://liteapp.example/1' })
    await until(() => { expect(test.written).toEqual([{ kind: 'grant', payload: GRANT }]) })
    expect(test.provider.login).toEqual({ phase: 'confirmed' })
    await until(() => { expect(test.scripted.polls[0]).toEqual({ cursor: '', timeoutMs: 30 }) })
    expect(test.provider.state).toEqual({ status: 'connecting' })
    test.abort(new Error('disposed'))
    await settle()
  })

  it('cancels a login in flight without storing a grant', async () => {
    const test = build({ lockDirectory: await tempRoot() })
    test.scripted.statuses.push({ status: 'wait' })
    await test.provider.beginLogin()
    test.provider.cancelLogin()
    expect(test.provider.login).toEqual({ phase: 'idle' })
    await settle()
    expect(test.written).toEqual([])
    expect(test.warns).toEqual([])
  })

  it('warns when a login fails and leaves no grant', async () => {
    const test = build({ lockDirectory: await tempRoot() })
    test.scripted.statuses.push({ status: 'expired' }, { status: 'expired' }, { status: 'expired' }, { status: 'expired' })
    await test.provider.beginLogin()
    await until(() => {
      expect(test.warns).toEqual(['channel-weixin login failed: the QR code expired 4 times without a scan'])
    })
    expect(test.written).toEqual([])
    expect(test.provider.login).toEqual({ phase: 'failed', diagnostic: 'the QR code expired 4 times without a scan' })
  })

  it('reports a lock acquisition failure as the connection diagnostic', async () => {
    const root = await tempRoot()
    const test = build({ lockDirectory: join(root, 'locks'), record: { kind: 'grant', payload: GRANT }, config: { pollTimeoutMs: 30 } })
    await chmod(root, 0o500)
    test.attach()
    await until(() => { expect(test.provider.state.status).toBe('unavailable') })
    await chmod(root, 0o700)
  })

  it('warns when the token lock cannot be released', async () => {
    const lockDirectory = await tempRoot()
    const test = build({ lockDirectory, record: { kind: 'grant', payload: GRANT } })
    test.attach()
    await until(() => { expect(test.scripted.polls.length).toBeGreaterThan(0) })
    await chmod(lockDirectory, 0o500)
    test.abort(new Error('disposed'))
    await until(() => {
      expect(test.warns.some(message => message.includes('could not release the token lock'))).toBe(true)
    })
    await chmod(lockDirectory, 0o700)
  })

  it('finishes a login without an attached control without starting a poll', async () => {
    const test = build({ lockDirectory: await tempRoot() })
    test.scripted.statuses.push({ status: 'confirmed', grant: GRANT })
    await test.provider.beginLogin()
    await settle()
    expect(test.written).toEqual([{ kind: 'grant', payload: GRANT }])
    expect(test.provider.login).toEqual({ phase: 'confirmed' })
    expect(test.scripted.polls).toEqual([])
  })

  it('returns before connecting when the signal aborts during the login read', async () => {
    const controller = new AbortController()
    const scripted = scriptedTransport()
    const warns: string[] = []
    const credentials = {
      async readRecord() {
        controller.abort(new Error('disposed during the login read'))
        return { kind: 'grant', payload: GRANT }
      },
      async modifyRecord() { throw new Error('unreachable') },
    } as unknown as CredentialProvider
    const provider = new WeixinChannelProvider({
      pollTimeoutMs: 30,
      pollRetryAttempts: 1,
      pollBackoffMs: 1,
      sendRetryAttempts: 1,
      sendBackoffMs: 1,
      throttleDelayMs: 1,
      breakerThreshold: 2,
      chunkLength: 10,
      lockDirectory: await tempRoot(),
    }, {
      credentials,
      resumeCursors: () => [],
      warn: (message) => { warns.push(message) },
      transport: scripted.transport,
      delay: async () => {},
    })
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
    const controller = new AbortController()
    const scripted = scriptedTransport()
    const warns: string[] = []
    const credentials = {
      async readRecord() {
        await new Promise((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => { reject(new Error('the credential read was aborted')) }, { once: true })
        })
        throw new Error('unreachable')
      },
      async modifyRecord() { throw new Error('unreachable') },
    } as unknown as CredentialProvider
    const provider = new WeixinChannelProvider({
      pollTimeoutMs: 30,
      pollRetryAttempts: 1,
      pollBackoffMs: 1,
      sendRetryAttempts: 1,
      sendBackoffMs: 1,
      throttleDelayMs: 1,
      breakerThreshold: 2,
      chunkLength: 10,
      lockDirectory: await tempRoot(),
    }, {
      credentials,
      resumeCursors: () => [],
      warn: (message) => { warns.push(message) },
      transport: scripted.transport,
      delay: async () => {},
    })
    const control = {
      signal: controller.signal,
      publish: () => {},
      changed: () => {},
    } as unknown as ChannelProviderControl
    provider.attach(control)
    controller.abort(new Error('disposed at once'))
    await settle()
    expect(warns).toEqual([])
    expect(provider.state).toEqual({ status: 'idle' })
  })
})
