/**
 * Channel provider registry.
 *
 * This package owns the Service Definition role of the channel capability seam.
 * Providers such as `@deepseek-ai/dsh-channel-weixin` own one platform connection;
 * this service owns only the provider set, the enumeration a controller projects,
 * and the inbound fan-out a Consumer subscribes to. It owns no connection, no
 * retry policy, and no product defaults.
 *
 * @module @deepseek-ai/dsh-channel
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { ChannelId } from './brand.ts'
import type { ChannelInboundMessage, ChannelProvider } from './types.ts'

export * from './brand.ts'
export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    channels: ChannelRegistry
  }
}

/** One effect-owned provider registration and its registration-scoped lifetime. */
interface ProviderRegistration {
  readonly provider: ChannelProvider
  readonly controller: AbortController
}

/** One inbound listener the Consumer installed. */
type InboundListener = (message: ChannelInboundMessage) => void

/** One projection listener the controller installed. */
type ChangeListener = () => void

/** Render an arbitrary listener failure without letting coercion escape containment. */
function errorMessage(error: unknown): string {
  try {
    return String(error)
  } catch {
    return '[unrenderable thrown value]'
  }
}

/**
 * Registry of channel providers. Providers register during plugin apply; the
 * registry enumerates them for a controller, forwards each provider's
 * authenticated inbound messages to the Consumer, and announces provider-set and
 * connection-state changes so a projection can refresh.
 */
export class ChannelRegistry extends Service {
  private readonly registrations = new Map<ChannelId, ProviderRegistration>()
  private readonly inboundListeners = new Set<InboundListener>()
  private readonly changeListeners = new Set<ChangeListener>()

  constructor(ctx: Context) {
    super(ctx, 'channels')
  }

  /**
   * Register one borrowed same-process provider and begin its inbound delivery.
   * The provider's `attach` runs synchronously inside this registration's effect,
   * so a throwing provider fails the registration loudly instead of half-registering.
   * @param provider - the platform connection to register.
   * @returns the exact Cordis effect disposer that unregisters the provider and aborts its registration signal.
   */
  register(provider: ChannelProvider): () => void {
    if (typeof provider.id !== 'string' || provider.id.trim() === '') {
      throw new TypeError('channel provider id must be a non-empty string')
    }
    const id = provider.id
    if (this.registrations.has(id)) {
      throw new Error(`channel provider "${id}" is already registered`)
    }
    const controller = new AbortController()
    // oxlint-disable-next-line typescript/no-misused-promises -- synchronous cleanup; direct return preserves disposer identity
    return this.ctx.effect(() => {
      /* v8 ignore next -- the public liveness check and this initializer have no await between them. */
      if (this.registrations.has(id)) throw new Error(`channel provider "${id}" is already registered`)
      const registration: ProviderRegistration = { provider, controller }
      try {
        provider.attach({
          signal: controller.signal,
          publish: (message) => { this.publish(id, message) },
          changed: () => { this.notifyChange() },
        })
      } catch (error: unknown) {
        // A provider that threw inside attach may have wired part of a connection;
        // aborting the registration signal lets it release whatever it started,
        // and the map stays untouched so no registration leaks without a disposer.
        controller.abort(error)
        throw error
      }
      this.registrations.set(id, registration)
      this.notifyChange()
      return () => {
        this.registrations.delete(id)
        controller.abort(new Error(`channel provider "${id}" was disposed`))
        this.notifyChange()
      }
    }, `channels.register(${id})`)
  }

  /**
   * Every currently registered provider, in registration order.
   * @returns the providers a controller projects into the client.
   */
  get list(): readonly ChannelProvider[] {
    return [...this.registrations.values()].map(registration => registration.provider)
  }

  /**
   * Resolve one registered provider by identity.
   * @param id - the registration identity to look up.
   * @returns the provider, or `undefined` when it is not registered.
   */
  get(id: ChannelId): ChannelProvider | undefined {
    return this.registrations.get(id)?.provider
  }

  /**
   * Observe every authenticated inbound message from every registered provider.
   * @param listener - called once per published message; its failures are contained and logged.
   * @returns a disposer that removes the listener.
   */
  onInbound(listener: InboundListener): () => void {
    this.inboundListeners.add(listener)
    return () => { this.inboundListeners.delete(listener) }
  }

  /**
   * Observe provider-set and connection-state changes.
   * @param listener - called after a registration change or a provider's `changed()` announcement.
   * @returns a disposer that removes the listener.
   */
  onChange(listener: ChangeListener): () => void {
    this.changeListeners.add(listener)
    return () => { this.changeListeners.delete(listener) }
  }

  /**
   * Forward one provider's normalized message to the Consumer. The registry stamps
   * the publishing provider's identity, so a provider cannot misattribute a message
   * to another channel.
   */
  private publish(channel: ChannelId, message: ChannelInboundMessage): void {
    const attributed: ChannelInboundMessage = { ...message, channel }
    for (const listener of [...this.inboundListeners]) {
      try {
        listener(attributed)
      } catch (error: unknown) {
        this.ctx.logger.warn(`channel inbound listener failed: ${errorMessage(error)}`)
      }
    }
  }

  /** Announce a projection-relevant change without making listeners load-bearing. */
  private notifyChange(): void {
    for (const listener of [...this.changeListeners]) {
      try {
        listener()
      } catch (error: unknown) {
        this.ctx.logger.warn(`channel change listener failed: ${errorMessage(error)}`)
      }
    }
  }
}

export default ChannelRegistry
