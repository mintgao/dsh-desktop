---
description: "Connect an instant-messaging conversation to a DSH Session: durable conversation bindings, sender authorization, inbound admission, and reply delivery over the channel seam."
kind: "package-reference"
---

# @deepseek-ai/dsh-channel-session

English | [中文](README.zh.md)

## Summary

`dsh-channel-session` connects one instant-messaging conversation to one durable DSH Session: you set the conversation up once, and every authorized message continues that Session while its settled replies return to the chat. Bindings, refused messages, and delivery records survive restarts, so a platform redelivery resumes the same Session instead of starting a second one, and a reply is retried rather than lost. Mount it beside a provider package that owns the platform connection; this package owns what the conversation means. Conversation commands and the permission-question relay are not included.

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

Mount the consumer once, after the channel registry and the services it injects; a client then sets each conversation up with its workspace, presets, and authorized senders, and from there the provider's messages and the Session's settled turns flow without further calls.

### When to choose it

Choose this package when a conversation on an instant-messaging platform must reach a real agent Session. The provider owns the connection, authentication, message normalization, and platform state; this consumer owns the conversation binding, sender authorization, admission, and the reply path. Avoid it when an external event should create one fresh Session with no conversation to continue — [`dsh-webhook`](../../webhook/webhook/README.md) covers that path.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-channel-session'
  config:
    defaultWorkspacePath: /Users/me/projects
    agentPreset: standard
    permissionPreset: read-only
    deliveryAttempts: 3
    deliveryBackoffMs: 1000
```

| Field | Default | Meaning |
|---|---|---|
| `defaultWorkspacePath` | required | Workspace a Session created for a conversation runs in; conversation setup may override it |
| `agentPreset` | required | Agent composition mounted on a Session this consumer creates; conversation setup may override it |
| `permissionPreset` | required | Sandbox and approval preset applied before the first prompt; conversation setup may override it |
| `deliveryAttempts` | required | Total outbound attempts one reply gets, including the first |
| `deliveryBackoffMs` | required | Wait between two outbound attempts, in milliseconds |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-channel-session) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The consumer keeps three durable domains under `ctx.storageDomain`: one binding per conversation that names the Session the conversation continues, one pending request per refused message, and one delivery record per settled reply. The binding alone decides whether a message continues an existing Session or admits a new one, so the write ordering is the contract: setup writes an unbound record before anything else exists, and an admitted message writes the Session association after durable attach and before the first prompt, so a crash between those points redelivers into the same Session instead of creating a second one.

Inbound messages arrive through `ctx.channels.onInbound` and pass four checks in order: a conversation that was never set up is refused with a diagnostic line, an unauthorized sender becomes a durable pending request, an exact platform redelivery is suppressed by the last admitted message id, and an authorized message either continues the bound Session or admits a new one through the shared `admitSession` transaction. Every admitted message carries `source.kind: "channel"` provenance — channel, conversation, sender, message id, and a notice-form summary — so the desktop renders where it came from.

The outbound path observes `session/event`: when a turn ends, the consumer resolves the conversation bound to that Session, folds the turn's final non-empty assistant text, and hands the reply to a bounded retry that records every attempt on the medium. Delivery is at-least-once: the platform exposes no idempotency key, so a retry after an ambiguous timeout can duplicate a reply, and a duplicate is preferable to a loss. Delivery records are transport state, never conversation content; nothing on this path is model-visible or enters the Session log. Disposal aborts the lifecycle signal first, so a send in flight stops before the domains close.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The consumer service: domains, setup, inbound authorization and admission, the outbound observer |
| [`src/binding.ts`](src/binding.ts) | Durable keys, binding reads, and the record transforms every writer shares |
| [`src/outbound.ts`](src/outbound.ts) | The reply fold, delivery identities, and the bounded retry |
| [`src/spec.ts`](src/spec.ts) | The three durable record schemas and their domain declarations |
| [`src/brand.ts`](src/brand.ts) | Opaque key brands |
| [`tests/binding.spec.ts`](tests/binding.spec.ts) | Keys, record transforms, schemas, and table reads |
| [`tests/inbound.spec.ts`](tests/inbound.spec.ts) | Authorization, admission, redelivery suppression, refusal records, delivery |
| [`tests/outbound.spec.ts`](tests/outbound.spec.ts) | Reply fold, retry bound, terminal failure, disposal |
| [`tests/loader-composition.spec.ts`](tests/loader-composition.spec.ts) | Real Loader composition: one message in, one reply out |
| — | No runtime invariant companion is published; every durable record is written through its own single write path and read back only by this consumer, and a binding whose Session no longer resolves is an accepted state that the inbound path repairs by admitting a new Session. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the seam this consumer subscribes to toward the contracts it depends on.

- [Channel subsystem](../../../docs/subsystems/channel.md) — the provider contract, registration lifetime, and the values this consumer shares with providers.
- [Channel provider registry](../channel/README.md) — the fan-out and provider set this consumer observes.
- [Session admission](../../session/session-admission/README.md) — the shared ordering every new conversation Session goes through.
- [Remote channel connections decision](../../../docs/decisions/0001-remote-channel-connections.md) — the durable contracts and the deferred command and relay work.
- [Channel group map](../README.md) — the family this package belongs to.

-----

<a id="model-experience"></a>
## Model Experience

### Admitted conversation message

#### What the model sees

Each authorized message is admitted as an ordinary user-role message whose text is exactly what the sender typed; its `source` carries `kind: "channel"` with the channel, conversation, sender, message id, and a notice-form summary. The consumer adds no prompt text, system-prompt prose, or tool schema of its own.

#### Token effect

The admitted text is retained as Session history and contributes tokens until ordinary compaction replaces it. Nothing else is added.

#### KV Cache effect

A first message establishes the created Session's request prefix; a follow-up appends at the request end, so earlier prefix blocks keep their cache identity.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define what a conversation can and cannot do today. They are current package constraints, not a task backlog.

- **Conversation commands are not implemented** — `/new`, `/status`, `/stop`, `/help`, `/whoami`, and the second-tier dispatch through `ctx.commands` are absent, so a conversation cannot start a fresh Session or stop a running turn from the chat.
- **The permission-question relay is not implemented** — an agent's permission question is not forwarded to the conversation; only the desktop shows it.
- **A refused message waits for a decision surface** — a refusal is a durable pending request with no surface that can approve or dismiss it; the record accumulates with its status `pending`.
- **Platform polling belongs to the provider** — this consumer persists and advances the provider cursor but never connects to a platform; a provider package owns the connection, retries, and chunking.
- **Delivery is at-least-once** — a retry after an ambiguous timeout can duplicate a reply; the platform exposes no idempotency key, and a duplicate is preferred to a loss.
- **An interrupted delivery stays pending** — disposal stops the retry and leaves the record `pending`; nothing retries it automatically on the next start.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
