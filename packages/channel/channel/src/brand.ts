/** Opaque channel identities shared by providers, conversation bindings, and Session provenance. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Identifies one registered channel provider, such as one WeChat bot identity. */
export type ChannelId = Branded<'ChannelId'>

/** Identifies one conversation inside a channel. The platform owns the value; the client never parses it. */
export type ChannelConversationId = Branded<'ChannelConversationId'>

/** Identifies one sender inside a channel. */
export type ChannelUserId = Branded<'ChannelUserId'>

/** Identifies one inbound platform message. The provider's own cursor is the only deduplication authority. */
export type ChannelMessageId = Branded<'ChannelMessageId'>

/**
 * Brand a channel provider id.
 * @param value - non-empty provider identifier validated at registration.
 * @returns the same string with its compile-time brand.
 */
export function ChannelId(value: string): ChannelId {
  return value as ChannelId
}

/**
 * Brand a channel conversation id.
 * @param value - platform-owned conversation identifier.
 * @returns the same string with its compile-time brand.
 */
export function ChannelConversationId(value: string): ChannelConversationId {
  return value as ChannelConversationId
}

/**
 * Brand a channel sender id.
 * @param value - platform-owned sender identifier.
 * @returns the same string with its compile-time brand.
 */
export function ChannelUserId(value: string): ChannelUserId {
  return value as ChannelUserId
}

/**
 * Brand an inbound platform message id.
 * @param value - platform-owned message identifier.
 * @returns the same string with its compile-time brand.
 */
export function ChannelMessageId(value: string): ChannelMessageId {
  return value as ChannelMessageId
}
