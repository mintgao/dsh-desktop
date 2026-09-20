/**
 * Real Loader composition for the WeChat channel: one cordis.yml assembles the
 * account service over the real channel registry, with the iLink transport
 * scripted — the loaded tree runs the QR login, registers the account the scan
 * bound, publishes one normalized message on the channel event, and splits one
 * reply across the platform's chunks.
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
import { ChannelConversationId } from '@deepseek-ai/dsh-channel'
import type { ChannelInboundMessage } from '@deepseek-ai/dsh-channel'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import type { WeixinSendRequest } from '../src/transport.ts'
import * as weixinPlugin from '../src/index.ts'
import { accountChannelId, accountRecordKey } from '../src/accounts.ts'
import type { WeixinAccountProvider } from '../src/provider.ts'

/** The scripted iLink transport the loaded provider speaks to. */
const scripted = vi.hoisted(() => ({
  polls: [] as Array<{ cursor: string; timeoutMs: number }>,
  sends: [] as Array<{ conversationId: string; text: string; clientId: string; contextToken: string | undefined }>,
  batches: [] as Array<{ readonly updates: readonly unknown[]; readonly cursor?: string } | Error>,
  statuses: [] as Array<Record<string, unknown> | Error>,
  waiters: [] as Array<() => void>,
  challenge: { code: 'code-1', url: 'https://liteapp.example/1' },
}))

vi.mock('../src/transport.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/transport.ts')>()
  const transport = {
    async fetchQr() { return scripted.challenge },
    async qrStatus() {
      const next = scripted.statuses.shift()
      if (next === undefined) throw new Error('the QR script is exhausted')
      if (next instanceof Error) throw next
      return next
    },
    async getUpdates(request: { readonly cursor: string; readonly timeoutMs: number; readonly signal: AbortSignal }) {
      scripted.polls.push({ cursor: request.cursor, timeoutMs: request.timeoutMs })
      for (;;) {
        const next = scripted.batches.shift()
        if (next instanceof Error) throw next
        if (next !== undefined) return next
        await new Promise<void>((resolve, reject) => {
          if (request.signal.aborted) {
            reject(request.signal.reason)
            return
          }
          request.signal.addEventListener('abort', () => { reject(request.signal.reason) }, { once: true })
          scripted.waiters.push(resolve)
        })
      }
    },
    async sendMessage(request: WeixinSendRequest) {
      scripted.sends.push({
        conversationId: request.conversationId,
        text: request.text,
        clientId: request.clientId,
        contextToken: request.contextToken,
      })
    },
  }
  return { ...original, createHttpTransport: () => transport }
})

/** The login product one confirmed scan yields. */
const GRANT = { accountId: 'bot@im.bot', token: 'token-1', baseUrl: 'https://shard.example', userId: 'user-1' }

/** Deliver one batch to the waiting long poll. */
function deliver(batch: { readonly updates: readonly unknown[]; readonly cursor?: string }): void {
  scripted.batches.push(batch)
  scripted.waiters.shift()?.()
}

let context: Context | undefined
let root: string | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  root = undefined
  scripted.polls.length = 0
  scripted.sends.length = 0
  scripted.batches.length = 0
  scripted.statuses.length = 0
  scripted.waiters.length = 0
})

describe('real Loader composition', () => {
  it('assembles the WeChat provider from a cordis.yml and moves one message in and one reply out', { timeout: 60_000 }, async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-channel-weixin-loader-'))
    const fixture = await readFile(new URL('./fixtures/cordis.yml', import.meta.url), 'utf8')
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, fixture.replace('{{lockRoot}}', root.replaceAll('\\', '/')))
    // A stale lock from a crashed instance is overridden, which the provider reports.
    await writeFile(join(root, 'weixin-user-1.lock'), JSON.stringify({ holder: 'holder-a', heartbeatAt: 0 }))

    const written: Array<{ key: unknown; record: { kind: string; payload: unknown } }> = []
    let stored: { kind: string; payload: unknown } | undefined
    let storedKey: unknown
    const credentials = {
      async listRecords() { return stored === undefined ? [] : [{ key: storedKey, kind: stored.kind }] },
      async readRecord() { return stored },
      async modifyRecord(key: unknown, mutate: (existing: unknown) => Promise<{ kind: string; payload: unknown }>) {
        const next = await mutate(stored)
        written.push({ key, record: next })
        storedKey = key
        stored = next
        return next
      },
    } as unknown as CredentialProvider
    const cursors: string[] = ['cursor-0']
    const dependencies = {
      name: 'fixture-dependencies',
      inject: ['channels'],
      apply(pluginCtx: Context) {
        pluginCtx.provide('credentials', credentials)
        pluginCtx.provide('channelSession', { resumeCursors: () => cursors })
      },
    }

    const ctx = context = new Context()
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-channel', channelPlugin],
      ['@deepseek-ai/dsh-channel-weixin', weixinPlugin],
      ['fixture-dependencies', dependencies],
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

    // Nothing is stored yet, so the composition carries no account until a scan confirms one.
    expect(ctx.channelWeixin.accounts).toEqual([])

    // The login advances through the scripted QR flow and stores its product.
    scripted.statuses.push({ status: 'confirmed', grant: GRANT })
    scripted.batches.push({ updates: [], cursor: 'cursor-1' })
    const loginState = await ctx.channelWeixin.beginLogin()
    expect(loginState).toEqual({ phase: 'waiting', qrUrl: 'https://liteapp.example/1' })
    await vi.waitFor(() => { expect(written).toHaveLength(1) })
    expect(written[0]?.record).toEqual({ kind: 'grant', payload: GRANT })
    expect(written[0]?.key).toBe(accountRecordKey('user-1'))

    // The confirmed scan registered the account under its own identity.
    const provider = ctx.channels.get(accountChannelId('user-1')) as unknown as WeixinAccountProvider
    expect(provider.displayName).toBe('bot@im.bot')
    expect(ctx.channelWeixin.accounts.map(account => account.id)).toEqual(['weixin:user-1'])
    await vi.waitFor(() => { expect(scripted.polls.length).toBeGreaterThan(0) })
    expect(scripted.polls[0]).toEqual({ cursor: 'cursor-0', timeoutMs: 1000 })
    const lock = JSON.parse(await readFile(join(root, 'weixin-user-1.lock'), 'utf8')) as { holder: string }
    expect(lock.holder).toMatch(/^dsh-/)

    // One delivered batch publishes one normalized message on the channel event.
    const inbound: ChannelInboundMessage[] = []
    ctx.channels.onInbound((message) => { inbound.push(message) })
    deliver({
      updates: [{
        from_user_id: 'sender-1',
        message_id: 'message-1',
        context_token: 'ctx-1',
        item_list: [{ type: 1, text_item: { text: 'ship it' } }],
      }],
      cursor: 'cursor-2',
    })
    await vi.waitFor(() => { expect(inbound).toHaveLength(1) })
    expect(inbound[0]).toMatchObject({
      channel: 'weixin:user-1',
      conversationId: 'sender-1',
      sender: 'sender-1',
      messageId: 'message-1',
      text: 'ship it',
      providerCursor: 'cursor-1',
    })

    // One reply leaves in platform-sized chunks, and the receipt names the reply.
    const receipt = await provider.send(ChannelConversationId('sender-1'), { text: 'one two three four' }, new AbortController().signal)
    expect(scripted.sends.map(send => send.text)).toEqual(['one', 'two', 'three', 'four'])
    expect(new Set(scripted.sends.map(send => send.clientId)).size).toBe(1)
    expect(scripted.sends[0]?.contextToken).toBe('ctx-1')
    expect(receipt.platformMessageId).toBe(scripted.sends[0]?.clientId)
  })
})
