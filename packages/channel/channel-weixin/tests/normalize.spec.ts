/**
 * Normalization of raw iLink updates: direct messages only, text only, and the
 * reply context token surfaced for the send path.
 */

import { describe, expect, it } from 'vitest'
import { ChannelId } from '@deepseek-ai/dsh-channel'
import { normalizeInboundMessage, updateContextToken } from '../src/normalize.ts'

/** One raw update carrying the fields a test cares about. */
function update(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    from_user_id: 'sender-1',
    message_id: 'message-1',
    item_list: [{ type: 1, text_item: { text: 'hello' } }],
    ...fields,
  }
}

describe('normalizeInboundMessage', () => {
  it('maps a direct text message onto the seam message', () => {
    const message = normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 7,
      update: update({}),
    })
    expect(message).toEqual({
      channel: 'weixin',
      conversationId: 'sender-1',
      sender: 'sender-1',
      messageId: 'message-1',
      text: 'hello',
      receivedAt: 7,
      event: { kind: 'weixin', messageType: 'text' },
    })
  })

  it('does not publish a message the bot itself sent', () => {
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'sender-1',
      receivedAt: 1,
      update: update({}),
    })).toBeUndefined()
  })

  it('does not publish an update without a sender or message id', () => {
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ from_user_id: '' }),
    })).toBeUndefined()
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ message_id: undefined }),
    })).toBeUndefined()
  })

  it('does not publish a group conversation reached through a room id', () => {
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ room_id: 'room-1' }),
    })).toBeUndefined()
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ chat_room_id: 'room-2' }),
    })).toBeUndefined()
  })

  it('does not publish a group conversation reached through the recipient', () => {
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ to_user_id: 'other-user', msg_type: 1 }),
    })).toBeUndefined()
  })

  it('keeps a direct message whose recipient is the bot or is unnamed', () => {
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ to_user_id: 'bot@im.bot', msg_type: 1 }),
    })).toBeDefined()
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ to_user_id: 'other-user', msg_type: 2 }),
    })).toBeDefined()
  })

  it('does not publish an update without a text item', () => {
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ item_list: undefined }),
    })).toBeUndefined()
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ item_list: [null, 'text', { type: 2, image_item: {} }] }),
    })).toBeUndefined()
    expect(normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ item_list: [{ type: 1 }, { type: 1, text_item: { text: '' } }] }),
    })).toBeUndefined()
  })

  it('reads the text from the first text item after non-text items', () => {
    const message = normalizeInboundMessage({
      channel: ChannelId('weixin'),
      accountId: 'bot@im.bot',
      receivedAt: 1,
      update: update({ item_list: [{ type: 3 }, { type: 1, text_item: { text: 'second' } }] }),
    })
    expect(message?.text).toBe('second')
  })
})

describe('updateContextToken', () => {
  it('reads a present token and treats a blank one as absent', () => {
    expect(updateContextToken(update({ context_token: 'ctx-1' }))).toBe('ctx-1')
    expect(updateContextToken(update({ context_token: '' }))).toBeUndefined()
    expect(updateContextToken(update({}))).toBeUndefined()
  })
})
