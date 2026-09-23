# Technical review: WeChat account ownership and multiple identities

English | [中文](technical-review.zh.md)

## Pass 1 — the revised decision, 2026-09-20

Reviewed: `docs/decisions/0001-remote-channel-connections.md` sections 1, 8, 10, 12 and the Authority note, together with [`brief.md`](brief.md), read against `packages/credentials/credentials/src/index.ts`, `packages/channel/channel/src/types.ts`, and `packages/channel/channel-weixin/src/index.ts`.

Reviewer: an independent agent — a separate instance from the decision's author — read-only, bounded to those five files, with the platform facts supplied as given.

Result: **`changes-required`**, from nine findings.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | blocking | The identity's source was unnamed: the grant carries `accountId`, `token`, `baseUrl`, `userId`, so "the bot identity the scan bound" had no field to read and no key could be built; what a re-scan does was unstated | The brief's Identity section now names both platform fields and keys the account on `ilink_user_id` — the WeChat account — because every scan mints a new `ilink_bot_id`; a re-scan of the same account replaces its grant in place under the same identity. The decision's sections 8 and 10 state the same, and the plan's `accounts.ts` role names the field |
| 2 | should-fix | The slug transform is lossy, so two accounts can fuse onto one identity, one record, and one lock file | Each record carries the raw user identity beside its grant; a slug that collides with another account's while the raw identities differ is refused with a diagnostic instead of overwriting that record. Recorded in the brief, the decision, and the plan's evidence list |
| 3 | should-fix | The stale-lock margin was twice the poll timeout, not the worst-case cycle, so a live retrying holder could be overridden | The rule is now the worst-case cycle — poll attempts multiplied by the poll timeout plus the backoffs between them — in the decision's section 10, the brief's durable-state notes, and the plan's evidence list |
| 4 | should-fix | An unparseable record was reported as an absent account, which contradicts the acceptance criterion that every stored account is restored and the repository's fail-loud rule | A record inside this package's scope whose payload cannot be parsed registers as `unavailable` with the unreadable-login diagnostic and its recovery action; nothing is dropped. Recorded in the brief, the decision, and the plan's Restore sequence |
| 5 | should-fix | "Reached `connected` after this start" does not separate the two expiries, and a send that fails with `-14` never reported state, so an account whose replies all failed stayed `connected` | The predicate is now "completed a poll cycle while holding this record in this process", and a send-time `-14` drives the same state and diagnostic. Recorded in the brief, the decision, and the plan's Eviction sequence |
| 6 | should-fix | The rejected alternative and the chosen surface were both named `ctx.channelWeixin`, and who may call the chosen one was unstated | The decision's section 1 now states the distinguishing rule: the service is optional, belongs to the provider package, and is read only by that platform's own setup surface; the Consumer and the registry projection never read it |
| 7 | should-fix | The acceptance criterion for multiple accounts was treated as needing two real accounts while the same brief recorded no open blocker | The criterion is evidenced by the two-account composition test. The pending real-account round trip is recorded as an acceptance item in this work item's verification record; it is acceptance evidence rather than an implementation blocker, so the readiness record still claims none |
| 8 | note | The readiness bullet named sections 1, 8 and 10 while the revision also covered 12 | Fixed: the trigger evidence and the decision's Authority note name 1, 8, 10 and 12 |
| 9 | note | The service was said to inject `channels` and `credentials`, but each account's poll needs the Consumer's `resumeCursors` | Fixed: the brief lists `channels`, `credentials`, and `channelSession` |

Every finding was resolved in the artifacts rather than argued away, and no product scope changed.

## Pass 2 — the artifacts after the resolutions, 2026-09-20

Reviewed: the brief, the decision's Authority note and sections 1, 8, 10 and 12, and the implementation plan, after every resolution from pass 1 landed.

Reviewer: a second independent agent, again a separate instance from the author, read-only and bounded to those artifacts plus `packages/credentials/credentials/src/index.ts`, `packages/channel/channel/src/types.ts`, and `packages/channel/channel-weixin/src/index.ts`.

Result: **`changes-required`**, from five findings.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 10 | should-fix | A re-scan of an already-registered account was described as replacing its grant in place, but the registry refuses a second provider under one identity and a fresh provider would meet its predecessor's account-scoped lock | The brief, the decision's section 10, and the plan now state the ordered handover: stop that account's poll, release its lock, dispose its registration, and register the new provider carrying the new bot identity as its display name |
| 11 | should-fix | The acceptance criterion for adding an account still read the scan's bot as the registration's identity | Reworded: the account registers under the identity derived from the scanning WeChat account and carries the bot identity as its display name |
| 12 | note | The stale rule counted only configured bounds, while the poll adopted the platform's suggested long-poll timeout without a bound, so a live holder could exceed the computed worst case | The poll now honours a suggested timeout only up to the configured bound; the decision's section 8 and the brief's durable-state notes state it, which keeps the worst case computable from the composition alone |
| 13 | note | Enumeration kept every in-scope record, so a key from the replaced single-identity layout would register as an account | Enumeration admits the `account-<slug>` id shape only; the replaced layout's key is not an account, is not admitted, and is left untouched rather than deleted |
| 14 | note | The collision rule is undecidable when a stored payload is unreadable, because the raw identity cannot be read | Stated as fail-closed: a new grant for that slug is refused, with the recovery being to disconnect the unreadable account first |

## Pass 3 — the artifacts after the second round of resolutions, 2026-09-20

Dispatched: a third independent agent, again a separate instance from the author, read-only and bounded to the same artifacts, asked to verify findings 10 to 14 only.

Result: **`approved`**. The reviewer read all six files, confirmed each of findings 10 to 14 as resolved in the brief, the decision's sections, and the plan, confirmed the handover's consistency with the registry's duplicate-identity rule and the account-scoped lock, and treated `poll.ts`'s current unbounded adoption of the platform's suggested timeout as the pre-change state the plan's evidence covers rather than an artifact defect. No remaining problem was found.

Verification this approves: the artifacts at the revision recorded in `docs/decisions/0001-remote-channel-connections.i18n.yaml` and `docs/work-items/20260920-wechat-account-ownership/{brief,implementation-plan,technical-review}.i18n.yaml`. A review covers the revision it names and no later one.