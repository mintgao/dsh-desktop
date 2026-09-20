/**
 * The outbound send path: chunk splitting, the bounded retry, the throttle
 * wait, and the tokenless fallback a stale session gets.
 */

import { describe, expect, it } from 'vitest'
import { sendChunked, splitText } from '../src/send.ts'
import type { WeixinSendRequest } from '../src/send.ts'
import { WeixinApiError } from '../src/transport.ts'
import type { WeixinTransport } from '../src/transport.ts'

/** One iLink failure of the given codes. */
function failure(ret: number, errmsg?: string): WeixinApiError {
  return new WeixinApiError(`scripted failure ret=${ret}`, { ret, errmsg })
}

/** One scripted send path and the observations a test asserts against. */
function harness(outcomes: Array<Error | undefined>, overrides: Partial<WeixinSendRequest> = {}): {
  readonly sends: Array<{ conversationId: string; text: string; clientId: string; contextToken: string | undefined }>
  readonly waits: number[]
  readonly request: WeixinSendRequest
} {
  const sends: Array<{ conversationId: string; text: string; clientId: string; contextToken: string | undefined }> = []
  const waits: number[] = []
  const transport: WeixinTransport = {
    async fetchQr() { throw new Error('the send script makes no QR calls') },
    async qrStatus() { throw new Error('the send script makes no QR calls') },
    async getUpdates() { throw new Error('the send script makes no poll calls') },
    async sendMessage(request) {
      sends.push({
        conversationId: request.conversationId,
        text: request.text,
        clientId: request.clientId,
        contextToken: request.contextToken,
      })
      const next = outcomes.shift()
      if (next instanceof Error) throw next
    },
  }
  const request: WeixinSendRequest = {
    transport,
    auth: { baseUrl: 'https://shard.example', token: 'token-1' },
    conversationId: 'sender-1',
    text: 'hello',
    chunkLength: 10,
    attempts: 2,
    backoffMs: 5,
    throttleDelayMs: 7,
    signal: new AbortController().signal,
    delay: async (ms) => { waits.push(ms) },
    ...overrides,
  }
  return { sends, waits, request }
}

describe('splitText', () => {
  it('keeps a short reply whole and splits a long one at its breaks', () => {
    expect(splitText('short', 10)).toEqual(['short'])
    expect(splitText('line one\nline two', 10)).toEqual(['line one', 'line two'])
    expect(splitText('word word word', 10)).toEqual(['word word', 'word'])
  })

  it('cuts hard when the window has no break, and drops the boundary character', () => {
    expect(splitText('abcdefghijk', 4)).toEqual(['abcd', 'efgh', 'ijk'])
    expect(splitText('\nabcdefgh', 4)).toEqual(['\nabc', 'defg', 'h'])
    expect(splitText('a\nb\nc\nd\ne\nf', 4)).toEqual(['a\nb', 'c\nd', 'e\nf'])
  })
})

describe('sendChunked', () => {
  it('sends one reply with a client-minted identity as the receipt', async () => {
    const test = harness([undefined], { contextToken: 'ctx-1' })
    const receipt = await sendChunked(test.request)
    expect(test.sends).toHaveLength(1)
    expect(test.sends[0]).toMatchObject({ conversationId: 'sender-1', text: 'hello', contextToken: 'ctx-1' })
    expect(receipt.platformMessageId).toBe(test.sends[0]?.clientId)
    expect(receipt.platformMessageId).toMatch(/^dsh-weixin-/)
  })

  it('omits the context token when the conversation has none', async () => {
    const test = harness([undefined])
    await sendChunked(test.request)
    expect(test.sends[0]?.contextToken).toBeUndefined()
  })

  it('sends every chunk in order under one client identity', async () => {
    const test = harness([undefined, undefined, undefined], { text: 'one two three four', chunkLength: 8 })
    const receipt = await sendChunked(test.request)
    expect(test.sends.map(send => send.text)).toEqual(['one two', 'three', 'four'])
    expect(new Set(test.sends.map(send => send.clientId)).size).toBe(1)
    expect(receipt.platformMessageId).toBe(test.sends[0]?.clientId)
  })

  it('waits out a frequency limit and retries', async () => {
    const test = harness([failure(-2, 'rate limited'), undefined])
    await sendChunked(test.request)
    expect(test.sends).toHaveLength(2)
    expect(test.waits).toEqual([7])
  })

  it('waits with the real timer when no helper is injected', async () => {
    const test = harness([failure(-2, 'rate limited'), undefined], { delay: undefined, throttleDelayMs: 1 })
    await sendChunked(test.request)
    expect(test.sends).toHaveLength(2)
  })

  it('backs off a transient failure and gives up after the attempts', async () => {
    const test = harness([new Error('the socket closed'), new Error('the socket closed')])
    await expect(sendChunked(test.request)).rejects.toThrow('the socket closed')
    expect(test.waits).toEqual([5])
  })

  it('backs off an iLink failure that is neither a limit nor a stale session', async () => {
    const test = harness([new WeixinApiError('scripted failure ret=-1', { ret: -1 }), undefined])
    await sendChunked(test.request)
    expect(test.sends).toHaveLength(2)
    expect(test.waits).toEqual([5])
  })

  it('retries a stale session once without the context token', async () => {
    const test = harness([failure(-14), undefined], { contextToken: 'ctx-1' })
    await sendChunked(test.request)
    expect(test.sends).toHaveLength(2)
    expect(test.sends[0]?.contextToken).toBe('ctx-1')
    expect(test.sends[1]?.contextToken).toBeUndefined()
    expect(test.waits).toEqual([])
  })

  it('fails a stale session immediately when no context token is in hand', async () => {
    const test = harness([failure(-14), undefined])
    await expect(sendChunked(test.request)).rejects.toThrow('scripted failure ret=-14')
    expect(test.sends).toHaveLength(1)
  })

  it('fails a stale session that survives the tokenless retry', async () => {
    const test = harness([failure(-14), failure(-2, 'prepare failed')], { contextToken: 'ctx-1' })
    await expect(sendChunked(test.request)).rejects.toThrow('scripted failure ret=-2')
    expect(test.sends).toHaveLength(2)
  })

  it('reports a cancellation instead of sending', async () => {
    const controller = new AbortController()
    controller.abort(new Error('the reply was abandoned'))
    const test = harness([undefined], { signal: controller.signal })
    await expect(sendChunked(test.request)).rejects.toThrow('the reply was abandoned')
    expect(test.sends).toHaveLength(0)
  })

  it('classifies an abort that lands during a send call', async () => {
    const controller = new AbortController()
    const transport: WeixinTransport = {
      async fetchQr() { throw new Error('unreachable') },
      async qrStatus() { throw new Error('unreachable') },
      async getUpdates() { throw new Error('unreachable') },
      async sendMessage() {
        controller.abort()
        throw new Error('the socket closed')
      },
    }
    const request: WeixinSendRequest = {
      transport,
      auth: { baseUrl: 'https://shard.example', token: 'token-1' },
      conversationId: 'sender-1',
      text: 'hello',
      chunkLength: 10,
      attempts: 2,
      backoffMs: 5,
      throttleDelayMs: 7,
      signal: controller.signal,
      delay: async () => {},
    }
    await expect(sendChunked(request)).rejects.toThrow()
  })

  it('classifies an abort that lands during the retry wait', async () => {
    const controller = new AbortController()
    const transport: WeixinTransport = {
      async fetchQr() { throw new Error('unreachable') },
      async qrStatus() { throw new Error('unreachable') },
      async getUpdates() { throw new Error('unreachable') },
      async sendMessage() { throw new Error('the socket closed') },
    }
    const request: WeixinSendRequest = {
      transport,
      auth: { baseUrl: 'https://shard.example', token: 'token-1' },
      conversationId: 'sender-1',
      text: 'hello',
      chunkLength: 10,
      attempts: 3,
      backoffMs: 5,
      throttleDelayMs: 7,
      signal: controller.signal,
      delay: async () => { controller.abort(new Error('the reply was abandoned')) },
    }
    await expect(sendChunked(request)).rejects.toThrow('the reply was abandoned')
  })
})
