/**
 * The QR login sequence: code fetch, status polling, the redirect host, the
 * refresh bound, and the phase reporting a settings page renders.
 */

import { describe, expect, it } from 'vitest'
import { WeixinLoginSequence } from '../src/login.ts'
import { ILINK_BASE_URL } from '../src/transport.ts'
import type { WeixinQrChallenge, WeixinQrStatus, WeixinTransport } from '../src/transport.ts'
import type { WeixinLoginGrant, WeixinLoginState } from '../src/types.ts'

/** The login product one confirmed script yields. */
const GRANT: WeixinLoginGrant = { accountId: 'bot@im.bot', token: 'token-1', baseUrl: 'https://shard.example', userId: 'user-1' }

/** One scripted transport and the observations a test asserts against. */
function harness(
  challenges: WeixinQrChallenge[] = [{ code: 'code-1', url: 'https://liteapp.example/1' }],
  options: { readonly pollIntervalMs?: number; readonly delay?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined } = {},
): {
  readonly transport: WeixinTransport
  readonly states: WeixinLoginState[]
  readonly statusCalls: Array<{ code: string; baseUrl: string }>
  readonly waits: number[]
  readonly fetchCount: () => number
  readonly sequence: WeixinLoginSequence
  readonly setStatuses: (statuses: Array<WeixinQrStatus | Error>) => void
} {
  const states: WeixinLoginState[] = []
  const statusCalls: Array<{ code: string; baseUrl: string }> = []
  const waits: number[] = []
  const script = { challenges: [...challenges], statuses: [] as Array<WeixinQrStatus | Error>, fetches: 0 }
  const transport: WeixinTransport = {
    async fetchQr() {
      script.fetches += 1
      const challenge = script.challenges.shift()
      if (challenge === undefined) throw new Error('the script has no more QR challenges')
      return challenge
    },
    async qrStatus(code, baseUrl) {
      statusCalls.push({ code, baseUrl })
      const next = script.statuses.shift()
      if (next === undefined) throw new Error('the script has no more QR statuses')
      if (next instanceof Error) throw next
      return next
    },
    async getUpdates() { throw new Error('the login script makes no poll calls') },
    async sendMessage() { throw new Error('the login script makes no send calls') },
  }
  const sequence = new WeixinLoginSequence({
    transport,
    onState: (state) => { states.push(state) },
    delay: async (ms) => { waits.push(ms) },
    ...options,
  })
  return {
    transport,
    states,
    statusCalls,
    waits,
    fetchCount: () => script.fetches,
    sequence,
    setStatuses: (statuses) => { script.statuses = [...statuses] },
  }
}

describe('WeixinLoginSequence', () => {
  it('reports the waiting code and confirms a scan', async () => {
    const test = harness()
    test.setStatuses([{ status: 'wait' }, { status: 'scanned' }, { status: 'confirmed', grant: GRANT }])
    const signal = new AbortController().signal
    await test.sequence.begin(signal)
    expect(test.sequence.state).toEqual({ phase: 'waiting', qrUrl: 'https://liteapp.example/1' })
    await expect(test.sequence.wait(signal)).resolves.toEqual(GRANT)
    expect(test.states).toEqual([
      { phase: 'waiting', qrUrl: 'https://liteapp.example/1' },
      { phase: 'scanned', qrUrl: 'https://liteapp.example/1' },
      { phase: 'confirmed' },
    ])
    expect(test.statusCalls).toEqual([
      { code: 'code-1', baseUrl: ILINK_BASE_URL },
      { code: 'code-1', baseUrl: ILINK_BASE_URL },
      { code: 'code-1', baseUrl: ILINK_BASE_URL },
    ])
  })

  it('reports a code without a scannable URL without one, and does not repeat an unchanged phase', async () => {
    const test = harness([{ code: 'code-1', url: '' }])
    test.setStatuses([{ status: 'wait' }, { status: 'scanned' }, { status: 'confirmed', grant: GRANT }])
    const signal = new AbortController().signal
    await test.sequence.begin(signal)
    await test.sequence.wait(signal)
    expect(test.states).toEqual([
      { phase: 'waiting', qrUrl: undefined },
      { phase: 'scanned', qrUrl: undefined },
      { phase: 'confirmed' },
    ])
  })

  it('does not repeat an unchanged phase', async () => {
    const test = harness()
    test.setStatuses([{ status: 'scanned' }, { status: 'scanned' }, { status: 'confirmed', grant: GRANT }])
    const signal = new AbortController().signal
    await test.sequence.begin(signal)
    await test.sequence.wait(signal)
    expect(test.states).toEqual([
      { phase: 'waiting', qrUrl: 'https://liteapp.example/1' },
      { phase: 'scanned', qrUrl: 'https://liteapp.example/1' },
      { phase: 'confirmed' },
    ])
  })

  it('waits with the real timer when no helper is injected', async () => {
    const test = harness(undefined, { delay: undefined, pollIntervalMs: 1 })
    test.setStatuses([{ status: 'wait' }, { status: 'confirmed', grant: GRANT }])
    const signal = new AbortController().signal
    await test.sequence.begin(signal)
    await expect(test.sequence.wait(signal)).resolves.toEqual(GRANT)
  })

  it('waits the configured poll interval, or the default one', async () => {
    const shortened = harness(undefined, { pollIntervalMs: 1 })
    shortened.setStatuses([{ status: 'wait' }, { status: 'confirmed', grant: GRANT }])
    await shortened.sequence.begin(new AbortController().signal)
    await shortened.sequence.wait(new AbortController().signal)
    expect(shortened.waits).toEqual([1])

    const defaulted = harness()
    defaulted.setStatuses([{ status: 'wait' }, { status: 'confirmed', grant: GRANT }])
    await defaulted.sequence.begin(new AbortController().signal)
    await defaulted.sequence.wait(new AbortController().signal)
    expect(defaulted.waits).toEqual([1_000])
  })

  it('follows a redirect host for the status polls', async () => {
    const test = harness()
    test.setStatuses([{ status: 'redirect', baseUrl: 'https://other.example' }, { status: 'confirmed', grant: GRANT }])
    const signal = new AbortController().signal
    await test.sequence.begin(signal)
    await test.sequence.wait(signal)
    expect(test.statusCalls[1]).toEqual({ code: 'code-1', baseUrl: 'https://other.example' })
  })

  it('refreshes an expired code within the bound and then fails', async () => {
    const test = harness([
      { code: 'code-1', url: 'https://liteapp.example/1' },
      { code: 'code-2', url: 'https://liteapp.example/2' },
      { code: 'code-3', url: 'https://liteapp.example/3' },
      { code: 'code-4', url: 'https://liteapp.example/4' },
    ])
    test.setStatuses([{ status: 'expired' }, { status: 'expired' }, { status: 'expired' }, { status: 'expired' }])
    const signal = new AbortController().signal
    await test.sequence.begin(signal)
    await expect(test.sequence.wait(signal)).rejects.toThrow('expired 4 times without a scan')
    expect(test.fetchCount()).toBe(4)
    expect(test.states.at(-1)).toMatchObject({ phase: 'failed' })
    expect(test.states.filter(state => state.phase === 'waiting')).toHaveLength(4)
  })

  it('keeps polling when a status call fails', async () => {
    const test = harness()
    test.setStatuses([new Error('the status call failed'), { status: 'confirmed', grant: GRANT }])
    const signal = new AbortController().signal
    await test.sequence.begin(signal)
    await expect(test.sequence.wait(signal)).resolves.toEqual(GRANT)
  })

  it('fails the sequence when the first code cannot be fetched', async () => {
    const failing: WeixinTransport = {
      async fetchQr() { throw new Error('the QR endpoint is down') },
      async qrStatus() { throw new Error('unreachable') },
      async getUpdates() { throw new Error('unreachable') },
      async sendMessage() { throw new Error('unreachable') },
    }
    const states: WeixinLoginState[] = []
    const sequence = new WeixinLoginSequence({ transport: failing, onState: (state) => { states.push(state) }, delay: async () => {} })
    await expect(sequence.begin(new AbortController().signal)).rejects.toThrow('the QR endpoint is down')
    expect(states).toEqual([{ phase: 'failed', diagnostic: 'the QR endpoint is down' }])
  })

  it('rejects the wait before any code was fetched', async () => {
    const test = harness()
    await expect(test.sequence.wait(new AbortController().signal)).rejects.toThrow('no live QR code')
  })

  it('rejects an aborted sequence without reporting a failure', async () => {
    const test = harness()
    const controller = new AbortController()
    await test.sequence.begin(controller.signal)
    controller.abort(new Error('the login was cancelled'))
    await expect(test.sequence.wait(controller.signal)).rejects.toThrow('the login was cancelled')
    expect(test.states).toEqual([{ phase: 'waiting', qrUrl: 'https://liteapp.example/1' }])
  })

  it('classifies an abort that lands during a status call', async () => {
    const controller = new AbortController()
    const transport: WeixinTransport = {
      async fetchQr() { return { code: 'code-1', url: 'https://liteapp.example/1' } },
      async qrStatus() {
        controller.abort()
        throw new Error('the socket closed')
      },
      async getUpdates() { throw new Error('unreachable') },
      async sendMessage() { throw new Error('unreachable') },
    }
    const sequence = new WeixinLoginSequence({ transport, onState: () => {}, delay: async () => {} })
    await sequence.begin(controller.signal)
    await expect(sequence.wait(controller.signal)).rejects.toThrow()
    await expect(sequence.wait(controller.signal)).rejects.toThrow()
  })

  it('reports an abort during the code fetch as a cancellation', async () => {
    const controller = new AbortController()
    const transport: WeixinTransport = {
      async fetchQr() {
        controller.abort(new Error('the login was cancelled'))
        throw new Error('the socket closed')
      },
      async qrStatus() { throw new Error('unreachable') },
      async getUpdates() { throw new Error('unreachable') },
      async sendMessage() { throw new Error('unreachable') },
    }
    const states: WeixinLoginState[] = []
    const sequence = new WeixinLoginSequence({ transport, onState: (state) => { states.push(state) }, delay: async () => {} })
    await expect(sequence.begin(controller.signal)).rejects.toThrow('the login was cancelled')
    expect(states).toEqual([])
  })
})
