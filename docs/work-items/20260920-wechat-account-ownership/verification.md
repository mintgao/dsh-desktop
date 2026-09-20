# Verification: WeChat account ownership and multiple identities

English | [中文](verification.zh.md)

## Acceptance evidence

| Criterion | Evidence | Result |
|---|---|---|
| AC-1 | Two-account Loader composition test: both accounts register, one inbound per account admits a Session under its own identity, each reply leaves through its own provider | Pending |
| AC-2 | Per-account isolation spec: disconnect one account and assert the other's record, lock, cursor, and bindings are untouched | Pending |
| AC-3 | Restore spec: stored accounts register at startup without a scan; a record whose payload cannot be parsed registers `unavailable` | Pending |
| AC-4 | The service's login spec: one scan registers the account under the identity the grant carries | Pending |
| AC-5 | Eviction specs: a `-14` after a completed cycle and one before it produce different diagnostics; a send-time `-14` drives the same state | Pending |
| AC-6 | Absence evidence: no re-scan, reconnect, or second-poller path exists in the provider, asserted at the state it reports | Pending |
| AC-7 | The package README pair states the platform rule | Pending |

## Automated checks

| Check | Result | Notes |
|---|---|---|
| Focused coverage over `packages/channel/channel-weixin/src` | Not run | Per-file 100% expected |
| Project verification | Not run | Owned by the independent QA lane after implementation |
| `pnpm run doc-sync` | Not run | Runs with the documentation artifacts |

## Manual scenarios

- **Two real WeChat accounts, with the owner.** Connect two accounts, send one direct message to each, observe each reply returning through its own account, then disconnect one and observe the other stay connected. Not run: the owner has no second WeChat account yet. This is an acceptance item on this record — it is not an implementation blocker, and its evidence is the only thing AC-1's real-account leg still lacks.

## Limitations and follow-ups

- The real-account round trip above cannot be produced in CI and needs the owner's second WeChat account.
- The client settings section (slice M3 of the parent work item) consumes this slice's surface; no client code is verified here.