/**
 * The long poll: a cursor the platform advances, a bounded retry for transient
 * failures, and a circuit breaker that reports `unavailable` instead of looping
 * against a throttled platform. Session expiry stops the loop for a new scan,
 * and an abort stops it for disposal.
 *
 * Every published message carries the cursor its batch was requested at, not
 * the batch's own next cursor: a crash after an admission then resumes before
 * that batch and the platform redelivers it, while `lastAdmittedMessageId`
 * suppresses the messages already admitted. Redelivery is recoverable; a gap
 * is not.
 * @module @deepseek-ai/dsh-channel-weixin/src/poll
 */

import type { ChannelConversationId, ChannelId, ChannelInboundMessage } from '@deepseek-ai/dsh-channel'
import { normalizeInboundMessage, updateContextToken } from './normalize.ts'
import { abortableDelay } from './abort.ts'
import { errorMessage, isSessionExpired, WeixinApiError } from './transport.ts'
import type { WeixinAuth, WeixinTransport, WeixinUpdateBatch } from './transport.ts'

/** Everything one poll loop run needs. */
export interface WeixinPollRequest {
  /** The iLink calls the loop makes. */
  readonly transport: WeixinTransport
  /** The bot's shard address and token. */
  readonly auth: WeixinAuth
  /** The registered provider's identity, stamped onto published messages. */
  readonly channel: ChannelId
  /** This bot's platform identity; its own messages are not published. */
  readonly accountId: string
  /** Stream position to resume from; the provider reconciles it from the recorded cursors. */
  readonly cursor: string
  /** Long-poll timeout in milliseconds; the platform may suggest another. */
  readonly timeoutMs: number
  /** Total attempts one poll cycle gets, including the first. */
  readonly attempts: number
  /** Wait between two attempts, and between two failed cycles, in milliseconds. */
  readonly backoffMs: number
  /** Consecutive failed cycles that open the circuit breaker. */
  readonly breakerThreshold: number
  /** Publish one authenticated, normalized inbound message. */
  readonly publish: (message: ChannelInboundMessage) => void
  /** Remember the freshest reply context token of one conversation. */
  readonly rememberContextToken: (conversationId: ChannelConversationId, token: string) => void
  /** Announce the first successful cycle, once per run. */
  readonly onConnected: () => void
  /** Contain one diagnostic line. */
  readonly warn: (message: string) => void
  /** Called once per poll cycle before the next request; a rejection ends the run and reports. */
  readonly onCycle: () => Promise<void>
  /** Clock override for tests. */
  readonly now?: (() => number) | undefined
  /** Wait helper; tests substitute one that skips real time. */
  readonly delay?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined
}

/** Why one poll loop run ended. */
export type WeixinPollOutcome =
  | { readonly kind: 'aborted' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'breaker'; readonly diagnostic: string }

/** One poll loop over one bot connection. */
export class WeixinPollLoop {
  constructor(private readonly request: WeixinPollRequest) {}

  /**
   * Run until the session expires, the breaker opens, or the signal aborts.
   * @param signal - cancels the loop when its registration disposes.
   * @returns why the run ended.
   */
  async run(signal: AbortSignal): Promise<WeixinPollOutcome> {
    const now = this.request.now ?? Date.now
    let cursor = this.request.cursor
    let timeoutMs = this.request.timeoutMs
    let consecutiveFailures = 0
    let announced = false
    for (;;) {
      if (signal.aborted) return { kind: 'aborted' }
      // A lock heartbeat rejection (the lock was taken over) propagates out of
      // run(): a second client owning the token must stop this one.
      await this.request.onCycle()
      let batch: WeixinUpdateBatch
      try {
        batch = await this.cycle(cursor, timeoutMs, signal)
      } catch (error: unknown) {
        if (signal.aborted) return { kind: 'aborted' }
        if (error instanceof WeixinApiError && isSessionExpired(error)) return { kind: 'expired' }
        const diagnostic = errorMessage(error)
        consecutiveFailures += 1
        if (consecutiveFailures >= this.request.breakerThreshold) return { kind: 'breaker', diagnostic }
        this.request.warn(
          `channel-weixin poll failed (${consecutiveFailures}/${this.request.breakerThreshold}): ${diagnostic}`,
        )
        try {
          await this.wait(signal, this.request.backoffMs)
        } catch (waitError: unknown) {
          if (signal.aborted) return { kind: 'aborted' }
          throw waitError
        }
        continue
      }
      consecutiveFailures = 0
      if (batch.longPollTimeoutMs !== undefined && batch.longPollTimeoutMs > 0) timeoutMs = batch.longPollTimeoutMs
      for (const update of batch.updates) {
        const message = normalizeInboundMessage({
          channel: this.request.channel,
          accountId: this.request.accountId,
          receivedAt: now(),
          update,
        })
        if (message === undefined) continue
        const token = updateContextToken(update)
        if (token !== undefined) this.request.rememberContextToken(message.conversationId, token)
        this.request.publish(cursor === '' ? message : { ...message, providerCursor: cursor })
      }
      if (batch.cursor !== undefined) cursor = batch.cursor
      if (!announced) {
        announced = true
        this.request.onConnected()
      }
    }
  }

  /** One poll cycle: up to the configured attempts, retrying a transient failure with the configured wait. */
  private async cycle(cursor: string, timeoutMs: number, signal: AbortSignal): Promise<WeixinUpdateBatch> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.request.attempts; attempt += 1) {
      try {
        return await this.request.transport.getUpdates({ cursor, timeoutMs, auth: this.request.auth, signal })
      } catch (error: unknown) {
        if (signal.aborted) throw error
        if (error instanceof WeixinApiError && isSessionExpired(error)) throw error
        lastError = error
        if (attempt < this.request.attempts) await this.wait(signal, this.request.backoffMs)
      }
    }
    throw lastError
  }

  /** The configured wait; an abort ends it early. */
  private wait(signal: AbortSignal, ms: number): Promise<void> {
    return (this.request.delay ?? abortableDelay)(ms, signal)
  }
}
