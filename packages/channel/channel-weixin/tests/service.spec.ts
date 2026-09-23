/**
 * WeixinChannelService over the real channel registry: what its account list
 * reports after a restore and what one live QR login does to it — announcing
 * every login state, storing a confirmed scan, refusing the scans whose slug an
 * account cannot take, handing a slug over to its next provider, and
 * disconnecting one account without touching the others. The iLink transport is
 * scripted, so no test here touches the platform.
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import * as channelModule from '@deepseek-ai/dsh-channel'
import { ChannelId } from '@deepseek-ai/dsh-channel'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { accountChannelId, accountRecordKey, accountSlug, lockFileNameForSlug, recordKeyForSlug } from '../src/accounts.ts'
import WeixinChannelService, { WEIXIN_UNREADABLE_DIAGNOSTIC } from '../src/index.ts'
import type { WeixinLoginGrant, WeixinLoginState } from '../src/index.ts'

/** One latch the scripted QR status holds on until the test releases it. */
interface Gate {
  readonly promise: Promise<void>
  readonly release: () => void
  readonly fail: (reason: unknown) => void
}

/** Build one latch. */
function gate(): Gate {
  let release: () => void = () => {}
  let fail: (reason: unknown) => void = () => {}
  const promise = new Promise<void>((resolve, reject) => {
    release = resolve
    fail = reject
  })
  return { promise, release, fail }
}

/** The scripted iLink transport the service's login sequence and providers speak to. */
const scripted = vi.hoisted(() => ({
  challenge: { code: 'code-1', url: 'https://liteapp.example/1' },
  statuses: [] as Array<Record<string, unknown> | Error | 'hold'>,
  polls: [] as Array<{ cursor: string; timeoutMs: number }>,
  fetches: 0,
  hold: null as Gate | null,
}))

vi.mock('../src/transport.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/transport.ts')>()
  const transport = {
    async fetchQr() {
      scripted.fetches += 1
      return scripted.challenge
    },
    async qrStatus() {
      const next = scripted.statuses.shift()
      if (next === 'hold') {
        const hold = scripted.hold
        if (hold === null) throw new Error('the QR script holds on no latch')
        await hold.promise
        throw new Error('the QR script is exhausted')
      }
      if (next === undefined) throw new Error('the QR script is exhausted')
      if (next instanceof Error) throw next
      return next
    },
    async getUpdates(request: { readonly cursor: string; readonly timeoutMs: number; readonly signal: AbortSignal }) {
      scripted.polls.push({ cursor: request.cursor, timeoutMs: request.timeoutMs })
      // Every poll parks until its provider is torn down, so no account ever reports a received batch.
      await new Promise<void>((_resolve, reject) => {
        if (request.signal.aborted) {
          reject(request.signal.reason)
          return
        }
        request.signal.addEventListener('abort', () => { reject(request.signal.reason) }, { once: true })
      })
    },
    async sendMessage() {
      throw new Error('the service under test never sends')
    },
  }
  return { ...original, createHttpTransport: () => transport }
})

/** The WeChat identity the platform reports for one scanned account. */
const IDENTITY = 'o9cq805fLDX0Z7bdqo3DCpheCC88@im.wechat'

/** A second account identity, whose slug sorts between the other two. */
const OTHER_IDENTITY = '9abc@im.wechat'

/** The raw identity one stored account holds the slug `user-a-im-wechat` with. */
const HOLDING_IDENTITY = 'user-a@im.wechat'

/** The raw identity the lossy slug transform collides with {@link HOLDING_IDENTITY} on. */
const COLLIDING_IDENTITY = 'user-a@im.WeChat'

/** The credential record of the replaced single-identity layout, which is not an account. */
const REPLACED_KEY = credentialKey('channel-weixin', 'login')

/** The connection state a restored account reports while its first poll parks. */
const RESTING_STATE = { status: 'connecting' }

/** The provider surface this suite reads out of the registry. */
interface RegistryProvider {
  readonly id: string
  readonly displayName: string
  readonly state: { readonly status: string; readonly diagnostic?: string }
}

/** One credential store serving the seeded records and recording every write. */
interface Store {
  readonly records: Map<string, CredentialRecord>
  readonly writes: Array<{ readonly key: string; readonly record: CredentialRecord }>
  readonly deletes: string[]
  /** The error every write fails with, when the test makes the store read-only. */
  failing?: Error | undefined
}

/** One booted composition. */
interface Harness {
  readonly ctx: Context
  readonly service: WeixinChannelService
}

/** The login product one confirmed scan of `identity` yields. */
function grantFor(identity: string, accountId = 'a4c0a9d31015@im.bot'): WeixinLoginGrant {
  return { accountId, token: 'token-1', baseUrl: 'https://shard.example', userId: identity }
}

/** The stored record one grant lives in. */
function storedGrant(grant: WeixinLoginGrant): CredentialRecord {
  return { kind: 'grant', payload: grant }
}

/** Subscribe to the plugin-local login event; the composition's event map does not name it. */
function onLogin(ctx: Context, listener: (state: WeixinLoginState) => void): void {
  const subscribe = ctx.on as unknown as (event: string, listener: (state: WeixinLoginState) => void) => void
  subscribe('channel-weixin/login', listener)
}

/** The provider the registry currently holds for one account identity. */
function providerFor(ctx: Context, identity: string): RegistryProvider | undefined {
  return ctx.channels.get(accountChannelId(identity)) as unknown as RegistryProvider | undefined
}

/** Wait until one restored account's provider settled onto its token lock, so a later scan meets it held. */
async function settled(identity: string): Promise<void> {
  if (root === undefined) throw new Error('the harness has no lock root')
  const lock = lockFileNameForSlug(accountSlug(identity))
  await vi.waitFor(async () => {
    expect(await readdir(root as string)).toContain(lock)
  })
}

let context: Context | undefined
let root: string | undefined
let store: Store

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-channel-weixin-service-'))
  store = { records: new Map(), writes: [], deletes: [] }
  scripted.statuses.length = 0
  scripted.polls.length = 0
  scripted.fetches = 0
  scripted.hold = null
})

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  root = undefined
})

/**
 * Boot one composition: the real channel registry, a fixture providing the
 * credential store and the channel session, then the WeChat service itself.
 * @param seeds - the records the credential store starts with.
 * @returns the composition's context and its WeChat service.
 */
async function boot(seeds: ReadonlyArray<readonly [string, CredentialRecord]> = []): Promise<Harness> {
  if (root === undefined) throw new Error('the harness has no lock root')
  for (const [key, record] of seeds) store.records.set(key, record)
  const cursors = ['cursor-0']
  const credentials = {
    async listRecords() { return [...store.records.keys()].map(key => ({ key, kind: 'grant' as const })) },
    async readRecord(key: string) { return store.records.get(key) },
    async modifyRecord(key: string, mutate: (existing: CredentialRecord | undefined) => Promise<CredentialRecord>) {
      const record = await mutate(store.records.get(key))
      if (store.failing !== undefined) throw store.failing
      store.writes.push({ key, record })
      store.records.set(key, record)
      return record
    },
    async deleteRecord(key: string) {
      store.deletes.push(key)
      store.records.delete(key)
    },
  } as unknown as CredentialProvider
  const dependencies = {
    name: 'fixture-dependencies',
    inject: ['channels'],
    apply(pluginCtx: Context) {
      pluginCtx.provide('credentials', credentials)
      pluginCtx.provide('channelSession', { resumeCursors: () => cursors })
    },
  }
  const ctx = context = new Context()
  await ctx.plugin(channelModule.default)
  await ctx.plugin(dependencies)
  await ctx.plugin(WeixinChannelService, { ...CONFIG, lockDirectory: root })
  return { ctx, service: (ctx as unknown as { channelWeixin: WeixinChannelService }).channelWeixin }
}

/** The plugin config one composition boots with: the retry and poll knobs the cheap scripted transport never exercises. */
const CONFIG = {
  pollTimeoutMs: 1000,
  pollRetryAttempts: 1,
  pollBackoffMs: 10,
  sendRetryAttempts: 1,
  sendBackoffMs: 10,
  chunkLength: 1000,
  throttleDelayMs: 0,
  breakerThreshold: 1,
}

describe('restoring the stored accounts', () => {
  it('registers a provider per readable record and an unavailable account for a record it cannot read', async () => {
    const { ctx, service } = await boot([
      [accountRecordKey(IDENTITY), storedGrant(grantFor(IDENTITY))],
      [accountRecordKey(OTHER_IDENTITY), storedGrant(grantFor(OTHER_IDENTITY, 'bot-2@im.bot'))],
      [accountRecordKey(HOLDING_IDENTITY), { kind: 'grant', payload: 'not-an-object' }],
      [REPLACED_KEY, storedGrant(grantFor('user-1'))],
    ])

    expect(service.accounts.map(view => view.id)).toEqual([
      'weixin:a-9abc-im-wechat',
      'weixin:o9cq805fldx0z7bdqo3dcphecc88-im-wechat',
      'weixin:user-a-im-wechat',
    ])
    expect(service.accounts[2]).toMatchObject({
      botIdentity: 'user-a-im-wechat',
      state: { status: 'unavailable', diagnostic: WEIXIN_UNREADABLE_DIAGNOSTIC },
    })
    expect(providerFor(ctx, IDENTITY)?.id).toBe(accountChannelId(IDENTITY))
    expect(providerFor(ctx, OTHER_IDENTITY)?.id).toBe(accountChannelId(OTHER_IDENTITY))

    // The replaced single-identity key is not an account: nothing restores from it, and it survives.
    expect(service.accounts.map(view => view.slug)).not.toContain('login')
    expect(store.records.has(REPLACED_KEY)).toBe(true)
    expect(store.deletes).toEqual([])
  })

  it('takes over the stale token lock a crashed instance left behind, and reports it', async () => {
    if (root === undefined) throw new Error('the harness has no lock root')
    const lock = lockFileNameForSlug(accountSlug(IDENTITY))
    await writeFile(join(root, lock), JSON.stringify({ holder: 'holder-a', heartbeatAt: 0 }))

    const { ctx, service } = await boot([[accountRecordKey(IDENTITY), storedGrant(grantFor(IDENTITY))]])
    const warnings: string[] = []
    const warned = vi.spyOn(ctx.logger, 'warn')
    warned.mockImplementation((...args: unknown[]) => { warnings.push(String(args[0])) })

    await vi.waitFor(async () => {
      const payload = JSON.parse(await readFile(join(root as string, lock), 'utf8')) as { holder?: string }
      expect(payload.holder).toMatch(/^dsh-/)
    })
    expect(service.accounts.map(view => view.id)).toEqual([accountChannelId(IDENTITY)])
    expect(warnings.some(message => message.includes('overrode the stale token lock of holder-a'))).toBe(true)
  })

  it('reports the id, slug, bot identity, and state of every restored account', async () => {
    const { ctx, service } = await boot([
      [accountRecordKey(IDENTITY), storedGrant(grantFor(IDENTITY))],
      [accountRecordKey(HOLDING_IDENTITY), { kind: 'grant', payload: 'not-an-object' }],
    ])
    await vi.waitFor(() => { expect(providerFor(ctx, IDENTITY)?.state).toEqual(RESTING_STATE) })

    expect(service.accounts).toEqual([
      {
        id: accountChannelId(IDENTITY),
        slug: accountSlug(IDENTITY),
        botIdentity: 'a4c0a9d31015@im.bot',
        state: RESTING_STATE,
      },
      {
        id: accountChannelId(HOLDING_IDENTITY),
        slug: accountSlug(HOLDING_IDENTITY),
        botIdentity: accountSlug(HOLDING_IDENTITY),
        state: { status: 'unavailable', diagnostic: WEIXIN_UNREADABLE_DIAGNOSTIC },
      },
    ])
  })
})

describe('the live QR login', () => {
  it('announces every state of a confirmed scan and stores its grant under the account key', async () => {
    const { ctx, service } = await boot()
    const announced: WeixinLoginState[] = []
    const live: WeixinLoginState[] = []
    onLogin(ctx, (state) => {
      announced.push(state)
      live.push(service.login)
    })

    scripted.statuses.push({ status: 'confirmed', grant: grantFor(IDENTITY) })
    const first = await service.beginLogin()

    // The returned state is the one the code fetch reached; the store write is the sequence's own outcome.
    expect(first).toEqual({ phase: 'waiting', qrUrl: scripted.challenge.url })
    await vi.waitFor(() => { expect(store.writes).toHaveLength(1) })
    expect(service.login).toEqual({ phase: 'confirmed' })

    // Every announced state is the state the getter reports when the announcement arrives.
    expect(announced).toEqual(live)
    expect(announced.map(state => state.phase)).toEqual(['idle', 'waiting', 'confirmed', 'confirmed'])
    expect(announced[1]).toEqual({ phase: 'waiting', qrUrl: scripted.challenge.url })
    expect(store.writes).toEqual([
      { key: accountRecordKey(IDENTITY), record: { kind: 'grant', payload: grantFor(IDENTITY) } },
    ])
    expect(service.accounts).toEqual([
      {
        id: accountChannelId(IDENTITY),
        slug: accountSlug(IDENTITY),
        botIdentity: 'a4c0a9d31015@im.bot',
        state: RESTING_STATE,
      },
    ])
    expect(providerFor(ctx, IDENTITY)?.id).toBe(accountChannelId(IDENTITY))
  })

  it('refuses a confirmed scan that names no WeChat account', async () => {
    const { service } = await boot()
    scripted.statuses.push({ status: 'confirmed', grant: { ...grantFor(IDENTITY), userId: '' } })

    await service.beginLogin()
    await vi.waitFor(() => {
      expect(service.login).toEqual({
        phase: 'failed',
        diagnostic: 'the platform confirmed the scan without naming the WeChat account; scan again',
      })
    })
    expect(store.writes).toEqual([])
    expect(store.deletes).toEqual([])
    expect(service.accounts).toEqual([])
  })

  it('refuses a confirmed scan whose slug an account of another identity already holds', async () => {
    const { ctx, service } = await boot([
      [accountRecordKey(HOLDING_IDENTITY), storedGrant(grantFor(HOLDING_IDENTITY, 'bot-old@im.bot'))],
    ])
    const holder = providerFor(ctx, HOLDING_IDENTITY)
    expect(holder?.displayName).toBe('bot-old@im.bot')

    scripted.statuses.push({ status: 'confirmed', grant: grantFor(COLLIDING_IDENTITY, 'bot-new@im.bot') })
    await service.beginLogin()
    await vi.waitFor(() => {
      expect(service.login).toEqual({
        phase: 'failed',
        diagnostic: `the identity "${accountSlug(HOLDING_IDENTITY)}" already belongs to another WeChat account; disconnect it first`,
      })
    })

    expect(service.login.phase).toBe('failed')
    expect(store.writes).toEqual([])
    expect(store.records.get(accountRecordKey(HOLDING_IDENTITY)))
      .toEqual(storedGrant(grantFor(HOLDING_IDENTITY, 'bot-old@im.bot')))
    expect(service.accounts.map(view => view.botIdentity)).toEqual(['bot-old@im.bot'])
    expect(providerFor(ctx, HOLDING_IDENTITY)).toBe(holder)
  })

  it('hands one slug over to its scanning account\'s next provider without growing the account list', async () => {
    const { ctx, service } = await boot([
      [accountRecordKey(IDENTITY), storedGrant(grantFor(IDENTITY, 'bot-old@im.bot'))],
    ])
    const predecessor = providerFor(ctx, IDENTITY)
    expect(predecessor?.displayName).toBe('bot-old@im.bot')
    await settled(IDENTITY)

    scripted.statuses.push({ status: 'confirmed', grant: grantFor(IDENTITY, 'bot-new@im.bot') })
    await service.beginLogin()
    await vi.waitFor(() => { expect(store.writes).toHaveLength(1) })
    expect(service.login).toEqual({ phase: 'confirmed' })

    expect(service.accounts).toEqual([
      {
        id: accountChannelId(IDENTITY),
        slug: accountSlug(IDENTITY),
        botIdentity: 'bot-new@im.bot',
        state: RESTING_STATE,
      },
    ])
    const successor = providerFor(ctx, IDENTITY)
    expect(successor).toBeDefined()
    expect(successor).not.toBe(predecessor)
    expect(successor?.id).toBe(accountChannelId(IDENTITY))
    expect(successor?.displayName).toBe('bot-new@im.bot')
    expect(store.writes).toEqual([
      { key: accountRecordKey(IDENTITY), record: { kind: 'grant', payload: grantFor(IDENTITY, 'bot-new@im.bot') } },
    ])
  })

  it('ends a live sequence on cancel without storing anything', async () => {
    const { service } = await boot()
    const hold = gate()
    scripted.hold = hold
    scripted.statuses.push('hold')
    const begun = service.beginLogin()
    void begun.catch(() => undefined)
    await vi.waitFor(() => { expect(scripted.statuses).toEqual([]) })
    expect(scripted.fetches).toBe(1)

    service.cancelLogin()
    expect(service.login).toEqual({ phase: 'idle' })

    // The sequence ends on the abort, so the unfinished login publishes no failure of its own.
    hold.fail(new Error('the WeChat login was cancelled'))
    await new Promise((resolve) => { setTimeout(resolve, 20) })

    expect(service.login).toEqual({ phase: 'idle' })
    expect(store.writes).toEqual([])
    expect(service.accounts).toEqual([])
  })

  it('survives a login listener that throws and keeps the sequence running', async () => {
    const { ctx, service } = await boot()
    onLogin(ctx, () => { throw new Error('the login listener exploded') })

    scripted.statuses.push({ status: 'confirmed', grant: grantFor(IDENTITY) })
    await service.beginLogin()
    await vi.waitFor(() => { expect(store.writes).toHaveLength(1) })
    expect(service.login).toEqual({ phase: 'confirmed' })

    expect(store.writes).toEqual([
      { key: accountRecordKey(IDENTITY), record: { kind: 'grant', payload: grantFor(IDENTITY) } },
    ])
  })

  it('reports a login whose grant the credential store refused to write', async () => {
    const { service } = await boot()
    store.failing = new Error('the credential store is read-only')

    scripted.statuses.push({ status: 'confirmed', grant: grantFor(IDENTITY) })
    await service.beginLogin()
    await vi.waitFor(() => {
      expect(service.login).toEqual({ phase: 'failed', diagnostic: 'the credential store is read-only' })
    })
    expect(store.writes).toEqual([])
    expect(service.accounts).toEqual([])
  })
})

describe('disconnecting an account', () => {
  it('unregisters one account, deletes its record, and leaves the others registered', async () => {
    const { ctx, service } = await boot([
      [accountRecordKey(IDENTITY), storedGrant(grantFor(IDENTITY))],
      [accountRecordKey(OTHER_IDENTITY), storedGrant(grantFor(OTHER_IDENTITY, 'bot-2@im.bot'))],
    ])
    expect(service.accounts).toHaveLength(2)

    await service.disconnect(accountChannelId(IDENTITY))

    expect(service.accounts.map(view => view.id)).toEqual([accountChannelId(OTHER_IDENTITY)])
    expect(ctx.channels.get(accountChannelId(IDENTITY))).toBeUndefined()
    expect(store.deletes).toEqual([recordKeyForSlug(accountSlug(IDENTITY))])
    expect(store.records.has(accountRecordKey(IDENTITY))).toBe(false)
    expect(store.records.has(accountRecordKey(OTHER_IDENTITY))).toBe(true)
    expect(providerFor(ctx, OTHER_IDENTITY)?.displayName).toBe('bot-2@im.bot')
  })

  it('refuses an identity that is not a WeChat account and forgets a slug it never registered', async () => {
    const { service } = await boot()

    await expect(service.disconnect(ChannelId('telegram:one'))).rejects.toThrow('is not a WeChat account identity')
    await expect(service.disconnect(ChannelId('weixin:'))).rejects.toThrow('is not a WeChat account identity')
    expect(store.deletes).toEqual([])

    await service.disconnect(ChannelId('weixin:absent'))
    expect(store.deletes).toEqual([recordKeyForSlug('absent')])
    expect(service.accounts).toEqual([])
  })
})
