# Reviewed unsigned desktop delivery

English | [中文](20260908-desktop-reviewed-delivery.zh.md)

Status: Accepted

- Decision owner: Tech Lead `distribution_design`
- Work item: [Reviewed delivery implementation](../work-items/20260908-desktop-reviewed-delivery/brief.md), RD-1–RD-6
- Review: independent Tech Lead `distribution_review` approved the exact amended decision on 2026-09-08

## Authority and executable scope

Implement ordinary adoption, unsigned native qualification and explicitly approved publication through `desktop:delivery`. The [delivery design](20260908-desktop-update-delivery.md#owner-confirmation) records the owner's resolved GitHub-protection trust choice; the [downstream policy](../context/downstream-policy.md) governs reuse. Administrators are the trust root. Existing production controls remain active until verified cutover. No custom App, renewable policy receipt, queue controller or mutable state ref is introduced. Signed mode rejects with `signed-mode-unconfigured`; shadow reports remain non-publishable.

Extend `scripts/desktop-delivery/` with cohesive adoption, production-manifest, GitHub-operation and migration modules. Keep distribution values in `.github/desktop-delivery/mint.json`. Add three manual workflows: `desktop-delivery-adopt.yml`, `desktop-delivery-qualify.yml` and `desktop-delivery-mutate.yml`. CLI and workflows use the same implementation; tests inject GitHub transport and use temporary Git repositories and artifact fixtures.

Commands are `adoption-plan`, `adoption-prepare`, `adoption-apply`, `release-manifest`, `promotion-plan`, `prepare-publication`, `promote`, `withdraw`, `restore` and `migration-preflight`. Remote writes require explicit `--apply` and the reviewed operation-plan digest. Default invocations produce local plans. Release mutations require activated workflow context; the local maintainer operation prepares an exact tag and draft only, never publishes.

## Adoption and review identity

Ordered discovery selects the immediate next upstream identity from the complete observation set and committed source lock. The adoption plan binds that identity, exact downstream base, proposed branch and desktop version; an existing adoption PR is reported instead of duplicated.

Preparation creates an isolated checkout and merges the exact upstream commit into the exact downstream base without executing candidate hooks or scripts with write credentials. Conflicts retain the checkout and produce a report; there is no automatic conflict resolution or skipping. After reviewed resolution, credential-free version/dependency checks produce an isolated seed commit and a separate proposed source-lock update. The upstream parent must remain in merge history; adoption PRs must not squash or rebase it away. Desktop unsigned-preview version mapping is explicit metadata rather than a workspace-wide version rewrite.

The local maintainer pushes only the exact seed branch, including any workflow-file changes, with their existing authenticated session. It does not create the PR. `desktop-delivery-adopt.yml` runs trusted tools from protected `main`, verifies the seed SHA, ancestry, predecessor and proposed lock, and creates one substantive source-lock commit with the seed as its sole parent. It updates the branch without force and creates the PR using `GITHUB_TOKEN`. Remote movement or a human-modified branch blocks. Candidate code never executes with the write token.

The bot is both PR author and last pusher, so the owner can provide the required review without weakening protection. Further human changes require a verified substantive lock finalization; dummy commits cannot manufacture approval eligibility. Activation requires enabling Actions PR creation with default token permissions still read-only. Only the adoption write job requests `contents: write` and `pull-requests: write`; it never approves or merges. The owner may need to approve bot-created PR checks. A workflow-permission failure blocks instead of substituting the owner's identity. [GitHub token behavior](https://docs.github.com/en/actions/concepts/security/github_token) and [Actions permissions](https://docs.github.com/en/rest/actions/permissions) own platform behavior.

Source-lock schema version 2 adds `adoptionSeed: { commit, tree }`, identifying the existing branch head and tree before finalization, never the commit containing the new lock. The bot requires the remote head to equal that commit, verifies its tree and upstream ancestry, and creates a sole-parent finalization whose diff changes only the source-lock file. Qualification verifies those relationships from Git objects. After a human code fix, a new seed updates this binding while preserving upstream and predecessor identities. A matching already-finalized retry performs no write; other remote movement rejects, with no force. Later human pushes invalidate finalization until the bot verifies the new seed.

The recovery regression covers bot finalization, a human code fix, stale-seed rejection, corrected-seed finalization and owner-review eligibility. Assert parent/tree binding, lock-only diff, unchanged upstream/predecessor and no-write retry. Live acceptance verifies GitHub's actual last pusher and owner review eligibility, not merely commit author text.

## Qualification and final manifest

Qualification dispatches from protected `main`; its `GITHUB_SHA` identifies trusted orchestration tools. The candidate is a separate full commit SHA reachable from protected `main`, clean and consistent with its source lock. Candidate code runs without publication or Apple credentials. Native arm64 and x64 jobs reuse `desktop:stage`, explicit unsigned electron-builder flags, architecture checks, authenticated backend smoke and bounded cleanup. Set desktop version explicitly in package metadata and verify the produced application version separately from the underlying DSH version.

Each native job also copies the read-only mounted application's payload to a temporary installation directory, exercises its packaged bootstrap and authenticated backend, stops it and removes that temporary installation. This tests copying and launching without replacing the user's app. It does not establish full native-window interaction or existing-user-data compatibility.

A distinct schema with `purpose: desktop-release-qualification` binds repository/distribution, `unsigned-preview` mode, desktop version/tag, upstream identity, downstream commit, source-lock digest, component versions, trusted workflow path/commit, run ID/attempt, predecessor tag/manifest or reviewed legacy-baseline digest, architecture-specific DMG names/sizes/digests, candidate/native-evidence digests, release-notes digest and data-compatibility-statement digest. It has no self-digest; approval hashes exact serialized bytes. Aggregation requires both architectures and all evidence. Shadow relabeling, missing/expired artifacts, changed bytes and failed qualification block; new qualification requires new approval.

Release notes and the data-compatibility statement come from the exact candidate. The statement identifies persisted-format changes, migration/restore evidence and unsupported downgrade paths. Missing assessment blocks promotion. Persisted-data changes require the separately reviewed migration evidence required by the governing design; temporary installation smoke cannot substitute for it.

## Approval, preparation and publication

One repository-wide mutation concurrency group, with cancellation disabled, covers promotion, withdrawal and restoration. The workflow accepts operation, manifest digest, qualification run ID/attempt and tag. Its read-only preparation job resolves the exact artifact bundle and displays the plan. The protected environment approval binds those immutable inputs in that run. Trusted tools come from protected `main` at the workflow commit, never the candidate. Dependency installation disables lifecycle scripts; downloaded applications or packages never execute with the write token.

Preserve maintainer-only tag creation and separate no-bypass tag update/deletion protection; remove the legacy App creation bypass at cutover. Do not assume a built-in Actions bypass. While the corresponding mutation workflow holds concurrency and waits for environment approval, local `prepare-publication` verifies its live workflow path, pending approval and plan digest, then creates or reconciles the exact approved immutable tag and empty draft using existing maintainer credentials. The owner then approves that same run. A cancelled/completed run or differing plan blocks preparation. A matching orphan draft can resume only in a new explicitly approved run for the same manifest. [GitHub's release API](https://docs.github.com/en/rest/releases/releases) documents token limits that require this separation for workflow-changing commits.

The approved publisher uses `contents: write`, `actions: read` and release-status `issues: write`; it has no Administration permission, Apple secrets or main-branch bypass. It re-fetches run metadata/artifacts and verifies repository, workflow path/commit, candidate source, successful attempt, complete assets and digests. After acquiring concurrency, it rereads activation, source-lock history, Releases, tags and predecessor evidence. Changed assumptions block.

The publisher only uploads/verifies/publishes an existing matching draft; it never creates a tag or substitutes its target. Missing matching files may be uploaded, including manifest and verification evidence. Conflicting tags, files, notes or identities block without overwrite. Verify the draft, publish as an unsigned prerelease without stable updater metadata, then download and verify public bytes. Public mismatch withdraws the release and records a blocker. An ambiguous write response is reconciled by reading server state before another write. The same manifest can resume an interrupted draft or verify an already-public release without rebuilding; different bytes require a new desktop version.

Withdrawal retains the immutable tag and assets as a draft. Restoration verifies the retained exact bytes before publication. A withdrawn predecessor blocks later delivery until restored or superseded by a separately qualified replacement for the same upstream release. Installed clients are never remotely downgraded.

## Lineage and baseline

Use source-lock Git history and manifest predecessor links, not a completion ledger. Missing or conflicting lineage blocks. The source lock's `predecessor` identifies the previous adopted upstream release; the manifest's `predecessor` identifies the previous desktop delivery. These relationships are not unconditionally equal.

<a id="desktop-delivery-order"></a>

### Upstream order and desktop delivery order

Every manifest declares `releaseKind: upstream | catch-up | desktop | replacement`:

- `upstream`: its upstream identity is the immediate adopted successor of the last verified delivery's upstream identity. The source lock's upstream predecessor matches that previous upstream identity. No intermediate upstream adoption may be skipped.
- `catch-up`: the [catch-up decision](20260910-desktop-catch-up-delivery.md) defines an explicit reviewed interval and direct baseline-to-target qualification; ordinary upstream semantics remain immediate-successor.
- `desktop`: its upstream identity equals the last verified delivery's upstream identity. Preserve the source lock's upstream predecessor; the delivery predecessor is the last verified desktop manifest or reviewed legacy baseline. This permits desktop-only fixes and separately qualified rebuilds without inventing an upstream adoption. Discovery of a newer upstream does not prevent this delivery.
- `replacement`: its upstream identity equals the withdrawn delivery it replaces. Include `supersedes: { tag, manifestDigest }`; its delivery predecessor is the withdrawn delivery's preceding verified delivery. Preserve the source lock's upstream predecessor. Retain the withdrawn manifest unchanged.

A new desktop publication has strictly greater SemVer precedence than every retained previously published desktop version, including withdrawn versions. Build metadata alone is insufficient. Its tag is unused except when resuming the exact same approved manifest. Restoration retains the original version and bytes.

Replacement applies only to a withdrawn delivery with no already-published successors. Withdrawal earlier in the published chain blocks further publication and requires restoration or a separately reviewed chain-recovery plan; replacement cannot discard successors.

### Callable preparation

`adoption-plan` accepts explicit `--kind upstream|desktop|replacement` and a desktop version. Desktop preparation uses the currently delivered upstream identity without merging upstream. Replacement additionally requires the exact withdrawn tag and manifest digest. Both create reviewable seed/source-lock plans without advancing discovery or upstream adoption.

For same-upstream source changes, bot finalization updates `adoptionSeed.commit/tree` while preserving upstream release and upstream predecessor. Qualification verifies the seed-parent/tree relationship. An unchanged-source rebuild may reuse its valid finalization without a dummy commit.

`release-manifest` and `promotion-plan` validate the declared kind against source history and live delivery lineage. A greater desktop version never implies an upstream advance.

Required tests cover successive desktop-only releases, a desktop fix while newer upstream is pending, the genuine next-upstream delivery after those fixes, rejected skipping, same-upstream seed finalization, withdrawn-tip replacement, rejected replacement with published successors, version ordering including withdrawn releases, and exact-manifest retry.

Legacy Releases have no new-format manifest. Migration preflight downloads actual public assets, verifies checksums, tags, upstream/source provenance and release metadata, and produces reviewed `legacy-baseline.json` containing the last completed upstream identity, desktop tag, source commit, retained asset digests and legacy evidence references. Its exact digest anchors new lineage; old Releases are not modified or given invented historical qualification. The baseline also records unresolved adoption; cutover either reconciles that exact candidate or retains it as a blocker.

## Protection and sole-writer activation

Live prerequisites are reviewed `main` with required checks, a release environment restricted to protected `main` with required maintainer reviewers, immutable desktop tags with supported maintainer creation authority, enabled Actions PR creation, verified bot review eligibility, publication-token access to the prepared draft, and absence of legacy mutation authority. Environment branch restriction alone is insufficient. [GitHub environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) own platform semantics.

An initially inactive `activation.json` binds repository ID, baseline digest, migration-report digest, expected protection IDs and workflow paths. A reviewed change enables writers only after live cutover evidence. Runtime reads visible protection fields and fails on missing/mismatched evidence; administrator inspection records fields unavailable to its token. This is administrator attestation, not independent cryptographic policy proof.

Preflight inventories controller, observer, finalizer, validation, policy preflight/bootstrap, publication, withdrawal and retired sync. Before activation, disable all legacy entry points and schedules through GitHub, drain/cancel queued and running jobs, and revoke App installations/credentials and outstanding authority. The old withdrawal workflow has its own `github.token` authority. Secret deletion or a boolean alone is insufficient. Record disabled workflows, completed/cancelled jobs, revoked identities, protections and baseline; prove delayed callbacks cannot mutate. Missing evidence leaves activation blocked. Retain legacy state and receipts as historical evidence.

Rollback disables replacement writers first. Restoring legacy machinery requires valid prerequisites and reconciliation of every replacement publication. Competing publishers are prohibited.

### Administrator preflight and runtime checks

`migration-preflight` validates all required settings using the maintainer's authenticated session. `requireActivation` verifies the accepted report and refreshes checks available to its declared runtime token; it does not rerun administrator preflight with `GITHUB_TOKEN`.

Trusted code fixes the administrator-only allowlist: the Actions-permissions endpoint's `default_workflow_permissions` and `can_approve_pull_request_reviews`; omitted `bypass_actors` for exact configured ruleset IDs; and the already-defined legacy revocation and live acceptance evidence. Configuration and runtime errors cannot expand it. GitHub documents [Administration read for Actions settings](https://docs.github.com/en/rest/actions/permissions#get-default-workflow-permissions-for-a-repository) and [restricted bypass visibility](https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset).

Each attestation records its fixed check identifier, repository ID, resource ID or endpoint, observation time, administrator identity, validated values and evidence digest. Ruleset attestations also bind runtime-visible fields, including `updated_at`. The digest-bound report retains underlying non-secret evidence. Activation binds the entire report and distribution configuration; callers cannot substitute an independent administrator-evidence object.

Administrator preflight must retrieve Actions settings and complete ruleset bypass information successfully. Failed administrator reads cannot be replaced with claimed values.

Runtime validates activation, report/configuration digests and required attestation identities and values. It does not call the administrator-only Actions-permissions endpoint. It fetches fresh repository identity, visible ruleset fields, release environment protections and complete legacy workflow/run inventories.

Present `bypass_actors` must pass validation and match the attestation. An omitted property can use the attested value only if the exact ruleset identity and bound visible fields still match. Missing never means an empty list. Mismatch, incomplete response, unexpected omission, 403, 404 or exhausted network failures on required runtime reads block mutation; generic permission errors cannot authorize fallback.

Every runtime-checking workflow job explicitly receives `actions: read`, including notifier and adoption finalizer, without Administration access. Environment and protection reads remain required; inability to read them is a live blocker. Known administrator-only changes require a refreshed report and reviewed activation binding. Runtime does not claim continuous detection of fields it cannot read under the accepted administrator trust model.

Tests cover failed administrator reads, no runtime Actions-permissions request, missing or altered attestations, omitted bypass data with exact matching evidence, visible ruleset drift, conflicting exposed bypass data and required-read failures. A valid runtime fixture succeeds without Administration permission.

## Initial workflow bootstrap

Normal adoption requires its workflow on protected `main`. A one-time mode in the already registered `desktop-ci.yml` permits installation from an immutable, independently reviewed implementation snapshot. This is an explicit exception to trusted tools coming from protected `main`; routine adoption cannot use it.

The maintainer reviews the exact seed, workflow diff and source-lock finalizer. A dedicated non-release bootstrap tag prefix has update/deletion protection before the tag is created. A secret-free bootstrap environment requires owner approval. The owner dispatches the existing workflow at the immutable tag and verifies repository, workflow path and run head SHA before approving. This is explicit owner authorization, not independent code review.

Bootstrap skips ordinary candidate execution. Its job uses only `contents: write` and `pull-requests: write`. It verifies repository ID, immutable tag, seed/tree, expected default-branch baseline and absence of the normal adoption workflow on `main`. The implementation branch must be absent, at the seed or at the matching finalization; competing branches or PRs block. The sole-parent finalization changes only the source lock and binds `adoptionSeed` substantively. It updates without force and creates a bot-authored PR, with interrupted-write reconciliation and no-write retry.

Bootstrap cannot merge, publish, change protections or credentials, dispatch workflows or edit arbitrary files. Only the dedicated nonpublic draft-access probe below may edit its exact probe Release and asset. Once the normal adoption workflow exists on `main`, bootstrap refuses further execution. The owner reviews and merges through required checks and review protection.

When the configured source-lock path is absent from the exact protected-main bootstrap base, bootstrap uses `baseLock: { state: "absent", baseCommit, path }` and `seedLockDigest`, the SHA-256 of lock bytes in the reviewed immutable seed. It proves absence from that base's Git tree; an API error or unavailable object is not absence. An existing file requires normal previous-lock validation.

Bootstrap verifies seed commit/tree, expected protected-main base, configured lock path, seed-lock digest, supported schema and distribution/upstream identity. The upstream commit is an ancestor of the seed. The seed lock matches explicitly referenced existing adoption evidence, such as pinned legacy adoption state and adopted upstream commit, rather than a guessed version or invented baseline. This establishes source identity only; it does not prove completed publication or replace production migration-baseline verification.

The bot produces a schema-2 lock preserving the reviewed seed lock's upstream release, predecessor and observations, with `adoptionSeed` bound to seed commit/tree. Its sole-parent finalization changes only the configured lock file. Schema conversion or seed binding must change the bytes substantively; otherwise return an existing exact finalization or block rather than creating a dummy commit.

This absent-base-lock exception is limited to approved initial bootstrap while the normal adoption workflow remains absent from protected `main`. Routine adoption still requires the existing base lock and digest. Missing or inconsistent legacy adoption evidence blocks bootstrap. Tests distinguish actual tree absence from lookup failure and cover existing locks, changed seed bytes, mismatched legacy identity, unsupported schemas, upstream ancestry, schema conversion, lock-only finalization and routine-adoption rejection of this exception.

Tests cover mismatched refs, changed default baseline, an installed finalizer, unexpected lock changes, competing branches or PRs, interrupted finalization and matching retry. Live acceptance verifies tag protection, environment approval, actual bot PR/last-pusher identity and owner-review eligibility. Missing prerequisites remain rollout blockers; this decision does not itself authorize remote changes.

### Bootstrap ruleset visibility

The reviewed immutable seed retains `.github/desktop-delivery/bootstrap-protection.json`: schema version 1, purpose `desktop-bootstrap-protection`, repository and configured ruleset IDs, observation time, administrator numeric ID, empty `bypassActors`, observed ruleset projection and digest, and the repository-relative path and digest of retained administrator response evidence. Preparation requires a successful administrator response with explicit empty `bypass_actors`; omitted, malformed or nonempty values cannot produce evidence. Credentials are never retained.

The projection contains exactly `id`, `source`, `source_type`, `target`, `enforcement`, `conditions`, `rules` and `updated_at`. Canonical JSON recursively sorts object keys and preserves array order. Requester-dependent and presentation fields are excluded. The operation plan binds the attestation-file digest; runtime verifies the exact seed-owned bytes, schema, repository, configured ruleset, administrator and retained response evidence. The attestation omits its enclosing seed SHA to avoid self-reference; the approved plan and workflow bind the seed.

Bootstrap fetches the ruleset successfully and requires complete fresh visible fields matching the projection, including `updated_at`. It independently enforces active tag update/deletion protection over the configured prefix without exclusions. Present `bypass_actors` must be an explicit empty array matching the attestation. Only complete omission may use the attested value. Null or malformed data, missing visible fields, changed projection, 403 or network failure blocks without fallback.

This exception applies only to the configured bootstrap ruleset's hidden bypass field. Environment approval, immutable tag resolution and exact run/seed checks remain live requirements. Tests cover omitted and present empty bypass, nonempty/null bypass, changed timestamp/rules/scope, missing fields, wrong repository/ruleset/admin, changed evidence bytes, read failures and attempted reuse for another ruleset or environment.

### Ruleset timestamp representation

Only projection `updated_at` is normalized to UTC before digesting or comparison. Accept a valid RFC 3339 calendar timestamp with an explicit offset or `Z` and zero to three fractional-second digits. Pad to milliseconds without rounding or truncation. Validate calendar and offset components; reject invalid dates, leap seconds, unknown-offset `-00:00`, malformed offsets and greater precision. Canonical output is `YYYY-MM-DDTHH:mm:ss.sssZ`; all other projection fields keep exact comparison.

Raw administrator-response bytes and their evidence digest remain unchanged. Bootstrap and migration administrator/runtime projections use the same normalization. Regenerate and rebind derived projection digests; mismatches never trigger a legacy fallback. Tests cover observed `+08:00`/`Z` equivalence, fractional padding, offset date crossing, one-millisecond changes, invalid inputs and precision, other-field changes and unchanged raw evidence bytes.

### Initial activation ordering and draft-access probe

Keep the initial bot PR open until its migration evidence is complete. Verify actual bot authorship, last pusher and owner-review eligibility; complete the bounded draft-access probe; preserve and explicitly reconcile the legacy candidate; disable and drain legacy writers; revoke outstanding authority; then capture final administrator preflight and the real publication baseline. Any subsequent protection or legacy-state change requires refreshed evidence.

A new immutable bootstrap seed places the final report, baseline and `activation.active: true` with matching digests in the same initial PR. Bot finalization invalidates earlier approval; the owner reviews the final head under ordinary protections. The first merge brings normal workflows and verified activation together, after which bootstrap refuses execution. Incomplete evidence keeps this PR open; merging an inactive intermediate version would prevent the normal bot from preparing its activation PR.

A dedicated bootstrap probe is the sole exception to bootstrap's release-operation prohibition. The maintainer creates a draft prerelease at the exact immutable bootstrap tag using existing credentials. Its reviewed plan binds repository ID, draft Release ID, tag and target commit. A separate owner-approved bootstrap job uses ordinary `GITHUB_TOKEN` with the publication permission declarations and trusted code from the reviewed immutable snapshot.

The probe requires the exact Release ID, tag and target with `draft: true`. It uploads a uniquely named harmless fixed-content asset, retrieves and hashes it, then removes only that asset. It exercises a probe-only body edit and restores the original body. Every edit preserves `draft: true`; neither publication nor retargeting is available. Conflicting identities or bytes block without overwrite. Interrupted execution resumes only against the same identity and expected bytes.

The result records workflow path, immutable head SHA, run/attempt, declared token permissions, Release ID and completed operation evidence. `preparedDraftTokenAccessVerified` derives from this successful result, not a GET alone. The maintainer may remove the probe draft after acceptance; the protected bootstrap tag remains evidence. Tests reject public Releases, wrong IDs/tags/commits, publish or retarget attempts, changed bytes and incomplete cleanup. This proves draft operations only, not production execution, native qualification or publication.

## Notifications and acceptance

The bot-created adoption PR supplies ordinary GitHub notification. Mutation outcomes maintain one release-specific status Issue with candidate/evidence fingerprint, blocker and next action; identical content is not edited. Job summaries remain available. Live GitHub/email receipt is verified during authorized rollout, not inferred from generated Markdown. Reads allow three bounded attempts for transient errors; deterministic blockers and exhaustion stop. No scheduled mutation retries are introduced.

Tests cover real CLI preparation and bot lock finalization, source conflicts and movement, workflow-changing adoption, two configurations, shadow rejection, incomplete architectures, stale approvals, interrupted/ambiguous writes, absent reviewers, unauthorized tag creation, cancelled preparation, exact-draft publication, lineage gaps, withdrawal/restore and delayed legacy jobs. Independent QA owns the unchanged candidate's default checks. Implementation produces real preparation payloads, unsigned candidates, fixture-backed recovery and exact live activation blockers; public release creation requires approval of that specific operation, and signed releases remain blocked.

## Automatic discovery and maintainer notification

Add a fourth workflow, `desktop-delivery-discover.yml`, with an hourly schedule and manual dispatch. Scheduled execution is best-effort, not a delivery-time guarantee. Adoption, qualification and publication remain explicitly initiated; discovery never dispatches them.

A read-only job executes complete ordered discovery against protected `main`, configuration and committed source lock. It identifies the immediate next release or a discovery blocker. Later queued releases do not bypass or repeatedly notify for the same pending predecessor.

A separate notification job has only `contents: read` and `issues: write`. Trusted tools from the workflow commit validate discovery and create or comment on one dedicated Issue per distribution. Candidate code and upstream prose never execute with its token. Activation and completed legacy sole-writer cutover are required. Under a distribution-specific notification concurrency group, reread activation and verify the checked-out default-branch revision is still current; stale results stop. Inactive operation produces a workflow summary only.

The dedicated Issue uses a stable title. Its body or bot comment identifies the next release or blocker, concise evidence, run link and action: bring the candidate to the Agent for preparation and confirmation. It never calls an upstream release an installable desktop update. Issue content is notification history, never adoption or publication authority.

A semantic fingerprint binds distribution, outcome, immediate next release identity, source-lock digest and stable blocker category/resource. It excludes timestamps, run IDs, transient diagnostic wording and later releases. Under concurrency, compare the most recent authoritative bot notice. Identical state creates, edits, comments and reopens nothing. Changed state appends one notice, creating the Issue if absent. An ambiguous write is reread and reconciled before retrying. Manual closure remains closed for unchanged state; changed actionable state may reopen and append one notice.

Reads retain three bounded attempts. Exhaustion emits one stable blocker notice if notification is available, otherwise a workflow summary. Subsequent schedules may retry only discovery reads, never blocked adoption or release mutations. Recovery produces one changed-state notice. GitHub subscriptions and email settings control delivery; activation acceptance verifies actual receipt. Local implementation sends no notification.

Wire `notification-plan` and notification apply through the shared GitHub transport, validation and Markdown rendering. Activated automated notification is the narrow exception to per-operation manual approval: it cannot invoke another writer. Tests cover scheduled invocation, inactive summaries, ordering, unchanged-state no-write across runs, later-release suppression, blocker/recovery notices, ambiguous-write reconciliation, stale checkout, concurrent deduplication, manual closure, exhausted reads, two configurations and absence of source/release mutation permissions or dispatches. Live rollout separately proves receipt and legacy notifier exclusion.

Authoritative notices require the configured immutable GitHub Actions user ID and API `type: Bot`; login text, titles and Markdown are not identity proof. Activation records the verified bot ID. Initial Issue bodies carry a validated `schemaVersion: 1`, `kind: desktop-discovery-notice`, repository ID, distribution ID, outcome, normalized discovery state and recomputed semantic fingerprint. Comment markers additionally bind the enclosing numeric Issue ID. Unknown schemas and inconsistent values reject.

Read every page of open/closed Issues, excluding PRs; select a bot-authored Issue with a matching valid initial marker. Human copies cannot match, multiple matches block, and malformed matching bot evidence requires repair. Read its complete comment history and accept only bot-authored markers valid for that Issue/repository/distribution. Select the latest by API creation order and numeric comment ID, with the initial body first. Incomplete retrieval blocks mutation. Titles remain presentation only. Maintainer edits to bot-authored content fall within the administrator trust model; current bytes have no claimed cryptographic authorship.

Tests additionally reject copied human Issues/comments, login spoofing with another numeric ID, cross-distribution/Issue markers, malformed bot markers, missing pagination and duplicate Issues; the last authoritative notice may occur on a later page.

## Release PATCH identity

Every Release PATCH supplies the approved `tag_name`, the intended `draft` status and `prerelease: true`. Probe edits also supply the exact reviewed body; publication retains `make_latest: "false"`. Requests never substitute an unexpected remote tag or change `target_commitish`. Verify the immutable tag resolves to the approved commit before mutation. After successful or ambiguous PATCH responses, reread the same Release ID and verify its tag, prerelease status, intended visibility and applicable body before reporting completion. Identity drift blocks subsequent writes and requires explicit maintainer recovery; automated recovery cannot retarget a conflicting Release.

Regression fixtures model a temporary tag when `tag_name` is omitted, verify every probe and publication PATCH, and reject incorrect identity or visibility even after HTTP success. Lost responses reconcile only to the complete intended state at the same ID. A drifted probe emits no success and performs no further PATCH or deletion. After explicit maintainer restoration, the exact reviewed probe can resume and remove only its own verified asset.

<a id="bootstrap-installation-evidence"></a>

## Bootstrap installation classification

Legacy-baseline capture accepts one optional explicit bootstrap context: `schemaVersion: 1`, purpose `desktop-bootstrap-installation`, repository name and numeric ID, PR number, protected base branch and commit, immutable bootstrap tag, seed commit/tree, and successful bootstrap run ID/attempt. Configuration supplies distribution, bot, workflow and protection identities. No context preserves ordinary pending-adoption classification. Unknown or malformed context rejects; branch names and PR numbers alone never authorize exclusion.

Before classifying the named PR, a read-only validator verifies the live repository identity, configured default branch and unchanged protected base. A complete Git tree at that base must prove absence of the configured source lock and ordinary delivery workflows; failed or truncated reads are not absence. The PR must be open, target that base branch in the same repository, originate in the same repository, and have the configured numeric Actions bot author with API type `Bot`. Its branch must match the release-derived adoption branch, and its current head must equal the live branch ref.

The validator resolves the protected immutable bootstrap tag to the context seed and verifies its tree, configured bootstrap ruleset and retained administrator evidence. It verifies the exact run/attempt belongs to this repository, uses `workflow_dispatch` and `.github/workflows/desktop-ci.yml` at that tag and seed, and completed successfully. The exact attempt's bootstrap finalization job must have completed successfully; a successful source-check or draft-probe run cannot substitute. Existing bootstrap environment protections remain required. Run success does not independently establish actual last-pusher identity or owner-review eligibility; those remain live rollout acceptance requirements.

The observed PR head must be a substantive source-lock-only finalization with the seed as its sole parent. Its schema-2 source lock binds the exact seed commit/tree and preserves the seed lock's upstream release, predecessor and observations. Validate the configured pinned legacy adoption evidence and upstream ancestry. Compare complete Git trees to exclude additional files, modes or submodule changes; incomplete compare output cannot prove a lock-only change.

The baseline records this PR separately as `bootstrapInstallation: { context, contextDigest, observedHead }`, where `contextDigest` hashes canonical JSON with recursively sorted object keys and preserved array order. It excludes exactly that validated PR from `unresolvedAdoption`; every other pending adoption remains subject to existing blocking rules. The enclosing baseline digest binds the classification and its evidence. Missing, duplicate, stale or conflicting identities, unsuccessful attempts and required API failures prevent a usable classification. This record establishes installation identity, not completed publication.

Capture the baseline and final administrator migration report against a completed prior bootstrap finalization. Retain those exact bytes in a reviewed successor seed with matching activation digests. The report never names its containing commit, and a successor seed alone does not require rewriting historical evidence. This ordering avoids recursive seed and evidence digests.

Before owner approval and merge, run a separately invocable read-only `bootstrap-installation-check` against the final successor context and the retained baseline, migration report and activation. It validates the new completed bootstrap run and current finalization using the same validator; requires the same repository, PR, protected base and retained release lineage; and verifies that the final head contains the exact reviewed baseline, migration report and matching activation/configuration digests. It refreshes required migration controls, administrator evidence and the complete pending-adoption inventory, excluding only the freshly validated installation PR. It revalidates the real published baseline's release/tag/source identity and asset identities, sizes and digests.

The check returns external evidence binding the final head, current context digest, retained evidence digests and observation time. It performs no remote writes and need not be committed into the candidate. Changed head, protected base, controls, publication baseline or pending inventory invalidates that result and blocks merge until corrected and checked again. Required review and branch checks apply to the final head. GitHub administrator trust remains the governing model; the report is an observation, not an atomic reservation of remote state.

After ordinary delivery workflows are installed, new bootstrap classification and bootstrap installation checks reject. The activated baseline retains its historical installation record without treating it as authority to exempt future PRs. Ordinary runtime activation validates its structure and digest binding without requiring the historical PR to remain open.

The migration and bootstrap tooling owns shared read-only validation; CLI commands expose it without additional permissions or automatic retries beyond the existing bounded read policy. Repository maintainers own final review and cutover. Failure keeps the installation PR open and publication unavailable. Resume by correcting the evidence or preparing a reviewed successor seed and obtaining another substantive bot finalization; never force-update immutable tags, create dummy commits or merge an inactive intermediate installation.

Retaining unconditional pending classification prevents the approved first-merge activation sequence. Excluding all bootstrap-looking branches or a fixed PR number permits unverified adoption to escape reconciliation. Binding the report to its containing successor commit creates recursive evidence updates. The explicit single-PR classification and separate final-head check preserve ordinary adoption blocking while allowing reviewed installation.
