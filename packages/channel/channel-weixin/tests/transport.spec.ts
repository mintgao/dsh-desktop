/**
 * The iLink transport over a scripted fetch: URL shapes, headers, request
 * bodies, the response decoding, and the error classification.
 */

import { describe, expect, it } from 'vitest'
import {
  createHttpTransport,
  errorMessage,
  ILINK_BASE_URL,
  isRateLimited,
  isSessionExpired,
  SESSION_EXPIRED_ERRCODE,
  WeixinApiError,
} from '../src/transport.ts'

/** One scripted HTTP response. */
interface ScriptedResponse {
  readonly status?: number
  readonly body?: string
}

/** A fetch stand-in that answers the scripted outcomes in order. */
function fakeFetch(outcomes: Array<ScriptedResponse | Error>): {
  readonly impl: typeof fetch
  readonly calls: Array<{ url: string; init: RequestInit }>
} {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    const next = outcomes.shift()
    if (next instanceof Error) throw next
    if (next === undefined) throw new Error('the script has no more responses')
    const status = next.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => next.body ?? '',
    } as Response
  }) as typeof fetch
  return { impl, calls }
}

/** The headers one recorded call carried. */
function headersOf(call: { init: RequestInit } | undefined): Record<string, string> {
  return (call?.init.headers ?? {}) as Record<string, string>
}

const AUTH = { baseUrl: 'https://shard.example', token: 'token-1' }

describe('createHttpTransport', () => {
  describe('fetchQr', () => {
    it('reads the code and the scannable URL', async () => {
      const fake = fakeFetch([{ body: JSON.stringify({ qrcode: 'code-1', qrcode_img_content: 'https://liteapp.example/1' }) }])
      const challenge = await createHttpTransport(fake.impl).fetchQr(new AbortController().signal)
      expect(challenge).toEqual({ code: 'code-1', url: 'https://liteapp.example/1' })
      expect(fake.calls[0]?.url).toBe(`${ILINK_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`)
      expect(headersOf(fake.calls[0])['iLink-App-Id']).toBe('bot')
    })

    it('treats a missing or non-string image content as no URL', async () => {
      const absent = fakeFetch([{ body: JSON.stringify({ qrcode: 'code-1' }) }])
      await expect(createHttpTransport(absent.impl).fetchQr(new AbortController().signal))
        .resolves.toEqual({ code: 'code-1', url: '' })
      const mistyped = fakeFetch([{ body: JSON.stringify({ qrcode: 'code-1', qrcode_img_content: 5 }) }])
      await expect(createHttpTransport(mistyped.impl).fetchQr(new AbortController().signal))
        .resolves.toEqual({ code: 'code-1', url: '' })
    })

    it('fails a response without a code', async () => {
      const fake = fakeFetch([{ body: JSON.stringify({ qrcode: '' }) }])
      await expect(createHttpTransport(fake.impl).fetchQr(new AbortController().signal))
        .rejects.toThrow('carried no qrcode')
    })
  })

  describe('response decoding', () => {
    it('fails a non-OK HTTP status with an excerpt of the body', async () => {
      const fake = fakeFetch([{ status: 502, body: 'bad gateway' }])
      await expect(createHttpTransport(fake.impl).fetchQr(new AbortController().signal))
        .rejects.toThrow('answered HTTP 502: bad gateway')
    })

    it('fails a body that is not JSON', async () => {
      const fake = fakeFetch([{ body: '<html>login</html>' }])
      await expect(createHttpTransport(fake.impl).fetchQr(new AbortController().signal))
        .rejects.toThrow('not JSON')
    })

    it('fails a JSON body that is not an object', async () => {
      for (const body of ['"a string"', 'null', '[1,2]']) {
        const fake = fakeFetch([{ body }])
        await expect(createHttpTransport(fake.impl).fetchQr(new AbortController().signal))
          .rejects.toThrow('not a JSON object')
      }
    })

    it('fails a non-zero platform return code and keeps its fields', async () => {
      const fake = fakeFetch([{ body: JSON.stringify({ ret: SESSION_EXPIRED_ERRCODE }) }])
      await expect(createHttpTransport(fake.impl).fetchQr(new AbortController().signal)).rejects.toThrow('ret=-14')
      const withMessage = fakeFetch([{ body: JSON.stringify({ errcode: -2, msg: 'prepare failed' }) }])
      try {
        await createHttpTransport(withMessage.impl).fetchQr(new AbortController().signal)
        throw new Error('the call should have failed')
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(WeixinApiError)
        expect((error as WeixinApiError).errmsg).toBe('prepare failed')
      }
    })

    it('accepts a zero return code and ignores a non-numeric one', async () => {
      const zeroed = fakeFetch([{ body: JSON.stringify({ ret: 0, errcode: 0, qrcode: 'code-1' }) }])
      await expect(createHttpTransport(zeroed.impl).fetchQr(new AbortController().signal))
        .resolves.toEqual({ code: 'code-1', url: '' })
      const mistyped = fakeFetch([{ body: JSON.stringify({ ret: 'x', qrcode: 'code-1' }) }])
      await expect(createHttpTransport(mistyped.impl).fetchQr(new AbortController().signal))
        .resolves.toEqual({ code: 'code-1', url: '' })
    })
  })

  describe('qrStatus', () => {
    /** One status poll over a scripted body. */
    async function poll(body: Record<string, unknown>): Promise<unknown> {
      const fake = fakeFetch([{ body: JSON.stringify(body) }])
      return await createHttpTransport(fake.impl).qrStatus('code-1', 'https://shard.example', new AbortController().signal)
    }

    it('maps the platform statuses, treating unknown and absent ones as waiting', async () => {
      await expect(poll({ status: 'wait' })).resolves.toEqual({ status: 'wait' })
      await expect(poll({})).resolves.toEqual({ status: 'wait' })
      await expect(poll({ status: 'something else' })).resolves.toEqual({ status: 'wait' })
      await expect(poll({ status: 'scaned' })).resolves.toEqual({ status: 'scanned' })
      await expect(poll({ status: 'expired' })).resolves.toEqual({ status: 'expired' })
    })

    it('follows a redirect host, and waits when the platform names none', async () => {
      await expect(poll({ status: 'scaned_but_redirect', redirect_host: 'other.example' }))
        .resolves.toEqual({ status: 'redirect', baseUrl: 'https://other.example' })
      await expect(poll({ status: 'scaned_but_redirect' })).resolves.toEqual({ status: 'wait' })
    })

    it('confirms a scan with its credential payload', async () => {
      await expect(poll({
        status: 'confirmed',
        ilink_bot_id: 'bot@im.bot',
        bot_token: 'token-1',
        baseurl: 'https://shard.example',
        ilink_user_id: 'user-1',
      })).resolves.toEqual({
        status: 'confirmed',
        grant: { accountId: 'bot@im.bot', token: 'token-1', baseUrl: 'https://shard.example', userId: 'user-1' },
      })
    })

    it('defaults the shard and the user when the confirmation omits them', async () => {
      await expect(poll({ status: 'confirmed', ilink_bot_id: 'bot@im.bot', bot_token: 'token-1' }))
        .resolves.toEqual({
          status: 'confirmed',
          grant: { accountId: 'bot@im.bot', token: 'token-1', baseUrl: ILINK_BASE_URL, userId: '' },
        })
    })

    it('fails a confirmation without the credential payload', async () => {
      await expect(poll({ status: 'confirmed', ilink_bot_id: 'bot@im.bot' }))
        .rejects.toThrow('credential payload was incomplete')
    })
  })

  describe('getUpdates', () => {
    it('posts the cursor under the bot headers and decodes the batch', async () => {
      const fake = fakeFetch([{
        body: JSON.stringify({
          msgs: [{ message_id: 'm-1' }, 'not an object', null],
          get_updates_buf: 'cursor-2',
          longpolling_timeout_ms: 30_000,
        }),
      }])
      const batch = await createHttpTransport(fake.impl).getUpdates({
        cursor: 'cursor-1',
        timeoutMs: 35_000,
        auth: AUTH,
        signal: new AbortController().signal,
      })
      expect(batch.updates).toEqual([{ message_id: 'm-1' }])
      expect(batch.cursor).toBe('cursor-2')
      expect(batch.longPollTimeoutMs).toBe(30_000)
      const call = fake.calls[0]
      expect(call?.url).toBe('https://shard.example/ilink/bot/getupdates')
      expect(headersOf(call)['Authorization']).toBe('Bearer token-1')
      expect(headersOf(call)['AuthorizationType']).toBe('ilink_bot_token')
      expect(Buffer.from(headersOf(call)['X-WECHAT-UIN'] ?? '', 'base64').toString('utf8')).toMatch(/^\d+$/)
      expect(JSON.parse(String(call?.init.body))).toEqual({
        get_updates_buf: 'cursor-1',
        base_info: { channel_version: '2.2.0' },
      })
    })

    it('treats a missing message list and cursor as an empty batch', async () => {
      const fake = fakeFetch([{ body: JSON.stringify({}) }])
      await expect(createHttpTransport(fake.impl).getUpdates({
        cursor: '',
        timeoutMs: 35_000,
        auth: AUTH,
        signal: new AbortController().signal,
      })).resolves.toEqual({ updates: [], cursor: undefined, longPollTimeoutMs: undefined })
    })

    it('treats the long-poll timeout as an empty batch', async () => {
      const timeout = new Error('the operation was aborted due to timeout')
      timeout.name = 'TimeoutError'
      const fake = fakeFetch([timeout])
      await expect(createHttpTransport(fake.impl).getUpdates({
        cursor: '',
        timeoutMs: 35_000,
        auth: AUTH,
        signal: new AbortController().signal,
      })).resolves.toEqual({ updates: [] })
    })

    it('keeps a timeout that lands after the caller aborted, and any other failure', async () => {
      const timeout = new Error('the operation was aborted due to timeout')
      timeout.name = 'TimeoutError'
      const controller = new AbortController()
      controller.abort(new Error('the provider unloaded'))
      const aborted = fakeFetch([timeout])
      await expect(createHttpTransport(aborted.impl).getUpdates({
        cursor: '',
        timeoutMs: 35_000,
        auth: AUTH,
        signal: controller.signal,
      })).rejects.toThrow('the operation was aborted due to timeout')
      const failed = fakeFetch([new Error('the socket closed')])
      await expect(createHttpTransport(failed.impl).getUpdates({
        cursor: '',
        timeoutMs: 35_000,
        auth: AUTH,
        signal: new AbortController().signal,
      })).rejects.toThrow('the socket closed')
    })
  })

  describe('sendMessage', () => {
    it('posts one text chunk with the reply context when the conversation has one', async () => {
      const fake = fakeFetch([{ body: '{"ret":0}' }])
      await createHttpTransport(fake.impl).sendMessage({
        conversationId: 'sender-1',
        text: 'hello',
        contextToken: 'ctx-1',
        clientId: 'dsh-weixin-1',
        auth: AUTH,
        signal: new AbortController().signal,
      })
      const call = fake.calls[0]
      expect(call?.url).toBe('https://shard.example/ilink/bot/sendmessage')
      expect(headersOf(call)['Authorization']).toBe('Bearer token-1')
      expect(JSON.parse(String(call?.init.body))).toEqual({
        msg: {
          from_user_id: '',
          to_user_id: 'sender-1',
          client_id: 'dsh-weixin-1',
          message_type: 2,
          message_state: 2,
          item_list: [{ type: 1, text_item: { text: 'hello' } }],
          context_token: 'ctx-1',
        },
        base_info: { channel_version: '2.2.0' },
      })
    })

    it('omits the reply context when the conversation has none', async () => {
      const fake = fakeFetch([{ body: '{"ret":0}' }])
      await createHttpTransport(fake.impl).sendMessage({
        conversationId: 'sender-1',
        text: 'hello',
        clientId: 'dsh-weixin-1',
        auth: AUTH,
        signal: new AbortController().signal,
      })
      const body = JSON.parse(String(fake.calls[0]?.init.body)) as { msg: Record<string, unknown> }
      expect('context_token' in body.msg).toBe(false)
    })
  })
})

describe('failure classification', () => {
  it('reads a stale session from either code or the known -2 messages', () => {
    expect(isSessionExpired(new WeixinApiError('x', { ret: SESSION_EXPIRED_ERRCODE }))).toBe(true)
    expect(isSessionExpired(new WeixinApiError('x', { errcode: SESSION_EXPIRED_ERRCODE }))).toBe(true)
    expect(isSessionExpired(new WeixinApiError('x', { ret: -2, errmsg: 'UNKNOWN ERROR' }))).toBe(true)
    expect(isSessionExpired(new WeixinApiError('x', { errcode: -2, errmsg: 'prepare failed' }))).toBe(true)
    expect(isSessionExpired(new WeixinApiError('x', { ret: -2, errmsg: 'something else' }))).toBe(false)
    expect(isSessionExpired(new WeixinApiError('x'))).toBe(false)
  })

  it('reads a frequency limit as a limit only when the session is live', () => {
    expect(isRateLimited(new WeixinApiError('x', { ret: -2, errmsg: 'rate limited' }))).toBe(true)
    expect(isRateLimited(new WeixinApiError('x', { errcode: -2 }))).toBe(true)
    expect(isRateLimited(new WeixinApiError('x', { ret: -2, errmsg: 'prepare failed' }))).toBe(false)
    expect(isRateLimited(new WeixinApiError('x'))).toBe(false)
  })

  it('renders any thrown value for a diagnostic line', () => {
    expect(errorMessage(new Error('the socket closed'))).toBe('the socket closed')
    expect(errorMessage('a bare failure')).toBe('a bare failure')
  })
})
