/** Provider-neutral channel connections, inbound messages, and outbound sends. */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {} from '@deepseek-ai/dsh-llm'
import type { ChannelConversationId, ChannelId, ChannelMessageId, ChannelUserId } from './brand.ts'

/** Channel providers add their normalized inbound event type through declaration merging. */
export interface ChannelEventMap {}

/** Event value for a known provider kind, or generic lossless JSON for an out-of-tree kind. */
export type ChannelEventOf<K extends string> =
  K extends keyof ChannelEventMap ? ChannelEventMap[K] : JsonValue

/**
 * Observable connection state of one provider. `unavailable` carries the diagnostic
 * the settings page shows, so a disconnected channel always states why.
 */
export type ChannelConnectionState =
  | { readonly status: 'idle' }
  | { readonly status: 'connecting' }
  | { readonly status: 'connected' }
  | { readonly status: 'unavailable'; readonly diagnostic: string }

/** One authenticated and provider-normalized inbound message. */
export interface ChannelInboundMessage<K extends string = string> {
  /** Registered provider that owns this conversation. */
  readonly channel: ChannelId
  /** Platform-owned conversation identity. */
  readonly conversationId: ChannelConversationId
  /** Platform-owned sender identity, authorized by the Consumer against the binding. */
  readonly sender: ChannelUserId
  /** Platform-owned message identity, used to suppress an exact platform redelivery. */
  readonly messageId: ChannelMessageId
  /** Plain-text body the sender typed. */
  readonly text: string
  /** Host receipt time in Unix epoch milliseconds. */
  readonly receivedAt: number
  /** Provider-normalized lossless JSON. */
  readonly event: ChannelEventOf<K>
}

/** One outbound message the platform must deliver. */
export interface ChannelOutboundMessage {
  /** Complete text the platform sends. Chunking and platform length limits belong to the provider. */
  readonly text: string
}

/**
 * Registration-scoped capability the registry borrows to one provider. The provider
 * owns its connection; the registry owns only the provider set and the fan-out.
 */
export interface ChannelProviderControl {
  /** Aborts when this exact provider registration is disposed. */
  readonly signal: AbortSignal
  /** Publish one authenticated, normalized inbound message. */
  readonly publish: (message: ChannelInboundMessage) => void
  /** Announce that this provider's connection state changed. */
  readonly changed: () => void
}

/** Trusted provider for one instant-messaging platform. */
export interface ChannelProvider<K extends string = string> {
  /** Unique registration identity; a second provider with the same id fails registration. */
  readonly id: ChannelId
  /** Platform family such as `weixin`, which selects the {@link ChannelEventMap} member. */
  readonly kind: K
  /** Human-readable connection name the settings page shows. */
  readonly displayName: string
  /** Current connection state. Read by the controller when it projects the provider set. */
  readonly state: ChannelConnectionState
  /**
   * Begin delivering inbound messages and observe this registration's lifetime.
   * The registry calls this once, synchronously, during registration.
   * @param control - registration-scoped lifetime, inbound publish, and state-change announcement.
   */
  readonly attach: (control: ChannelProviderControl) => void
  /**
   * Send one outbound message to a conversation.
   * @param conversation - platform-owned conversation to deliver to.
   * @param message - complete text to send.
   * @param signal - cancels the send when its owner unloads.
   * @returns a promise that resolves when the platform accepted the message, not when the recipient read it.
   */
  readonly send: (
    conversation: ChannelConversationId,
    message: ChannelOutboundMessage,
    signal: AbortSignal,
  ) => Promise<void>
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Input admitted from one instant-messaging conversation. */
    channel: {
      readonly kind: 'channel'
      readonly channel: ChannelId
      readonly conversationId: ChannelConversationId
      readonly sender: ChannelUserId
      readonly messageId: ChannelMessageId
      readonly form: 'notice'
      readonly summary: string
    }
  }
}
