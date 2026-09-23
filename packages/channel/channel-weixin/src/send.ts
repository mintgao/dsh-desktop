/**
 * The outbound send path: one reply split into platform-sized chunks, sent in
 * order under a bounded retry. A frequency limit backs off and retries; a stale
 * session re-sends once without the reply context token, because iLink accepts
 * a tokenless send as a degraded fallback; anything else fails the send after
 * the configured attempts, and the Consumer's delivery record then carries the
 * failure as a reported state.
 * @module @deepseek-ai/dsh-channel-weixin/src/send
 */

import { randomUUID } from 'node:crypto'
import type { ChannelSendReceipt } from '@deepseek-ai/dsh-channel'
import { abortableDelay, abortError } from './abort.ts'
import { isRateLimited, isSessionExpired, WeixinApiError } from './transport.ts'
import type { WeixinAuth, WeixinTransport } from './transport.ts'

/** Everything one chunked send needs. */
export interface WeixinSendRequest {
  /** The iLink calls the send makes. */
  readonly transport: WeixinTransport
  /** The bot's shard address and token. */
  readonly auth: WeixinAuth
  /** Platform conversation to deliver to. */
  readonly conversationId: string
  /** Complete reply text; the send splits it within the chunk length. */
  readonly text: string
  /** Largest chunk the platform accepts, in characters. */
  readonly chunkLength: number
  /** Total attempts one chunk gets, including the first. */
  readonly attempts: number
  /** Wait between two attempts, in milliseconds. */
  readonly backoffMs: number
  /** Wait a frequency-limited chunk observes before its retry, in milliseconds. */
  readonly throttleDelayMs: number
  /** Freshest reply context token of the conversation, when the provider has one. */
  readonly contextToken?: string | undefined
  /** Cancels the send when its owner unloads. */
  readonly signal: AbortSignal
  /** Wait helper; tests substitute one that skips real time. */
  readonly delay?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined
}

/**
 * Split one reply into chunks the platform accepts: prefer the last line break
 * before the limit, then the last space, then a hard cut, so a chunk boundary
 * lands where the text already breaks and the boundary character itself is
 * dropped.
 * @param text - the complete reply text.
 * @param chunkLength - largest chunk, in characters.
 * @returns the chunks in delivery order.
 */
export function splitText(text: string, chunkLength: number): readonly string[] {
  if (text.length <= chunkLength) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > chunkLength) {
    const window = rest.slice(0, chunkLength)
    const breakAt = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '))
    if (breakAt > 0) {
      chunks.push(rest.slice(0, breakAt))
      rest = rest.slice(breakAt + 1)
    } else {
      chunks.push(window)
      rest = rest.slice(chunkLength)
    }
  }
  chunks.push(rest)
  return chunks
}

/**
 * Send one reply as chunks under the bounded retry.
 * @param request - the reply, the platform bounds, and the bot's auth.
 * @returns the platform receipt once every chunk was accepted.
 */
export async function sendChunked(request: WeixinSendRequest): Promise<ChannelSendReceipt> {
  // One client id for the whole send, like the protocol's reference
  // implementations: the platform echoes it, so the receipt names the send
  // rather than one chunk of it.
  const clientId = `dsh-weixin-${randomUUID()}`
  for (const chunk of splitText(request.text, request.chunkLength)) {
    await sendChunk(request, chunk, clientId)
  }
  return { platformMessageId: clientId }
}

/**
 * Send one chunk under the bounded retry. A stale session with a context token
 * in hand re-sends tokenless once, and that re-send does not spend an attempt;
 * a stale session without one fails immediately, because the platform is
 * deterministic about it until the peer messages the bot again.
 */
async function sendChunk(request: WeixinSendRequest, chunk: string, clientId: string): Promise<void> {
  let contextToken = request.contextToken
  let retriedTokenless = false
  let failures = 0
  for (;;) {
    if (request.signal.aborted) throw abortError(request.signal)
    try {
      await request.transport.sendMessage({
        conversationId: request.conversationId,
        text: chunk,
        clientId,
        auth: request.auth,
        signal: request.signal,
        ...(contextToken === undefined ? {} : { contextToken }),
      })
      return
    } catch (error: unknown) {
      if (request.signal.aborted) throw abortError(request.signal)
      if (error instanceof WeixinApiError && isSessionExpired(error)) {
        if (!retriedTokenless && contextToken !== undefined) {
          retriedTokenless = true
          contextToken = undefined
          continue
        }
        throw error
      }
      failures += 1
      if (failures >= request.attempts) throw error
      const waitMs = error instanceof WeixinApiError && isRateLimited(error)
        ? request.throttleDelayMs
        : request.backoffMs * failures
      await (request.delay ?? abortableDelay)(waitMs, request.signal)
    }
  }
}
