---
description: "Connect WeChat accounts to the channel seam: one QR login per account, that account's token lock, the cursor long poll, and chunked replies over Tencent's iLink Bot API."
kind: "package-reference"
---

# @deepseek-ai/dsh-channel-weixin

English | [中文](README.zh.md)

## Summary

`dsh-channel-weixin` connects WeChat accounts to the channel seam, one registration per account. You scan a QR code once per account, and that account's provider long-polls the platform for direct messages, publishes each authenticated text under its own channel identity, and sends an agent's reply back in platform-sized chunks. Mount it beside `dsh-channel-session`, which owns what each conversation means. One WeChat account holds one bot session at a time, so a login replaces whatever client held it before; the package reports the session a re-scan displaced. Group conversations, media, and the settings page are not included.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the service once, after the channel registry, the credential service, and the consumer it reads recorded cursors from. It restores every account the credential store already holds, and `ctx.channelWeixin` is the surface that starts a login, cancels one, and disconnects an account — the same operations the client's settings page in slice M3 drives.

### When to choose it

Choose this package when a WeChat conversation must reach a real agent Session. Each account's provider owns that account's platform connection, QR login, token lock, long poll, and outbound chunking; [`dsh-channel-session`](../channel-session/README.md) owns the conversation binding, authorization, admission, and delivery records.

企业微信 and 公众号 are outside the feature's scope, and so is every unofficial protocol.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-channel-weixin'
  config:
    pollTimeoutMs: 35000
    pollRetryAttempts: 3
    pollBackoffMs: 1000
    sendRetryAttempts: 3
    sendBackoffMs: 1000
    throttleDelayMs: 5000
    breakerThreshold: 5
    chunkLength: 2048
    lockDirectory: /Users/me/Library/Application Support/dsh-mint
```

| Field | Default | Meaning |
|---|---|---|
| `pollTimeoutMs` | required | Long-poll timeout in milliseconds; the platform may suggest another one for the next request |
| `pollRetryAttempts` | required | Total attempts one poll cycle gets, including the first |
| `pollBackoffMs` | required | Wait between two poll attempts, and between two failed cycles, in milliseconds |
| `sendRetryAttempts` | required | Total attempts one outbound chunk gets, including the first |
| `sendBackoffMs` | required | Wait between two outbound attempts, in milliseconds |
| `throttleDelayMs` | required | Wait a frequency-limited send observes before its retry, in milliseconds |
| `breakerThreshold` | required | Consecutive failed poll cycles that open the circuit breaker |
| `chunkLength` | required | Largest outbound chunk within the platform's length limit, in characters |
| `lockDirectory` | required | Directory of the token-lock files; one file per account, named from the account's identity. The Mint bundle points it at the desktop data directory |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-channel-weixin) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The provider speaks one protocol: Tencent's iLink Bot API at `https://ilinkai.weixin.qq.com`, entirely over Node builtins (`fetch`, `AbortSignal`, `node:crypto`), because a Mint package may not declare a third-party runtime dependency. `src/transport.ts` is the only module that talks to the platform; every other module takes the transport it is handed, so tests script a stand-in behind that seam.

The login sequence fetches one QR code, polls its status, follows a redirect shard, replaces an expired code within a bound, and writes the confirmed product — the bot identity, the token, its shard, and the platform identity that scanned it — through `ctx.credentials`, under a record key named from that identity. The platform holds one bot session per WeChat account at a time: a login for an account replaces the session whatever client held before it owned, which is why a re-scan of a connected account is an ordered handover — the previous provider stops its poll and releases its lock before the new one registers — and why the displaced client meets `errcode -14` on both its polls and its sends. Each account owns its own token-lock file, whose holder heartbeats once per poll cycle: a second instance reports `unavailable` with a diagnostic instead of splitting the stream, and a crashed holder's lock is overridden once its heartbeat is older than the worst-case poll cycle the configured bounds allow.

The poll resumes from the earliest cursor among the conversation bindings `ctx.channelSession` reports, because one token-level stream feeds every conversation and `lastAdmittedMessageId` suppresses the replays that follow. Every published message carries the cursor its batch was requested at, so a crash after an admission resumes before that batch instead of skipping it. A session expiry (`errcode -14`) stops the loop for a new scan and reports which reading it is — taken away while connected, or already gone when the provider started — a transient failure retries within the configured bounds, and repeated failures open the breaker and report `unavailable`. The platform's suggested poll timeout is adopted only up to the configured bound.

`src/accounts.ts` owns what one account is named after: the slug derived from the platform identity, the credential record key, the registration identity `weixin:<slug>`, and its lock file name. `src/index.ts` restores every stored account at init — a record whose payload this build cannot read registers as `unavailable` instead of disappearing — and gives each account its own provider. `disconnect(id)` unregisters an account once its poll stopped and its lock is free, deletes its stored login, and leaves every other account alone; it does not release the platform session, because only another login replaces it.

The outbound path splits the reply within the configured chunk length, retries a throttled or failed chunk within its own bounds, and resolves with the first chunk's platform message id once the platform accepted every chunk. Disposal aborts the long poll and releases the token lock.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The account service `ctx.channelWeixin`: restore at init, the one live login sequence, the ordered handover, disconnect, and the validated `Config` |
| [`src/accounts.ts`](src/accounts.ts) | What one account is named after: the slug, the credential key, the registration identity, the lock file |
| [`src/provider.ts`](src/provider.ts) | One account's provider: attach, lock, poll, send, and the eviction diagnostics |
| [`src/config.ts`](src/config.ts) | The deployment bounds and the stale threshold they imply |
| [`src/login.ts`](src/login.ts) | The QR login sequence and the credential write |
| [`src/transport.ts`](src/transport.ts) | The iLink HTTP/JSON calls over Node builtins, and the error mapping |
| [`src/poll.ts`](src/poll.ts) | The long poll: the cursor, the retry bounds, the backoff, the circuit breaker |
| [`src/send.ts`](src/send.ts) | `send_message`: chunking, the throttle policy, the receipt |
| [`src/lock.ts`](src/lock.ts) | The token-lock file: exclusive create, the heartbeat, the stale rule |
| [`src/normalize.ts`](src/normalize.ts) | A platform update into the channel's inbound event |
| [`src/types.ts`](src/types.ts) | Types only, no runtime code |
| [`tests/provider.spec.ts`](tests/provider.spec.ts) | One account's provider: attach, lock, send, eviction, and every reported failure |
| [`tests/service.spec.ts`](tests/service.spec.ts) | The account service: restore, the login sequence, the handover, disconnect, and both refusals |
| [`tests/transport.spec.ts`](tests/transport.spec.ts) | URL shapes, headers, request bodies, decoding, error classification |
| [`tests/loader-composition.spec.ts`](tests/loader-composition.spec.ts) | Real Loader composition: one scan, one message in, one reply out |
| — | No runtime invariant companion is published; each provider keeps no durable state of its own beyond the credential record it writes and the token-lock file it owns. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Channel subsystem](../../../docs/subsystems/channel.md) — the provider contract and the registration lifetime this package implements.
- [Channel provider registry](../channel/README.md) — the fan-out this provider publishes into.
- [The channel Session consumer](../channel-session/README.md) — the package that turns these messages into Sessions and sends the replies back.
- [Remote channel connections decision](../../../docs/decisions/0001-remote-channel-connections.md) — the durable contracts and the deferred command and relay work.
- [Channel group map](../README.md) — the family this package belongs to.

-----

<a id="model-experience"></a>
## Model Experience

### No model-visible surface

#### What the model sees

This package adds no prompt text, system-prompt prose, or tool schema of its own; each account's provider publishes the sender's text unchanged as an inbound event carrying the `conversationId`, `sender`, `messageId`, and `text` fields, and the consumer's admission is what reaches the model.

#### Token effect

None of its own. The text it publishes is retained by the consumer's admission and contributes tokens there.

#### KV Cache effect

None. The provider writes nothing into a Session's request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what a connection can and cannot do today. They are current package constraints, not a task backlog.

- **Direct messages and text only** — a group conversation is ignored with one diagnostic line, and rich inbound media is outside the brief's scope.
- **One WeChat account holds one bot session at a time** — a login for an account replaces the session whatever client held before it owned, so two clients cannot stay connected to one account. The displaced client meets `errcode -14` on both its polls and its sends and needs a scan of its own to return, and WeChat's own interface shows no signal that the connected client changed, which is why the package reports the eviction itself.
- **Several accounts are supported, but only one has been exercised against the platform** — the second WeChat identity and the two-account round trip are the acceptance step the owner still has to run.
- **The settings page is not implemented** — the QR login operations exist on `ctx.channelWeixin`, but the client surface that renders them is slice M3.
- **Conversation commands and the permission relay are not implemented** — they belong to slice M4 and to the consumer.
- **The iLink API is not publicly documented** — error codes and throttle semantics come from the reference implementations, and the owner-involved real round trip is what confirms them against the platform.
- **A crashed holder costs the stale threshold** — the next instance waits out the worst-case poll cycle the configured bounds allow before overriding the token lock, and reports the wait as a diagnostic rather than hiding it.
- **The Mint bundle does not carry this package yet** — packaging and the packaged checks are slice M5.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
