/**
 * ChannelSession outbound behavior: a settled turn's final assistant text
 * becomes one reply, the delivery record is durable on the medium before the
 * provider is called, a transient failure retries within the configured bound,
 * an exhausted bound leaves a terminal failure with one diagnostic line, an
 * unregistered provider fails the delivery instead of losing it, and disposal
 * leaves the record pending rather than closing it as a failure. The delivery
 * table is the real domain over the json backend, so every assertion reads what
 * the domain actually holds.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ChannelConversationId, ChannelId } from '@deepseek-ai/dsh-channel'
import type { ChannelOutboundMessage, ChannelProvider, ChannelSendReceipt } from '@deepseek-ai/dsh-channel'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import {
  apply as storageJsonApply, Config as storageJsonConfig, inject as storageJsonInject, name as storageJsonName,
} from '@deepseek-ai/dsh-storage-json'
import {
  apply as storageDomainApply, Config as storageDomainConfig, inject as storageDomainInject, name as storageDomainName,
} from '@deepseek-ai/dsh-storage-domain'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { ChannelDeliveryKey } from '../src/brand.ts'
import { channelDeliveryKey } from '../src/binding.ts'
import {
  createDeliveryRecord,
  deliverReply,
  deliveryIdFor,
  turnReplyText,
  withFailedAttempt,
  withSent,
  withTerminalFailure,
} from '../src/outbound.ts'
import type { DeliveryHost, ReplyDelivery } from '../src/outbound.ts'
import { CHANNEL_SESSION_RECORD_VERSION, channelDeliveryDomainSpec } from '../src/spec.ts'
import type { ChannelDeliveryRecord } from '../src/spec.ts'

/** The json storage backend the durable assertions read from. */
const storageJsonPlugin = {
  name: storageJsonName, inject: storageJsonInject, apply: storageJsonApply, Config: storageJsonConfig,
}

/** The domain layer that opens the delivery table. */
const storageDomainPlugin = {
  name: storageDomainName, inject: storageDomainInject, apply: storageDomainApply, Config: storageDomainConfig,
}

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })))
})

/** The real delivery table over a temporary json root. */
async function deliveryTable(): Promise<{ table: KvTable<ChannelDeliveryKey, ChannelDeliveryRecord>; root: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-channeldelivery-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(storageJsonPlugin, { root })
  await ctx.plugin(storageDomainPlugin, { backend: 'json' })
  const domain = await ctx.storageDomain.open(channelDeliveryDomainSpec)
  return { table: domain.table('deliveries'), root }
}

/** One provider whose send outcomes a test scripts, one per call. */
function fakeProvider(
  outcomes: Array<ChannelSendReceipt | Error>,
  onSend?: () => void,
): {
  readonly provider: ChannelProvider
  readonly sent: Array<{ conversation: string; text: string }>
} {
  const sent: Array<{ conversation: string; text: string }> = []
  const provider: ChannelProvider = {
    id: ChannelId('weixin'),
    kind: 'weixin',
    displayName: 'WeChat fixture',
    state: { status: 'connected' },
    attach() {},
    async send(conversation, message: ChannelOutboundMessage) {
      sent.push({ conversation, text: message.text })
      onSend?.()
      const outcome = outcomes.shift() ?? new Error('unexpected send')
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  }
  return { provider, sent }
}

/** A delivery host over one table and provider, with the bounds a test chooses. */
function host(
  table: KvTable<ChannelDeliveryKey, ChannelDeliveryRecord>,
  provider: ChannelProvider | undefined,
  overrides: Partial<DeliveryHost> = {},
): DeliveryHost {
  return {
    deliveries: table,
    provider,
    attempts: 1,
    backoffMs: 1,
    signal: new AbortController().signal,
    warn: () => {},
    ...overrides,
  }
}

/** One settled turn's reply. */
function reply(overrides: Partial<ReplyDelivery> = {}): ReplyDelivery {
  return {
    channel: ChannelId('weixin'),
    conversationId: ChannelConversationId('conversation-1'),
    sessionId: SessionId('channel-1'),
    turn: 1,
    text: 'ship it',
    ...overrides,
  }
}

/** Append one assistant message the way the loop commits a step. */
function appendAssistant(session: Session, turn: number, step: number, text: string): void {
  session.append('assistant/message', {
    turn,
    step,
    message: createAssistantMessage({
      content: text === '' ? [] : [{ type: 'text', text }],
      source: { provider: 'fixture', model: 'fixture-model' },
    }),
    stream: [],
  }, { surfaceOp: 'append' })
}

describe('turn reply composition', () => {
  it('takes the turn\u2019s final non-empty assistant text', () => {
    const session = Session.create(SessionId('channel-1'))
    session.append('turn/start', { turn: 1 })
    appendAssistant(session, 1, 1, 'first answer')
    appendAssistant(session, 1, 2, 'final answer')
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    expect(turnReplyText(session, 1)).toBe('final answer')
  })

  it('keeps the last non-empty message when the loop appends an empty one after it', () => {
    const session = Session.create(SessionId('channel-1'))
    session.append('turn/start', { turn: 1 })
    appendAssistant(session, 1, 1, 'the answer')
    appendAssistant(session, 1, 2, '')
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    expect(turnReplyText(session, 1)).toBe('the answer')
  })

  it('joins the text blocks of one message', () => {
    const session = Session.create(SessionId('channel-1'))
    session.append('turn/start', { turn: 1 })
    session.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: 'one ' }, { type: 'text', text: 'two' }],
        source: { provider: 'fixture', model: 'fixture-model' },
      }),
      stream: [],
    }, { surfaceOp: 'append' })
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

    expect(turnReplyText(session, 1)).toBe('one two')
  })

  it('returns nothing for a turn that committed no assistant text', () => {
    const session = Session.create(SessionId('channel-1'))
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'interrupted' } })
    session.append('turn/start', { turn: 2 })
    appendAssistant(session, 2, 1, '   ')
    session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })

    expect(turnReplyText(session, 1)).toBeUndefined()
    expect(turnReplyText(session, 2)).toBeUndefined()
  })

  it('never takes a message from another turn', () => {
    const session = Session.create(SessionId('channel-1'))
    session.append('turn/start', { turn: 1 })
    appendAssistant(session, 1, 1, 'first turn')
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    session.append('turn/start', { turn: 2 })
    appendAssistant(session, 2, 1, 'second turn')
    session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })

    expect(turnReplyText(session, 1)).toBe('first turn')
    expect(turnReplyText(session, 2)).toBe('second turn')
    expect(turnReplyText(session, 3)).toBeUndefined()
  })
})

describe('delivery records', () => {
  it('starts pending, counts every attempt, and records the platform identity on success', () => {
    const pending = createDeliveryRecord(10)
    expect(pending).toEqual({
      state: 'pending',
      attempts: 0,
      createdAt: 10,
      updatedAt: 10,
      schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
    })

    const retried = withFailedAttempt(pending, 'connection reset', 20)
    expect(retried).toEqual({
      state: 'pending',
      attempts: 1,
      lastError: 'connection reset',
      createdAt: 10,
      updatedAt: 20,
      schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
    })

    expect(withSent(retried, { platformMessageId: 'platform-1' }, 30)).toMatchObject({
      state: 'sent',
      attempts: 2,
      platformMessageId: 'platform-1',
      updatedAt: 30,
    })
    // Closing the record counts no further attempt: the attempt that failed
    // already counted itself.
    expect(withTerminalFailure(retried, 'connection reset', 30)).toMatchObject({
      state: 'failed',
      attempts: 1,
      lastError: 'connection reset',
    })
  })

  it('omits the platform identity when the platform reported none', () => {
    const sent = withSent(createDeliveryRecord(10), {}, 20)

    expect('platformMessageId' in sent).toBe(false)
    expect(sent.state).toBe('sent')
  })
})

describe('outbound delivery', () => {
  it('records the reply durably, sends it once, and keeps the platform identity', async () => {
    const { table, root } = await deliveryTable()
    const fixture = fakeProvider([{ platformMessageId: 'platform-1' }])

    await deliverReply(host(table, fixture.provider), reply())

    expect(fixture.sent).toEqual([{ conversation: 'conversation-1', text: 'ship it' }])
    const key = channelDeliveryKey(
      ChannelId('weixin'), ChannelConversationId('conversation-1'), deliveryIdFor(SessionId('channel-1'), 1),
    )
    expect(table.get(key)).toMatchObject({ state: 'sent', attempts: 1, platformMessageId: 'platform-1' })
    const medium = JSON.parse(await readFile(join(root, 'channel_delivery.json'), 'utf8')) as {
      tables: { deliveries: Record<string, unknown> }
    }
    expect(medium.tables.deliveries[key]).toMatchObject({ state: 'sent', attempts: 1 })
  })

  it('retries a transient failure within the bound and stops at the first success', async () => {
    const { table } = await deliveryTable()
    const fixture = fakeProvider([new Error('connection reset'), { platformMessageId: 'platform-2' }])

    await deliverReply(host(table, fixture.provider, { attempts: 3 }), reply())

    expect(fixture.sent).toHaveLength(2)
    const record = table.get(channelDeliveryKey(
      ChannelId('weixin'), ChannelConversationId('conversation-1'), deliveryIdFor(SessionId('channel-1'), 1),
    ))
    expect(record).toMatchObject({ state: 'sent', attempts: 2, lastError: 'Error: connection reset' })
  })

  it('leaves a terminal failure with its last error and one diagnostic line', async () => {
    const { table } = await deliveryTable()
    const fixture = fakeProvider([new Error('connection reset'), new Error('still refused')])
    const warn = vi.fn()

    await deliverReply(host(table, fixture.provider, { attempts: 2, warn }), reply())

    expect(fixture.sent).toHaveLength(2)
    const record = table.get(channelDeliveryKey(
      ChannelId('weixin'), ChannelConversationId('conversation-1'), deliveryIdFor(SessionId('channel-1'), 1),
    ))
    expect(record).toMatchObject({ state: 'failed', attempts: 2, lastError: 'Error: still refused' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('delivery failed')
  })

  it('fails the delivery instead of losing it when the provider is not registered', async () => {
    const { table } = await deliveryTable()
    const warn = vi.fn()

    await deliverReply(host(table, undefined, { warn }), reply())

    const record = table.get(channelDeliveryKey(
      ChannelId('weixin'), ChannelConversationId('conversation-1'), deliveryIdFor(SessionId('channel-1'), 1),
    ))
    expect(record).toMatchObject({ state: 'failed', attempts: 0, lastError: 'channel "weixin" is not registered' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('found no provider')
  })

  it('stops retrying at disposal and leaves the record pending', async () => {
    const { table } = await deliveryTable()
    const controller = new AbortController()
    const fixture = fakeProvider([new Error('connection reset')], () => { controller.abort() })

    await deliverReply(host(table, fixture.provider, { attempts: 3, signal: controller.signal }), reply())

    // The attempt ran and failed, and disposal stops the retry: the record
    // stays pending, because disposal never turns a reply into a failure.
    expect(fixture.sent).toHaveLength(1)
    expect(table.get(channelDeliveryKey(
      ChannelId('weixin'), ChannelConversationId('conversation-1'), deliveryIdFor(SessionId('channel-1'), 1),
    ))).toMatchObject({ state: 'pending', attempts: 1, lastError: 'Error: connection reset' })
  })

  it('starts no attempt once the registration is disposed', async () => {
    const { table } = await deliveryTable()
    const controller = new AbortController()
    controller.abort()
    const fixture = fakeProvider([])

    await deliverReply(host(table, fixture.provider, { signal: controller.signal }), reply())

    expect(fixture.sent).toEqual([])
    expect(table.get(channelDeliveryKey(
      ChannelId('weixin'), ChannelConversationId('conversation-1'), deliveryIdFor(SessionId('channel-1'), 1),
    ))).toMatchObject({ state: 'pending', attempts: 0 })
  })
})
