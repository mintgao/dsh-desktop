/**
 * Durable declarations of the channel Session consumer: the conversation
 * binding, the refused messages awaiting a decision, and the outbound delivery
 * records. Each schema validates the shipped format at the durability boundary
 * and pins the record's `schemaVersion` as a literal, so a record written by a
 * build this one does not know fails the domain open instead of being
 * reinterpreted.
 * @module @deepseek-ai/dsh-channel-session/src/spec
 */

import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { ChannelMessageId, ChannelUserId } from '@deepseek-ai/dsh-channel'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  ChannelBindingKey,
  ChannelDeliveryKey,
  ChannelPendingRequestKey,
} from './brand.ts'

/** Record format version this build writes and accepts, in all three domains. */
export const CHANNEL_SESSION_RECORD_VERSION = 1

/**
 * Which parts of a turn an outbound reply carries. Every part is off in the
 * shipped product: the platform's anti-spam behaviour and the desktop
 * notification precedent both argue against unsolicited chatter, so a reply is
 * the turn's final assistant text and nothing else.
 */
export const channelDisplayOptions = z.object({
  toolProgress: z.boolean(),
  interimAssistantMessages: z.boolean(),
  longRunningNotices: z.boolean(),
})

/** Display options inferred from {@link channelDisplayOptions}. */
export type ChannelDisplayOptions = z.infer<typeof channelDisplayOptions>

/** The shipped display defaults: a reply is the turn's final assistant text. */
export const CHANNEL_DISPLAY_OPTIONS_OFF: ChannelDisplayOptions = {
  toolProgress: false,
  interimAssistantMessages: false,
  longRunningNotices: false,
}

/**
 * Durable shape of one conversation binding. `sessionId` alone decides which
 * Session the conversation continues and is absent while the conversation is
 * unbound; `workspacePath`, `agentPreset`, `permissionPreset`, `title`, and
 * `displayOptions` are setup values applied when a Session is created;
 * `providerCursor` is the value the provider resumes its poll from, and
 * `lastAdmittedMessageId` suppresses an exact platform redelivery.
 */
export const channelBindingRecord = z.object({
  sessionId: z.string().transform(value => brandString<SessionId>(value)).optional(),
  workspacePath: z.string(),
  agentPreset: z.string(),
  permissionPreset: z.string(),
  title: z.string(),
  authorizedSenderIds: z.array(z.string().transform(value => ChannelUserId(value))),
  displayOptions: channelDisplayOptions,
  providerCursor: z.string().optional(),
  lastAdmittedMessageId: z.string().transform(value => ChannelMessageId(value)).optional(),
  schemaVersion: z.literal(CHANNEL_SESSION_RECORD_VERSION),
})

/** One stored conversation binding, inferred from {@link channelBindingRecord}. */
export type ChannelBindingRecord = z.infer<typeof channelBindingRecord>

/**
 * Durable shape of one refused message. A refusal creates no Session and no
 * model-visible event, so this record is the only evidence the message
 * arrived; it lives until a client approves or dismisses it.
 */
export const channelPendingRequestRecord = z.object({
  senderId: z.string().transform(value => ChannelUserId(value)),
  text: z.string(),
  receivedAt: z.number(),
  status: z.enum(['pending', 'approved', 'dismissed']),
  schemaVersion: z.literal(CHANNEL_SESSION_RECORD_VERSION),
})

/** One stored pending request, inferred from {@link channelPendingRequestRecord}. */
export type ChannelPendingRequestRecord = z.infer<typeof channelPendingRequestRecord>

/**
 * Durable shape of one outbound delivery. The record is transport state, never
 * conversation content: nothing here is model-visible or logged into the
 * Session.
 */
export const channelDeliveryRecord = z.object({
  state: z.enum(['pending', 'sent', 'failed']),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  platformMessageId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  schemaVersion: z.literal(CHANNEL_SESSION_RECORD_VERSION),
})

/** One stored delivery record, inferred from {@link channelDeliveryRecord}. */
export type ChannelDeliveryRecord = z.infer<typeof channelDeliveryRecord>

/** The conversation-binding domain: one record per `(channel, conversationId)`. */
export const channelBindingDomainSpec = defineDomain({
  name: 'channel_binding',
  version: 1,
  tables: { bindings: domainTable<ChannelBindingKey, ChannelBindingRecord>(channelBindingRecord) },
})

/** The refused-message domain: one record per `(channel, conversationId, messageId)`. */
export const channelPendingRequestDomainSpec = defineDomain({
  name: 'channel_pending_request',
  version: 1,
  tables: { requests: domainTable<ChannelPendingRequestKey, ChannelPendingRequestRecord>(channelPendingRequestRecord) },
})

/** The outbound delivery domain: one record per sent reply attempt. */
export const channelDeliveryDomainSpec = defineDomain({
  name: 'channel_delivery',
  version: 1,
  tables: { deliveries: domainTable<ChannelDeliveryKey, ChannelDeliveryRecord>(channelDeliveryRecord) },
})
