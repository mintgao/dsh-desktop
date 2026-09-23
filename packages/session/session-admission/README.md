---
description: "The one external-Session admission transaction triggers share: validate a request, resolve presets and the Workspace, create and attach the Agent, then admit the follow-up."
kind: "package-library"
---

# @deepseek-ai/dsh-session-admission

English | [中文](README.zh.md)

## Summary

`dsh-session-admission` lets an external trigger create a durable root Session without restating the ordering that keeps it safe. Call `admitSession()` to validate the request before any await, resolve presets and the Workspace, create the Agent with its preset mounted, attach the Session durably, hand the new id to your binding hook, and admit the first prompt. The caller owns the id prefix, the admitted text with its provenance, the error subject, and the cancellation signal. The transaction holds no durable state and stops owning the Agent at admission.

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

### When to use it

Call `admitSession()` from an external ingress that must turn one outside request into an ordinary root Session: a verified webhook delivery, a chat-channel message, or a trigger of your own. It is not a Cordis plugin and has no profile mount row; the consuming package injects the services the transaction reads. No runtime invariant companion is published because the transaction is stateless and calls each owning service exactly once per step, so it holds no relation that a second observation could contradict.

### Entry point

```text
import { admitSession } from '@deepseek-ai/dsh-session-admission'

await admitSession(ctx, {
  workspacePath: '/Users/me/project',
  prompt: 'review the pull request',
  agentPreset: 'standard',
  permissionPreset: 'read-only',
}, {
  sessionIdPrefix: 'webhook-',
  followup: { text: 'review the pull request', source: { kind: 'webhook', … } },
  errorSubject: 'webhook Session request',
  signal,
}, async (sessionId) => { await bindings.set(conversationId, sessionId) })
```

The promise resolves after the follow-up was admitted; the Agent is lifecycle-owned by `ctx` from then on and follows normal Session behavior. A missing, empty, or malformed required value rejects with a `TypeError` that opens with `errorSubject` and names the field, before any await, so nothing was created. Every later failure detaches the Session and disposes the Agent before rethrowing the original failure, which is what keeps a rejected admission from leaving a live Agent behind; a failure inside that rollback is logged and swallowed rather than replacing the original error. `options.signal` is honored at every await boundary.

Four values are the caller's, because the transaction cannot infer them: `sessionIdPrefix` brands the new Session id with the trigger that created it, `followup` carries the admitted text with its fully built provenance member, `errorSubject` names the trigger in every validation message, and `onAttached` runs once with the new id after durable attach and before the first prompt — the write a conversation binding belongs in, and the caller's to compensate when the operation rejects afterwards.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The ordering is the contract, and the entry point's JSDoc states it step by step. One transaction runs: validate and snapshot the request before any await; resolve the permission preset, the agent preset, and its standing key, failing loud before anything is created; resolve or create the Workspace; create the Agent with the Session working directory equal to the Workspace path, the agent preset mounted inside the creation `setup`, and the creation-time model selection installed until the first durable request header exists; attach the Session durably; invoke `onAttached`; apply the permission preset; rename the Session only when the caller supplied a title; then admit the follow-up, which ends the transaction. Rollback runs only for a failure after `agents.create` returned, and it detaches only when the attach call itself resolved.

The upstream webhook transaction in [`packages/webhook/webhook/src/session.ts`](../../webhook/webhook/src/session.ts) still carries its own copy of this ordering. The parity suite drives both through the same scenarios and compares their side-effect logs until the [migration work item](../../../docs/work-items/20260919-session-admission-webhook-migration/brief.md) lands.

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The transaction, its request validation, the initial model-selection listener, and the rollback |
| [`src/types.ts`](src/types.ts) | Request and caller-owned option types |
| [`tests/admission.spec.ts`](tests/admission.spec.ts) | Behavior suite: validation table, explicit route, listener, id branding |
| [`tests/webhook-parity.spec.ts`](tests/webhook-parity.spec.ts) | Cross-package parity of the ordering and its rollback |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Remote channel connections decision](../../../docs/decisions/0001-remote-channel-connections.md) — the trigger seam this transaction serves, and why it was extracted.
- [Webhook migration work item](../../../docs/work-items/20260919-session-admission-webhook-migration/brief.md) — the follow-up that deletes the duplicate ordering.
- [Channel provider registry](../../channel/channel/README.md) — the inbound side a channel consumer builds on.
- [Webhook ingress](../../webhook/webhook/README.md) — the trigger that owns this ordering today.
- [Session package map](../README.md) — adjacent persistence, projection, title, and telemetry packages.

-----

<a id="model-experience"></a>
## Model Experience

### First-prompt admission

#### What the model sees

Nothing of its own: the transaction contributes no prompt text, system-prompt prose, or tool schema. It admits one caller-owned `user/message` event, whose content and `source` member come from `options.followup`, and the Agent then runs the normal request context of the mounted agent preset.

#### Token effect

Zero direct tokens. The admitted follow-up carries the caller's text exactly as a composer message would.

#### KV Cache effect

No effect of its own: the created Session starts a fresh request prefix, and admission precedes the first request. The initial model-selection listener rewrites the route and reasoning effort of the first request only, and stops once the Session's first durable request header exists.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One admitted message, no continuation** — the transaction creates a Session and admits exactly one follow-up; continuing an existing Session is `ctx.sessionController.prompt(...)`, not this service's operation.
- **No durable state of any kind** — bindings, cursors, authorization, and delivery records belong to the caller; `onAttached` runs after durable attach and the caller's own compensation owns its write.
- **A rollback failure does not fail the operation** — detach and dispose failures are logged and swallowed so the original failure survives, so a rejected admission is not guaranteed to have left no live Agent.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
