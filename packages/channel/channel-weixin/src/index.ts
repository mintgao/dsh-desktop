/**
 * The WeChat channel plugin: the composition's WeChat accounts, the QR login
 * that connects one, and the registration each account's provider holds.
 * Adding an account cannot be a provider method — no registration exists before
 * the scan — so this package declares the plugin-local service
 * `ctx.channelWeixin`, which the platform's own settings surface drives. The
 * Consumer and the registry projection never read it.
 * @module @deepseek-ai/dsh-channel-weixin
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ChannelConnectionState, ChannelId } from '@deepseek-ai/dsh-channel'
import type {} from '@deepseek-ai/dsh-channel-session'
import { accountRecordKey, accountSlug, channelIdForSlug, listStoredAccounts, recordKeyForSlug } from './accounts.ts'
import type { WeixinStoredAccountEntry } from './accounts.ts'
import type { Config } from './config.ts'
import { WeixinLoginSequence } from './login.ts'
import { WeixinAccountProvider } from './provider.ts'
import { createHttpTransport, errorMessage } from './transport.ts'
import type { WeixinTransport } from './transport.ts'
import type { WeixinLoginState } from './types.ts'

export type * from './types.ts'
export type { Config } from './config.ts'
export {
  WEIXIN_STALE_AT_START_DIAGNOSTIC,
  WEIXIN_TAKEN_AWAY_DIAGNOSTIC,
  WEIXIN_UNREADABLE_DIAGNOSTIC,
  WeixinAccountProvider,
} from './provider.ts'
export type { WeixinProviderAccount, WeixinProviderDependencies } from './provider.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    channelWeixin: WeixinChannelService
  }
}

/** Prefix every WeChat account's registration identity carries. */
const CHANNEL_ID_PREFIX = 'weixin:'

/** One connected WeChat account, as the settings surface reads it. */
export interface WeixinAccountView {
  /** Registration identity, such as `weixin:o9cq805f-im-wechat`. */
  readonly id: ChannelId
  /** Slug the registration and both keys are named after. */
  readonly slug: string
  /** Bot identity the account's current login bound; the slug when the stored login is unreadable. */
  readonly botIdentity: string
  /** Current connection state, including the diagnostics an eviction reports. */
  readonly state: ChannelConnectionState
}

/** One registered account and the disposer that unregisters it. */
interface RegisteredAccount {
  readonly provider: WeixinAccountProvider
  readonly dispose: () => void
}

/**
 * The WeChat accounts of one composition. It restores every stored account at
 * init, owns the one live login sequence, and gives each account's provider its
 * own lock, poll, and registration.
 */
export class WeixinChannelService extends Service {
  static inject = ['channels', 'credentials', 'channelSession']

  // Inline schema call: the config catalog walks `static Config` statically.
  static Config: z<Config> = z.object({
    pollTimeoutMs: z.number().step(1).min(1).required(),
    pollRetryAttempts: z.number().step(1).min(1).required(),
    pollBackoffMs: z.number().step(1).min(0).required(),
    sendRetryAttempts: z.number().step(1).min(1).required(),
    sendBackoffMs: z.number().step(1).min(0).required(),
    throttleDelayMs: z.number().step(1).min(0).required(),
    breakerThreshold: z.number().step(1).min(1).required(),
    chunkLength: z.number().step(1).min(1).required(),
    lockDirectory: z.string().required(),
  })

  private readonly registered = new Map<string, RegisteredAccount>()
  private loginAbort: AbortController | undefined
  private loginState: WeixinLoginState = { phase: 'idle' }
  private readonly transport: WeixinTransport

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'channelWeixin')
    this.transport = createHttpTransport()
  }

  /** Restore every account the credential store holds for this package. */
  protected async [Service.init](): Promise<void> {
    for (const entry of await listStoredAccounts(this.ctx.credentials)) this.registerAccount(entry)
  }

  /** The account list, in slug order. */
  get accounts(): readonly WeixinAccountView[] {
    return [...this.registered.values()].map(({ provider }) => ({
      id: provider.id,
      slug: provider.accountView.slug,
      botIdentity: provider.displayName,
      state: provider.state,
    }))
  }

  /** The login sequence's observable state, for the settings page. */
  get login(): WeixinLoginState {
    return this.loginState
  }

  /**
   * Start a QR login: fetch the first code and run the sequence in the
   * background, replacing any sequence already live. A confirmed scan stores
   * the account it bound and starts that account's connection.
   * @returns the state after the first code was fetched.
   */
  async beginLogin(): Promise<WeixinLoginState> {
    this.cancelLogin()
    const controller = new AbortController()
    this.loginAbort = controller
    const sequence = new WeixinLoginSequence({
      transport: this.transport,
      onState: (state) => { this.publishLogin(state) },
    })
    await sequence.begin(controller.signal)
    void this.completeLogin(sequence, controller.signal)
    return sequence.state
  }

  /** Cancel a login sequence in flight; a no-op when none is. */
  cancelLogin(): void {
    this.loginAbort?.abort(new Error('the WeChat login was cancelled'))
    this.loginAbort = undefined
    this.publishLogin({ phase: 'idle' })
  }

  /**
   * Stop using one account: unregister its provider once its poll stopped and
   * its lock was released, then delete its stored login. The platform session
   * is not released — the platform releases it only when another login replaces
   * it — and every other account is left untouched.
   * @param id - the account's registration identity, as {@link accounts} reports it.
   * @returns resolution once the account is gone from this composition.
   */
  async disconnect(id: ChannelId): Promise<void> {
    const slug = id.startsWith(CHANNEL_ID_PREFIX) ? id.slice(CHANNEL_ID_PREFIX.length) : undefined
    if (slug === undefined || slug === '') throw new Error(`"${id}" is not a WeChat account identity`)
    await this.unregister(slug)
    await this.ctx.credentials.deleteRecord(recordKeyForSlug(slug))
  }

  /** Register one stored account; the account's own provider does the rest. */
  private registerAccount(entry: WeixinStoredAccountEntry): void {
    const account = entry.account
    const id = channelIdForSlug(entry.slug)
    const provider = new WeixinAccountProvider(this.config, {
      slug: entry.slug,
      ...account === undefined ? {} : { identity: account.identity, grant: account.grant },
    }, {
      resumeCursors: () => this.ctx.channelSession.resumeCursors(id),
      warn: (message) => { this.ctx.logger.warn(message) },
      transport: this.transport,
    })
    const dispose = this.ctx.effect(() => this.ctx.channels.register(provider), `channelWeixin.register(${entry.slug})`)
    this.registered.set(entry.slug, { provider, dispose })
  }

  /** Unregister one account and wait until its poll stopped and its lock is free. */
  private async unregister(slug: string): Promise<void> {
    const registered = this.registered.get(slug)
    if (registered === undefined) return
    this.registered.delete(slug)
    registered.dispose()
    await registered.provider.quiesce()
  }

  /** Finish one login sequence: store the account it bound and connect it. */
  private async completeLogin(sequence: WeixinLoginSequence, signal: AbortSignal): Promise<void> {
    try {
      const grant = await sequence.wait(signal)
      if (grant.userId === '') {
        this.refuseLogin('the platform confirmed the scan without naming the WeChat account; scan again')
        return
      }
      const slug = accountSlug(grant.userId)
      const holder = this.registered.get(slug)?.provider.accountView
      if (holder !== undefined && holder.identity !== grant.userId) {
        this.refuseLogin(`the identity "${slug}" already belongs to another WeChat account; disconnect it first`)
        return
      }
      // The ordered handover: the account's next provider must not meet its
      // predecessor's lock, and the registry refuses two providers under one id.
      if (holder !== undefined) await this.unregister(slug)
      await this.ctx.credentials.modifyRecord(accountRecordKey(grant.userId), async () => ({ kind: 'grant', payload: grant }))
      this.registerAccount({ slug, account: { slug, identity: grant.userId, grant } })
      this.loginAbort = undefined
      this.publishLogin({ phase: 'confirmed' })
    } catch (error: unknown) {
      if (signal.aborted) return
      this.refuseLogin(errorMessage(error))
    }
  }

  /** End one login attempt without an account, reporting why. */
  private refuseLogin(diagnostic: string): void {
    this.ctx.logger.warn(`channel-weixin login failed: ${diagnostic}`)
    this.loginAbort = undefined
    this.publishLogin({ phase: 'failed', diagnostic })
  }

  /** Announce one login state without letting a listener's failure reach the sequence. */
  private publishLogin(state: WeixinLoginState): void {
    this.loginState = state
    try {
      this.ctx.emit('channel-weixin/login', state)
    } catch (error: unknown) {
      this.ctx.logger.warn(`channel-weixin login listener failed: ${errorMessage(error)}`)
    }
  }
}

export default WeixinChannelService
