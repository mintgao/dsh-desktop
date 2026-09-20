/**
 * Normalization of one raw iLink update into the channel seam's inbound
 * message: direct messages only, text only. A group conversation, a message the
 * bot itself sent, and an update carrying no text are not published, and the
 * reply context token is surfaced separately so the provider can echo it while
 * it is fresh.
 * @module @deepseek-ai/dsh-channel-weixin/src/normalize
 */

import { ChannelConversationId, ChannelMessageId, ChannelUserId } from '@deepseek-ai/dsh-channel'
import type { ChannelId, ChannelInboundMessage } from '@deepseek-ai/dsh-channel'
import { ITEM_TEXT } from './transport.ts'
import type { WeixinRawUpdate } from './transport.ts'

/** What one normalization needs beyond the raw update. */
export interface WeixinNormalizationRequest {
  /** The registered provider's identity, stamped onto the message. */
  readonly channel: ChannelId
  /** This bot's platform identity; its own messages are not published. */
  readonly accountId: string
  /** Host receipt time in Unix epoch milliseconds. */
  readonly receivedAt: number
  /** The raw update as `get_updates` reported it. */
  readonly update: WeixinRawUpdate
}

/** Read one non-empty string field of a raw update. */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** The text of one raw update, from its first text item. */
function updateText(update: WeixinRawUpdate): string | undefined {
  if (!Array.isArray(update.item_list)) return undefined
  for (const item of update.item_list) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    if (entry['type'] !== ITEM_TEXT) continue
    const textItem = entry['text_item']
    if (typeof textItem !== 'object' || textItem === null) continue
    const text = readString((textItem as Record<string, unknown>)['text'])
    if (text !== undefined) return text
  }
  return undefined
}

/** Whether one raw update belongs to a group conversation rather than a direct message. */
function isGroupUpdate(update: WeixinRawUpdate, accountId: string): boolean {
  if (readString(update.room_id) !== undefined || readString(update.chat_room_id) !== undefined) return true
  const toUserId = readString(update.to_user_id)
  return toUserId !== undefined && toUserId !== accountId && update.msg_type === 1
}

/**
 * Normalize one raw update. Not published: an update from this bot itself, a
 * group conversation, and an update carrying no text.
 * @param request - the raw update and what normalization needs beyond it.
 * @returns the inbound message the registry publishes, or `undefined` when the update is not one.
 */
export function normalizeInboundMessage(request: WeixinNormalizationRequest): ChannelInboundMessage<'weixin'> | undefined {
  const sender = readString(request.update.from_user_id)
  const messageId = readString(request.update.message_id)
  if (sender === undefined || sender === request.accountId || messageId === undefined) return undefined
  if (isGroupUpdate(request.update, request.accountId)) return undefined
  const text = updateText(request.update)
  if (text === undefined) return undefined
  return {
    channel: request.channel,
    conversationId: ChannelConversationId(sender),
    sender: ChannelUserId(sender),
    messageId: ChannelMessageId(messageId),
    text,
    receivedAt: request.receivedAt,
    event: { kind: 'weixin', messageType: 'text' },
  }
}

/**
 * The reply context token of one raw update, when it carries one. The send path
 * echoes the freshest token of a conversation while it lives; iLink also
 * accepts a tokenless send as a degraded fallback.
 * @param update - the raw update as `get_updates` reported it.
 * @returns the token, or `undefined` when the update carries none.
 */
export function updateContextToken(update: WeixinRawUpdate): string | undefined {
  return readString(update.context_token)
}
