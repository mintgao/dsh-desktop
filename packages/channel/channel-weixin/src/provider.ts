/**
 * One WeChat account's provider: the registration the channel registry holds
 * for one WeChat account. It owns that account's token lock, its long poll, and
 * its send path, and it reports the two readings of a session the platform has
 * taken away — one taken while DSH was connected, and one that was already
 * unusable when DSH started.
 * @module @deepseek-ai/dsh-channel-weixin/src/provider
 */

import { randomUUID } from 'node:crypto'
import type {
  ChannelConnectionState,
  ChannelConversationId,
  ChannelId,
  ChannelOutboundMessage,
  ChannelProvider,
  ChannelProviderControl,
  ChannelSendReceipt,
} from '@deepseek-ai/dsh-channel'
import { channelIdForSlug, lockFileNameForSlug } from './accounts.ts'
import type { Config } from './config.ts'
import { staleThresholdMs } from './config.ts'
import { acquireTokenLock } from './lock.ts'
import type { WeixinTokenLock } from './lock.ts'
import { WeixinPollLoop } from './poll.ts'
import { sendChunked } from './send.ts'
import { createHttpTransport, errorMessage, isSessionExpired, WeixinApiError } from './transport.ts'
import type { WeixinTransport } from './transport.ts'
import type { WeixinLoginGrant } from './types.ts'

/** Diagnostic of an account whose session was taken away while DSH was connected. */
export const WEIXIN_TAKEN_AWAY_DIAGNOSTIC =
  'the WeChat session was taken away while DSH was connected; scanning a new QR code takes the account back'

/** Diagnostic of an account whose stored session was already unusable when DSH started. */
export const WEIXIN_STALE_AT_START_DIAGNOSTIC =
  'the stored WeChat session is no longer usable; it may have been taken over before DSH started — scanning a new QR code takes the account back'

/** Diagnostic of an account whose stored login this build cannot read. */
export const WEIXIN_UNREADABLE_DIAGNOSTIC =
  'the stored login of this WeChat account is unreadable; scanning a new QR code connects it again'

/** The one WeChat account a provider serves. */
export interface WeixinProviderAccount {
  /** Slug derived from the account identity; names the registration and both keys. */
  readonly slug: string
  /** Platform identity of the WeChat account; absent when the stored record could not be read. */
  readonly identity?: string | undefined
  /** The stored login; absent when the record could not be read, which leaves the account unavailable. */
  readonly grant?: WeixinLoginGrant | undefined
}

/** What one account's provider needs beyond its configuration. */
export interface WeixinProviderDependencies {
  /** Recorded resume positions of this account's conversations. */
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

/**
 * One WeChat account's connection: `attach` starts the poll in the background
 * from the account's stored login and reports every state through the
 * registration's `changed` announcement. An account without a readable login
 * registers as `unavailable` and never polls.
 */
export class WeixinAccountProvider implements ChannelProvider<'weixin'> {
  readonly id: ChannelId
  readonly kind = 'weixin'
  private connection: ChannelConnectionState
  private control: ChannelProviderControl | undefined
  private poll: AbortController | undefined
  private lock: WeixinTokenLock | undefined
  private cycleCompleted = false
  private teardown: Promise<void> = Promise.resolve()
  private readonly contextTokens = new Map<string, string>()
  private readonly transport: WeixinTransport

  constructor(
    private readonly config: Config,
    private readonly account: WeixinProviderAccount,
    private readonly deps: WeixinProviderDependencies,
  ) {
    this.id = channelIdForSlug(account.slug)
    this.connection = account.grant === undefined
      ? { status: 'unavailable', diagnostic: WEIXIN_UNREADABLE_DIAGNOSTIC }
      : { status: 'idle' }
    this.transport = deps.transport ?? createHttpTransport()
  }

  /** Name the settings page shows: the bot identity this account's current login bound. */
  get displayName(): string {
    return this.account.grant?.accountId ?? this.account.slug
  }

  /** Current connection state. Read by the controller when it projects the provider set. */
  get state(): ChannelConnectionState {
    return this.connection
  }

  /** What this provider serves, for the account list. */
  get accountView(): WeixinProviderAccount {
    return this.account
  }

  /**
   * Begin delivering inbound messages and observe this registration's lifetime.
   * The registry calls this once, synchronously, during registration; the
   * connection itself starts in the background and reports through `state`.
   * @param control - registration-scoped lifetime, inbound publish, and state-change announcement.
   */
  attach(control: ChannelProviderControl): void {
    this.control = control
    control.signal.addEventListener('abort', () => { this.teardown = this.stop() }, { once: true })
    void this.start(control.signal)
  }

  /**
   * Resolve after this account's poll has stopped and its lock is released.
   * A handover awaits it before registering the account's next provider, so the
   * successor cannot meet its predecessor's lock.
   * @returns resolution once this provider holds nothing.
   */
  async quiesce(): Promise<void> {
    await this.teardown
  }

  /**
   * Send one outbound message to a conversation: take the freshest reply
   * context token the poll remembered and hand the reply to the chunked bounded
   * retry. A send the platform refuses because the session is gone reports the
   * same state an expired poll does.
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
    const grant = this.account.grant
    if (grant === undefined) throw new Error('this WeChat account has no readable login; connect it again')
    try {
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
    } catch (error: unknown) {
      if (error instanceof WeixinApiError && isSessionExpired(error)) this.reportEviction()
      throw error
    }
  }

  /** Start the connection from the stored login, in the background. */
  private async start(signal: AbortSignal): Promise<void> {
    const grant = this.account.grant
    if (grant === undefined) return
    try {
      await this.connect(grant, signal)
    } catch (error: unknown) {
      if (signal.aborted) return
      this.report({ status: 'unavailable', diagnostic: errorMessage(error) })
    }
  }

  /** Acquire this account's token lock and run its poll loop. */
  private async connect(grant: WeixinLoginGrant, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return
    this.report({ status: 'connecting' })
    const result = await acquireTokenLock({
      directory: this.config.lockDirectory,
      fileName: lockFileNameForSlug(this.account.slug),
      holderId: `dsh-${randomUUID()}`,
      staleMs: staleThresholdMs(this.config),
    })
    if (result.kind === 'held') {
      this.report({
        status: 'unavailable',
        diagnostic: `another client holds this account's token (holder ${result.holderId})`,
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
      onConnected: () => {
        this.cycleCompleted = true
        this.report({ status: 'connected' })
      },
      onCycle: async () => { await acquired.heartbeat() },
      warn: (message) => { this.deps.warn(message) },
      now: this.deps.now,
      delay: this.deps.delay,
    })
    try {
      const outcome = await loop.run(AbortSignal.any([signal, controller.signal]))
      if (outcome.kind === 'expired') {
        this.reportEviction()
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

  /** Stop the poll and release this account's lock. */
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

  /** Stop the connection: abort the poll and release the lock. */
  private async stop(): Promise<void> {
    await this.stopPoll()
  }

  /**
   * Report the session is gone. An account that completed a poll cycle while
   * holding this login lost its session while DSH was connected; one that never
   * did may have lost it before DSH started. Both actions are the same new
   * scan, and nothing here attempts it.
   */
  private reportEviction(): void {
    const diagnostic = this.cycleCompleted ? WEIXIN_TAKEN_AWAY_DIAGNOSTIC : WEIXIN_STALE_AT_START_DIAGNOSTIC
    this.report({ status: 'unavailable', diagnostic })
  }

  /**
   * The position this account's poll resumes from: the earliest cursor among
   * its conversation bindings. One token-level stream feeds every conversation,
   * so the provider resumes from the earliest recorded cursor and
   * `lastAdmittedMessageId` suppresses the replays.
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
