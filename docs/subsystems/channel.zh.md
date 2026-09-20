# 通道连接

[English](channel.md) | 中文

Channel 子系统把一段即时通讯会话与一个 DSH Session 相互连接。[远程通道连接决策](../decisions/0001-remote-channel-connections.zh.md)持有各项持久约定——绑定的持久性、发送者授权、外发投递、会话命令、权限提问中继，以及各包归属；本页是 Service Definition 的参考：提供方约定、其注册生命周期、入站扇出，以及提供方、消费方与 Remote 控制器共享的值。

## 共享值

`ChannelId`、`ChannelConversationId`、`ChannelUserId` 与 `ChannelMessageId` 是带品牌标记的字符串。会话、发送方与消息值都归平台所有；提供方自己的游标是唯一的去重权威，客户端从不解析它们中的任何一个。

`ChannelEventMap` 按提供方 kind 可合并扩展，`ChannelEventOf<K>` 选择已知提供方的规范化事件，或为树外 kind 接受通用无损 JSON。

`ChannelInboundMessage<K>` 携带已注册的 `channel`、平台侧的 `conversationId`、`sender` 与 `messageId`、纯文本 `text`、Host 接收时间 `receivedAt`，以及提供方规范化后的 `event`。`ChannelOutboundMessage` 携带平台要发送的完整 `text`；分块与平台长度限制属于提供方。

`ChannelConnectionState` 是 `idle`、`connecting`、`connected` 与 `unavailable` 的封闭联合，其中 `unavailable` 携带设置页展示的诊断，因此断开连接的通道总会说明原因。

`ChannelProvider<K>` 声明唯一的 `id`、平台 `kind`（如 `weixin`）、人类可读的 `displayName`、当前 `state`、`attach(control)` 与 `send(conversation, message, signal)`。

## 注册与生命周期

`register(provider)` 拒绝空 id 与重复 id，然后返回那个精确的 Cordis effect 释放器：它移除注册并中止该注册的信号。`attach` 在该 effect 内同步运行且只运行一次：在这里抛出的提供方不会留下没有释放器的注册，且注册表会先中止注册信号，让提供方释放它已经启动的东西。

`ChannelProviderControl` 是注册表借给单个提供方的注册作用域能力：`signal` 在该注册被释放时中止，`publish` 用于已认证的入站消息，`changed` 用于连接状态变化。连接、重试与限流策略、游标都归提供方所有；注册表一概不持有。

## 入站扇出

`onInbound(listener)` 观察每个已注册提供方的消息。注册表会把发布方身份盖印到每条转发的消息上，因此提供方无法把消息误记到另一个通道；抛错的监听器只被记录并隔离，不会替其它监听器否决该消息。

`onChange(listener)` 宣告提供方集合与连接状态的变化，供投影刷新；注册表从不自行把状态推送给客户端。注册表不保留队列、重试、游标、投递记录或会话绑定——那些属于提供方或消费方。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

/**
 * The resume positions one channel's conversations recorded, for the provider
 * that owns the poll. A token-level platform stream feeds every conversation,
 * so the provider reconciles these into the position it resumes from — the
 * earliest recorded cursor, whose replays `lastAdmittedMessageId` suppresses.
 * @param channel - registered provider whose recorded cursors are wanted.
 * @returns every cursor the channel's bindings carry, in no particular order.
 */
resumeCursors(channel: ChannelId): readonly string[]
```

Source: [`packages/channel/channel-session/src/index.ts`](../../packages/channel/channel-session/src/index.ts)
<!-- END GENERATED cordis-surface -->
