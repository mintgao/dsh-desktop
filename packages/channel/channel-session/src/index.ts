/**
 * Channel Session consumer (`ctx.channelSession`): the only component that
 * creates or continues a Session for the channel seam. It owns the conversation
 * bindings, sender authorization with the durable records a refusal creates,
 * and the inbound path that admits an authorized message through
 * `@deepseek-ai/dsh-session-admission`. It owns no platform connection, no
 * command surface, and no permission-question relay.
 * @module @deepseek-ai/dsh-channel-session
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ChannelConversationId, ChannelId, ChannelInboundMessage, ChannelUserId } from '@deepseek-ai/dsh-channel'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { boundContextSummary, createUserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { admitSession } from '@deepseek-ai/dsh-session-admission'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-workspace'
import type { ChannelBindingKey, ChannelDeliveryKey, ChannelPendingRequestKey } from './brand.ts'
import {
  bindingForSession,
  channelBindingKey,
  channelPendingRequestKey,
  createChannelBinding,
  readChannelBinding,
  withAdmittedMessage,
} from './binding.ts'
import type { ChannelBindingSetup } from './binding.ts'
import { deliverReply, turnReplyText } from './outbound.ts'
import {
  CHANNEL_DISPLAY_OPTIONS_OFF,
  CHANNEL_SESSION_RECORD_VERSION,
  channelBindingDomainSpec,
  channelDeliveryDomainSpec,
  channelPendingRequestDomainSpec,
} from './spec.ts'
import type { ChannelBindingRecord, ChannelDeliveryRecord, ChannelPendingRequestRecord } from './spec.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The channel Session consumer. */
    channelSession: ChannelSession
  }
}

/** Session id brand prefix every Session this consumer creates carries. */
const SESSION_ID_PREFIX = 'channel-'

/** What a client collected while setting one conversation up. */
export interface ConversationSetupRequest {
  /** Registered provider that owns the conversation. */
  readonly channel: ChannelId
  /** Platform-owned conversation identity. */
  readonly conversationId: ChannelConversationId
  /** Conversation title the settings surface shows. */
  readonly title: string
  /** Senders authorized from the start; the account that completed setup comes first. */
  readonly authorizedSenderIds: readonly ChannelUserId[]
  /** Workspace a created Session runs in; omission uses the deployment default. */
  readonly workspacePath?: string
  /** Agent composition mounted on a created Session; omission uses the deployment default. */
  readonly agentPreset?: string
  /** Sandbox and approval preset for a created Session; omission uses the deployment default. */
  readonly permissionPreset?: string
}

/**
 * Deployment choices of the consumer. Every bound is stated by the composition:
 * the workspace a conversation's Sessions run in, the agent composition they
 * mount, the sandbox and approval preset they run under, and the bounds of the
 * outbound retry.
 */
export interface Config {
  /** Workspace a Session created for a conversation runs in. */
  readonly defaultWorkspacePath: string
  /** Agent composition mounted on a Session this consumer creates. */
  readonly agentPreset: string
  /** Sandbox and approval preset applied before the first prompt is admitted. */
  readonly permissionPreset: string
  /** Total attempts one outbound reply gets, including the first. */
  readonly deliveryAttempts: number
  /** Wait between two outbound attempts, in milliseconds. */
  readonly deliveryBackoffMs: number
}

/** Config schema of {@link Config}. */
export const Config: z<Config> = z.object({
  defaultWorkspacePath: z.string().required(),
  agentPreset: z.string().required(),
  permissionPreset: z.string().required(),
  deliveryAttempts: z.number().step(1).min(1).required(),
  deliveryBackoffMs: z.number().step(1).min(0).required(),
})

/**
 * The channel Session consumer. It opens the conversation-binding,
 * pending-request, and outbound-delivery domains at init, observes every
 * provider's authenticated inbound messages, delivers each bound Session's
 * settled turn back to its conversation, and disposes its registrations with
 * the plugin.
 */
export class ChannelSession extends Service {
  static inject = ['channels', 'storageDomain', 'agents', 'agentDefaultModel', 'agentPresets', 'permissionPresets', 'workspaceRegistry']

  static Config: z<Config> = Config

  private bindings!: KvTable<ChannelBindingKey, ChannelBindingRecord>
  private pendingRequests!: KvTable<ChannelPendingRequestKey, ChannelPendingRequestRecord>
  private deliveries!: KvTable<ChannelDeliveryKey, ChannelDeliveryRecord>
  private readonly lifecycle = new AbortController()

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'channelSession')
  }

  /**
   * Open the durable domains and observe inbound messages and settled turns for
   * this registration's lifetime. Disposal aborts the lifecycle signal first, so
   * a send in flight stops before the delivery domain closes.
   */
  protected async [Service.init](): Promise<void> {
    const bindings = await this.ctx.storageDomain.open(channelBindingDomainSpec)
    const pendingRequests = await this.ctx.storageDomain.open(channelPendingRequestDomainSpec)
    const deliveries = await this.ctx.storageDomain.open(channelDeliveryDomainSpec)
    this.bindings = bindings.table('bindings')
    this.pendingRequests = pendingRequests.table('requests')
    this.deliveries = deliveries.table('deliveries')
    this.ctx.effect(() => () => {
      this.lifecycle.abort(new Error('channel Session consumer disposed'))
      return Promise.all([bindings.close(), pendingRequests.close(), deliveries.close()]).then(() => undefined)
    }, 'channelSession.lifecycle')
    this.ctx.effect(() => this.ctx.channels.onInbound((message) => { this.observe(message) }), 'channelSession.inbound')
    this.ctx.on('session/event', (session, event) => { this.observeTurn(session, event) })
  }

  /**
   * Set one conversation up: write its binding record before any Session or
   * message exists, with the Session association left absent. The settings
   * surface calls this once per conversation.
   * @param request - what the client collected, with the deployment defaults applied to omissions.
   * @returns resolution after the record is durable.
   */
  async setupConversation(request: ConversationSetupRequest): Promise<void> {
    const key = channelBindingKey(request.channel, request.conversationId)
    await this.bindings.put(key, createChannelBinding(this.resolveSetup(request)))
  }

  /**
   * The binding record of one conversation.
   * @param channel - registered provider that owns the conversation.
   * @param conversationId - platform-owned conversation identity.
   * @returns the record, or `undefined` when the conversation was never set up.
   */
  bindingFor(channel: ChannelId, conversationId: ChannelConversationId): ChannelBindingRecord | undefined {
    return readChannelBinding(this.bindings, channelBindingKey(channel, conversationId))
  }

  /** Apply the deployment defaults to the values a client omitted. */
  private resolveSetup(request: ConversationSetupRequest): ChannelBindingSetup {
    return {
      channel: request.channel,
      conversationId: request.conversationId,
      workspacePath: request.workspacePath ?? this.config.defaultWorkspacePath,
      agentPreset: request.agentPreset ?? this.config.agentPreset,
      permissionPreset: request.permissionPreset ?? this.config.permissionPreset,
      title: request.title,
      authorizedSenderIds: request.authorizedSenderIds,
      displayOptions: CHANNEL_DISPLAY_OPTIONS_OFF,
    }
  }

  /**
   * Contain one inbound message's asynchronous work. The registry contains a
   * listener's synchronous throw; a rejected promise is this consumer's to
   * report, so nothing escapes into the provider's poll loop.
   */
  private observe(message: ChannelInboundMessage): void {
    this.handleInbound(message).catch((error: unknown) => {
      this.ctx.logger.warn(`channel Session inbound failed: ${String(error)}`)
    })
  }

  /**
   * Contain one settled turn's delivery. Only a bound Session has a conversation
   * to reply to, so an unbound Session's turn is not this consumer's work and
   * leaves no record.
   */
  private observeTurn(session: Session, event: SessionEvent): void {
    if (event.type !== 'turn/end') return
    this.deliverTurn(session, event.data.turn).catch((error: unknown) => {
      this.ctx.logger.warn(`channel Session outbound failed: ${String(error)}`)
    })
  }

  /**
   * Deliver one settled turn of a bound Session: resolve the conversation, take
   * the turn's final assistant text, resolve the provider, and hand the reply to
   * the bounded retry.
   */
  private async deliverTurn(session: Session, turn: number): Promise<void> {
    const bound = bindingForSession(this.bindings, session.id)
    if (bound === undefined) return
    const text = turnReplyText(session, turn)
    if (text === undefined) return
    await deliverReply({
      deliveries: this.deliveries,
      provider: this.ctx.channels.get(bound.record.channel),
      attempts: this.config.deliveryAttempts,
      backoffMs: this.config.deliveryBackoffMs,
      signal: this.lifecycle.signal,
      warn: (message) => { this.ctx.logger.warn(message) },
    }, {
      channel: bound.record.channel,
      conversationId: bound.record.conversationId,
      sessionId: session.id,
      turn,
      text,
    })
  }

  /**
   * Resolve, authorize, and admit one inbound message: an unauthorized sender
   * or a conversation that was never set up is refused, an exact redelivery is
   * suppressed, a bound Session takes a follow-up, and an unbound conversation
   * admits a new Session.
   */
  private async handleInbound(message: ChannelInboundMessage): Promise<void> {
    const key = channelBindingKey(message.channel, message.conversationId)
    const binding = readChannelBinding(this.bindings, key)
    if (binding === undefined) {
      this.ctx.logger.warn(`channel Session refused a message for an unconfigured conversation on ${message.channel}`)
      return
    }
    if (!binding.authorizedSenderIds.includes(message.sender)) {
      await this.recordRefusal(message)
      return
    }
    if (binding.lastAdmittedMessageId === message.messageId) return
    const bound = binding.sessionId === undefined ? undefined : this.ctx.agents.get(binding.sessionId)
    if (bound === undefined) {
      await this.admitNewSession(key, binding, message)
      return
    }
    bound.followup(createUserMessage({
      content: [{ type: 'text', text: message.text }],
      source: this.provenance(message),
    }))
    await this.bindings.update(key, record => withAdmittedMessage(record, {
      sessionId: bound.session.id,
      messageId: message.messageId,
    }))
  }

  /**
   * Admit a new Session for one conversation. The binding write runs after
   * durable attach and before the first prompt is admitted, so a crash
   * afterwards redelivers into the same Session instead of creating a second
   * one.
   */
  private async admitNewSession(
    key: ChannelBindingKey,
    binding: ChannelBindingRecord,
    message: ChannelInboundMessage,
  ): Promise<void> {
    await admitSession(this.ctx, {
      workspacePath: binding.workspacePath,
      prompt: message.text,
      agentPreset: binding.agentPreset,
      permissionPreset: binding.permissionPreset,
    }, {
      sessionIdPrefix: SESSION_ID_PREFIX,
      followup: { text: message.text, source: this.provenance(message) },
      errorSubject: 'channel Session request',
      signal: this.lifecycle.signal,
    }, async (sessionId) => {
      await this.bindings.update(key, record => withAdmittedMessage(record, {
        sessionId,
        messageId: message.messageId,
      }))
    })
  }

  /**
   * Record one refused message. The record is durable and carries no Session
   * association, because a refusal creates no Session and no model-visible
   * event.
   */
  private async recordRefusal(message: ChannelInboundMessage): Promise<void> {
    const key = channelPendingRequestKey(message.channel, message.conversationId, message.messageId)
    await this.pendingRequests.put(key, {
      senderId: message.sender,
      text: message.text,
      receivedAt: message.receivedAt,
      status: 'pending',
      schemaVersion: CHANNEL_SESSION_RECORD_VERSION,
    })
    this.ctx.logger.warn(`channel Session refused a message from an unauthorized sender on ${message.channel}`)
  }

  /** The provenance member every admitted channel message carries. */
  private provenance(message: ChannelInboundMessage): {
    readonly kind: 'channel'
    readonly channel: ChannelId
    readonly conversationId: ChannelConversationId
    readonly sender: ChannelUserId
    readonly messageId: ChannelInboundMessage['messageId']
    readonly form: 'notice'
    readonly summary: string
  } {
    return {
      kind: 'channel',
      channel: message.channel,
      conversationId: message.conversationId,
      sender: message.sender,
      messageId: message.messageId,
      form: 'notice',
      summary: boundContextSummary(`${message.channel} conversation ${message.conversationId}`),
    }
  }
}

export default ChannelSession
