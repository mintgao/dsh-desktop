# Validate existing session queries through restoration

Status: Accepted

English | [中文](20260910-seeded-session-query-restoration.zh.md)

## Authority and scope

Technical author: `preset_compat_decision`. Independent reviewer: `classification_review`, result `approved`, design only. The [review record](../work-items/20260910-dsh-015-upgrade/seeded-query-review.json) binds proposal SHA256 `d19640306b35e02840e01104a6cacce04a568fa2ec12440810e8a2842d220856`. The [work item](../work-items/20260910-dsh-015-upgrade/brief.md) owns the separate implementation gate. This supplements the Accepted [migration registry](20260910-desktop-mint-migration-registry.md) for exact history queries and preserved fork semantics.

The [synthetic failure summary](../work-items/20260910-dsh-015-upgrade/seeded-query-evidence.json) records a delivered-baseline fork with its own completed continuation. Target migration, resume and a further real turn succeed, but public `readSession` rejects the complete child history with `seeded session constructor seed must equal its inherited prefix`. Existing history contains both inherited events and the child's own events; the fresh-creation invariant remains correct.

## Query ownership and validation

Repair only reusable `@deepseek-ai/dsh-session-query`. Materialize validation copies of every loaded event and header through existing `snapshotJsonValue` from `@deepseek-ai/dsh-util-values`, declaring its normal package dependency if needed. Reject non-lossless JSON values before detached validation. `Session.fromRestore` alone omits this check, and `structuredClone` does not establish JSON representability.

Validate those copies through `Session.fromRestore` with the exact session identity, inherited count and detached mode. Preserve header identity/version, event envelope/sequence, surface transitions and inheritance bounds checks. Do not change the fresh-fork invariant, Session constructor, Agent Loop, native code, format versions or migration generations.

Return the existing detached snapshots from the loaded observation and its original inherited count. Do not return the temporary restored Session's events: restoration can add an ordinary in-memory `session/end-seed`, while an exact query must add no marker. Keep cold-read interrupted-turn balancing unchanged. Query creates no live registration, lifecycle emission, write handle or stored-byte change; validation failure publishes no partial result.

This is an identified downstream correction in an upstream-owned reusable package, without Mint-specific behavior. Track it as an upstream contribution candidate and retire it only after an adopted upstream implementation passes the same checks. Outbound submission requires separate authorization. Recovery continues to use the complete quiescent backup.

## Alternatives

Relaxing fresh seeded creation would weaken a valid invariant. Truncating history, clearing seeded metadata or changing inherited count would hide corruption. Returning the restoration-added marker violates exact query results. A general Session validation API expands shared infrastructure beyond this bounded repair.

## Required verification

- Public live and cold queries succeed for seeded children immediately after creation and after completed own continuation, including a genuinely resumed persisted child.
- Returned header, inherited count and complete events equal the loaded observation, with no extra marker; modifying returned fields cannot mutate their sources.
- Query creates no attached Session, lifecycle event, write handle or stored-byte change.
- Preserve corrupt-sequence refusal and reject invalid header identity/version, out-of-bounds inheritance, invalid surface transitions and non-lossless JSON header/event values.
- Keep relevant fresh-fork rejection checks unchanged.
- Rebuild the actual package and execute delivered child creation, target migration/resume/turn, public query, complete process restart and cold query, then complete backup restoration and baseline observation. Bind actual source/runtime hashes; unit tests alone do not establish packaged qualification.
