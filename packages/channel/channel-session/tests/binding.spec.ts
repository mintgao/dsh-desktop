/**
 * Behavior spec for the durable layer: the binding key, the record setup
 * builds, the admitted-message transform, and the schemas that pin each
 * record's format version.
 */

import { ChannelConversationId, ChannelId, ChannelMessageId, ChannelUserId } from '@deepseek-ai/dsh-channel'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { describe, expect, it } from 'vitest'
import { channelBindingKey, createChannelBinding, readChannelBinding, withAdmittedMessage } from '../src/binding.ts'
import type { ChannelBindingKey } from '../src/brand.ts'
import {
  CHANNEL_DISPLAY_OPTIONS_OFF,
  CHANNEL_SESSION_RECORD_VERSION,
  channelBindingRecord,
  channelDeliveryRecord,
  channelPendingRequestRecord,
} from '../src/spec.ts'
import type { ChannelBindingRecord } from '../src/spec.ts'

/** One record store that behaves like a domain table without a backend. */
class MemoryTable<K extends string, V> implements KvTable<K, V> {
  private readonly rows = new Map<K, V>()

  get(key: K): V | undefined {
    return this.rows.get(key)
  }

  entries(): IterableIterator<[K, V]> {
    return this.rows.entries()
  }

  keys(): IterableIterator<K> {
    return this.rows.keys()
  }

  get size(): number {
    return this.rows.size
  }

  async put(key: K, value: V): Promise<void> {
    this.rows.set(key, value)
  }

  async delete(key: K): Promise<boolean> {
    return this.rows.delete(key)
  }

  async update(key: K, fn: (current: V) => V): Promise<V> {
    const current = this.rows.get(key)
    if (current === undefined) throw new Error(`missing-key: ${key}`)
    const next = fn(current)
    this.rows.set(key, next)
    return next
  }
}

const channel = ChannelId('weixin')
const conversationId = ChannelConversationId('conversation-1')

function setup(): Parameters<typeof createChannelBinding>[0] {
  return {
    workspacePath: '/work/project',
    agentPreset: 'standard',
    permissionPreset: 'read-only',
    title: 'Project chat',
    authorizedSenderIds: [ChannelUserId('sender-1')],
    displayOptions: CHANNEL_DISPLAY_OPTIONS_OFF,
  }
}

describe('channel binding key', () => {
  it('composes an unambiguous key from both identities', () => {
    const key = channelBindingKey(channel, conversationId)

    expect(JSON.parse(key)).toEqual(['weixin', 'conversation-1'])
    expect(channelBindingKey(ChannelId('weixin'), ChannelConversationId('conversation-2'))).not.toBe(key)
    expect(channelBindingKey(ChannelId('feishu'), conversationId)).not.toBe(key)
  })
})

describe('conversation setup', () => {
  it('builds an unbound record carrying the setup values and the format version', () => {
    const record = createChannelBinding(setup())

    expect(record).toEqual({
      workspacePath: '/work/project',
      agentPreset: 'standard',
      permissionPreset: 'read-only',
      title: 'Project chat',
      authorizedSenderIds: ['sender-1'],
      displayOptions: { toolProgress: false, interimAssistantMessages: false, longRunningNotices: false },
      schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
    })
    expect('sessionId' in record).toBe(false)
    expect('lastAdmittedMessageId' in record).toBe(false)
  })

  it('copies the caller collections so a later mutation cannot reach the record', () => {
    const input = setup()
    const record = createChannelBinding(input)

    ;(input.authorizedSenderIds as ChannelUserId[]).push(ChannelUserId('sender-2'))
    ;(input.displayOptions as { toolProgress: boolean }).toolProgress = true

    expect(record.authorizedSenderIds).toEqual(['sender-1'])
    expect(record.displayOptions.toolProgress).toBe(false)
  })
})

describe('admitted message', () => {
  const admitted = {
    sessionId: brandString<SessionId>('channel-1'),
    messageId: ChannelMessageId('message-1'),
  }

  it('records the Session association and the suppressed redelivery identity', () => {
    const next = withAdmittedMessage(createChannelBinding(setup()), admitted)

    expect(next.sessionId).toBe('channel-1')
    expect(next.lastAdmittedMessageId).toBe('message-1')
    expect('providerCursor' in next).toBe(false)
  })

  it('stores the provider cursor when the provider handed one over', () => {
    const next = withAdmittedMessage(createChannelBinding(setup()), { ...admitted, providerCursor: 'cursor-7' })

    expect(next.providerCursor).toBe('cursor-7')
    expect(next.workspacePath).toBe('/work/project')
  })
})

describe('binding reads', () => {
  it('returns the stored record, and nothing for a conversation that was never set up', async () => {
    const table = new MemoryTable<ChannelBindingKey, ChannelBindingRecord>()
    const key = channelBindingKey(channel, conversationId)

    expect(readChannelBinding(table, key)).toBeUndefined()
    await table.put(key, createChannelBinding(setup()))
    expect(readChannelBinding(table, key)?.title).toBe('Project chat')
  })
})

describe('record schemas', () => {
  it('accepts a stored binding and brands its identities', () => {
    const parsed = channelBindingRecord.parse({
      sessionId: 'channel-1',
      workspacePath: '/work/project',
      agentPreset: 'standard',
      permissionPreset: 'read-only',
      title: 'Project chat',
      authorizedSenderIds: ['sender-1'],
      displayOptions: { toolProgress: false, interimAssistantMessages: false, longRunningNotices: false },
      providerCursor: 'cursor-7',
      lastAdmittedMessageId: 'message-1',
      schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
    })

    expect(parsed.sessionId).toBe('channel-1')
    expect(parsed.authorizedSenderIds).toEqual(['sender-1'])
    expect(parsed.lastAdmittedMessageId).toBe('message-1')
  })

  it('rejects a record written by an unknown format version instead of reinterpreting it', () => {
    const unknown = { ...createChannelBinding(setup()), schemaVersion: CHANNEL_SESSION_RECORD_VERSION + 1 }

    expect(() => channelBindingRecord.parse(unknown)).toThrow()
  })

  it('accepts the pending-request and delivery states and rejects unknown ones', () => {
    expect(channelPendingRequestRecord.parse({
      senderId: 'sender-9',
      text: 'hello',
      receivedAt: 1,
      status: 'pending',
      schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
    }).senderId).toBe('sender-9')
    expect(() => channelPendingRequestRecord.parse({
      senderId: 'sender-9',
      text: 'hello',
      receivedAt: 1,
      status: 'unseen',
      schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
    })).toThrow()

    expect(channelDeliveryRecord.parse({
      state: 'sent',
      attempts: 1,
      platformMessageId: 'platform-1',
      createdAt: 1,
      updatedAt: 2,
      schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
    }).state).toBe('sent')
    expect(() => channelDeliveryRecord.parse({
      state: 'queued',
      attempts: 0,
      createdAt: 1,
      updatedAt: 1,
      schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
    })).toThrow()
  })
})

describe('table handle typing', () => {
  it('keeps the binding table keyed by the composed key', async () => {
    const table = new MemoryTable<ChannelBindingKey, ChannelBindingRecord>()
    const key: ChannelBindingKey = channelBindingKey(channel, conversationId)
    await table.put(key, createChannelBinding(setup()))

    expect([...table.keys()]).toEqual([key])
    expect(table.size).toBe(1)
    await expect(table.delete(key)).resolves.toBe(true)
    expect(table.size).toBe(0)
  })
})
