# 0001: Remote Channel Connections

- Status: Accepted

English | [中文](0001-remote-channel-connections.zh.md)

## Context

The accepted brief at [docs/work-items/20260919-remote-channel-connections/brief.md](../work-items/20260919-remote-channel-connections/brief.md) owns the goal, scope, acceptance criteria AC-1..AC-11, the design, the readiness record, and the product decisions the product owner resolved on 2026-09-19. This record decides the durable contracts and the technical trade-offs the readiness gate left open, and adds no product scope.

## Authority

Earlier decision records in this repository use a date-prefixed filename convention (`<yyyymmdd>-<slug>.md`). The installed Vibe Kit readiness validator does not accept that filename grammar, so this record uses the validator's grammar: `docs/decisions/0001-remote-channel-connections.md`, one top-level heading `# 0001: Remote Channel Connections`, and one metadata bullet `- Status: Accepted`. Migrating the earlier records to this grammar is out of scope. The brief remains the authority for scope and acceptance.

Sections 2, 3, 7, 10 and 12 were revised on 2026-09-19 to resolve the ten findings of the independent review recorded in the work item. The revision also records two product choices the owner resolved after the first draft: concurrent permission questions are relayed together and distinguished by index, and a conversation-created Session carries no explicit title, leaving naming to the composition's title capability. The work item's review evidence names the revision each review covers.

## 1. The `ctx.channels` service definition

Chosen: one registry service. `packages/channel/channel` declares `ctx.channels`; providers register into it; the Consumer reads it.

Alternatives: per-platform services (`ctx.channelWeixin`) discovered by convention have no single enumeration point, make the Consumer branch on platform identity, and give a second provider a second contract; rejected. Reusing `ctx.webhook` with a channel provider kind fits a one-shot delivery-to-Session trigger, not a connection lifecycle, an outbound send, and a per-conversation binding, and it is upstream-owned code; rejected.

The registry owns the provider set and the enumeration the controller projects. It owns no connection, no retry policy, and no product defaults. `ctx.channels.register(provider)` returns a disposer.

A provider declares a branded `id: ChannelId`, a display identity, an observable connection state (`idle | connecting | connected | unavailable`, where `unavailable` carries a diagnostic), an inbound event surface, and `send(conversation, message, signal)`. The inbound surface is `ChannelEventMap`, merge-extensible by provider kind like `WebhookEventMap`. The provider authenticates a delivery and normalizes it before it publishes; the registry never carries platform-raw bytes and the Consumer never sees them. Alternative: publish raw and authenticate in the Consumer; rejected, because it moves per-platform verification into the shared Consumer and a parsing bug would become a Session. `send` resolves when the platform accepted the message, not when the recipient read it.

Shared values are branded: `ChannelId`, `ChannelConversationId`, `ChannelUserId`, `ChannelMessageId`. The registry does not push state to the client; the controller projects it and the page reads it through the Remote surface.

Trade-off: a provider goes through the controller rather than shipping its own page. Accepted; one Remote surface is what keeps a second platform cheap.

## 2. External Session admission

`packages/webhook/webhook/src/session.ts` holds the only implementation of the transaction that turns an external trigger into a durable root Session: validate and snapshot the request, resolve the presets, resolve or create the Workspace, create the Agent with the preset mounted before publication, attach the Session durably, apply preset and title, admit the follow-up, and on failure detach then dispose. The package is upstream-owned; Mint does not edit it in this delivery.

Decision: (b), extract the smallest reusable service into `packages/session/session-admission`, which owns the transaction and nothing else; `channel-session` adopts it from the start, and the webhook migration is a separate follow-up. (a) and (c) are rejected: (a) couples the feature's schedule to upstream review for a change with no webhook-visible effect, and (c) duplicates an ordering that is subtle exactly where it is easy to get wrong.

The operation's full signature:

```text
admitSession(
  ctx: Context,
  request: SessionAdmissionRequest,
  options: {
    /** brand prefix; `webhook-` stays and channel Sessions get their own */
    sessionIdPrefix: string
    /** the message text and its fully built MessageSourceMap member — the service never invents provenance */
    followup: { readonly text: string; readonly source: MessageSource }
    /** subject the validation messages open with (`webhook Session request`); their exact text and field names are pinned */
    errorSubject: string
    signal: AbortSignal
  },
  onAttached: (sessionId: SessionId) => Promise<void>,
): Promise<void>
```

The three inputs the transaction needs that the first draft's signature omitted: the session-id brand prefix; the follow-up message and its source, because the webhook runtime builds `source.kind: 'webhook'` from the delivery and the rule id inside the transaction; and the error-message subject, because validation messages read `webhook Session request <field> …`.

Ordering, as the service's contract: (1) validate and snapshot before any await — `admitSession` requires only the universally required fields, absolute workspace path, non-empty prompt, `agentPreset` and `permissionPreset`, and takes `title` and `model` as optional, rejecting with a `TypeError` that names the field and opens with `errorSubject`, while the webhook's own rule-result validation runs before it calls `admitSession` and keeps requiring non-empty `workspacePath`, `title`, `prompt`, `agentPreset` and `permissionPreset`, an absolute `workspacePath`, and an optional `model` with non-empty `provider` and `model` and a positive safe integer `maxTokens`, so `webhook Session request title must be a non-empty string` still throws from the webhook path with the field name `title`; (2) resolve the permission preset, the agent preset, and its standing key, failing loud before anything is created; (3) honor the abort signal at every await boundary; (4) resolve or create the Workspace; (5) create the Agent with the Session working directory equal to the Workspace path, the agent preset mounted inside the creation `setup`, and the creation-time model selection installed until the first durable request header exists; (6) attach the Session durably; (7) invoke `onAttached(sessionId)`, where `channel-session` persists the conversation binding, before the first prompt; (8) apply the permission preset and rename the Session only when the caller supplied a title — the webhook passes its validated title and the Session is renamed as today, while a Session created by a channel conversation carries no title and is named by the composition's title capability from its first message; (9) admit the follow-up, which ends the transaction; the Agent is lifecycle-owned by `ctx` and follows normal Session behavior.

Failure and rollback, as the code behaves: failure before `ctx.agents.create` returns — validation, preset resolution, Workspace resolution, the create call itself — leaves nothing to roll back. Every failure after it returns disposes the Agent; a failure between creation and attach, including one inside the attach call itself, leaves `attached` false, so it skips detach and only disposes; a failure after attach resolves detaches the Workspace Session first, then disposes. The two rollback steps are attempted independently, a rollback failure is logged and never replaces the original error, and the original error is rethrown. A service that disposes only after attach leaks a live, published Agent on a pre-attach failure.

Compensation: `admitSession` calls `onAttached` at most once, after durable attach, and resolves only when the follow-up was admitted; step 9 can still fail afterwards, and every rejection has already detached and disposed. The caller's write at step 7 is the caller's to compensate: when the operation rejects after `onAttached` ran, `channel-session` deletes the binding record only when this transaction created it; when the record pre-existed — a re-admission after `/new`, or after the bound Session went missing — it restores the record's pre-write state instead, so the workspace, presets, title, authorized senders, display options, and cursor survive, and it reports the failure afterwards. In exchange the operation's guarantee that no rejection leaves a live Agent is best-effort: a rollback failure is logged and swallowed by design. The only session id the caller ever sees is the `onAttached(sessionId)` argument, passed after durable attach.

The suite is the executable specification of the ordering, and it also drives the unchanged upstream `createWebhookSession` against the same assertions from the cross-package parity test `packages/session/session-admission/tests/webhook-parity.spec.ts` (test-scope import; devDependency only). The follow-up work item [20260919-session-admission-webhook-migration](../work-items/20260919-session-admission-webhook-migration/brief.md) deletes the webhook transaction and its rollback and repoints the trigger at the service; its landing depends on upstream review, so the duplication window stays open until it lands, and the parity test is what keeps the window safe.

What must not regress, and what the migration's tests assert: the session id brand prefix (the service takes it as a parameter); request validation errors and field names; preset resolution order and standing-key resolution; Workspace resolve-or-create semantics; the model-selection inheritance rule; title and permission-preset application before admission; `source.kind: 'webhook'` provenance; the abort signal honored through publication; the detach-then-dispose order; and Agent disposal on a pre-attach failure (the abort check between creation and attach), where nothing was attached and only disposal runs.

## 3. Conversation binding durability

One `ctx.storageDomain` domain holds a record per `(channel, conversationId)`: `sessionId`, `workspacePath`, `agentPreset`, `permissionPreset`, `title`, `authorizedSenderIds`, outbound display options, the provider cursor, `lastAdmittedMessageId`, and `schemaVersion`.

`sessionId` is authoritative: it alone decides which Session the conversation continues. The workspace and preset fields are setup values applied only when a Session is created. On read, the Consumer resolves `sessionId` through `ctx.sessions` and treats a missing Session as unbound rather than reconstructing one from the other fields.

Every writer mutates the binding through the storage domain's own write path, whose transform runs at its slot on the domain's single write chain against the latest committed state. The `onAttached` write, `/new`'s clear, the cursor and `lastAdmittedMessageId` advance, and the approval's `authorizedSenderIds` addition are all such transforms, so no read-modify-write loses a concurrent admission write, and `channel-session` owns no per-conversation lock. Approval's second write — the pending record's status in its own domain — follows the binding update; a crash between them leaves the request pending, and repeating the approval is idempotent because both writes set values into the latest state.

The binding record is created at conversation setup, before any Session or message exists: setup writes the workspace path, presets, title, display options, and `authorizedSenderIds`, with `sessionId` and `lastAdmittedMessageId` empty. The `onAttached` write and `/new` update that record; neither creates one. Refusal is decided against the record's `authorizedSenderIds`, so a pending request exists only where a binding does. If an approval finds no record, it creates none: the update fails `missing-key`, the approval rejects, and the request stays pending until the conversation is set up.

The record is written with `sessionId` inside the admission transaction's `onAttached` hook, after durable attach and before the first prompt is admitted. `/new` clears only the session association before it acknowledges: `sessionId` and `lastAdmittedMessageId` are emptied and every other field is retained, so the workspace, presets, title, authorized senders, display options, and cursor survive; the next ordinary message creates a Session from those values, and AC-4's fields stay displayable.

The provider cursor advances only after a message is admitted, so a crash after the binding write causes platform redelivery, and the durable binding makes the redelivery continue the same Session instead of creating a second one; `lastAdmittedMessageId` suppresses an exact repeat. A crash between durable attach (step 6) and the binding write (step 7) has no binding yet: redelivery creates a second Session, and the first stays attached to the Workspace, readable from the desktop, and orphaned — no conversation reaches it. The record accepts that window instead of closing it: it needs a crash between two adjacent durable writes, and no primitive is known to span the Workspace registry and the storage domain in one transaction, which is the reason the window is accepted rather than an established fact about the code.

Pending requests from refused senders are durable records, not an in-memory queue. `channel-session` writes one record per refused message into a second `ctx.storageDomain` domain keyed by `(channel, conversationId, messageId)`, with fields `senderId`, the message text, `receivedAt`, `status` (`pending | approved | dismissed`), and `schemaVersion`; a refused message still creates no Session and no model-visible event. The page renders the pending records through the controller's Remote surface; approving one adds its `senderId` to the conversation binding's `authorizedSenderIds` and marks it approved, and dismissing marks it dismissed. Retention: a record lives until the page approves or dismisses it; nothing else expires it, so a restart never drops a request the user has not seen. Disposal: the records are durable and outlive `channel-session`'s disposal — disposal stops the projection, and a reconnected page reads every pending record again.

The record carries `schemaVersion`; a version the running build does not know fails loud, with the channel reporting unavailable and a diagnostic, instead of being reinterpreted.

## 4. Inbound provenance

The member is:

```text
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
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
```

This does not change the Session log format version. `MessageSourceMap` is merge-extensible; its consumers switch on `kind` and fall through a documented default for unknown kinds; `webhook` and `agent-team` already extend it the same way. The log stores the source as data, so an added member is additive data, not a format change. Alternative: reuse the `webhook` member with a channel-shaped payload; rejected, because it would misstate `deliveryId` and `ruleId` or widen them for every consumer, while the desktop's source projection needs exactly these fields to render the chip.

## 5. Outbound delivery

At-most-once (one attempt, then a report) is rejected: the reply is the product's only output to a phone user, and a transient failure would silently lose it. Exactly-once is not available: the iLink `send_message` path exposes no idempotency key this design can rely on, so a retry after an ambiguous timeout can duplicate. Chosen: at-least-once. A duplicate reply is preferable to a lost one.

Retry is bounded by validated Config fields (attempt bound, backoff), not hardcoded constants. The delivery record lives in a `ctx.storageDomain` domain keyed by channel, conversation, and delivery id: state (`pending | sent | failed`), attempt count, last error, the platform message id on success, and timestamps. The controller lists the records; the page renders 发送中 / 已送达 / 发送失败 per reply.

The record is not model-visible: it is transport state, not conversation content, and a model-visible delivery state would make the transcript depend on the platform and add a log entry per retry. A terminal failure leaves the record with its last error, the page state, and one diagnostic log line. Nothing retries after the bound is exhausted, and the Session's content stays readable and complete.

## 6. Conversation commands

Two tiers. Tier 1 is a channel-local table in `channel-session`, matched before any agent is resolved, so it works with no Session, with an idle Session, and while a turn runs: `/new`, `/status`, `/stop`, `/help`, `/whoami`. `/stop` calls the session controller's cancel operation; `/new` unbinds now and the next ordinary message creates the Session; `/help` lists both tiers and labels the conversation layer apart from the Session's plugins. Tier 1 is not registered in `ctx.commands`: registry dispatch takes an exact Agent, which tier 1 must work without, and a global registration would appear in the desktop composer's `/` menu, which the product owner excluded.

Tier 2 dispatches through `ctx.commands` against the bound Session's agent, so every plugin-registered command (`/compact`, `/plan`, `/goal`, `/export`, and later additions) works in the conversation with no per-platform work; each run logs `command/run` and `command/done` and never enters model history. Both tiers match the registry's documented syntax: a slash at byte zero, then a lowercase name of `[a-z0-9_-]`, then end of input or whitespace. A test pins the two matchers to the same grammar. A well-formed command neither tier knows is answered with a hint pointing at `/help` and never becomes a model message.

Divergence from the desktop adapter, accepted: a slash-prefixed line that is not command-shaped is an ordinary message on a chat surface. The desktop adapter rejects it because its `/` menu makes the intent unambiguous; a chat surface has no such affordance, and swallowing ordinary text is a worse failure than one accidental prompt. `/help` states the rule.

## 7. Permission-question relay

Ownership: `channel-session` registers an answerer on the `approval/request` waterfall through `ctx.effect`. The seam's predicate: `ApprovalService.request` dispatches the waterfall through `scopeTarget(req.agent, req.agent)`, whose call site is `packages/interaction/user-approval/src/index.ts` and whose admission semantics — untagged listeners, scope keys and ancestors — live in `@deepseek-ai/dsh-scope`, and which admits a listener when the asking agent's own Cordis filter admits its context and the listener is either untagged — registered on an unscoped context, admitted for every agent — or tagged with the asking agent's scope key or one of that key's ancestors. A listener scoped to a different agent, or below the asking agent, never receives the request; the seam enforces routing and the agent's service filter, not ownership.

`channel-session` registers the answerer from its own plugin context, which is not scoped to any agent, so the waterfall admits it for every request; it satisfies the ownership rule in the answerer body, answering only when `req.agent.session`'s id is one of its bound Sessions and calling `next()` for every other request, so the desktop answerer keeps its seat and an unanswered chain still ends in the fail-closed fallback. Section 2 step 9's "lifecycle-owned by `ctx`" does not contradict this: lifecycle ownership decides who disposes the Agent, the seam's predicate never consults disposal, and answer eligibility here is the registration scope plus the binding index.

Concurrency: a conversation holds several pending questions at once. Each relayed question carries a per-conversation index and names the tool, the asker's reason, and its answers as a numbered list, so one message identifies every open question and a reply identifies both the question and the answer. Nothing queues: the product owner rejected making a second question wait, because a question that falls through unanswered settles `unavailable` and denies, failing a task the user never saw. An index is reused only after its question settles.

Fail-closed default: no reply, a timeout, a disconnected channel, or a reply that names no pending question or no option of the one it names all leave that question unanswered, and the caller's closed-set handling settles it `unavailable` and denies. The relay never converts silence into `allowed-once`. A reply that arrives after the caller settled its question is ignored.

Numbered mapping: the answer's number maps onto the closed `ApprovalOutcome` set: the allow option to `allowed-once` (the set's only allow-shaped outcome), the reject option to `rejected`, the cancel option to `cancelled`. A reply that is not a question index together with an option number, names no pending question, or is out of range leaves every pending question unanswered rather than guessing.

## 8. WeChat transport

`channel-weixin` implements the documented iLink HTTP/JSON API with Node builtins: `fetch` or `node:https` for QR login, `get_qrcode_status`, `get_updates`, and `send_message`; `node:crypto` for the AES-128-ECB media path; the poll cursor in the binding record. It declares no third-party runtime dependency, because `verifyMintPackages` resolves every declared dependency against the frozen official closure and would fail assembly. The official `@tencent-weixin/openclaw-weixin` package and the MIT `cc-weixin` project are protocol references, not dependencies. Chunking, platform length limits, and the throttle policy live in the provider.

Feishu boundary, not committed: the Phase 2 provider implements the same interface. Whether it bundles the official SDK into the packed plugin's build output or implements the connection frames against Node's built-in WebSocket is decided by the Phase 2 readiness record. This record records only the constraint: no third-party runtime dependency, and the handshake, reconnection, and token refresh are owned code if the SDK is not bundled.

## 9. Packaging and assembly

Each new package enters `MINT_PACKAGES` in `scripts/desktop-assembly.ts`, the build and pack pipeline in `scripts/build-mint-plugins.ts`, and is enabled by `packages/bundle/desktop-mint/cordis.patch.yml`, which carries patch rows only. The packaged artifact must verify: every declared dependency and peer dependency of every Mint package resolves inside the staged frozen runtime closure; the `desktop-mint` Profile contains each selected row exactly once; a generic Web composition excludes every Mint-only default and still boots the seam; the keyless browser scenario observes the setup flow and the connected state; and the packaged smoke test passes with the new packages present. No shared package branches on Mint identity.

## 10. Recovery and disconnection

Token lock: the platform accepts one polling client per token and a second poller silently splits messages, so the provider takes a lock before polling and reports `unavailable` with a diagnostic when another instance holds it. Medium: an OS-level lock file created with an exclusive-create flag in the desktop data directory, keyed by platform identity; the holder writes its instance id and a heartbeat refreshed on every poll cycle into the file, and creation fails while the file exists. Scope: cross-process for every instance on one machine, since a real file is readable across processes, and not cross-machine, which is why the page states that one identity serves one connected client at a time. Stale-lock rule: a lock is stale only when its heartbeat is older than twice the configured poll bound; the margin keeps a second instance from overriding a live holder whose poll overruns the bound. A holder that finds a different holder id in the lock file stops polling and reports the superseded state; a crashed holder's heartbeat stops, the lock goes stale under the same threshold, and the next provider overrides it after one diagnostic log line and writes its own holder id.

Expired platform session: WeChat `errcode -14` means the platform session is gone; the provider stops polling and reports the state that requires a new scan, and the page offers it. No retry policy attempts to resurrect an expired session.

Retry and circuit breaker: poll and send retries use validated Config bounds with backoff, and the breaker opens on repeated platform failures so the connection reports `unavailable` with its diagnostic instead of degrading the desktop backend process with an unbounded loop against a throttled platform.

Shutdown: disposal aborts the long poll, releases the token lock, stops delivery, and unregisters the answerer and the command surface; every registration is a `ctx.effect` disposer, so this holds on unload as well as on application exit.

No user state becomes irrecoverable: bindings, pending requests, and delivery records are durable before they are observable, and the platform credential lives in `ctx.credentials`. After a restart the provider reuses the stored token and resumes from the durable cursor, so only an expired platform session requires a new scan, and an interrupted delivery stays a reported state rather than a lost reply. Existing Sessions stay readable after disconnect.

## 11. Compatibility and reuse

Supported DSH range: the upstream Harness version the desktop assembly pins for the release the plugin ships in. A Mint release declares the pin it was assembled and smoke-tested against and claims no other; the assembly check and the packaged smoke test are the evidence.

Reuse: another DSH developer mounts `packages/channel/channel` and registers a provider implementing the interface above; mounts `packages/channel/channel-session` for binding, authorization, commands, delivery, and permission relay; and may mount `packages/api/channel-controller` and the client plugin for the settings surface. The provider publishes authenticated, normalized inbound events; the Consumer needs nothing else. Reuse instructions live in the packages' READMEs.

## 12. Ownership and disposal per package

| Package | Owns | Disposal |
|---|---|---|
| `channel/channel` | the registry, the provider interface, the branded ids, `ChannelEventMap` | the mounting plugin; disposing the registration disposes the provider |
| `channel/channel-weixin` | the platform connection, the token-lock file, the poll cursor, chunking and throttling | its registration disposer; aborts the poll, releases the lock; a crash leaves the lock stale, which the next instance overrides by the stale-lock rule |
| `channel/channel-session` | bindings, sender authorization, the pending-request records, tier 1 commands, delivery records and retry, the relay's pending-question index, the answerer seat | its registrations; stops delivery, unregisters the answerer, drops pending relays so their questions settle fail-closed; the binding and pending-request records stay durable |
| `api/channel-controller` | the Remote surface, the pending-request list projection, and its forwarded owner events | its registration; the section disappears from the client |
| client settings plugin | the settings section, the modal, its slots and copy | its slot and locale registrations |
| `session/session-admission` | the admission transaction | its caller; it holds no durable state and never owns the Agent, which is lifecycle-owned by `ctx` |

Durable records outlive disposal: disposing a package stops access, not durability, so a reconnected provider reads the same bindings and the page renders the same pending requests. A crash between durable attach and the binding write (section 3) leaves one Session attached and orphaned: `ctx` owns it, it stays readable, and nothing deletes it.

## Consequences

- The seam is generic; Mint enables it and chooses product defaults, and a plain Web composition boots it without them.
- Until the webhook migration lands, two implementations of the admission transaction exist, kept aligned by the cross-package parity suite rather than by a shared implementation.
- The Feishu path stays open and uncommitted.
- The assembly gains packages; the runtime-closure check and the packaged smoke test are the gates.
- A remote conversation's permission preset is a real execution boundary: it is chosen explicitly at setup and stays visible.
- Several permission questions can be pending in one conversation, so the relayed message identifies each by index and a reply names the question it answers.
- A conversation-created Session carries no explicit title; the composition's title capability names it from the first message, as it names every other Session in this product.
- One Session can be orphaned by a crash between two adjacent durable writes; it stays readable and is never deleted.
