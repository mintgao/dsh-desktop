import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ChannelRegistry, {
  ChannelConversationId,
  ChannelId,
  ChannelMessageId,
  ChannelUserId,
  type ChannelInboundMessage,
  type ChannelProvider,
  type ChannelProviderControl,
} from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** Construct the registry directly so registry-only tests need no plugin tree. */
function harness(): { ctx: Context; registry: ChannelRegistry } {
  const ctx = new Context()
  contexts.push(ctx)
  return { ctx, registry: new ChannelRegistry(ctx) }
}

/** One provider whose every observable surface is captured for assertions. */
function provider(id = 'weixin-primary'): {
  provider: ChannelProvider<'fixture'>
  control: () => ChannelProviderControl | undefined
  state: { current: ChannelProvider['state'] }
  sent: Array<{ conversation: string; text: string }>
} {
  let captured: ChannelProviderControl | undefined
  const state: { current: ChannelProvider['state'] } = { current: { status: 'idle' } }
  const sent: Array<{ conversation: string; text: string }> = []
  const built: ChannelProvider<'fixture'> = {
    id: ChannelId(id),
    kind: 'fixture',
    displayName: 'WeChat fixture',
    get state() { return state.current },
    attach(control) { captured = control },
    async send(conversation, message) {
      sent.push({ conversation, text: message.text })
      return { platformMessageId: 'platform-fixture' }
    },
  }
  return { provider: built, control: () => captured, state, sent }
}

/** One authenticated inbound message. */
function message(text = 'hello'): ChannelInboundMessage<'fixture'> {
  return {
    channel: ChannelId('not-the-publisher'),
    conversationId: ChannelConversationId('conversation-1'),
    sender: ChannelUserId('sender-1'),
    messageId: ChannelMessageId('message-1'),
    text,
    receivedAt: 1,
    event: { value: 1 },
  }
}

describe('ChannelRegistry', () => {
  it('registers a provider, attaches its control, and enumerates it', () => {
    const { registry } = harness()
    const fixture = provider()

    const dispose = registry.register(fixture.provider)

    expect(registry.list).toEqual([fixture.provider])
    expect(registry.get(ChannelId('weixin-primary'))).toBe(fixture.provider)
    expect(registry.get(ChannelId('absent'))).toBeUndefined()
    expect(fixture.control()?.signal.aborted).toBe(false)
    dispose()
  })

  it('rejects an empty id and a duplicate id', () => {
    const { registry } = harness()
    const empty = provider('')
    expect(() => registry.register(empty.provider)).toThrow(TypeError)
    expect(() => registry.register(empty.provider)).toThrow('channel provider id must be a non-empty string')

    const first = provider('same-id')
    registry.register(first.provider)
    const second = provider('same-id')
    expect(() => registry.register(second.provider)).toThrow('channel provider "same-id" is already registered')
  })

  it('unregisters and aborts the registration signal when its disposer runs', () => {
    const { registry } = harness()
    const fixture = provider()
    const dispose = registry.register(fixture.provider)

    dispose()

    expect(registry.list).toEqual([])
    expect(registry.get(ChannelId('weixin-primary'))).toBeUndefined()
    expect(fixture.control()?.signal.aborted).toBe(true)
  })

  it('stamps the publishing provider identity onto every forwarded message', () => {
    const { registry } = harness()
    const fixture = provider()
    registry.register(fixture.provider)
    const seen: ChannelInboundMessage[] = []
    registry.onInbound((entry) => { seen.push(entry) })

    fixture.control()?.publish(message('first'))
    fixture.control()?.publish(message('second'))

    expect(seen.map(entry => entry.text)).toEqual(['first', 'second'])
    expect(seen.map(entry => entry.channel)).toEqual(['weixin-primary', 'weixin-primary'])
  })

  it('stops forwarding after the inbound disposer runs', () => {
    const { registry } = harness()
    const fixture = provider()
    registry.register(fixture.provider)
    const seen: ChannelInboundMessage[] = []
    const unsubscribe = registry.onInbound((entry) => { seen.push(entry) })

    fixture.control()?.publish(message('before'))
    unsubscribe()
    fixture.control()?.publish(message('after'))

    expect(seen.map(entry => entry.text)).toEqual(['before'])
  })

  it('contains a throwing inbound listener and still reaches the others', () => {
    const { ctx, registry } = harness()
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const fixture = provider()
    registry.register(fixture.provider)
    const seen: string[] = []
    registry.onInbound(() => { throw new Error('listener exploded') })
    registry.onInbound((entry) => { seen.push(entry.text) })

    fixture.control()?.publish(message('survives'))

    expect(seen).toEqual(['survives'])
    expect(warn).toHaveBeenCalledWith('channel inbound listener failed: Error: listener exploded')
  })

  it('renders an unrenderable listener failure without escaping containment', () => {
    const { ctx, registry } = harness()
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const fixture = provider()
    registry.register(fixture.provider)
    const hostile = { toString() { throw new Error('coercion refused') } }
    registry.onInbound(() => { throw hostile })

    fixture.control()?.publish(message())

    expect(warn).toHaveBeenCalledWith('channel inbound listener failed: [unrenderable thrown value]')
  })

  it('announces registration, disposal, and provider-reported state changes', () => {
    const { registry } = harness()
    const fixture = provider()
    const changes: string[] = []
    const unsubscribe = registry.onChange(() => { changes.push('changed') })

    const dispose = registry.register(fixture.provider)
    fixture.control()?.changed()
    dispose()

    expect(changes).toHaveLength(3)
    unsubscribe()
    fixture.control()?.changed()
    expect(changes).toHaveLength(3)
  })

  it('contains a throwing change listener', () => {
    const { ctx, registry } = harness()
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const fixture = provider()
    registry.onChange(() => { throw new Error('projection exploded') })

    registry.register(fixture.provider)

    expect(warn).toHaveBeenCalledWith('channel change listener failed: Error: projection exploded')
  })

  it('fails registration loudly when a provider throws inside attach', () => {
    const { registry } = harness()
    let captured: ChannelProviderControl | undefined
    const exploding: ChannelProvider<'fixture'> = {
      id: ChannelId('exploding'),
      kind: 'fixture',
      displayName: 'Exploding fixture',
      state: { status: 'idle' },
      attach(control) { captured = control; throw new Error('attach refused') },
      send: async () => ({}),
    }

    expect(() => registry.register(exploding)).toThrow('attach refused')
    expect(registry.list).toEqual([])
    expect(captured?.signal.aborted).toBe(true)
  })

  it('reports connection state through the provider and sends through the provider', async () => {
    const { registry } = harness()
    const fixture = provider()
    registry.register(fixture.provider)

    fixture.state.current = { status: 'unavailable', diagnostic: 'token expired' }
    expect(registry.list[0]?.state).toEqual({ status: 'unavailable', diagnostic: 'token expired' })

    const receipt = await registry.list[0]?.send(
      ChannelConversationId('conversation-1'),
      { text: 'reply' },
      new AbortController().signal,
    )
    expect(fixture.sent).toEqual([{ conversation: 'conversation-1', text: 'reply' }])
    // The provider's receipt reaches its caller unchanged, so the Consumer can
    // record the platform's identity for the delivered message.
    expect(receipt).toEqual({ platformMessageId: 'platform-fixture' })
  })
})
