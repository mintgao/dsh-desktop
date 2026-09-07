# Technical decision: Correlated Client Console readiness

English | [中文](technical-decision.zh.md)

Status: Accepted

- Decision owner: Tech Lead (`inspector_ack_decision_author`)
- Decision date: 2026-09-04
- Review mode: independent-agent
- Review result: approved
- Review evidence: Independent Tech Lead `inspector_ack_decision_review` approved the exact amended technical content after verifying enable-epoch serialization, late-continuation fencing, realm linearization and failure isolation, complete identity correlation, matching-artifact recovery, and deterministic lifecycle-race coverage.
- Governing decisions: [Cross-realm CDP inspector](../../../.agents/notes/implemented/architecture/2026-08-23-cross-realm-cdp-inspector.md) and [Inspector execution realms and protocol planes](../../../.agents/notes/implemented/architecture/2026-08-26-inspector-execution-realms-and-protocol-planes.md)

## Trigger coverage

This decision changes the versioned Client-to-Worker protocol, Console subscription ownership, `Runtime.enable` readiness, and timeout, disconnect, disposal, and stale-frame behavior. These are the protocol, cross-realm ownership, compatibility, and failure-consistency triggers recorded by the work item.

No material product choice remains. `Runtime.enable` continues to expose the same Host and Client contexts and preserves per-DevTools-session object isolation; it now fulfills the existing readiness contract before returning.

## Accepted-decision applicability

The cross-realm Inspector decision continues to govern Worker-owned CDP state, browser-owned Console interception, typed correlated frame families, source generations, and per-session Client object handles. The protocol-plane decision continues to place wire types in `shared/bridge/`, browser installation in `client/`, correlation in `worker/bridge/`, and CDP enable state in `worker/cdp/`.

Neither Accepted decision defines an acknowledgement for Console installation or the lifecycle of a pending Console subscription. This decision extends them without changing their ownership or dependency rules.

## Decision

### Protocol

Increment `INSPECTOR_PROTOCOL_VERSION` from `0` to `1`. Version 1 adds a branded `ClientConsoleSubscriptionId` allocated by the Worker for each Console-enable attempt.

The exact version-1 Console envelopes are:

- `client-console/enable`: `v`, `t`, `sourceId`, `generation`, `sessionId`, `subscriptionId`.
- `client-console/enable-result`: the same identity fields plus `outcome`, which is `{ ok: true }` or `{ ok: false, error: { code, message } }`. Codes are `installation-failed` and `session-conflict`; messages are bounded to 2,048 characters.
- `client-console/disable`: `v`, `t`, `sourceId`, `generation`, `sessionId`, `subscriptionId`.
- `client-console/event`: the same four identity fields plus `event`.

Every decoder remains exact and rejects missing or unknown fields. The source registry first authenticates the active `sourceId` and `generation`; the Runtime router then requires `sessionId` and `subscriptionId` to match the pending or active subscription.

### Readiness and ordering

`ConsoleBackend.subscribe()` returns a synchronously owned handle containing `ready: Promise<void>` and an idempotent `dispose()` operation. Host Console registration returns an already-ready handle. Client registration returns a provisional handle whose promise settles from `client-console/enable-result`.

The Worker allocates the subscription id, installs the local event listener, stores the provisional subscription and pending correlation, and starts the `clientRuntimeTimeoutMs` timer before sending `client-console/enable`. No new configuration field is introduced.

The Client records the `(sessionId, subscriptionId)` pair and completes synchronous Console and global-error hook installation before sending a successful result. Installation failure rolls back partial hooks and returns a failed result.

A Client Console subscription becomes active only after the Worker accepts a successful, exactly correlated result. `Runtime.enable` awaits Runtime backend enablement and every current Console subscription's `ready` promise, then announces Client execution contexts and returns success. A Client realm connected after Runtime is enabled is announced only after its Runtime and Console readiness complete.

Each DevTools Runtime session owns at most one in-flight initial enable epoch. Concurrent `Runtime.enable` calls join that epoch, while a call against an already enabled domain returns success without creating another subscription. The initial epoch snapshots its realm membership before starting backend and Console readiness. Realms opened while it is pending are queued outside that response barrier; a successful epoch commits enabled state and then processes the queued realms through the dynamic-realm path, while a failed or invalidated epoch discards its queue without announcing any queued context. A later retry takes a fresh snapshot that includes every still-open realm.

`Runtime.disable` and DevTools-session close invalidate the current epoch before disposing any active or provisional resource. Disable waits for its cleanup and returns success; each joined enable request rejects. Every continuation after an `await` compares the captured epoch with the current epoch and closed state. Stale continuation code may only finish rollback; it cannot subscribe, announce a context, restore enabled state, or replace resources owned by a newer epoch.

A realm opened after enabled state commits receives its own provisional Console subscription. Readiness success announces only that realm. Readiness failure disposes its provisional state, withholds its execution context, and closes that connection-local realm session without changing sibling realms or the Runtime domain's enabled state. That source becomes eligible again only through a new source generation or a new DevTools connection; the existing source generation is not retried implicitly.

### Failure, recovery, and cleanup

A failed result, timeout, send failure, source disconnect or generation replacement rejects the pending readiness promise and removes its timer, listener, and provisional record. Runtime-domain disable, DevTools-session close, realm removal, and Worker/router disposal invoke the same idempotent disposal path. Disposal sends a matching disable frame only when that source generation remains active.

Any failure during the initial multi-realm `Runtime.enable` disposes all active and provisional subscriptions created by that attempt, disables the enabled Runtime backends, clears uncommitted contexts and objects, and returns a CDP error. A caller may retry after the Client reconnects or the failure clears.

The Client treats a repeated enable carrying the same complete tuple as idempotent. An already-active successful tuple resends success without reinstalling hooks. A failed installation rolls back every partial hook, retains only the bounded failure result for that tuple until matching disable or generation reset, and resends that failure; retry requires a new Worker-allocated subscription id. Reuse of one Runtime session with a different live subscription id returns `session-conflict`. A matching disable removes that subscription or failure tombstone and releases its `console` object group; an unknown or mismatched disable is a no-op.

The Worker ignores duplicate or late results for unknown or already-settled subscription ids. A result using a known pending subscription id with any mismatched authenticated source id, source generation, or Runtime session fails that pending subscription as a correlation error and runs its normal cleanup. Events are delivered only for the exact active source generation, Runtime session, and subscription id; provisional, disposed, disconnected, and stale events are ignored.

Timeout and disposal send best-effort disable. WebSocket ordering ensures a delayed Client that processes the enable also processes the later disable; socket closure or generation reset independently removes all Client Console sessions and hooks. No durable state or migration is required.

### Compatibility and security

Version 1 has no version-0 negotiation, shim, or mixed-peer support. This package is private, experimental, excluded from releases, and builds its Host, Worker, and Client faces together. Existing strict version rejection remains the recovery mechanism. Recovery requires matching Host, Worker, and browser Client artifacts, including reloading or restarting an already-running Client page; restarting only the Inspector cannot update that page's loaded Client bundle.

Public package APIs, session formats, source identities, CDP context identities, and multi-session object isolation do not change. The acknowledgement uses the existing authenticated Client WebSocket and adds only opaque correlation ids and bounded diagnostics, so it creates no new trust or privacy boundary. A Client can withhold readiness only until the existing finite Client Runtime deadline.

## Alternatives considered

**Keep one-way enable and increase test timeouts.** Rejected because it preserves the interval in which `Runtime.enable` succeeds before observation exists and permanently loses events.

**Acknowledge by source generation and Runtime session only.** Rejected because disable followed by re-enable can leave a late acknowledgement indistinguishable from the current attempt.

**Buffer all Client Console traffic for replay.** Rejected because Console arguments own per-DevTools-session handles; global replay changes retention, ordering, and isolation instead of establishing readiness.

**Reuse Client Runtime request frames.** Rejected because Console lifecycle is an existing separate frame family, and treating observer installation as evaluation would blur the accepted protocol ownership.

## Implementation boundaries

Implementation is limited to the Inspector protocol/version and ids, Client dispatcher/transport and Console observer, Worker source dispatch and Runtime router, shared Console backend subscription semantics, Runtime-domain enable ordering, and focused fixtures/tests. It must preserve source-generation validation and per-session object groups.

Update the Inspector README and its Chinese counterpart, plus the English and Chinese cross-realm Inspector Agent Note, with the shipped acknowledgement, ownership, timeout, and cleanup behavior. The protocol-plane Agent Note requires no decision change because the new frames follow its existing placement rules.

The other three contention fixes remain local test synchronization or finite test-budget changes and do not enter this protocol decision.

## Required verification

- Exact codec tests accept every version-1 Console frame and reject version 0, missing identities, unknown fields, invalid outcomes, and oversized diagnostics.
- A deterministic controlled-transport test observes and holds `client-console/enable-result`, proves `Runtime.enable` remains unsettled after the enable frame and microtask drain, releases the result, then registers the event waiter before logging and proves Console delivery.
- Focused tests cover failed installation, timeout with fake timers, disconnect and generation replacement, Runtime disable, DevTools close, router disposal, duplicate results, mismatched correlation, duplicate enable, and stale disable/event frames.
- Worker tests cover Console-enable transport returning `false` and throwing before dispatch.
- Held-ack tests separately invoke Runtime disable, DevTools close, and router disposal, then prove prompt settlement, timer and listener removal, and the absence of late subscription or context reactivation.
- A multi-realm test lets one acknowledgement succeed while another fails or times out, proves every subscription and enabled backend owned by that epoch rolls back, and proves a later retry succeeds.
- Realm-lifecycle tests open a realm during initial enable, prove it is processed only after the initial epoch commits, and prove dynamic-realm readiness failure withholds and closes only that realm session.
- Correlation tests vary source id, generation, Runtime session, and subscription id independently. Client tests prove failed-install rollback plus duplicate behavior for both active-success and failed tuples.
- Existing two-DevTools-session tests continue to prove distinct object ids, object-group cleanup, and sibling-session isolation.
- Tests use protocol barriers, deferred promises, event waiters registered before triggers, and fake timers; fixed sleeps, retries, global serialization, and worker-count reduction are not success conditions.
- Documentation synchronization, Inspector focused tests, typecheck, and `git diff --check` pass before independent QA runs the single default verification required by AC-7.

## Approval condition

Implementation remains blocked until a different Tech Lead approves this exact persisted decision and the workflow orchestrator records `decision-accepted`, `Review result: approved`, no open blockers, and `Gate: implementation-ready`.
