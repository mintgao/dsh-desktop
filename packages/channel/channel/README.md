---
description: "Channel provider registry for maintainers wiring instant-messaging connections into DSH Sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-channel

English | [中文](README.zh.md)

## Summary

`dsh-channel` provides the Host `ctx.channels`: the Service Definition half of the channel capability seam. Providers such as `dsh-channel-weixin` own one platform connection; this package owns only the provider set, the enumeration a controller projects, the inbound fan-out a Consumer subscribes to, and the branded identities shared across all of them. Use it when a connection must carry authenticated messages from an instant-messaging platform into DSH and carry replies back.

## Table of Contents

- [Provider interface](#provider-interface)
- [Registry](#registry)
- [Inbound provenance](#inbound-provenance)
- [Composition](#composition)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="provider-interface"></a>
## Provider interface

`ChannelProvider<K>` declares a branded `id`, a platform `kind` such as `weixin`, a human-readable `displayName`, an observable `state`, `attach(control)`, and `send(conversation, message, signal)`.

`state` is a closed union: `idle`, `connecting`, `connected`, or `unavailable` carrying the diagnostic the settings page shows. A disconnected channel therefore always states why.

`attach(control)` runs once, synchronously, inside the provider's registration effect. It receives the registration's `AbortSignal`, a `publish` for authenticated inbound messages, and a `changed` announcement for state transitions. The provider owns its connection, its retry policy, its throttle policy, and its cursor; the registry owns none of them.

`send` resolves when the platform accepted the message, not when the recipient read it. Chunking and platform length limits belong to the provider.

<a id="registry"></a>
## Registry

`ctx.channels.register(provider)` returns the Cordis effect disposer that unregisters the provider and aborts its registration signal. A duplicate `id` and an empty `id` fail loudly at registration.

`ctx.channels.list` enumerates the registered providers for a controller. `ctx.channels.get(id)` resolves one by identity.

`ctx.channels.onInbound(listener)` hands every authenticated message to the Consumer. The registry stamps the publishing provider's identity onto each message, so a provider cannot misattribute a message to another channel. A listener failure is logged and contained; it cannot veto the message for other listeners.

`ctx.channels.onChange(listener)` announces provider-set and connection-state changes so a projection can refresh. The registry never pushes state to a client itself.

<a id="inbound-provenance"></a>
## Inbound provenance

Admitted messages carry the merge-extensible `channel` member of `MessageSourceMap`, declared here because the branded identities live here:

```text
kind: 'channel'
channel, conversationId, sender, messageId
form: 'notice'
summary
```

Adding a member is additive data, not a Session log format change: `MessageSourceMap` is merge-extensible, its consumers switch on `kind` and fall through a documented default, and `webhook` and `agent-team` already extend it the same way.

<a id="composition"></a>
## Composition

Load the registry on the Host plane. Provider plugins inject `channels` and yield the disposer returned by `register()` through their own effect. A Consumer injects `channels` and installs its inbound listener through `ctx.effect`. The [channel subsystem](../../../docs/subsystems/channel.md) is the reference for the provider contract, the registration lifetime, and the values this registry moves.

<a id="model-experience"></a>
## Model Experience

### Channel message provenance

#### What the model sees

Nothing directly. This package contributes no prompt text, no tool schema, and no model-facing diagnostic; it moves values between same-process plugins. The model sees a channel message only after a Consumer admits it as an ordinary user message whose `source` carries the `channel` member above.

#### Token effect

None. Registry state is not retained in any Session.

#### KV Cache effect

None. This package never touches a request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No state push to a client** — the registry exposes enumeration and change notifications only; projecting them into a settings surface belongs to a controller Consumer.
- **No connection lifecycle** — reconnection, backoff, circuit breaking, and cursor persistence are provider concerns, so a provider that never reconnects is indistinguishable here from one that does.
- **No invariant companion** — the registry's only owned relation is that a map key equals the registered provider's `id`, which registration sets in one statement and the effect disposer removes in one statement; no independent observation can diverge, so this package omits `./invariant` per the package invariant rules.
- **No delivery guarantees** — the registry forwards a message to in-process listeners and records nothing; at-least-once behaviour and its duplicate tolerance belong to the Consumer.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
