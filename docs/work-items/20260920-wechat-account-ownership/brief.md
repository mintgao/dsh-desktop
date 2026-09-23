# WeChat account ownership and multiple identities

English | [中文](brief.zh.md)

- ID: `20260920-wechat-account-ownership`
- Size: `M`
- Status: shaping
- Created: 2026-09-20

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: the work changes a durable ownership model and its identity keys — the channel identity each connection registers, the credential-record and token-lock keys that hold one account's platform state, the login surface that creates an account, and the recovery semantics of an account the platform takes away; the platform's one-connection rule becomes a contract stated to the user. The governing decision's sections 1, 8, 10 and 12 were revised for it on 2026-09-20
- Decision owner: Tech Lead `wechat_account_ownership`
- Governing decision: `docs/decisions/0001-remote-channel-connections.md`
- No-new-decision rationale: none
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: `docs/work-items/20260920-wechat-account-ownership/technical-review.md`
- Material product decisions: resolved by the product owner on 2026-09-20 — one composition may serve several WeChat accounts at once; two clients on one WeChat account stays out of reach because the platform exposes a single bot entry, so the product states the exclusivity instead of working around it; connecting takes the account over, and the client says so before the scan; an account's card identity is the platform's own bot identity, with no rename capability
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-20T15:39:21Z
- Confirmation basis: the orchestrator checked the accepted governing decision `docs/decisions/0001-remote-channel-connections.md` at its 2026-09-20 revision, the three review passes recorded in `docs/work-items/20260920-wechat-account-ownership/technical-review.md` — two `changes-required` passes whose fourteen findings were resolved in the artifacts and a third pass that approved findings 10 to 14 as resolved with no remaining problem — the resolved material product decisions in this brief, and `Open blockers: none`
- Readiness history: 2026-09-20 the orchestrator ran the trigger scan after a real platform round trip (one owner scan, one direct message, one reply) and found the durable identity, ownership, and recovery triggers; the record started `decision-required + blocked` with no application code edited — the round-trip harness lives under the gitignored `tmp/` tree and is not part of the delivery; the same day the Tech Lead perspective `wechat_account_ownership` revised `docs/decisions/0001-remote-channel-connections.md` sections 1, 8, 10 and 12, which moved the outcome to `decision-accepted`; three independent review passes followed — nine findings, then five, then approval — and the orchestrator confirmed `implementation-ready` at 2026-09-20T15:39:21Z

## Goal

One DSH Desktop Mint composition serves several WeChat accounts at once, and the platform's one-connection-per-account rule becomes an explicit, reversible ownership choice rather than a silent takeover. A user who connects a WeChat account to DSH sees, before scanning, that doing so disconnects any other assistant on that account; a user whose account is taken away sees which account it was, that the platform took it, and the one action that takes it back. A second account is added the same way as the first, and each account keeps its own conversations, Session bindings, and reply path.

## Context

The parent work item [20260919-remote-channel-connections](../20260919-remote-channel-connections/brief.md) owns the channel seam, its acceptance criteria AC-1..AC-11, and the M1/M2 slices that built the Consumer and the WeChat provider. Its brief assumed **one card per platform**, and slice M2 implemented exactly that: one fixed identity `weixin`, one credential record, one token-lock file.

Facts verified on the real platform on 2026-09-20, by a round trip whose harness booted the provider over the real transport and whose scan, message, and reply came from the owner:

- **One WeChat account holds one bot session at a time.** A QR login for an account replaces the session its previous client held: the displaced client's polls and sends both fail with `errcode -14` (`session timeout`), and it cannot recover without a scan of its own. Hermes' gateway, connected to the same account, logged `Session expired; pausing for 10 minutes` five seconds after this provider's scan was confirmed, and its outbound retries failed with the same code.
- **The login entry is the platform's to choose.** This provider requests `ilink/bot/get_bot_qrcode?bot_type=3`; bot types `0`–`9` were probed and every value but `3` answers `ret=2, invalid bot_type`, and the QR it returns points at one liteapp entry. Every client implementing this API therefore scans into the same entry, so the exclusivity is per WeChat account rather than per client implementation, and two clients cannot avoid it by choosing different entries.
- **The WeChat conversation is unchanged.** The same chat carries the bot before and after a takeover; WeChat shows no signal that the connected client changed, so the product is the only place a user can learn it.

Consequences the design must carry: the account, not the platform, is the unit that owns durable state; the identity each connection registers must be stable across restarts; and being disconnected is a state the user must be able to read and reverse.

## Scope

In:

- Several connected WeChat accounts in one composition: one registration, credential record, token lock, poll loop, and conversation-binding set per account.
- A package service that owns the account set and the login sequence, so adding an account no longer depends on a registration existing first.
- Ownership semantics: the takeover stated before the scan, an eviction diagnostic that distinguishes a takeover while connected from a session already gone at startup, and the single recovery action.
- Disconnecting one account: stop its poll, release its lock, remove its credential record, and leave every other account untouched.
- Restoring every stored account at startup, without a scan.
- The revision of the governing decision record and the package documentation pair.

Out:

- Making two clients coexist on one WeChat account. The platform exposes one bot entry, so this is not reachable from this repository; the product states the rule instead.
- The client settings section. Slice M3 of the parent work item owns the page; this slice exposes the reads and announcements it consumes.
- Conversation commands, the permission relay, group conversations, media, and the Feishu provider.
- Any automatic re-scan, reconnect loop, or background attempt to take an account back.

## Acceptance criteria

- [ ] AC-1: One composition serves two or more connected WeChat accounts at once; each registers its own channel identity, and a direct message on either account admits a Session recorded against that account's identity and delivers its reply through that account's provider.
- [ ] AC-2: Every durable value belongs to one account: its credential record, its token-lock file, its poll cursor, and its conversation bindings. Disconnecting one account stops only its poll, releases only its lock, removes only its credential record, and leaves the other account's records unchanged.
- [ ] AC-3: Every stored account is restored at startup without a scan; a stored account whose platform session is gone reports the state that requires a new scan and stays out of the poll.
- [ ] AC-4: Adding an account is one QR scan driven from the Host surface with no configuration-file edit, and the account registers under the identity derived from the scanning WeChat account, carrying the bot identity that scan bound as its display name.
- [ ] AC-5: An account the platform takes away while it is connected reports a diagnostic that names the takeover and the one recovery action, and that state is distinguishable from a stored session that was already gone when the process started.
- [ ] AC-6: Nothing in the composition takes an account back on its own: no automatic re-scan, no reconnect loop against a session the platform has taken, and no second poller for one account.
- [ ] AC-7: The package documentation states the platform rule for users: one WeChat account serves one client at a time, connecting takes the account over, the displaced client needs a new scan, and WeChat itself shows no signal.

## Design and technical notes

### Identity

An account's identity is the WeChat account, not the bot the platform issues for it. A confirmed scan returns both: `ilink_bot_id` names the bot that scan created, and `ilink_user_id` names the WeChat account that scanned. Every scan mints a fresh bot, so the bot identity is the account's display fact, never its key; the account keys on its user identity. It registers `ChannelId('weixin:<slug>')`, its credential record is `channel-weixin/account-<slug>`, and its token lock is `weixin-<slug>.lock`, where `<slug>` lowers that user identity and replaces every character outside `[a-z0-9]` with `-`, satisfying the identity grammar both the registry and the credential service enforce.

Because the identity comes from the platform's own value it survives restarts, so the conversation bindings, authorized senders, and cursors recorded against it stay attached to the right account. The transform is lossy — two different identities can lower to one slug — so each record keeps the raw user identity beside its slug, and registering an account whose slug another account already holds with a different raw identity is refused with a diagnostic instead of overwriting that record.

A re-scan of the same WeChat account therefore replaces its grant in place under the same identity: the same account, a new bot, a new session. Because a registration's identity is stable, that replacement is an ordered handover, not a second registration: stop that account's poll, release its lock, dispose its registration, and register a new provider carrying the new bot identity as its display name — the registry refuses a second provider under one identity, and a new provider must not meet its predecessor's lock. When a stored record's payload is unreadable its raw identity is unknown, so a slug collision cannot be judged; a new grant for that slug is refused until the user disconnects the unreadable account, which is the fail-closed reading.

A registration's `displayName` carries the account's current bot identity; the platform label a card shows is the page's to compose, because client copy is locale-owned.

### The account surface

Adding an account cannot be a method of a registered provider, because no registration exists before the scan. `packages/channel/channel-weixin` therefore becomes a service package: it default-exports one service class that owns the account set, the login sequence, and the registrations, and injects `channels`, `credentials`, and `channelSession` — the Consumer's `resumeCursors(identity)` is what each account's poll resumes from.

- `accounts()` — one view per connected account: its registration identity, the platform bot identity, its connection state, and its last transition.
- `beginLogin()` — starts one QR sequence, replacing any sequence already live, and returns that sequence's state.
- `cancelLogin()` — abandons a live sequence; the account set is unchanged.
- `disconnect(identity)` — stops that account's poll, releases its lock, deletes its credential record, and unregisters its provider.

Connection state reaches a subscriber through the registry: each account's provider announces with its registration's `changed()`, and `ctx.channels.onChange` carries that to the controller. The login sequence has no registration, so the service announces it on its own context event, declared by merging into the Cordis `Events` interface the way `credentials/record-updated` is declared in `packages/credentials/credentials/src/types.ts`, with listener failures contained.

### Durable state

- **Credential record per account.** `credentialKey('channel-weixin', 'account-<slug>')`, holding the login grant the scan produced and the raw user identity the slug was derived from. Startup enumerates `listRecords()`, keeps the entries whose scope is this package and whose id matches `account-<slug>`, and reads each payload: a record that parses registers its account and restores its poll; a record that does not parse keeps its record and registers the account as `unavailable`, with the diagnostic that the stored login is unreadable and a new scan is the recovery, because skipping a referent silently is what the repository's fail-loud rule forbids. A key from the replaced single-identity layout is not an account, is not admitted, and is left untouched rather than deleted. The key's id segment satisfies the credential grammar (`^[a-z][a-z0-9-]*$`), which is why the slug carries the `account-` prefix.
- **Token lock per account.** `<lockDirectory>/weixin-<slug>.lock`, so two accounts on one machine never contend for one file and the stale rule keeps its per-account meaning.
- **The stale threshold follows the worst-case cycle.** A lock counts as stale only when its heartbeat is older than the worst-case cycle the configured bounds allow — the poll attempts multiplied by the poll timeout plus the backoffs between them — rather than twice a single poll timeout, because a holder that is retrying inside its own configured bounds must never look dead to a second instance. The poll honours a timeout the platform suggests only up to the configured bound, so that worst case is computable from the composition alone.
- **Bindings and cursors unchanged.** The Consumer already keys them by channel identity, so per-account identities give per-account conversations with no change to `channel-session`.

### Ownership and recovery

- The connect flow states the takeover **before** the QR renders: connecting an account disconnects any other client holding that account, the displaced client needs a scan of its own to come back, and WeChat shows no signal that it happened. The wording is the page's, built from the Host's facts.
- **Distinguishing the two expiries.** The predicate is what this process can observe: whether this account completed a poll cycle while holding this record. An `errcode -14` after that point reports a session taken away while DSH was connected; one before it reports a stored session that was already unusable when DSH started, which a takeover elsewhere may well have caused but is not reported as one. A send that fails with `-14` drives the same state and the same diagnostic, so an account whose replies all fail does not stay reported as connected. The two readings share the one recovery action, and the diagnostic is what tells a user whether they were just displaced or are looking at an account that was already gone.
- **No automatic recovery.** Nothing re-scans, re-polls, or re-registers an account the platform has taken. The state that requires a scan is reported and stays reported until the user acts.
- **Disconnect is honest about the platform.** Removing an account stops DSH's use of it and deletes the stored grant; it does not release the platform session, because the platform releases it only when another login replaces it. The card says so.

### Migration

Nothing is released: slice M2's single-identity layout — one fixed credential key and one fixed lock file — carries no shipped data, so this change replaces that layout instead of migrating it. The governing decision records the replacement, and the package's tests cover the new layout rather than both.

### Configuration

The composition keeps stating the per-account bounds it already states: poll and send attempts with their backoff, the throttle delay, the breaker threshold, the chunk length, and the lock directory. The account set is runtime state, not configuration, so no field is added and no bound is hardcoded.

## Client experience

The page itself is slice M3's; what this slice fixes is the surface and the statements it needs.

- **Connection list.** One card per connected WeChat account instead of one card per platform: the bot identity as the name, the `StateDot`, the workspace and permission-preset summary, the authorized senders, and 断开连接. Adding an account is a separate action on the same section, not a state of an existing card.
- **Setup modal.** Step 2, 确认身份, carries the ownership statement: this identity serves one client at a time, connecting takes the account over, another assistant on this account is disconnected and needs its own scan to return, and WeChat shows no signal that the client changed.
- **Taken-away state.** The card shows the diagnostic and one action, 重新扫码接管; the state persists until the user acts.
- **Disconnect.** The confirmation says DSH stops using the account and forgets its grant, and that the WeChat conversation itself is unaffected.

## Risks and open decisions

- **The exclusivity is a platform rule this repository cannot lift.** If iLink later exposes a second entry, coexistence becomes reachable; the ownership model here still holds, because it treats the account as the unit of ownership rather than assuming one client forever.
- **Two real accounts cannot be exercised without a second WeChat account.** The owner provides one later; until then, multi-account behavior is proven with scripted transports, and per-account isolation is proven through the real composition test. The pending real-account evidence is recorded as an acceptance item in this work item's verification record; it does not gate implementation, and AC-1 is evidenced by the composition test.
- **Enumeration reads records belonging to other packages.** The provider filters by its own scope; a record inside its own scope whose payload cannot be parsed is reported as an `unavailable` account with its recovery action, never dropped.
- **Slice M3 may reshape the surface.** If the page needs a different projection, these reads are the ones to revisit; no client code is built here.