# Verification: WeChat account ownership and multiple identities

English | [中文](verification.zh.md)

## Acceptance evidence

| Criterion | Evidence | Result |
|---|---|---|
| AC-1 | Two-account Loader composition test: both accounts register, one inbound per account admits a Session under its own identity, each reply leaves through its own provider | Partial — the single-account Loader composition proves registration, admission, and the reply leaving through the account's own provider; the two-account composition is unwritten and the real-account leg is open, recorded under Manual scenarios |
| AC-2 | Per-account isolation spec: disconnect one account and assert the other's record, lock, cursor, and bindings are untouched | Proven — `tests/service.spec.ts`: "unregisters one account, deletes its record, and leaves the others registered", and "refuses an identity that is not a WeChat account and forgets a slug it never registered" |
| AC-3 | Restore spec: stored accounts register at startup without a scan; a record whose payload cannot be parsed registers `unavailable` | Proven — `tests/service.spec.ts`: "registers a provider per readable record and an unavailable account for a record it cannot read" |
| AC-4 | The service's login spec: one scan registers the account under the identity the grant carries | Proven — `tests/service.spec.ts`: "announces every state of a confirmed scan and stores its grant under the account key" |
| AC-5 | Eviction specs: a `-14` after a completed cycle and one before it produce different diagnostics; a send-time `-14` drives the same state | Proven — `tests/provider.spec.ts`: the taken-away, already-unusable-at-start, and send-time eviction specs, each asserting the state it reports |
| AC-6 | Absence evidence: no re-scan, reconnect, or second-poller path exists in the provider, asserted at the state it reports | Proven — `tests/provider.spec.ts`: an account without a readable login never polls, refuses to send, and reports `unavailable` while another client holds the token |
| AC-7 | The package README pair states the platform rule | Proven — both README sides state the one-bot-session-per-account rule, the displaced client's `errcode -14` on polls and sends, and the platform's missing signal |

## Automated checks

| Check | Result | Notes |
|---|---|---|
| Focused coverage over `packages/channel/channel-weixin/src` | 100% per file | 11 files and 135 tests passing; 519/519 statements, 338/338 branches, 98/98 functions, 445/445 lines, read per file from the `json-summary` reporter |
| Project verification | Not run | Owned by the independent QA lane after implementation; the package suite above is what ran with this slice |
| `pnpm run doc-sync` | Passed | 34 gates, 0 failed, including the documentation standard tests and every generated catalog |

## Manual scenarios

- **Two real WeChat accounts, with the owner.** Connect two accounts, send one direct message to each, observe each reply returning through its own account, then disconnect one and observe the other stay connected. Not run: the owner has no second WeChat account yet. This is an acceptance item on this record — it is not an implementation blocker, and its evidence is the only thing AC-1's real-account leg still lacks.

## Limitations and follow-ups

- The real-account round trip above cannot be produced in CI and needs the owner's second WeChat account.
- The two-account Loader composition leg of AC-1 is unwritten: the composition spec covers one account end to end, and every per-account behaviour it would multiply is proven at the service and provider level instead.
- The client settings section (slice M3 of the parent work item) consumes this slice's surface; no client code is verified here.