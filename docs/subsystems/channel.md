# Channel connections

English | [中文](channel.zh.md)

The Channel subsystem carries one instant-messaging conversation to and from a DSH Session. The [remote channel connections decision](../decisions/0001-remote-channel-connections.md) owns the durable contracts — binding durability, sender authorization, outbound delivery, conversation commands, the permission-question relay, and per-package ownership; this page is the reference for the Service Definition: the provider contract, its registration lifetime, the inbound fan-out, and the values providers, the Consumer, and the Remote controller share.

## Shared values

`ChannelId`, `ChannelConversationId`, `ChannelUserId`, and `ChannelMessageId` are branded strings. The platform owns every conversation, sender, and message value; a provider's own cursor remains the only deduplication authority, and the client never parses any of them.

`ChannelEventMap` is merge-extensible by provider kind, and `ChannelEventOf<K>` selects a known provider's normalized event or admits generic lossless JSON for an out-of-tree kind.

`ChannelInboundMessage<K>` carries the registered `channel`, the platform `conversationId`, `sender`, and `messageId`, the plain-text `text`, the Host receipt time `receivedAt`, and the provider-normalized `event`. `ChannelOutboundMessage` carries the complete `text` the platform sends; chunking and platform length limits belong to the provider.

`ChannelConnectionState` is a closed union of `idle`, `connecting`, `connected`, and `unavailable` with the diagnostic the settings page shows, so a disconnected channel always states why.

`ChannelProvider<K>` declares a unique `id`, a platform `kind` such as `weixin`, a human-readable `displayName`, the current `state`, `attach(control)`, and `send(conversation, message, signal)`.

## Registration and lifetime

`register(provider)` rejects an empty or duplicate id, then returns the exact Cordis effect disposer that removes the registration and aborts its signal. `attach` runs once and synchronously inside that effect: a provider that throws there leaves no registration behind without a disposer, and the registry aborts the registration signal first so the provider can release whatever it started.

`ChannelProviderControl` is the registration-scoped capability the registry borrows to one provider: the `signal` that aborts when that registration is disposed, the `publish` for authenticated inbound messages, and `changed` for connection-state transitions. The provider owns its connection, its retry and throttle policy, and its cursor; the registry owns none of them.

## Inbound fan-out

`onInbound(listener)` observes every registered provider's messages. The registry stamps the publishing provider's identity onto each forwarded message, so a provider cannot misattribute a message to another channel, and a throwing listener is logged and contained rather than vetoing the message for its siblings.

`onChange(listener)` announces provider-set and connection-state changes so a projection can refresh; the registry never pushes state to a client itself. The registry keeps no queue, retry, cursor, delivery record, or Session binding — those belong to a provider or to the Consumer.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxchannels--channelregistry"></a>

### `ctx.channels` — `ChannelRegistry`

Registry of channel providers. Providers register during plugin apply; the registry enumerates them for a controller, forwards each provider's authenticated inbound messages to the Consumer, and announces provider-set and connection-state changes so a projection can refresh.

```ts cordis-catalog
/**
 * Register one borrowed same-process provider and begin its inbound delivery.
 * The provider's `attach` runs synchronously inside this registration's effect,
 * so a throwing provider fails the registration loudly instead of half-registering.
 * @param provider - the platform connection to register.
 * @returns the exact Cordis effect disposer that unregisters the provider and aborts its registration signal.
 */
register(provider: ChannelProvider): () => void

/**
 * Resolve one registered provider by identity.
 * @param id - the registration identity to look up.
 * @returns the provider, or `undefined` when it is not registered.
 */
get(id: ChannelId): ChannelProvider | undefined

/**
 * Observe every authenticated inbound message from every registered provider.
 * @param listener - called once per published message; its failures are contained and logged.
 * @returns a disposer that removes the listener.
 */
onInbound(listener: InboundListener): () => void

/**
 * Observe provider-set and connection-state changes.
 * @param listener - called after a registration change or a provider's `changed()` announcement.
 * @returns a disposer that removes the listener.
 */
onChange(listener: ChangeListener): () => void
```

Source: [`packages/channel/channel/src/index.ts`](../../packages/channel/channel/src/index.ts)

<a id="ctxchannelsession--channelsession"></a>

### `ctx.channelSession` — `ChannelSession`

The channel Session consumer. It opens the conversation-binding, pending-request, and outbound-delivery domains at init, observes every provider's authenticated inbound messages, delivers each bound Session's settled turn back to its conversation, and disposes its registrations with the plugin.

```ts cordis-catalog
/**
 * Set one conversation up: write its binding record before any Session or
 * message exists, with the Session association left absent. The settings
 * surface calls this once per conversation.
 * @param request - what the client collected, with the deployment defaults applied to omissions.
 * @returns resolution after the record is durable.
 */
async setupConversation(request: ConversationSetupRequest): Promise<void>

/**
 * The binding record of one conversation.
 * @param channel - registered provider that owns the conversation.
 * @param conversationId - platform-owned conversation identity.
 * @returns the record, or `undefined` when the conversation was never set up.
 */
bindingFor(channel: ChannelId, conversationId: ChannelConversationId): ChannelBindingRecord | undefined
```

Source: [`packages/channel/channel-session/src/index.ts`](../../packages/channel/channel-session/src/index.ts)
<!-- END GENERATED cordis-surface -->
