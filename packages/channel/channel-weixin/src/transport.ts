/**
 * The iLink HTTP/JSON transport: the one place the WeChat provider speaks to
 * Tencent's iLink Bot API (`https://ilinkai.weixin.qq.com`). Every call runs on
 * Node builtins — `fetch`, `AbortSignal.timeout`, and `node:crypto` for the
 * request nonce — because a Mint package may not declare a third-party runtime
 * dependency. The wire constants come from the protocol's reference
 * implementations; the owner-involved real round trip is what confirms them
 * against the platform.
 * @module @deepseek-ai/dsh-channel-weixin/src/transport
 */

import { randomBytes } from 'node:crypto'
import type { WeixinLoginGrant } from './types.ts'

/** The default iLink shard; a login may report another one. */
export const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com'

/** iLink's session-expiry code: the bot token must be replaced by a new scan. */
export const SESSION_EXPIRED_ERRCODE = -14

/** iLink's frequency-limit code: back off and retry, never re-scan. */
export const RATE_LIMIT_ERRCODE = -2

/** iLink item type of a plain text message. */
export const ITEM_TEXT = 1

/** One raw inbound message of a `get_updates` batch; only the fields this provider reads are declared. */
export interface WeixinRawUpdate {
  readonly from_user_id?: unknown
  readonly to_user_id?: unknown
  readonly message_id?: unknown
  readonly room_id?: unknown
  readonly chat_room_id?: unknown
  readonly msg_type?: unknown
  readonly context_token?: unknown
  readonly item_list?: unknown
}

/** One `get_updates` batch: the raw messages, the next cursor, and the platform's suggested poll timeout. */
export interface WeixinUpdateBatch {
  /** Raw messages of this batch, in platform order. */
  readonly updates: readonly WeixinRawUpdate[]
  /** Stream position to resume from; absent keeps the caller's cursor. */
  readonly cursor?: string | undefined
  /** Long-poll timeout the platform suggests for the next request, in milliseconds. */
  readonly longPollTimeoutMs?: number | undefined
}

/** Where to reach one bot's shard and how to authenticate its calls. */
export interface WeixinAuth {
  /** Base address of the shard serving this identity. */
  readonly baseUrl: string
  /** Bearer token the platform issued for this bot identity. */
  readonly token: string
}

/** One `get_updates` call. */
export interface WeixinGetUpdatesRequest {
  /** Stream position to resume from; empty starts the stream. */
  readonly cursor: string
  /** Long-poll timeout in milliseconds. */
  readonly timeoutMs: number
  /** The bot's shard address and token. */
  readonly auth: WeixinAuth
  /** Cancels the call when its owner unloads. */
  readonly signal: AbortSignal
}

/** One `send_message` call for a single chunk; chunking belongs to the caller. */
export interface WeixinSendRequest {
  /** Platform conversation to deliver to. */
  readonly conversationId: string
  /** Complete chunk text. */
  readonly text: string
  /** Reply context token echoed while fresh, when the conversation has one. */
  readonly contextToken?: string | undefined
  /** Client-minted message identity the platform echoes back. */
  readonly clientId: string
  /** The bot's shard address and token. */
  readonly auth: WeixinAuth
  /** Cancels the call when its owner unloads. */
  readonly signal: AbortSignal
}

/** One QR challenge as `get_bot_qrcode` reports it. */
export interface WeixinQrChallenge {
  /** Opaque code the status endpoint polls by. */
  readonly code: string
  /** Liteapp URL WeChat scans; the bare code is not a scannable payload. */
  readonly url: string
}

/** One QR status poll outcome. */
export type WeixinQrStatus =
  | { readonly status: 'wait' | 'scanned' | 'expired' }
  | { readonly status: 'redirect'; readonly baseUrl: string }
  | { readonly status: 'confirmed'; readonly grant: WeixinLoginGrant }

/** The iLink calls one WeChat provider makes; tests script a stand-in behind this seam. */
export interface WeixinTransport {
  /** Fetch one login QR from the default shard. */
  fetchQr(signal: AbortSignal): Promise<WeixinQrChallenge>
  /** Poll one QR's status against the shard currently serving it. */
  qrStatus(code: string, baseUrl: string, signal: AbortSignal): Promise<WeixinQrStatus>
  /** Long-poll updates after one cursor; the poll's own timeout is an empty batch, not a failure. */
  getUpdates(request: WeixinGetUpdatesRequest): Promise<WeixinUpdateBatch>
  /** Send one text chunk to one conversation. */
  sendMessage(request: WeixinSendRequest): Promise<void>
}

/** One iLink API failure carrying the platform's own ret, errcode, and message. */
export class WeixinApiError extends Error {
  /** Platform return code, when the response carried one. */
  readonly ret: number | undefined
  /** Platform error code, when the response carried one. */
  readonly errcode: number | undefined
  /** Platform error message, when the response carried one. */
  readonly errmsg: string | undefined

  constructor(message: string, codes: { ret?: number | undefined; errcode?: number | undefined; errmsg?: string | undefined } = {}) {
    super(message)
    this.name = 'WeixinApiError'
    this.ret = codes.ret
    this.errcode = codes.errcode
    this.errmsg = codes.errmsg
  }
}

/** The `-2` messages that mean a stale session rather than a frequency limit. */
const STALE_SESSION_MESSAGES = new Set(['unknown error', 'prepare failed'])

/**
 * Whether one failure means the platform session must be re-established by a scan.
 * @param error - one iLink failure with its platform codes.
 * @returns true when the session is stale and only a new scan revives it.
 */
export function isSessionExpired(error: WeixinApiError): boolean {
  const staleVariant = (error.ret === RATE_LIMIT_ERRCODE || error.errcode === RATE_LIMIT_ERRCODE)
    && STALE_SESSION_MESSAGES.has((error.errmsg ?? '').toLowerCase())
  return error.ret === SESSION_EXPIRED_ERRCODE || error.errcode === SESSION_EXPIRED_ERRCODE || staleVariant
}

/**
 * Whether one failure is iLink's frequency limit — back off and retry.
 * @param error - one iLink failure with its platform codes.
 * @returns true when the failure is a limit rather than a stale session.
 */
export function isRateLimited(error: WeixinApiError): boolean {
  return (error.ret === RATE_LIMIT_ERRCODE || error.errcode === RATE_LIMIT_ERRCODE) && !isSessionExpired(error)
}

/**
 * Render an arbitrary thrown value for a diagnostic line.
 * @param error - the caught value, which need not be an `Error`.
 * @returns the error's message, or the value's string form.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Protocol constants of the iLink Bot API this provider speaks. */
const ILINK_APP_ID = 'bot'
const CHANNEL_VERSION = '2.2.0'
/** `(2 << 16) | (2 << 8) | 0`, the client version the reference implementations send. */
const ILINK_APP_CLIENT_VERSION = 131_584
const EP_GET_BOT_QR = 'ilink/bot/get_bot_qrcode'
const EP_GET_QR_STATUS = 'ilink/bot/get_qrcode_status'
const EP_GET_UPDATES = 'ilink/bot/getupdates'
const EP_SEND_MESSAGE = 'ilink/bot/sendmessage'
/** Bot type the QR endpoint mints codes for. */
const QR_BOT_TYPE = '3'
/** iLink message fields of a bot-originated, finished message. */
const MESSAGE_TYPE_BOT = 2
const MESSAGE_STATE_FINISH = 2
/** HTTP budgets: the QR half and the authenticated half. */
const QR_TIMEOUT_MS = 35_000
const API_TIMEOUT_MS = 15_000

/** One decoded JSON response body. */
type JsonRecord = Record<string, unknown>

/** Read one string field of a decoded response, treating a blank value as absent. */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Read one numeric field of a decoded response. */
function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Build the transport the provider uses outside tests.
 * @param fetchImpl - fetch implementation; tests may substitute one.
 * @returns the iLink transport over Node builtins.
 */
export function createHttpTransport(fetchImpl: typeof fetch = globalThis.fetch): WeixinTransport {
  /** Run one call under the caller's signal and the endpoint's timeout, and decode the JSON body. */
  async function requestJson(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<JsonRecord> {
    const response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new WeixinApiError(`iLink ${init.method} ${url} answered HTTP ${response.status}: ${text.slice(0, 200)}`)
    }
    let decoded: unknown
    try {
      decoded = JSON.parse(text)
    } catch {
      throw new WeixinApiError(`iLink ${init.method} ${url} answered a body that is not JSON: ${text.slice(0, 200)}`)
    }
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      throw new WeixinApiError(`iLink ${init.method} ${url} answered a body that is not a JSON object`)
    }
    const record = decoded as JsonRecord
    const ret = readNumber(record['ret'])
    const errcode = readNumber(record['errcode'])
    if ((ret !== undefined && ret !== 0) || (errcode !== undefined && errcode !== 0)) {
      const errmsg = readString(record['errmsg']) ?? readString(record['msg'])
      throw new WeixinApiError(
        `iLink ${init.method} ${url} failed: ret=${String(ret)} errcode=${String(errcode)} errmsg=${errmsg ?? 'unknown error'}`,
        { ret, errcode, errmsg },
      )
    }
    return record
  }

  /** The unauthenticated headers every QR call carries. */
  const baseHeaders = (): Record<string, string> => ({
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': String(ILINK_APP_CLIENT_VERSION),
  })

  /** The request nonce the platform expects: base64 of a random 32-bit unsigned integer's decimal form. */
  const requestNonce = (): string => Buffer.from(String(randomBytes(4).readUInt32BE(0)), 'utf8').toString('base64')

  return {
    async fetchQr(signal) {
      const record = await requestJson(
        `${ILINK_BASE_URL}/${EP_GET_BOT_QR}?bot_type=${QR_BOT_TYPE}`,
        { method: 'GET', headers: baseHeaders() },
        QR_TIMEOUT_MS,
        signal,
      )
      const code = readString(record['qrcode'])
      if (code === undefined) throw new WeixinApiError('iLink QR response carried no qrcode')
      return { code, url: readString(record['qrcode_img_content']) ?? '' }
    },

    async qrStatus(code, baseUrl, signal) {
      const record = await requestJson(
        `${baseUrl}/${EP_GET_QR_STATUS}?qrcode=${encodeURIComponent(code)}`,
        { method: 'GET', headers: baseHeaders() },
        QR_TIMEOUT_MS,
        signal,
      )
      const status = readString(record['status']) ?? 'wait'
      if (status === 'scaned_but_redirect') {
        const host = readString(record['redirect_host'])
        if (host === undefined) return { status: 'wait' }
        return { status: 'redirect', baseUrl: `https://${host}` }
      }
      if (status === 'scaned') return { status: 'scanned' }
      if (status === 'expired') return { status: 'expired' }
      if (status !== 'confirmed') return { status: 'wait' }
      const accountId = readString(record['ilink_bot_id'])
      const token = readString(record['bot_token'])
      if (accountId === undefined || token === undefined) {
        throw new WeixinApiError('iLink confirmed the scan but the credential payload was incomplete')
      }
      return {
        status: 'confirmed',
        grant: {
          accountId,
          token,
          baseUrl: readString(record['baseurl']) ?? ILINK_BASE_URL,
          userId: readString(record['ilink_user_id']) ?? '',
        },
      }
    },

    async getUpdates(request) {
      try {
        const record = await requestJson(
          `${request.auth.baseUrl}/${EP_GET_UPDATES}`,
          {
            method: 'POST',
            headers: {
              ...baseHeaders(),
              'Content-Type': 'application/json',
              'AuthorizationType': 'ilink_bot_token',
              'X-WECHAT-UIN': requestNonce(),
              'Authorization': `Bearer ${request.auth.token}`,
            },
            body: JSON.stringify({ get_updates_buf: request.cursor, base_info: { channel_version: CHANNEL_VERSION } }),
          },
          request.timeoutMs,
          request.signal,
        )
        const msgs = record['msgs']
        return {
          updates: Array.isArray(msgs) ? msgs.filter((entry): entry is WeixinRawUpdate => typeof entry === 'object' && entry !== null) : [],
          cursor: readString(record['get_updates_buf']),
          longPollTimeoutMs: readNumber(record['longpolling_timeout_ms']),
        }
      } catch (error: unknown) {
        // The long poll times out by design: a timeout with the caller still
        // live is an empty batch, and only a caller abort is the caller's.
        if (error instanceof Error && error.name === 'TimeoutError' && !request.signal.aborted) {
          return { updates: [] }
        }
        throw error
      }
    },

    async sendMessage(request) {
      await requestJson(
        `${request.auth.baseUrl}/${EP_SEND_MESSAGE}`,
        {
          method: 'POST',
          headers: {
            ...baseHeaders(),
            'Content-Type': 'application/json',
            'AuthorizationType': 'ilink_bot_token',
            'X-WECHAT-UIN': requestNonce(),
            'Authorization': `Bearer ${request.auth.token}`,
          },
          body: JSON.stringify({
            msg: {
              from_user_id: '',
              to_user_id: request.conversationId,
              client_id: request.clientId,
              message_type: MESSAGE_TYPE_BOT,
              message_state: MESSAGE_STATE_FINISH,
              item_list: [{ type: ITEM_TEXT, text_item: { text: request.text } }],
              ...(request.contextToken === undefined ? {} : { context_token: request.contextToken }),
            },
            base_info: { channel_version: CHANNEL_VERSION },
          }),
        },
        API_TIMEOUT_MS,
        request.signal,
      )
    },
  }
}
