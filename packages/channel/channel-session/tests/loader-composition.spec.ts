/**
 * Real Loader composition for the channel Session consumer: one cordis.yml
 * assembles the consumer over the real channel registry, storage domains, and
 * Session store, and the loaded tree turns a provider-published message into a
 * durable `user/message` event whose settled reply the provider sends back out.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as channelPlugin from '@deepseek-ai/dsh-channel'
import { ChannelConversationId, ChannelId, ChannelMessageId, ChannelUserId } from '@deepseek-ai/dsh-channel'
import type { ChannelInboundMessage, ChannelProvider } from '@deepseek-ai/dsh-channel'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import * as sessionPlugin from '@deepseek-ai/dsh-session'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomainPlugin from '@deepseek-ai/dsh-storage-domain'
import * as storageJsonPlugin from '@deepseek-ai/dsh-storage-json'
import { channelBindingKey, channelDeliveryKey } from '../src/binding.ts'
import ChannelSession from '../src/index.ts'
import { deliveryIdFor } from '../src/outbound.ts'

/** The Agent surface the admission transaction drives, as the loaded tree sees it. */
interface FakeAgent {
  readonly session: Session
  followup(message: UserMessage): void
}

/** Provide one service the way a composition's own plugin would. */
function provide(ctx: Context, name: string, value: unknown): void {
  ctx.provide(name, value)
}

/** One json domain file's table, as the storage backend materialized it. */
async function storedTable(
  root: string,
  file: string,
  table: string,
): Promise<Record<string, Record<string, unknown>>> {
  const medium = JSON.parse(await readFile(join(root, file), 'utf8')) as {
    tables: Record<string, Record<string, Record<string, unknown>>>
  }
  return medium.tables[table] ?? {}
}

/** Settle one turn on a Session the way the loop does. */
function settleTurn(session: Session, turn: number, text: string): void {
  session.append('turn/start', { turn })
  session.append('assistant/message', {
    turn,
    step: 1,
    message: createAssistantMessage({
      content: [{ type: 'text', text }],
      source: { provider: 'fixture', model: 'fixture-model' },
    }),
    stream: [],
  }, { surfaceOp: 'append' })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

/** The one inbound message the fixture provider publishes. */
function message(): ChannelInboundMessage {
  return {
    channel: ChannelId('weixin'),
    conversationId: ChannelConversationId('conversation-1'),
    sender: ChannelUserId('sender-1'),
    messageId: ChannelMessageId('message-1'),
    text: 'ship it',
    receivedAt: 1,
    event: { action: 'message' },
  }
}

let context: Context | undefined
let storageRoot: string | undefined
const followups: UserMessage[] = []
const createCalls: Array<{ readonly sessionId: string; readonly meta?: Record<string, unknown> }> = []
const live = new Map<string, FakeAgent>()
const sent: Array<{ conversation: string; text: string }> = []
let publish: ((message: ChannelInboundMessage) => void) | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (storageRoot !== undefined) {
    await rm(storageRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
  storageRoot = undefined
  followups.length = 0
  createCalls.length = 0
  live.clear()
  sent.length = 0
  publish = undefined
})

describe('real Loader composition', () => {
  it('assembles the consumer from a cordis.yml and moves one message in and one reply out', { timeout: 60_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-channel-session-loader-'))
    storageRoot = root
    const fixture = await readFile(new URL('./fixtures/cordis.yml', import.meta.url), 'utf8')
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, fixture.replace('{{storageRoot}}', root.replaceAll('\\', '/')))

    const dependencies = {
      name: 'fixture-dependencies',
      inject: ['sessions'],
      apply(pluginCtx: Context) {
        provide(pluginCtx, 'agents', {
          async create(options: {
            readonly sessionId: string
            readonly meta?: Record<string, unknown>
            readonly setup?: (scope: unknown) => Promise<void>
          }) {
            createCalls.push(options)
            await options.setup?.({ on() { return () => {} } })
            const session = pluginCtx.sessions.create(SessionId(options.sessionId))
            const agent: FakeAgent = {
              session,
              followup(message) {
                followups.push(message)
                session.append('user/message', message, { surfaceOp: 'append' })
              },
            }
            live.set(session.id, agent)
            return { agent, async dispose() { live.delete(session.id) } }
          },
          get(sessionId: string) { return live.get(sessionId) },
        })
        provide(pluginCtx, 'agentDefaultModel', {
          currentSelection: () => ({ provider: 'default-provider', model: 'default-model', reasoningEffort: 'high' }),
        })
        provide(pluginCtx, 'agentPresets', {
          async resolve(name: string) { return { id: name } },
          async standingKeyFor() { return {} },
          async mount() { return {} },
        })
        provide(pluginCtx, 'permissionPresets', { resolve() { return {} }, set() {} })
        provide(pluginCtx, 'workspaceRegistry', {
          async create(path: string) {
            return { path, async attachSession() {}, async detachSession() {} }
          },
        })
      },
    }
    const provider: ChannelProvider = {
      id: ChannelId('weixin'),
      kind: 'weixin',
      displayName: 'WeChat fixture',
      state: { status: 'connected' },
      attach(control) { publish = control.publish },
      async send(conversation, outbound) {
        sent.push({ conversation, text: outbound.text })
        return { platformMessageId: 'platform-fixture' }
      },
    }
    const providerFixture = {
      name: 'fixture-provider',
      inject: ['channels'],
      apply(pluginCtx: Context) {
        pluginCtx.channels.register(provider)
      },
    }

    const ctx = context = new Context()
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-storage', Storage],
      ['@deepseek-ai/dsh-storage-json', storageJsonPlugin],
      ['@deepseek-ai/dsh-storage-domain', storageDomainPlugin],
      ['@deepseek-ai/dsh-session', sessionPlugin],
      ['@deepseek-ai/dsh-channel', channelPlugin],
      ['@deepseek-ai/dsh-channel-session', ChannelSession],
      ['fixture-dependencies', dependencies],
      ['fixture-provider', providerFixture],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error('Unexpected Loader import: ' + specifier)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    expect([...ctx.loader.entries()].filter(entry => entry.fiber === undefined && !entry.disabled)).toEqual([])

    // Setup writes the binding through the real storage domain.
    await ctx.channelSession.setupConversation({
      channel: ChannelId('weixin'),
      conversationId: ChannelConversationId('conversation-1'),
      title: 'Project chat',
      authorizedSenderIds: [ChannelUserId('sender-1')],
    })
    const bindingKey = channelBindingKey(ChannelId('weixin'), ChannelConversationId('conversation-1'))
    expect((await storedTable(root, 'channel_binding.json', 'bindings'))[bindingKey]).toMatchObject({
      workspacePath: '/default/workspace',
      agentPreset: 'standard',
      permissionPreset: 'read-only',
      title: 'Project chat',
      authorizedSenderIds: ['sender-1'],
    })

    // One provider-published message admits a Session and logs the message durably.
    expect(publish).toBeDefined()
    publish!(message())
    await vi.waitFor(() => { expect(followups).toHaveLength(1) })
    const admittedId = String(createCalls[0]?.sessionId)
    expect(admittedId).toMatch(/^channel-/)
    expect(createCalls[0]?.meta).toMatchObject({ cwd: '/default/workspace', agentPreset: 'standard' })
    const session = ctx.sessions.get(SessionId(admittedId))
    if (session === undefined) throw new Error('the admitted Session is not in the store')
    expect(session.snapshotEvents().find(event => event.type === 'user/message')?.data).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'ship it' }],
      source: {
        kind: 'channel',
        channel: 'weixin',
        conversationId: 'conversation-1',
        sender: 'sender-1',
        messageId: 'message-1',
        form: 'notice',
      },
    })

    // The binding now names the Session the conversation continues.
    await vi.waitFor(async () => {
      expect((await storedTable(root, 'channel_binding.json', 'bindings'))[bindingKey]).toMatchObject({
        sessionId: admittedId,
        lastAdmittedMessageId: 'message-1',
      })
    })

    // The settled turn's reply leaves through the provider's own send path.
    settleTurn(session, 1, 'the composition reply')
    await vi.waitFor(() => { expect(sent).toHaveLength(1) })
    expect(sent[0]).toEqual({ conversation: 'conversation-1', text: 'the composition reply' })
    const deliveryKey = channelDeliveryKey(
      ChannelId('weixin'),
      ChannelConversationId('conversation-1'),
      deliveryIdFor(SessionId(admittedId), 1),
    )
    expect((await storedTable(root, 'channel_delivery.json', 'deliveries'))[deliveryKey]).toMatchObject({
      state: 'sent',
      attempts: 1,
      platformMessageId: 'platform-fixture',
    })
  })
})
