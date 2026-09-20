# Implementation plan: WeChat account ownership and multiple identities

English | [中文](implementation-plan.zh.md)

- Work item: `20260920-wechat-account-ownership`
- Slice: `packages/channel/channel-weixin`
- Gate: `implementation-ready` (after the independent review of the revised decision)

The durable contracts live in the [decision record](../../decisions/0001-remote-channel-connections.md) and the acceptance criteria in [the brief](brief.md). This document adds the file-level shape, the order of work, and the evidence the slice owes.

## Slice boundary

In scope:

- The per-account identity `weixin:<slug>` and the durable keys derived from it.
- The plugin-local service that owns the account set, the login sequence, and the registrations.
- Startup enumeration and restore, disconnect, and the two eviction diagnostics.
- The package README pair, the decision revision, and the regenerated catalogs.

Out of scope:

- The client settings section (slice M3 of the parent work item consumes the surface this slice exposes).
- Feishu, conversation commands, the permission relay, media, and group conversations.

## Package shape

`channel-weixin` becomes a service package: the default export is the service class, injected as `ctx.channelWeixin`, and it registers one provider per connected account.

| File | Role |
|---|---|
| `src/index.ts` | The service: the account set, `accounts()`, `beginLogin()`, `cancelLogin()`, `disconnect(identity)`, and the registrations |
| `src/provider.ts` | One account's provider: `attach`, the connection lifecycle, the send path, the connection state and its diagnostics |
| `src/accounts.ts` | The slug derived from a scan's `ilink_user_id`, the credential key and lock-file name derived from it, the slug-collision check, and the enumeration of stored accounts |
| `src/login.ts` | The QR sequence: fetch, status polling, refresh, the grant it yields |
| `src/lock.ts`, `src/poll.ts`, `src/send.ts`, `src/normalize.ts`, `src/abort.ts`, `src/transport.ts` | Unchanged mechanics, parameterized by the account wherever they touch platform state |
| `src/types.ts` | Types, and the declaration of the service's login announcement on the Cordis `Events` interface |

## Durable state

One account's state, and no other account's:

- The credential record `channel-weixin/account-<slug>`, holding the login grant the scan produced.
- The token-lock file `weixin-<slug>.lock` in the configured lock directory.
- The conversation bindings, authorized senders, cursors, and delivery records the Consumer keeps under the identity `weixin:<slug>`.

The package creates no storage domain of its own, exactly as before.

## Sequences

**Add an account.** `beginLogin()` fetches one QR and announces its state; the platform's answers drive scanned, confirmed, expired-and-refreshed, or failed. A confirmed scan yields the bot it created (`ilink_bot_id`) and the scanning WeChat account (`ilink_user_id`); the account is keyed on the second, so a re-scan of the same WeChat account replaces its grant under the same identity and a grant whose slug collides with another account's raw identity is refused with a diagnostic instead of overwriting that record. For an account that is already registered, the replacement is an ordered handover — stop that account's poll, release its lock, dispose its registration, register the new provider with the new bot identity as its display name — because the registry refuses a second provider under one identity and a new provider must not meet its predecessor's lock. A confirmed, non-colliding scan of a new account writes the grant under the account's key, registers the provider, and starts its poll. A second `beginLogin()` replaces any sequence still live; `cancelLogin()` abandons the live one without touching the account set.

**Restore.** At service init the enumeration reads this package's `account-<slug>` records, parses each payload, and registers every account it can read; a record inside this package's scope whose payload cannot be parsed still registers, as `unavailable` with the unreadable-login diagnostic, because dropping it silently would hide a referent the user still has on the platform. A key from the replaced single-identity layout is not an account, is not admitted, and is left untouched.

**Eviction.** The poll reports `expired` when the platform takes the session, and a send that fails with the same code drives the same state. The provider records whether this account completed a poll cycle while holding this record: after that point the diagnostic names a session taken away while DSH was connected; before it the diagnostic names a stored session that was already unusable. Either way the account stays registered, stops polling, and waits for the user.

**Disconnect.** Stops that account's poll, releases its lock, deletes its credential record, and unregisters its provider. The platform session is not released, and the card says so.

## Configuration

No field is added. The composition keeps stating the per-account bounds it already states, and the account set is runtime state rather than configuration.

## Evidence this slice owes

- Unit specs per module with per-file 100% coverage over `src`: slug and key derivation from `ilink_user_id`, the slug-collision refusal including the unreadable-payload default, enumeration and parsing across the `account-<slug>` shape (including the unreadable payload restoring as `unavailable` and the replaced layout's key not being admitted), the service's account set and its three operations, the re-scan handover order, the provider's attach and both eviction diagnostics, a send-time `-14` driving the same state, the platform-suggested poll timeout clamped to the configured bound, the worst-case-cycle stale threshold, and the send path.
- A real-composition test through the Loader with two accounts: both register, one inbound per account admits a Session under its own identity, each reply leaves through its own account's provider, and disconnecting one leaves the other connected.
- The README pair, the regenerated catalogs, and `pnpm run doc-sync`.
- One real two-account round trip, with the owner, once a second WeChat account exists; it stays open until then.

## Order of work

1. `accounts.ts` and its spec.
2. Extract `provider.ts` from `index.ts`, preserving behavior, and move the existing specs onto it.
3. The service: account set, `beginLogin`, `cancelLogin`, `disconnect`, the login announcement.
4. The two-account Loader composition spec.
5. The README pair, the catalogs, `doc-sync`, and the commit.

## Risks in this slice

- **The package's export form changes**, so every existing spec moves with it in one change; there is no half-converted state.
- **Two accounts share the process's timers and transports but no state.** A defect that leaks one account's grant into another's provider is the failure this slice's isolation evidence exists to catch.
- **The second real account is the owner's to provide.** Until then the multi-account evidence is the composition test, and the acceptance criterion for two real accounts stays open.