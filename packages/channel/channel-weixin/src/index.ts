/**
 * The WeChat channel provider: one iLink bot connection registered into
 * `ctx.channels`. This package owns the QR login sequence, the token lock, the
 * cursor long poll, and the chunked send path; the Consumer owns the
 * conversation bindings, and this package reads their recorded cursors through
 * `ctx.channelSession` to resume the poll. Everything durable lives in
 * `ctx.credentials` (the login product) and in the binding records — the
 * provider itself keeps only the volatile reply context tokens.
 * @module @deepseek-ai/dsh-channel-weixin
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ChannelId } from '@deepseek-ai/dsh-channel'
import type {
  ChannelConnectionState,
  ChannelConversationId,
  ChannelOutboundMessage,
  ChannelProvider,
  ChannelProviderControl,
  ChannelSendReceipt,
} from '@deepseek-ai/dsh-channel'
import type {} from '@deepseek-ai/dsh-channel-session'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { acquireTokenLock } from './lock.ts'
import type { WeixinTokenLock } from './lock.ts'
import { WeixinLoginSequence } from './login.ts'
import { WeixinPollLoop } from './poll.ts'
import { sendChunked } from './send.ts'
import { createHttpTransport, errorMessage } from './transport.ts'
import type { WeixinTransport } from './transport.ts'
import type { WeixinLoginGrant, WeixinLoginState } from './types.ts'

export type * from './types.ts'

/** Cordis function-plugin name. */
export const name = 'channel-weixin'

/** Host services required before the provider can register. */
export const inject = ['channels', 'credentials', 'channelSession']

/** The registration identity of the one WeChat connection. */
export const WEIXIN_CHANNEL_ID = ChannelId('weixin')

/**
 * The credential record holding the login product. The bot identity a scan
 * creates is the registration identity's display fact, not its key: the
 * provider registers before any login exists, and the brief gives one card per
 * platform.
 */
export const WEIXIN_LOGIN_KEY = credentialKey('channel-weixin', 'login')

/**
 * Deployment choices of the WeChat provider. Every bound is stated by the
 * composition; the API base address stays a protocol constant.
 */
export interface Config {
  /** Long-poll timeout in milliseconds; the platform may suggest another one. */
  readonly pollTimeoutMs: number
  /** Total attempts one poll cycle gets, including the first. */
  readonly pollRetryAttempts: number
  /** Wait between two poll attempts, and between two failed cycles, in milliseconds. */
  readonly pollBackoffMs: number
  /** Total attempts one outbound chunk gets, including the first. */
  readonly sendRetryAttempts: number
  /** Wait between two outbound attempts, in milliseconds. */
  readonly sendBackoffMs: number
  /** Wait a frequency-limited send observes before its retry, in milliseconds. */
  readonly throttleDelayMs: number
  /** Consecutive failed poll cycles that open the circuit breaker. */
  readonly breakerThreshold: number
  /** Largest outbound chunk within the platform's length limit, in characters. */
  readonly chunkLength: number
  /** Directory of the token-lock file; the Mint bundle points it at the desktop data directory. */
  readonly lockDirectory: string
}

/** Config schema of {@link Config}. */
export const Config: z<Config> = z.object({
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

/** What the provider needs beyond its configuration. */
export interface WeixinProviderDependencies {
  /** Credential service holding the login product. */
  readonly credentials: CredentialProvider
  /** Recorded resume positions of this channel's conversations. */
  readonly resumeCursors: () => readonly string[]
  /** Contain one diagnostic line. */
  readonly warn: (message: string) => void
  /** Platform calls; tests inject a scripted stand-in. */
  readonly transport?: WeixinTransport | undefined
  /** Clock override for tests. */
  readonly now?: (() => number) | undefined
  /** Wait helper; tests substitute one that skips real time. */
  readonly delay?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined
}

/** Validate one stored login payload; a payload this build cannot read is treated as absent. */
function parseGrant(payload: unknown): WeixinLoginGrant | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const fields = payload as Record<string, unknown>
  const accountId = fields['accountId']
  const token = fields['token']
  const baseUrl = fields['baseUrl']
  const userId = fields['userId']
  if (typeof accountId !== 'string' || accountId === '') return undefined
  if (typeof token !== 'string' || token === '') return undefined
  if (typeof baseUrl !== 'string' || baseUrl === '') return undefined
  if (typeof userId !== 'string') return undefined
  return { accountId, token, baseUrl, userId }
}

/**
 * One WeChat connection: the provider the registry registers, plus the login
 * surface a settings page drives. `attach` starts the connection in the
 * background from the stored login product and reports every state through the
 * registration's `changed` announcement.
 */
export class WeixinChannelProvider implements ChannelProvider<'weixin'> {
  readonly id = WEIXIN_CHANNEL_ID
  readonly kind = 'weixin'
  readonly displayName = 'WeChat (微信)'
  private connection: ChannelConnectionState = { status: 'idle' }
  private control: ChannelProviderControl | undefined
  private poll: AbortController | undefined
  private lock: WeixinTokenLock | undefined
  private loginAbort: AbortController | undefined
  private loginState: WeixinLoginState = { phase: 'idle' }
  private readonly contextTokens = new Map<string, string>()
  private readonly transport: WeixinTransport

  constructor(private readonly config: Config, private readonly deps: WeixinProviderDependencies) {
    this.transport = deps.transport ?? createHttpTransport()
  }

  /** Current connection state. Read by the controller when it projects the provider set. */
  get state(): ChannelConnectionState {
    return this.connection
  }

  /** The login sequence's observable state, for the settings page. */
  get login(): WeixinLoginState {
    return this.loginState
  }

  /**
   * Begin delivering inbound messages and observe this registration's lifetime.
   * The registry calls this once, synchronously, during registration; the
   * connection itself starts in the background and reports through `state`.
   * @param control - registration-scoped lifetime, inbound publish, and state-change announcement.
   */
  attach(control: ChannelProviderControl): void {
    this.control = control
    control.signal.addEventListener('abort', () => { void this.stop() }, { once: true })
    void this.start(control.signal)
  }

  /**
   * Send one outbound message to a conversation: resolve the current login
   * product, take the freshest reply context token the poll remembered, and
   * hand the reply to the chunked bounded retry.
   * @param conversation - platform conversation to deliver to.
   * @param message - complete reply text.
   * @param signal - cancels the send when its owner unloads.
   * @returns the platform receipt once every chunk was accepted.
   */
  async send(
    conversation: ChannelConversationId,
    message: ChannelOutboundMessage,
    signal: AbortSignal,
  ): Promise<ChannelSendReceipt> {
    const grant = await this.readGrant()
    if (grant === undefined) throw new Error('the WeChat channel has no login; connect it first')
    return await sendChunked({
      transport: this.transport,
      auth: { baseUrl: grant.baseUrl, token: grant.token },
      conversationId: conversation,
      text: message.text,
      chunkLength: this.config.chunkLength,
      attempts: this.config.sendRetryAttempts,
      backoffMs: this.config.sendBackoffMs,
      throttleDelayMs: this.config.throttleDelayMs,
      contextToken: this.contextTokens.get(conversation),
      signal,
      delay: this.deps.delay,
    })
  }

  /**
   * Start a QR login: fetch the first code and run the sequence in the
   * background. The returned state carries the QR URL the settings page shows;
   * a confirmed scan writes the login product and reconnects the provider.
   * @returns the state after the first code was fetched.
   */
  async beginLogin(): Promise<WeixinLoginState> {
    this.cancelLogin()
    const controller = new AbortController()
    this.loginAbort = controller
    const sequence = new WeixinLoginSequence({
      transport: this.transport,
      onState: (state) => {
        this.loginState = state
        this.control?.changed()
      },
      delay: this.deps.delay,
    })
    await sequence.begin(controller.signal)
    void this.completeLogin(sequence, controller.signal)
    return sequence.state
  }

  /** Cancel a login sequence in flight; a no-op when none is. */
  cancelLogin(): void {
    this.loginAbort?.abort(new Error('the WeChat login was cancelled'))
    this.loginAbort = undefined
    this.loginState = { phase: 'idle' }
    this.control?.changed()
  }

  /** Finish one login sequence: store the product and reconnect. */
  private async completeLogin(sequence: WeixinLoginSequence, signal: AbortSignal): Promise<void> {
    try {
      const grant = await sequence.wait(signal)
      await this.deps.credentials.modifyRecord(WEIXIN_LOGIN_KEY, async () => ({ kind: 'grant', payload: grant }))
      this.loginAbort = undefined
      await this.reconnect()
    } catch (error: unknown) {
      if (signal.aborted) return
      this.deps.warn(`channel-weixin login failed: ${errorMessage(error)}`)
      this.loginAbort = undefined
    }
  }

  /** Start the connection from the stored login product, in the background. */
  private async start(signal: AbortSignal): Promise<void> {
    try {
      const grant = await this.readGrant()
      if (grant === undefined) {
        this.report({ status: 'idle' })
        return
      }
      await this.connect(grant, signal)
    } catch (error: unknown) {
      if (signal.aborted) return
      this.report({ status: 'unavailable', diagnostic: errorMessage(error) })
    }
  }

  /**
   * Acquire the token lock and run the poll loop for one login product. The
   * lock's stale threshold is twice the configured poll timeout, so a holder
   * that missed its heartbeats is overridden instead of blocking forever.
   */
  private async connect(grant: WeixinLoginGrant, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return
    this.report({ status: 'connecting' })
    const result = await acquireTokenLock({
      directory: this.config.lockDirectory,
      holderId: `dsh-${randomUUID()}`,
      staleMs: this.config.pollTimeoutMs * 2,
    })
    if (result.kind === 'held') {
      this.report({
        status: 'unavailable',
        diagnostic: `another client holds this bot's token (holder ${result.holderId})`,
      })
      return
    }
    const acquired = result.lock
    this.lock = acquired
    if (result.overrode !== undefined) {
      this.deps.warn(`channel-weixin overrode the stale token lock of ${result.overrode}`)
    }
    const controller = new AbortController()
    this.poll = controller
    const loop = new WeixinPollLoop({
      transport: this.transport,
      auth: { baseUrl: grant.baseUrl, token: grant.token },
      channel: this.id,
      accountId: grant.accountId,
      cursor: this.resumeCursor(),
      timeoutMs: this.config.pollTimeoutMs,
      attempts: this.config.pollRetryAttempts,
      backoffMs: this.config.pollBackoffMs,
      breakerThreshold: this.config.breakerThreshold,
      publish: (message) => { this.control?.publish(message) },
      rememberContextToken: (conversationId, token) => { this.contextTokens.set(conversationId, token) },
      onConnected: () => { this.report({ status: 'connected' }) },
      onCycle: async () => { await acquired.heartbeat() },
      warn: (message) => { this.deps.warn(message) },
      now: this.deps.now,
      delay: this.deps.delay,
    })
    try {
      const outcome = await loop.run(AbortSignal.any([signal, controller.signal]))
      if (outcome.kind === 'expired') {
        this.report({ status: 'unavailable', diagnostic: 'the WeChat session expired; scan a new QR code' })
      } else if (outcome.kind === 'breaker') {
        this.report({ status: 'unavailable', diagnostic: `the WeChat poll stopped after repeated failures: ${outcome.diagnostic}` })
      }
    } catch (error: unknown) {
      if (!signal.aborted) this.report({ status: 'unavailable', diagnostic: errorMessage(error) })
    } finally {
      if (this.lock === acquired) this.lock = undefined
      if (this.poll === controller) this.poll = undefined
      try {
        await acquired.release()
      } catch (error: unknown) {
        this.deps.warn(`channel-weixin could not release the token lock: ${errorMessage(error)}`)
      }
    }
  }

  /** Stop the poll and release the token lock. */
  private async stopPoll(): Promise<void> {
    this.poll?.abort(new Error('the WeChat channel poll was stopped'))
    this.poll = undefined
    const lock = this.lock
    this.lock = undefined
    if (lock === undefined) return
    try {
      await lock.release()
    } catch (error: unknown) {
      this.deps.warn(`channel-weixin could not release the token lock: ${errorMessage(error)}`)
    }
  }

  /** Stop the connection: cancel any login, abort the poll, release the lock. */
  private async stop(): Promise<void> {
    this.cancelLogin()
    await this.stopPoll()
  }

  /** Restart the connection from the current login product, stopping the old poll first. */
  private async reconnect(): Promise<void> {
    const control = this.control
    if (control === undefined) return
    await this.stopPoll()
    void this.start(control.signal)
  }

  /** Read and validate the stored login product. */
  private async readGrant(): Promise<WeixinLoginGrant | undefined> {
    const record = await this.deps.credentials.readRecord(WEIXIN_LOGIN_KEY)
    if (record === undefined) return undefined
    if (record.kind !== 'grant') return undefined
    const grant = parseGrant(record.payload)
    if (grant === undefined) {
      this.deps.warn('channel-weixin: the stored login record is not readable; a new scan is required')
    }
    return grant
  }

  /**
   * The position the poll resumes from: the earliest recorded cursor among the
   * channel's bindings. A cursor's format is opaque, so the comparison is
   * lexicographic; any position at or before every recorded one is safe,
   * because the platform redelivers what follows and `lastAdmittedMessageId`
   * suppresses the messages already admitted.
   */
  private resumeCursor(): string {
    let earliest: string | undefined
    for (const cursor of this.deps.resumeCursors()) {
      if (earliest === undefined || cursor < earliest) earliest = cursor
    }
    return earliest ?? ''
  }

  /**
   * Report one connection state. A status that did not change is not
   * re-announced; an `unavailable` re-report always is, because its diagnostic
   * is the news.
   */
  private report(state: ChannelConnectionState): void {
    if (state.status === this.connection.status && state.status !== 'unavailable') return
    this.connection = state
    this.control?.changed()
  }
}

/**
 * Register the WeChat provider with the channel registry for this plugin's
 * lifetime: disposal unregisters the provider, which aborts the long poll and
 * releases the token lock.
 * @param ctx - the plugin context, holding the registry, the credentials, and the consumer.
 * @param config - validated deployment bounds.
 */
export function apply(ctx: Context, config: Config): void {
  const provider = new WeixinChannelProvider(config, {
    credentials: ctx.credentials,
    resumeCursors: () => ctx.channelSession.resumeCursors(WEIXIN_CHANNEL_ID),
    warn: (message) => { ctx.logger.warn(message) },
  })
  ctx.effect(() => ctx.channels.register(provider), 'channel-weixin.register')
}
