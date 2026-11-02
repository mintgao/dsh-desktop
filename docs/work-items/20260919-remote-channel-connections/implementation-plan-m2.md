# Implementation plan: the WeChat channel provider

English | [中文](implementation-plan-m2.zh.md)

- Work item: `20260919-remote-channel-connections`
- Slice: M2 — `packages/channel/channel-weixin`
- Gate: `implementation-ready` (`decision-accepted`, confirmed 2026-09-19)

The durable contracts live in the [decision record](../../decisions/0001-remote-channel-connections.md) and the acceptance criteria in [the brief](brief.md). This document adds the slice boundary, the file-level shape, the order of work, and the evidence each step owes.

## Slice boundary

In scope — the Provider role of the channel seam, against Tencent's iLink Bot API (`https://ilinkai.weixin.qq.com`):

- The QR login sequence: fetch a QR, poll its status, refresh on expiry, and write the resulting token through `ctx.credentials`.
- The connection lifecycle: the observable state (`idle | connecting | connected | unavailable` with a diagnostic), the token lock, the long poll, and the disconnection behavior.
- The inbound path: `get_updates` under a durable cursor; every update authenticated, normalized, and published on the channel event as a direct-message conversation.
- The outbound path: `send_message` with chunking, the platform's throttle policy, and the receipt the Consumer records.
- Retry and the circuit breaker: validated bounds for poll and send, and the breaker that reports `unavailable` instead of looping against a throttled platform.

Out of scope, with the slice that owns each:

- The Consumer (bindings, authorization, delivery records, commands, the relay) — landed in M1; commands and the relay are M4.
- `packages/api/channel-controller` and the client settings section, including the QR rendering — slice M3. This slice exposes the login operations on the provider registration for that page to consume.
- Mint bundle rows, `MINT_PACKAGES`, and the packaged checks — slice M5.
- Group conversations and media. Direct messages only, text only: the Consumer sends the agent's final reply text, attachments are Phase 3, and rich inbound media is outside the brief's scope. The media path's constraint (`node:crypto` for AES-128-ECB) is recorded in the decision for the slice that adds it.
- 企业微信, 公众号, and unofficial protocols — outside the feature.

## Package shape

`packages/channel/channel-weixin/` is a Host plugin package that injects `channels` and registers through `ctx.effect`; it declares no third-party runtime dependency, because `verifyMintPackages` resolves every declared dependency against the frozen official closure.

| File | Role |
|---|---|
| `src/index.ts` | The plugin: validated `Config`, the provider registration, lifecycle state, teardown |
| `src/login.ts` | The QR login sequence and the token write into `ctx.credentials` |
| `src/transport.ts` | The iLink HTTP/JSON calls against Node builtins, and the error mapping |
| `src/poll.ts` | The long poll: the cursor, the retry bounds, the backoff, the circuit breaker |
| `src/send.ts` | `send_message`: chunking, the throttle policy, the receipt |
| `src/lock.ts` | The token-lock file: exclusive create, the heartbeat, the stale rule |
| `src/normalize.ts` | A platform update into the channel's inbound event |
| `src/types.ts` | Types only, no runtime code |

Creating the package follows [the adding-a-package cookbook](../../cookbook/adding-a-package.md): the registry entries in both tsconfig aggregates, the row in the `channel/` README pair, the `package-reference` README form for a plugin entry, the regenerated config catalog with its Chinese side brought along by hand, and the doc graphs' `channels` role, whose provider list names this package.

## Durable state

This slice creates no storage domain. Its durable surface:

- The platform token, written through `ctx.credentials` and never read back to a client.
- The token-lock file, keyed by platform identity in the configured lock directory; a crash leaves it stale, and the next instance overrides it under the stale rule.
- The poll cursor, stored in M1's binding record: this package reads the persisted cursor at start and hands the current cursor along with every inbound event; the Consumer persists it in the same transform that records admission.

## Login sequence

1. `beginLogin` on the provider registration fetches a QR and reports the waiting state.
2. Poll the QR status until it reports scanned, confirmed, or expired; an expired QR is replaced by a fresh one, and the sequence keeps exactly one live QR.
3. A confirmed login yields the token, written through `ctx.credentials`, and the bot identity the login created.
4. The page renders this sequence in M3; this slice's real acceptance renders the QR with a one-off harness instead.

## Inbound sequence

1. Acquire the token lock; when another instance holds it, report `unavailable` with a diagnostic instead of polling.
2. Resolve the token; with none stored, report the state that requires a scan.
3. Poll `get_updates` from the cursor with the configured timeout.
4. Map the platform's errors: an expired session (`errcode -14`) stops polling and reports the state that requires a new scan; a transient failure retries within the configured bounds; repeated failures open the breaker, which reports `unavailable` with its diagnostic.
5. Authenticate and normalize each update: the conversation, the sender, the message id, the text, and the cursor; a group conversation is not published.
6. Publish on the channel event; the Consumer persists the cursor when it admits the message.

## Outbound sequence

1. `send(conversation, message, signal)` splits the body within the configured chunk length and sends the chunks in order.
2. A throttled or transiently failed chunk retries within the configured bounds and delay, honoring the abort signal.
3. The call resolves with the platform message id of the first chunk once the platform accepted every chunk, and rejects with the platform diagnostic otherwise.

## Configuration

Every bound is a required validated `Config` field — a hardcoded constant is not configurability. The API base address stays a protocol constant, not a field.

| Field | Meaning |
|---|---|
| `pollTimeoutMs` | The long poll's timeout |
| `pollRetryAttempts`, `pollBackoffMs` | Bounds of the poll retry |
| `sendRetryAttempts`, `sendBackoffMs` | Bounds of the send retry |
| `throttleDelayMs` | The delay a throttled send observes before retrying |
| `breakerThreshold` | Consecutive platform failures that open the circuit breaker |
| `chunkLength` | The outbound chunk length within the platform's limit |
| `lockDirectory` | Directory of the token-lock file; the Mint bundle points it at the desktop data directory |

## Evidence this slice owes

- Unit specs per module against a scripted transport: the login state machine with its expiry refresh, the lock's exclusive create, stale override, and superseded holder, the poll loop with its cursor, `errcode -14`, and the breaker, the send path's chunking, throttle retry, and receipt, and normalization's direct-message filter.
- **A real-composition test through the Loader**: the provider assembled over a scripted transport stand-in, asserting that the login sequence advances, the poll publishes one normalized message on the channel event, and the send splits the body and resolves its receipt.
- **One real platform round trip, with the owner**: a one-off harness renders the QR; the owner scans, sends a direct message, and observes the reply return to WeChat. Until M5 assembles the desktop, this is the only way to see the real round trip.
- Per-file 100% coverage over the package source, run with the focused coverage command.
- The README pair, the group README row, the regenerated catalogs, and `pnpm run doc-sync`.

## Acceptance mapping

| Criterion | After M2 |
|---|---|
| AC-1 (connect by scanning one QR from the client, no configuration file) | The login sequence and its states exist and are drivable; the client entry point is M3 |
| AC-2 (a direct message becomes a Session message and the reply returns) | The platform half is met by the real round trip; the Consumer half was proven in M1 |
| AC-9 (disconnecting stops polling and delivery, Sessions stay readable) | The poll half is met at disposal — the long poll aborts and the lock releases; the delivery half was M1 |
| AC-4–AC-8, AC-10, AC-11 | Later slices |

## Order of work

1. Package skeleton, registrations, and the transport module with its spec.
2. The login sequence, the credential write, and the token lock with its spec.
3. The poll loop, the error mapping, and normalization.
4. The send path with its chunking and throttle policy.
5. The composition test, then the real round-trip harness, then the documentation artifacts and `doc-sync`.

## Local assumptions recorded

- Cursor recovery: the provider resumes from the earliest cursor among the bindings, because one token-level stream feeds every conversation; replays are suppressed by `lastAdmittedMessageId`.
- The receipt names the first chunk's message id; the delivery record stays one record per reply, not per chunk.
- The provider publishes direct messages only; a group conversation is ignored with one diagnostic line.
- The lock file's holder heartbeat refreshes every poll cycle, and the stale threshold is twice the configured poll bound.
- The token's credential name is fixed by this package; the settings document carries the reference only.

## Risks in this slice

- **The iLink API is official but not publicly documented**, so error codes and throttle semantics come from the reference implementations; the real round trip is what confirms them against the platform.
- **The lock's stale rule costs time after a hard kill**: a crashed holder's heartbeat stops, and the next instance waits out the stale threshold before overriding it. The wait is reported as a diagnostic, not hidden.
- **The transport must be testable without the platform**, and the base address stays a protocol constant; the stand-in is injected at the transport seam, with the exact mechanism (module stand-in or construction injection) chosen by repository convention during implementation.
- **The cursor couples this package to the Consumer's domain**: the provider reads the binding domain by name, and if that read is not available, a read surface is added where the implementation requires it.
- **The real round trip needs the owner** to scan and send; it cannot run in CI, so the plan treats it as a manual acceptance step with recorded evidence.
