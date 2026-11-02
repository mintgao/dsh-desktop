/**
 * The long poll: cursor advancement, the bounded cycle retry, the circuit
 * breaker, session expiry, and the abort paths.
 */

import { describe, expect, it } from 'vitest'
import { ChannelId } from '@deepseek-ai/dsh-channel'
import type { ChannelInboundMessage } from '@deepseek-ai/dsh-channel'
import { WeixinPollLoop } from '../src/poll.ts'
import { WeixinApiError } from '../src/transport.ts'
import type { WeixinTransport, WeixinUpdateBatch } from '../src/transport.ts'

/** One publishable raw update. */
function update(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    from_user_id: 'sender-1',
    message_id: 'm-1',
    item_list: [{ type: 1, text_item: { text: 'hello' } }],
    ...overrides,
  }
}

/** One scripted poll loop and the observations a test asserts against. */
function harness(options: {
  readonly script: Array<WeixinUpdateBatch | Error>
  readonly attempts?: number
  readonly breakerThreshold?: number
  readonly backoffMs?: number
  readonly cursor?: string
  readonly timeoutMs?: number
  readonly now?: () => number
  readonly delay?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined
  readonly onCycle?: () => Promise<void>
  readonly abortBeforeCall?: number
  readonly useRealTimer?: boolean
}): {
  readonly loop: WeixinPollLoop
  readonly controller: AbortController
  readonly published: ChannelInboundMessage[]
  readonly tokens: Array<{ conversationId: string; token: string }>
  readonly calls: Array<{ cursor: string; timeoutMs: number }>
  readonly warns: string[]
  readonly waits: number[]
  readonly connections: () => number
  readonly cycles: () => number
} {
  const controller = new AbortController()
  const published: ChannelInboundMessage[] = []
  const tokens: Array<{ conversationId: string; token: string }> = []
  const calls: Array<{ cursor: string; timeoutMs: number }> = []
  const warns: string[] = []
  const waits: number[] = []
  const script = [...options.script]
  let connections = 0
  let cycles = 0
  const transport: WeixinTransport = {
    async fetchQr() { throw new Error('the poll script makes no QR calls') },
    async qrStatus() { throw new Error('the poll script makes no QR calls') },
    async getUpdates(request) {
      calls.push({ cursor: request.cursor, timeoutMs: request.timeoutMs })
      if (calls.length === options.abortBeforeCall) {
        controller.abort(new Error('the poll was stopped'))
        throw new Error('the poll was stopped')
      }
      const next = script.shift()
      if (next === undefined) {
        controller.abort(new Error('the poll script is exhausted'))
        throw new Error('the poll script is exhausted')
      }
      if (next instanceof Error) throw next
      return next
    },
    async sendMessage() { throw new Error('the poll script makes no send calls') },
  }
  const loop = new WeixinPollLoop({
    transport,
    auth: { baseUrl: 'https://shard.example', token: 'token-1' },
    channel: ChannelId('weixin'),
    accountId: 'bot@im.bot',
    cursor: options.cursor ?? '',
    timeoutMs: options.timeoutMs ?? 35_000,
    attempts: options.attempts ?? 1,
    backoffMs: options.backoffMs ?? 5,
    breakerThreshold: options.breakerThreshold ?? 3,
    publish: (message) => { published.push(message) },
    rememberContextToken: (conversationId, token) => { tokens.push({ conversationId, token }) },
    onConnected: () => { connections += 1 },
    onCycle: options.onCycle ?? (async () => { cycles += 1 }),
    warn: (message) => { warns.push(message) },
    now: options.now,
    delay: options.useRealTimer === true ? undefined : (options.delay ?? (async (ms) => { waits.push(ms) })),
  })
  return {
    loop,
    controller,
    published,
    tokens,
    calls,
    warns,
    waits,
    connections: () => connections,
    cycles: () => cycles,
  }
}

describe('WeixinPollLoop', () => {
  it('publishes the normalized messages, remembers the reply context, and announces the first cycle', async () => {
    const test = harness({
      now: () => 7,
      script: [{
        updates: [
          update({ context_token: 'ctx-1' }),
          {},
          update({ from_user_id: 'bot@im.bot', message_id: 'm-2' }),
        ],
        cursor: 'cursor-2',
        longPollTimeoutMs: 30_000,
      }],
    })
    await expect(test.loop.run(test.controller.signal)).resolves.toEqual({ kind: 'aborted' })
    expect(test.published).toEqual([{
      channel: 'weixin',
      conversationId: 'sender-1',
      sender: 'sender-1',
      messageId: 'm-1',
      text: 'hello',
      receivedAt: 7,
      event: { kind: 'weixin', messageType: 'text' },
    }])
    expect(test.tokens).toEqual([{ conversationId: 'sender-1', token: 'ctx-1' }])
    expect(test.calls).toEqual([
      { cursor: '', timeoutMs: 35_000 },
      { cursor: 'cursor-2', timeoutMs: 30_000 },
    ])
    expect(test.connections()).toBe(1)
    expect(test.warns).toEqual([])
  })

  it('carries the cursor a batch was requested at, not the batch own next one', async () => {
    const test = harness({ cursor: 'cursor-1', script: [{ updates: [update()], cursor: 'cursor-2' }] })
    await test.loop.run(test.controller.signal)
    expect(test.published).toHaveLength(1)
    expect(test.published[0]).toMatchObject({ providerCursor: 'cursor-1' })
    expect(Number.isFinite(test.published[0]?.receivedAt)).toBe(true)
  })

  it('keeps the cursor and the timeout when a batch reports neither', async () => {
    const test = harness({ cursor: 'cursor-1', script: [{ updates: [], longPollTimeoutMs: 0 }] })
    await test.loop.run(test.controller.signal)
    expect(test.calls).toEqual([
      { cursor: 'cursor-1', timeoutMs: 35_000 },
      { cursor: 'cursor-1', timeoutMs: 35_000 },
    ])
  })

  it('retries a transient failure inside the cycle without reporting it', async () => {
    const test = harness({ attempts: 2, script: [new Error('flaky'), { updates: [] }] })
    await test.loop.run(test.controller.signal)
    expect(test.waits).toEqual([5])
    expect(test.warns).toEqual([])
    expect(test.connections()).toBe(1)
  })

  it('reports a failed cycle, waits, and counts the next failure from one again', async () => {
    const test = harness({
      breakerThreshold: 3,
      script: [new Error('down'), { updates: [] }, new Error('down'), { updates: [] }],
    })
    await test.loop.run(test.controller.signal)
    expect(test.warns).toEqual([
      'channel-weixin poll failed (1/3): down',
      'channel-weixin poll failed (1/3): down',
    ])
    expect(test.waits).toEqual([5, 5])
  })

  it('opens the breaker at the threshold', async () => {
    const test = harness({ breakerThreshold: 2, script: [new Error('down'), new Error('down')] })
    await expect(test.loop.run(test.controller.signal)).resolves.toEqual({ kind: 'breaker', diagnostic: 'down' })
    expect(test.warns).toEqual(['channel-weixin poll failed (1/2): down'])
  })

  it('stops on an expired session without retrying the cycle', async () => {
    const test = harness({ attempts: 2, script: [new WeixinApiError('stale', { ret: -14 })] })
    await expect(test.loop.run(test.controller.signal)).resolves.toEqual({ kind: 'expired' })
    expect(test.calls).toHaveLength(1)
    expect(test.warns).toEqual([])
  })

  it('returns aborted without a single call when the signal is already aborted', async () => {
    const test = harness({ script: [] })
    test.controller.abort(new Error('stopped before the run'))
    await expect(test.loop.run(test.controller.signal)).resolves.toEqual({ kind: 'aborted' })
    expect(test.calls).toEqual([])
    expect(test.cycles()).toBe(0)
  })

  it('returns aborted when the signal aborts while a call is in flight', async () => {
    const test = harness({ attempts: 2, script: [new Error('unreachable')], abortBeforeCall: 1 })
    await expect(test.loop.run(test.controller.signal)).resolves.toEqual({ kind: 'aborted' })
    expect(test.warns).toEqual([])
  })

  it('ends the run when the lock heartbeat rejects', async () => {
    const test = harness({
      script: [],
      onCycle: async () => { throw new Error('the token lock was taken over by holder-b') },
    })
    await expect(test.loop.run(test.controller.signal)).rejects.toThrow('the token lock was taken over by holder-b')
    expect(test.calls).toEqual([])
  })

  it('waits with the real timer when no helper is injected', async () => {
    const test = harness({
      backoffMs: 1,
      breakerThreshold: 2,
      useRealTimer: true,
      script: [new Error('down'), { updates: [] }],
    })
    await test.loop.run(test.controller.signal)
    expect(test.connections()).toBe(1)
  })

  it('returns aborted when the signal aborts during the backoff wait', async () => {
    const test = harness({
      script: [new Error('down')],
      delay: async () => { test.controller.abort(new Error('stopped during the wait')) },
    })
    await expect(test.loop.run(test.controller.signal)).resolves.toEqual({ kind: 'aborted' })
  })

  it('returns aborted when the wait itself rejects with the abort', async () => {
    const test = harness({
      script: [new Error('down')],
      delay: async () => {
        test.controller.abort(new Error('stopped during the wait'))
        throw new Error('stopped during the wait')
      },
    })
    await expect(test.loop.run(test.controller.signal)).resolves.toEqual({ kind: 'aborted' })
  })

  it('surfaces a wait failure that is not an abort', async () => {
    const test = harness({
      script: [new Error('down')],
      delay: async () => { throw new Error('the timer itself failed') },
    })
    await expect(test.loop.run(test.controller.signal)).rejects.toThrow('the timer itself failed')
  })

  it('returns aborted when the signal aborts during a cycle retry wait', async () => {
    const test = harness({
      attempts: 3,
      script: [new Error('flaky')],
      delay: async () => {
        test.controller.abort(new Error('stopped during the retry'))
        throw new Error('stopped during the retry')
      },
    })
    await expect(test.loop.run(test.controller.signal)).resolves.toEqual({ kind: 'aborted' })
  })
})
