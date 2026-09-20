/**
 * ChannelSession inbound behavior: a conversation that was never set up is
 * refused without a record, an unauthorized sender leaves a durable pending
 * request, an authorized message admits a Session through the admission
 * transaction or continues the bound one, an exact platform redelivery is
 * suppressed, and a failed admission is contained instead of escaping into the
 * provider's poll loop. The durable medium is the json backend under a
 * temporary root, so every assertion about a record reads what the domain
 * actually holds.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ChannelConversationId, ChannelId, ChannelMessageId, ChannelUserId } from '@deepseek-ai/dsh-channel'
import type { ChannelInboundMessage } from '@deepseek-ai/dsh-channel'
import Storage from '@deepseek-ai/dsh-storage'
import {
  apply as storageJsonApply, Config as storageJsonConfig, inject as storageJsonInject, name as storageJsonName,
} from '@deepseek-ai/dsh-storage-json'
import {
  apply as storageDomainApply, Config as storageDomainConfig, inject as storageDomainInject, name as storageDomainName,
} from '@deepseek-ai/dsh-storage-domain'
import { channelPendingRequestKey } from '../src/binding.ts'
import ChannelSession from '../src/index.ts'
import type { Config } from '../src/index.ts'

interface HarnessOptions {
  /** Make Agent creation fail, the way a broken composition would. */
  readonly failAt?: 'agent'
}

/** The Agent surface the consumer and the admission transaction touch. */
interface FakeAgent {
  readonly session: { readonly id: string; readonly header: { readonly cwd: string } }
  followup(message: unknown): void
}

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })))
})

/** A provider registry that records listeners and lets a test publish as a provider would. */
function fakeRegistry(): {
  readonly service: unknown
  readonly publish: (message: ChannelInboundMessage) => void
  readonly listenerCount: () => number
} {
  const listeners: Array<(message: ChannelInboundMessage) => void> = []
  const registry = {
    register() { return () => {} },
    get list() { return [] },
    get() { return undefined },
    onInbound(listener: (message: ChannelInboundMessage) => void) {
      listeners.push(listener)
      return () => { listeners.splice(listeners.indexOf(listener), 1) }
    },
    onChange() { return () => {} },
  }
  return {
    service: registry,
    publish(message) { for (const listener of [...listeners]) listener(message) },
    listenerCount: () => listeners.length,
  }
}

/** The Agent stack the admission transaction drives, recording every step. */
function fakeAgentStack(options: HarnessOptions): {
  readonly service: Record<string, unknown>
  readonly calls: string[]
  readonly messages: unknown[]
  readonly live: Map<string, FakeAgent>
  readonly createCalls: Array<Record<string, unknown>>
  readonly forget: (sessionId: string) => void
} {
  const calls: string[] = []
  const messages: unknown[] = []
  const createCalls: Array<Record<string, unknown>> = []
  const live = new Map<string, FakeAgent>()
  const service = {
    async create(createOptions: Record<string, unknown> & { sessionId: string; setup?: (ctx: unknown) => Promise<void> }) {
      calls.push('agent-create')
      createCalls.push(createOptions)
      if (options.failAt === 'agent') throw new Error('agent failed')
      await createOptions.setup?.({ on() { return () => {} } })
      const session = { id: createOptions.sessionId, header: { cwd: '/workspace' } }
      const agent = {
        session,
        followup(message: unknown) { calls.push('followup'); messages.push(message) },
      }
      live.set(session.id, agent)
      return { agent, async dispose() { calls.push('dispose'); live.delete(session.id) } }
    },
    get(sessionId: string) { return live.get(sessionId) },
  }
  return { service, calls, messages, live, createCalls, forget: (sessionId) => { live.delete(sessionId) } }
}

/** Provide one service the way a composition's own plugin would. */
function provide(ctx: Context, name: string, value: unknown): void {
  ctx.provide(name, value)
}

/** The json storage backend the durable assertions read from. */
const storageJsonPlugin = {
  name: storageJsonName, inject: storageJsonInject, apply: storageJsonApply, Config: storageJsonConfig,
}

/** The domain layer that opens the consumer's three tables. */
const storageDomainPlugin = {
  name: storageDomainName, inject: storageDomainInject, apply: storageDomainApply, Config: storageDomainConfig,
}

async function harness(options: HarnessOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-channelsession-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  await ctx.plugin(storageJsonPlugin, { root })
  await ctx.plugin(storageDomainPlugin, { backend: 'json' })

  const registry = fakeRegistry()
  const agents = fakeAgentStack(options)
  const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
  provide(ctx, 'channels', registry.service)
  provide(ctx, 'agents', agents.service)
  provide(ctx, 'agentDefaultModel', {
    currentSelection: () => ({ provider: 'default-provider', model: 'default-model', reasoningEffort: 'high' }),
  })
  provide(ctx, 'agentPresets', {
    async resolve(name: string) { return { id: name } },
    async standingKeyFor() { return {} },
    async mount() { return {} },
  })
  provide(ctx, 'permissionPresets', { resolve() { return {} }, set() {} })
  provide(ctx, 'workspaceRegistry', {
    async create(path: string) {
      return { path, async attachSession() {}, async detachSession() {} }
    },
  })

  const config: Config = {
    defaultWorkspacePath: '/default/workspace',
    agentPreset: 'standard',
    permissionPreset: 'read-only',
  }
  const fiber = await ctx.plugin(ChannelSession, config)
  const session = ctx.channelSession
  await session.setupConversation({
    channel: ChannelId('weixin'),
    conversationId: ChannelConversationId('conversation-1'),
    title: 'Project chat',
    authorizedSenderIds: [ChannelUserId('sender-1')],
  })
  return { ctx, root, fiber, session, registry, agents, warn }
}

function message(overrides: Partial<ChannelInboundMessage> = {}): ChannelInboundMessage {
  return {
    channel: ChannelId('weixin'),
    conversationId: ChannelConversationId('conversation-1'),
    sender: ChannelUserId('sender-1'),
    messageId: ChannelMessageId('message-1'),
    text: 'ship it',
    receivedAt: 1,
    event: { action: 'message' },
    ...overrides,
  }
}

describe('conversation setup', () => {
  it('writes the binding with the deployment defaults and reads it back', async () => {
    const test = await harness()

    expect(test.session.bindingFor(ChannelId('weixin'), ChannelConversationId('conversation-1'))).toMatchObject({
      workspacePath: '/default/workspace',
      agentPreset: 'standard',
      permissionPreset: 'read-only',
      title: 'Project chat',
      authorizedSenderIds: ['sender-1'],
    })
    expect(test.session.bindingFor(ChannelId('weixin'), ChannelConversationId('unknown'))).toBeUndefined()
  })

  it('prefers the values the client collected over the deployment defaults', async () => {
    const test = await harness()
    await test.session.setupConversation({
      channel: ChannelId('weixin'),
      conversationId: ChannelConversationId('conversation-2'),
      title: 'Other chat',
      authorizedSenderIds: [ChannelUserId('sender-2')],
      workspacePath: '/chosen/workspace',
      agentPreset: 'focused',
      permissionPreset: 'workspace-write',
    })

    expect(test.session.bindingFor(ChannelId('weixin'), ChannelConversationId('conversation-2'))).toMatchObject({
      workspacePath: '/chosen/workspace',
      agentPreset: 'focused',
      permissionPreset: 'workspace-write',
    })
  })
})

describe('inbound authorization', () => {
  it('refuses a message for a conversation that was never set up, with no record', async () => {
    const test = await harness()

    test.registry.publish(message({ conversationId: ChannelConversationId('unknown'), messageId: ChannelMessageId('m-unknown') }))
    await vi.waitFor(() => { expect(test.warn).toHaveBeenCalledTimes(1) })

    expect(test.agents.calls).toEqual([])
    expect(String(test.warn.mock.calls[0]?.[0])).toContain('unconfigured conversation')
  })

  it('refuses an unauthorized sender into a durable pending request', async () => {
    const test = await harness()

    test.registry.publish(message({ sender: ChannelUserId('intruder'), messageId: ChannelMessageId('m-refused') }))
    await vi.waitFor(() => { expect(test.warn).toHaveBeenCalledTimes(1) })

    expect(String(test.warn.mock.calls[0]?.[0])).toContain('unauthorized sender')
    expect(test.agents.calls).toEqual([])
    // The refusal is durable: the record is on the medium, not in a queue.
    const key = channelPendingRequestKey(ChannelId('weixin'), ChannelConversationId('conversation-1'), ChannelMessageId('m-refused'))
    const medium = JSON.parse(await readFile(
      join(test.root, 'channel_pending_request.json'),
      'utf8',
    )) as { tables: { requests: Record<string, unknown> } }
    expect(medium.tables.requests[key]).toMatchObject({
      senderId: 'intruder',
      text: 'ship it',
      receivedAt: 1,
      status: 'pending',
      schemaVersion: 1,
    })
  })
})

describe('inbound admission', () => {
  it('admits a Session for the conversation and records it in the binding before the prompt', async () => {
    const test = await harness()

    test.registry.publish(message())
    await vi.waitFor(() => { expect(test.agents.messages).toHaveLength(1) })

    expect(test.agents.createCalls[0]).toMatchObject({
      meta: { cwd: '/default/workspace', agentPreset: 'standard' },
    })
    expect(String(test.agents.createCalls[0]?.['sessionId'])).toMatch(/^channel-/)
    expect(test.agents.messages[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'ship it' }],
      source: { kind: 'channel', channel: 'weixin', conversationId: 'conversation-1', sender: 'sender-1', messageId: 'message-1' },
    })
    expect(test.session.bindingFor(ChannelId('weixin'), ChannelConversationId('conversation-1'))).toMatchObject({
      sessionId: test.agents.createCalls[0]?.['sessionId'],
      lastAdmittedMessageId: 'message-1',
    })
    expect(test.warn).not.toHaveBeenCalled()
  })

  it('continues the bound Session on the next message', async () => {
    const test = await harness()
    test.registry.publish(message())
    await vi.waitFor(() => { expect(test.agents.messages).toHaveLength(1) })

    test.registry.publish(message({ messageId: ChannelMessageId('message-2'), text: 'and again' }))
    await vi.waitFor(() => { expect(test.agents.messages).toHaveLength(2) })

    expect(test.agents.calls.filter(call => call === 'agent-create')).toHaveLength(1)
    expect(test.agents.messages[1]).toMatchObject({ content: [{ type: 'text', text: 'and again' }] })
    await vi.waitFor(() => {
      expect(test.session.bindingFor(ChannelId('weixin'), ChannelConversationId('conversation-1'))?.lastAdmittedMessageId)
        .toBe('message-2')
    })
  })

  it('suppresses an exact platform redelivery', async () => {
    const test = await harness()
    test.registry.publish(message())
    await vi.waitFor(() => { expect(test.agents.messages).toHaveLength(1) })

    test.registry.publish(message())
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(test.agents.messages).toHaveLength(1)
  })

  it('admits a new Session when the bound Session no longer resolves', async () => {
    const test = await harness()
    test.registry.publish(message())
    await vi.waitFor(() => { expect(test.agents.messages).toHaveLength(1) })
    test.agents.forget(String(test.agents.createCalls[0]?.['sessionId']))

    test.registry.publish(message({ messageId: ChannelMessageId('message-3') }))
    await vi.waitFor(() => { expect(test.agents.calls.filter(call => call === 'agent-create')).toHaveLength(2) })

    expect(test.agents.messages).toHaveLength(2)
  })

  it('contains a failed admission instead of escaping into the provider', async () => {
    const test = await harness({ failAt: 'agent' })

    test.registry.publish(message())
    await vi.waitFor(() => { expect(test.warn).toHaveBeenCalledTimes(1) })

    expect(String(test.warn.mock.calls[0]?.[0])).toContain('channel Session inbound failed')
  })
})

describe('disposal', () => {
  it('stops observing inbound messages and closes its domains', async () => {
    const test = await harness()
    expect(test.registry.listenerCount()).toBe(1)

    await test.fiber.dispose()

    expect(test.registry.listenerCount()).toBe(0)
    test.registry.publish(message())
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(test.agents.calls).toEqual([])
  })
})
