/**
 * Conversation-binding keys, reads, and the pure transforms every writer of the
 * binding domain shares. A transform is a total function from the record
 * current at its queue slot to the next record, so a writer applies it inside
 * the domain's own `update` and no read-modify-write can lose a concurrent
 * admission write.
 * @module @deepseek-ai/dsh-channel-session/src/binding
 */

import type { ChannelConversationId, ChannelId, ChannelMessageId, ChannelUserId } from '@deepseek-ai/dsh-channel'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { ChannelBindingKey } from './brand.ts'
import { CHANNEL_SESSION_RECORD_VERSION } from './spec.ts'
import type { ChannelBindingRecord, ChannelDisplayOptions } from './spec.ts'

/**
 * Compose the durable key of one conversation's binding record. The pair is
 * JSON-encoded rather than concatenated, so no separator character can collide
 * with a platform identifier; the key is opaque and never parsed by a client.
 * @param channel - registered provider that owns the conversation.
 * @param conversationId - platform-owned conversation identity.
 * @returns the branded table key.
 */
export function channelBindingKey(channel: ChannelId, conversationId: ChannelConversationId): ChannelBindingKey {
  return brandString<ChannelBindingKey>(JSON.stringify([channel, conversationId]))
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

/** The values conversation setup writes into a new binding record. */
export interface ChannelBindingSetup {
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
