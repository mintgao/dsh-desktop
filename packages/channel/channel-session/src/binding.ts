/**
 * Durable keys of the consumer's three domains, the binding reads, and the
 * pure transforms every writer of the binding domain shares. A transform is a
 * total function from the record current at its queue slot to the next record,
 * so a writer applies it inside the domain's own `update` and no
 * read-modify-write can lose a concurrent admission write.
 * @module @deepseek-ai/dsh-channel-session/src/binding
 */

import type { ChannelConversationId, ChannelId, ChannelMessageId, ChannelUserId } from '@deepseek-ai/dsh-channel'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { ChannelBindingKey, ChannelDeliveryKey, ChannelPendingRequestKey } from './brand.ts'
import { CHANNEL_SESSION_RECORD_VERSION } from './spec.ts'
import type { ChannelBindingRecord, ChannelDisplayOptions } from './spec.ts'

/**
 * Encode one identity as a path-safe key segment. The json backend turns a
 * record key into a path segment and rejects anything outside
 * `[a-zA-Z0-9_-]+`, and a platform identifier may contain any character, so
 * every part is hex-encoded before it reaches the key.
 * @param value - one identity to encode.
 * @returns the hex encoding of the value's UTF-8 bytes.
 */
function keySegment(value: string): string {
  return Buffer.from(value, 'utf8').toString('hex')
}

/**
 * Compose the durable key of one conversation's binding record. The separator
 * cannot occur in a hex segment, so distinct conversations can never collide.
 * @param channel - registered provider that owns the conversation.
 * @param conversationId - platform-owned conversation identity.
 * @returns the branded table key.
 */
export function channelBindingKey(channel: ChannelId, conversationId: ChannelConversationId): ChannelBindingKey {
  return brandString<ChannelBindingKey>(`${keySegment(channel)}_${keySegment(conversationId)}`)
}

/**
 * Compose the durable key of one refused message's pending request.
 * @param channel - registered provider that owns the conversation.
 * @param conversationId - platform-owned conversation identity.
 * @param messageId - platform message identity of the refused message.
 * @returns the branded table key.
 */
export function channelPendingRequestKey(
  channel: ChannelId,
  conversationId: ChannelConversationId,
  messageId: ChannelMessageId,
): ChannelPendingRequestKey {
  return brandString<ChannelPendingRequestKey>(
    `${keySegment(channel)}_${keySegment(conversationId)}_${keySegment(messageId)}`,
  )
}

/**
 * Compose the durable key of one outbound delivery record.
 * @param channel - registered provider that owns the conversation.
 * @param conversationId - platform-owned conversation identity.
 * @param deliveryId - Consumer-minted identity of the delivery.
 * @returns the branded table key.
 */
export function channelDeliveryKey(
  channel: ChannelId,
  conversationId: ChannelConversationId,
  deliveryId: string,
): ChannelDeliveryKey {
  return brandString<ChannelDeliveryKey>(
    `${keySegment(channel)}_${keySegment(conversationId)}_${keySegment(deliveryId)}`,
  )
}

/**
 * The binding record of one conversation.
 * @param table - the binding domain's table handle.
 * @param key - key composed by {@link channelBindingKey}.
 * @returns the record, or `undefined` when the conversation was never set up.
 */
export function readChannelBinding(
  table: KvTable<ChannelBindingKey, ChannelBindingRecord>,
  key: ChannelBindingKey,
): ChannelBindingRecord | undefined {
  return table.get(key)
}

/**
 * The conversation a Session belongs to. The outbound observer holds only the
 * Session identity a settled turn reports, so it matches the binding records on
 * the Session they recorded rather than parsing a table key. A conversation
 * holds one binding, so the first match is the only one.
 * @param table - the binding domain's table handle.
 * @param sessionId - Session whose conversation is wanted.
 * @returns the binding key and record, or `undefined` when no conversation is bound to that Session.
 */
export function bindingForSession(
  table: KvTable<ChannelBindingKey, ChannelBindingRecord>,
  sessionId: SessionId,
): { readonly key: ChannelBindingKey; readonly record: ChannelBindingRecord } | undefined {
  for (const [key, record] of table.entries()) {
    if (record.sessionId === sessionId) return { key, record }
  }
  return undefined
}

/** The values conversation setup writes into a new binding record. */
export interface ChannelBindingSetup {
  /** Registered provider that owns the conversation. */
  readonly channel: ChannelId
  /** Platform-owned conversation identity. */
  readonly conversationId: ChannelConversationId
  /** Existing local directory a created Session runs in. */
  readonly workspacePath: string
  /** Agent composition mounted on a created Session. */
  readonly agentPreset: string
  /** Sandbox and approval preset applied before the first prompt. */
  readonly permissionPreset: string
  /** Conversation title shown by the settings surface. */
  readonly title: string
  /** Senders authorized from the start; the account that completed setup comes first. */
  readonly authorizedSenderIds: readonly ChannelUserId[]
  /** Which parts of a turn an outbound reply carries. */
  readonly displayOptions: ChannelDisplayOptions
}

/**
 * Build the record conversation setup stores. The Session association and the
 * admitted-message identity are absent: setup runs before any Session or
 * message exists, and only an admitted message or `/new` writes them.
 * @param setup - the values the client collected during setup.
 * @returns the complete binding record for a conversation with no Session yet.
 */
export function createChannelBinding(setup: ChannelBindingSetup): ChannelBindingRecord {
  return {
    channel: setup.channel,
    conversationId: setup.conversationId,
    workspacePath: setup.workspacePath,
    agentPreset: setup.agentPreset,
    permissionPreset: setup.permissionPreset,
    title: setup.title,
    authorizedSenderIds: [...setup.authorizedSenderIds],
    displayOptions: { ...setup.displayOptions },
    schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
  }
}

/** The values one admitted message contributes to its conversation's binding. */
export interface AdmittedMessage {
  /** Session that now owns the conversation. */
  readonly sessionId: SessionId
  /** Platform message identity of the admitted message, suppressing its redelivery. */
  readonly messageId: ChannelMessageId
  /** Provider cursor to resume the poll from, when the provider handed one over. */
  readonly providerCursor?: string
}

/**
 * Record one admitted message: the Session association, the suppressed
 * redelivery identity, and the provider's cursor. The write happens after
 * durable attach and before the first prompt is admitted, so a crash
 * afterwards redelivers into the same Session instead of creating a second one.
 * @param record - the record current at the write's queue slot.
 * @param admitted - what the admitted message contributed.
 * @returns the next record.
 */
export function withAdmittedMessage(record: ChannelBindingRecord, admitted: AdmittedMessage): ChannelBindingRecord {
  return {
    ...record,
    sessionId: admitted.sessionId,
    lastAdmittedMessageId: admitted.messageId,
    ...admitted.providerCursor === undefined ? {} : { providerCursor: admitted.providerCursor },
  }
}
