/**
 * The outbound path: observe a bound Session's settled turn, compose the reply
 * body, and deliver it through the provider under a bounded retry. Delivery is
 * at-least-once — the platform exposes no idempotency key, so a retry after an
 * ambiguous timeout can duplicate, and a duplicate reply is preferable to a
 * lost one. The delivery record is transport state, never conversation content,
 * so nothing here is model-visible or reaches the Session log.
 * @module @deepseek-ai/dsh-channel-session/src/outbound
 */

import type {
  ChannelConversationId,
  ChannelId,
  ChannelProvider,
  ChannelSendReceipt,
} from '@deepseek-ai/dsh-channel'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { ChannelDeliveryKey } from './brand.ts'
import { channelDeliveryKey } from './binding.ts'
import { CHANNEL_SESSION_RECORD_VERSION } from './spec.ts'
import type { ChannelDeliveryRecord } from './spec.ts'

/**
 * The turn's final assistant text, or `undefined` when the turn committed none.
 * The fold reads forward from the turn's own `turn/start` to its `turn/end`, so
 * it never takes a message from another turn, and it keeps the last non-empty
 * message: the loop appends an empty assistant message after a max-tokens step
 * that produced no blocks, and that message records usage without replacing the
 * turn's answer. A turn that only ran tools, or was interrupted before a
 * message, has no reply to send.
 * @param session - the Session whose turn settled.
 * @param turn - the turn that settled.
 * @returns the text the platform sends, or `undefined` when there is none.
 */
export function turnReplyText(session: Session, turn: number): string | undefined {
  let text: string | undefined
  let open = false
  for (const event of session.snapshotEvents()) {
    if (event.type === 'turn/start') {
      open = event.data.turn === turn
      continue
    }
    if (event.type === 'turn/end' && event.data.turn === turn) break
    if (!open || event.type !== 'assistant/message') continue
    const joined = event.data.message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')
    if (joined.trim() !== '') text = joined
  }
  return text
}

/**
 * The Consumer-minted identity of one turn's reply. The platform exposes no
 * idempotency key, so the identity is derived from what the reply belongs to:
 * observing the same settled turn twice writes the same record instead of a
 * second one.
 * @param sessionId - Session that produced the reply.
 * @param turn - turn that settled.
 * @returns the delivery identity.
 */
export function deliveryIdFor(sessionId: SessionId, turn: number): string {
  return `${sessionId}:${turn}`
}

/**
 * The delivery record a reply starts as, before any attempt.
 * @param now - Host time in Unix epoch milliseconds.
 * @returns the pending record.
 */
export function createDeliveryRecord(now: number): ChannelDeliveryRecord {
  return {
    state: 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
  }
}

/**
 * Record one failed attempt that still has a retry left.
 * @param record - the record current at the write's queue slot.
 * @param error - the failure, rendered.
 * @param now - Host time in Unix epoch milliseconds.
 * @returns the next record, still pending.
 */
export function withFailedAttempt(record: ChannelDeliveryRecord, error: string, now: number): ChannelDeliveryRecord {
  return { ...record, attempts: record.attempts + 1, lastError: error, updatedAt: now }
}

/**
 * Record the attempt that exhausted the retry bound, or a delivery that never
 * reached a platform. It closes the record with the last error and counts no
 * further attempt: the attempt that failed already counted itself.
 * @param record - the record current at the write's queue slot.
 * @param error - the failure, rendered.
 * @param now - Host time in Unix epoch milliseconds.
 * @returns the next record, failed and terminal.
 */
export function withTerminalFailure(record: ChannelDeliveryRecord, error: string, now: number): ChannelDeliveryRecord {
  return { ...record, state: 'failed', lastError: error, updatedAt: now }
}

/**
 * Record an accepted delivery, with the platform's identity when it reported one.
 * @param record - the record current at the write's queue slot.
 * @param receipt - what the platform reported about the accepted message.
 * @param now - Host time in Unix epoch milliseconds.
 * @returns the next record, sent.
 */
export function withSent(record: ChannelDeliveryRecord, receipt: ChannelSendReceipt, now: number): ChannelDeliveryRecord {
  return {
    ...record,
    state: 'sent',
    attempts: record.attempts + 1,
    updatedAt: now,
    ...receipt.platformMessageId === undefined ? {} : { platformMessageId: receipt.platformMessageId },
  }
}

/** One turn's reply, resolved and ready to deliver. */
export interface ReplyDelivery {
  /** Registered provider that owns the conversation. */
  readonly channel: ChannelId
  /** Platform-owned conversation the reply goes to. */
  readonly conversationId: ChannelConversationId
  /** Session that produced the reply; with the turn, it identifies the record. */
  readonly sessionId: SessionId
  /** Turn that settled. */
  readonly turn: number
  /** Body the platform sends. */
  readonly text: string
}

/** Everything one delivery needs from the plugin that owns it. */
export interface DeliveryHost {
  /** The outbound delivery domain's table handle. */
  readonly deliveries: KvTable<ChannelDeliveryKey, ChannelDeliveryRecord>
  /** Provider that owns the conversation, or `undefined` when it is not registered. */
  readonly provider: ChannelProvider | undefined
  /** Validated retry bound: total attempts, including the first. */
  readonly attempts: number
  /** Validated wait between attempts, in milliseconds. */
  readonly backoffMs: number
  /** Aborts when the plugin is disposed, which stops delivery and cancels a send in flight. */
  readonly signal: AbortSignal
  /** Diagnostic sink for one terminal failure. */
  readonly warn: (message: string) => void
}

/**
 * Deliver one settled turn's reply: record the delivery as pending, then send
 * it through the provider within the retry bound. Success records the
 * platform's receipt; an exhausted bound leaves the record failed with its last
 * error and one diagnostic line; disposal stops the retry and leaves the record
 * pending, because the reply was never refused and the page reports an
 * interrupted delivery rather than a lost one.
 * @param host - the plugin-owned table, provider, bounds, lifetime, and diagnostic sink.
 * @param reply - the resolved reply to deliver.
 * @returns resolution after the delivery reaches a terminal record or disposal stops it.
 */
export async function deliverReply(host: DeliveryHost, reply: ReplyDelivery): Promise<void> {
  const key = channelDeliveryKey(reply.channel, reply.conversationId, deliveryIdFor(reply.sessionId, reply.turn))
  await host.deliveries.put(key, createDeliveryRecord(Date.now()))
  const provider = host.provider
  if (provider === undefined) {
    const error = `channel "${reply.channel}" is not registered`
    await host.deliveries.update(key, record => withTerminalFailure(record, error, Date.now()))
    host.warn(`channel Session delivery found no provider for ${reply.channel}`)
    return
  }
  let lastError = ''
  for (let attempt = 1; attempt <= host.attempts; attempt++) {
    if (host.signal.aborted) return
    try {
      const receipt = await provider.send(reply.conversationId, { text: reply.text }, host.signal)
      await host.deliveries.update(key, record => withSent(record, receipt, Date.now()))
      return
    } catch (error: unknown) {
      lastError = String(error)
      await host.deliveries.update(key, record => withFailedAttempt(record, lastError, Date.now()))
      // Disposal aborts a send in flight. The reply was never refused, so the
      // record stays pending for the page to report instead of closing as a
      // failure, and no further attempt starts.
      if (host.signal.aborted) return
      if (attempt < host.attempts) await waitBetweenAttempts(host.backoffMs)
    }
  }
  await host.deliveries.update(key, record => withTerminalFailure(record, lastError, Date.now()))
  host.warn(`channel Session delivery failed for ${reply.conversationId}: ${lastError}`)
}

/**
 * Wait the configured backoff between two attempts.
 * @param ms - the configured backoff.
 * @returns resolution after the backoff elapses.
 */
async function waitBetweenAttempts(ms: number): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, ms) })
}
