# Implementation plan: the channel Session consumer

English | [中文](implementation-plan.zh.md)

- Work item: `20260919-remote-channel-connections`
- Slice: M1 — `packages/channel/channel-session`
- Gate: `implementation-ready` (`decision-accepted`, confirmed 2026-09-19)

The durable contracts live in the [decision record](../../decisions/0001-remote-channel-connections.md) and the acceptance criteria in [the brief](brief.md). This document adds the slice boundary, the file-level shape, the order of work, and the evidence each step owes.

## Slice boundary

In scope — the Consumer role of the channel seam:

- The conversation binding: one durable record per `(channel, conversationId)`.
- Sender authorization: the authorized set, the refusal path, and the durable pending-request record a refusal creates.
- The inbound path: an accepted message becomes a new Session through `@deepseek-ai/dsh-session-admission`, or a follow-up turn on the bound Session.
- The outbound path: the bound Session's turn completion is delivered through the provider with a bounded retry and a durable delivery record.

Out of scope, with the slice that owns each:

- Conversation commands (`/new`, `/status`, `/stop`, `/help`, `/whoami`, and tier-2 dispatch through `ctx.commands`) and the permission-question relay — slice M4. `channel-session` lands without them, and its README states the gap under Known Limitations.
- `packages/api/channel-controller` and the client settings section — slice M3.
- `channel-weixin` and every other provider — slice M2.
- Mint bundle rows, `MINT_PACKAGES`, and the packaged checks — slice M5.

One consequence of that order, accepted: a refusal is durable from M1 onward but approve-or-dismiss needs M3's page, so an early refusal accumulates until that page exists.

## Package shape

`packages/channel/channel-session/` is a Host plugin package that injects `channels` and registers through `ctx.effect`.

| File | Role |
|---|---|
| `src/index.ts` | The plugin: validated `Config`, the three domains, effect wiring, teardown |
| `src/binding.ts` | The binding domain: schema, read, and the write transforms every writer shares |
| `src/authorization.ts` | Authorized-sender resolution and the durable refusal record |
| `src/inbound.ts` | The inbound sequence below |
| `src/outbound.ts` | Turn observation, delivery records, the bounded retry |
| `src/types.ts` | Types only, no runtime code |

Creating the package follows [the adding-a-package cookbook](../../cookbook/adding-a-package.md): the registry entries in both tsconfig aggregates, the row in the `channel/` README pair, the `PACKAGE_LIBRARIES` entry if the entry is a plain module (it is a plugin: `apply` form, so `package-reference`), and the README omission sentence for the absent `./invariant` companion.

## Durable state

Three `ctx.storageDomain` domains, each with `schemaVersion`; a version the running build does not know reports the channel unavailable with a diagnostic instead of being reinterpreted.

| Domain | Key | Fields |
|---|---|---|
| Binding | `(channel, conversationId)` | `sessionId`, `workspacePath`, `agentPreset`, `permissionPreset`, `title`, `authorizedSenderIds`, outbound display options, provider cursor, `lastAdmittedMessageId` |
| Pending requests | `(channel, conversationId, messageId)` | `senderId`, text, `receivedAt`, `status` (`pending \| approved \| dismissed`) |
| Delivery records | `(channel, conversationId, deliveryId)` | state (`pending \| sent \| failed`), attempt count, last error, platform message id on success, timestamps |

`sessionId` alone decides which Session a conversation continues; a `sessionId` that resolves to no Session is treated as unbound rather than reconstructed from the other fields. Every write goes through the domain's own write path, so the provider's cursor advance, the admission's `onAttached` write, and a later `/new` clear cannot lose each other.

## Inbound sequence

1. The registry hands an authenticated, provider-normalized message to the Consumer's inbound listener.
2. Resolve the binding for `(channel, conversationId)`. No binding means no setup: the message is refused with one diagnostic log line, and no record is created, because refusal is decided against a record's authorized set.
3. Resolve the sender against `authorizedSenderIds`. An unknown sender is refused: no Session, no model-visible event, one diagnostic log line, and one pending-request record.
4. Suppress an exact repeat of `lastAdmittedMessageId`.
5. With no bound Session, admit one through `admitSession`: workspace path, presets, and the follow-up text with the `channel` provenance member; the `onAttached` hook writes `sessionId` and advances the cursor before the first prompt is admitted.
6. With a bound Session, submit the message through `ctx.sessionController.prompt(...)` with the same provenance, then advance `lastAdmittedMessageId` and the cursor.

## Outbound sequence

1. Observe the Session event that settles a turn on every bound Session.
2. Compose one body: the turn's final assistant text. Tool progress, intermediate assistant text, and long-running notices are not sent.
3. Write a delivery record in `pending`, then call the provider's `send(conversation, message, signal)`.
4. On success record `sent` with the platform message id; on failure retry within the configured attempt and backoff bounds, then leave `failed` with the last error, one diagnostic log line, and the page state.
5. Disposal stops delivery; a record in `pending` stays durable and is reported rather than silently dropped.

## Configuration

Every bound is a required validated `Config` field — a hardcoded constant is not configurability.

| Field | Meaning |
|---|---|
| `defaultWorkspacePath` | Workspace a new Session is created in when the binding carries none |
| `agentPreset` | Agent composition mounted on a created Session |
| `permissionPreset` | Sandbox and approval preset applied before the first prompt |
| `deliveryAttempts`, `deliveryBackoffMs` | Bounds of the outbound retry |
| `displayOptions` | Which outbound parts are sent |

Poll timeout, poll retry bounds, the circuit-breaker threshold, and outbound chunking belong to `channel-weixin` (slice M2), not here.

## Evidence this slice owes

- Unit specs per behavior area, each covering its error paths: binding reads and writes, authorization and refusal, the inbound sequence with a recording fake service stack, and the outbound retry with its terminal failure.
- **A real-composition test**, because this is a product-visible plugin: a test-only `cordis.yml` booted through the Loader with a fake provider, asserting that an accepted message produces a durable `user/message` event carrying the `channel` provenance and that the reply reaches the provider's `send`.
- Per-file 100% coverage over the package source, run with the focused coverage command.
- The README pair, the group README row, and `pnpm run doc-sync` for the documentation artifacts.

Evidence this slice cannot produce, and which later slices owe: a real platform round trip (M2), the settings flow observed in a browser (M3), and the packaged assembly and smoke test (M5).

## Acceptance mapping

| Criterion | After M1 |
|---|---|
| AC-2 (inbound message becomes a Session user message; the reply reaches the conversation) | Consumer half proven against a fake provider; the platform half needs M2 |
| AC-3 (an unauthorized sender is refused, nothing model-visible, diagnosable) | Met, with the pending record as the durable evidence |
| AC-9 (disconnecting stops inbound polling and outbound delivery, existing Sessions stay readable) | Delivery half met at disposal; the poll half is the provider's (M2) |
| AC-1, AC-4–AC-8, AC-10, AC-11 | Later slices |

## Order of work

1. Package skeleton, registrations, and the binding domain with its spec.
2. Authorization, the refusal record, and the inbound sequence through `admitSession`.
3. Turn observation, delivery records, and the bounded retry.
4. The real-composition test, then the documentation artifacts and `doc-sync`.

## Local assumptions recorded

- The Consumer brands created Session ids with the prefix `channel-`.
- The delivery record's key includes a Consumer-minted delivery id, because the iLink send path exposes no idempotency key.
- Outbound composition starts with the turn's final assistant text only; the display options decide later whether part-level delivery returns.

## Risks in this slice

- **The pending-request record has no consumer until M3.** A refusal is durable and diagnosable, but nothing can approve it yet; the README states this as a limitation rather than implying the page exists.
- **The provider cursor is written by two packages.** `channel-weixin` owns the cursor value; this package persists it in the same transform that records admission, so the two writers must both go through the domain's write path — the reason the domain is created here and read there.
- **The admission transaction is shared with the unchanged webhook runtime.** A behaviour change in `admitSession` therefore reaches both; the cross-package parity suite is what keeps the duplication window safe until the migration work item lands.