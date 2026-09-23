/**
 * Types of the WeChat channel provider: the provider's `ChannelEventMap`
 * member, the login sequence's observable state, and the login product the
 * credential record stores. Types only — no runtime code.
 * @module @deepseek-ai/dsh-channel-weixin/src/types
 */

declare module '@deepseek-ai/dsh-channel' {
  interface ChannelEventMap {
    weixin: {
      readonly kind: 'weixin'
      /** iLink item type this message was normalized from; only text messages are published. */
      readonly messageType: 'text'
    }
  }
}

/**
 * Observable phase of one QR login sequence. `waiting` covers a fresh code and
 * the refresh of an expired one; a confirmed scan moves to `confirmed` and the
 * provider writes the login product, and any unrecoverable failure lands on
 * `failed` with the diagnostic the settings page shows.
 */
export type WeixinLoginPhase = 'idle' | 'waiting' | 'scanned' | 'confirmed' | 'failed'

/** What a settings page renders for the login sequence at one moment. */
export interface WeixinLoginState {
  /** Current phase of the sequence. */
  readonly phase: WeixinLoginPhase
  /** Liteapp URL the page encodes into the QR it shows; present while a code waits. */
  readonly qrUrl?: string | undefined
  /** Why the sequence stopped or restarted; present on `failed`. */
  readonly diagnostic?: string | undefined
}

/**
 * The product of one confirmed QR login, stored verbatim as the credential
 * record's payload: the bot identity the scan created, the token that
 * authenticates the poll and the sends, the shard base address the login
 * reported, and the scanning user's platform identity.
 */
export interface WeixinLoginGrant {
  /** iLink bot identity, for example `<id>@im.bot`. */
  readonly accountId: string
  /** Bearer token the platform issued for this bot identity. */
  readonly token: string
  /** Base address of the shard serving this identity. */
  readonly baseUrl: string
  /** Platform identity of the user who completed the scan. */
  readonly userId: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One login sequence reported a new state: the code being waited on, the
     * scan the platform observed, the confirmation that stored an account, or
     * the failure that ended an attempt. The settings surface the platform's
     * own controller drives is the only subscriber.
     * @param state - the login sequence's observable state.
     * @mode emit
     */
    'channel-weixin/login'(state: WeixinLoginState): void
  }
}
