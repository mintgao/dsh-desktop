# Desktop updates through reviewed adoption and artifact promotion

English | [中文](20260908-desktop-update-delivery.zh.md)

Status: Proposed

- Decision owner: Tech Lead `distribution_design`
- Work item: [Desktop distribution redesign](../work-items/20260908-desktop-distribution-redesign/brief.md), AC-2 and AC-4
- Review: independent Tech Lead `distribution_review` approved the prior technical design on 2026-09-08 conditionally; subsequent owner clarifications below do not constitute implementation approval

## Assessment and authority

Keep Electron, the standard DSH launcher, the shared Web client, and the packaged runtime. The [product-layer decision](../../.agents/notes/implemented/architecture/2026-08-25-downstream-client-product-layer.md) remains applicable. Process supervision and update modules need a supported reuse path with Mint identity supplied as configuration; their application-local location is a reuse gap, not evidence that Electron causes release failures.

The [transactional adoption decision](../work-items/20260831-upstream-mint-release-incident/technical-decision.md) remains operational authority until migration. This proposal changes source adoption and release operations, not installed applications. The [investigation](../work-items/20260908-desktop-distribution-redesign/brief.md) distinguishes historical merge, callback, bootstrap and package-version failures from the current approval block.

## Proposed delivery

Separate discovery, source adoption, qualification and publication. Keep whole-application replacement with the tested DSH runtime and plugin composition. No desktop-side Git merge, npm update, or backend hot swap is introduced.

**Discovery and adoption.** A scheduled read-only query identifies public upstream releases by repository, release ID, tag and resolved commit. A separate narrowly scoped writer creates or updates one ordinary adoption PR per release. It has no merge, publication or signing authority. Changed tag resolution blocks adoption. Retain ordered adoption and delivery; skipping releases is outside this decision. Maintainers resolve conflicts and approve workflow changes under branch protection. Merging source does not publish it.

**Qualification.** Build both Mac architectures from one exact merged downstream commit with frozen dependencies. Record desktop and DSH versions, upstream and downstream commits, build-workflow commit, run and attempt, plugin versions, architecture, expected files and digests in a release manifest. Assert downstream workspace version consistency before expensive builds. Recheck the actual merged commit; pre-merge tests cannot authorize another tree.

Candidate execution has no publication or Apple credentials. For signed releases, a separately protected job consumes the qualified payload using trusted packaging tools and never runs candidate scripts, hooks or application binaries while credentials are present. Record final digests after signing and notarization; a credential-free job runs installation smoke against those exact final files. Missing or expired artifacts require new qualification and approval.

**Promotion.** After both architectures pass installation qualification, a maintainer approves the final manifest digest, including final signed/notarized bytes when applicable. One protected-environment promotion run displays and binds that digest, source commit, qualification run and attempt. The trusted publisher checks that binding, repository, workflow identity, successful qualification, completeness and digests. Changed source, bytes, manifest, signing or qualification attempt invalidates approval; affected qualification and approval must run again. Create or verify an immutable desktop tag, upload a draft, verify all draft files, publish, then fetch and verify the public result. A mismatch causes withdrawal and a visible blocker. One release-specific Issue records failures and recovery.

Publication retries do not redo adoption. Resume an interrupted draft only for the same manifest and exact matching files; conflicting files or tags stop the attempt. A verified public release is an idempotent success. Never overwrite a published version; a different build requires a new desktop version. PRs, workflow artifacts and Releases supply the record; no atomic transaction across source, tag and a mutable queue ref is required.

## Ordered progress

Migration establishes a reviewed baseline naming the last verified upstream identity, desktop tag and final manifest digest. Each adoption PR updates a committed source lock with upstream repository, release ID, publication time, tag, commit and predecessor upstream identity. Protected Git history retains earlier locks. Adoption chooses the next public release in publication order, breaking timestamp ties by release ID. An unresolved adoption cannot be bypassed. Unexpected older discovery or changed/missing recorded upstream identity requires reconciliation.

Each final manifest identifies its source lock and predecessor desktop tag and manifest digest. Delivery completes only when public assets match the manifest and its predecessor lineage reaches the baseline. Recheck public evidence before each promotion. The next promotion must match the immediate successor source lock after the last verified delivery; a later adopted commit cannot bypass it. No separate completion PR or mutable queue ref is required.

Publication, withdrawal and restoration share one repository-wide mutation concurrency group without cancellation. After acquiring it, reread locks, tags, Releases and manifests. Identical promotions reconcile idempotently; later releases wait or block until predecessors verify. Drafts are incomplete. Missing assets or predecessor records, conflicting identities, and inconsistent successors block advancement.

Withdrawal retains the release and manifest as a draft and blocks further promotion until restoration or a qualified replacement for that same upstream release. A replacement uses a new desktop version, records the superseded tag/digest, and points to the valid predecessor before withdrawal. Published successors remain historical evidence but cannot authorize further promotion during unresolved recovery. Deletion of recorded lineage blocks reconciliation, never silently removes a predecessor. This detects changes against retained locks, manifests, tags and baseline, not releases deleted before discovery or coordinated administrator rewriting of all evidence.

## Trust and product choices

Recommend GitHub branch, tag and environment protections plus explicit maintainer promotion, replacing three custom Apps and expiring signed policy receipts. Keep least privilege, workflow review, secret-free candidate execution, isolated signing, immutable tags and separate publication authority. The publisher has no branch-protection bypass. Any write permission GitHub cannot restrict to Releases is a residual risk constrained by branch and tag protection.

Repository administrators become the release trust root; the replacement does not cryptographically authenticate hidden GitHub configuration. Protection changes require review and a verification run. The owner has accepted replacing independent signed policy attestation, as recorded in [Owner confirmation](#owner-confirmation); current controls remain active until verified cutover. The owner accepts maintainer confirmation with Agent-assisted preparation and execution, and the resulting publication latency. Ordered release delivery remains unchanged.

Maintainer notifications cover an adoption ready for decision, an actionable blocker, and qualified artifacts ready for publication. Use GitHub notifications with optional email according to recipient settings; implementation must verify actual delivery. Notifications summarize changes, evidence, recommendation and the relevant PR or candidate. The owner can bring that link to the Agent and authorize the specific merge or publication; no manual Git expertise is required. This flow does not assume GitHub events wake a Codex conversation or authorize future external actions automatically.

## Desktop reuse and user experience

Extract only demonstrated reusable behavior: backend supervision and native update lifecycle with explicit interfaces and disposal. Electron provides the native adapter; Mint supplies branding, application identity, release repository and validated defaults. Test a second minimal desktop composition with different configuration, external packed installation where applicable, generic Web exclusion of Mint defaults and Mint dependency closure. Moving files alone is not acceptance.

Keep the native update menu; an in-app panel is not required. Any future DSH Client update UI belongs to a plugin consuming a narrow typed native capability, with no Electron import or arbitrary filesystem/command access. End users see one client update, desktop version, user-facing release summary and installation choice. Do not expose separate DSH/plugin update tracks or require component-version decisions in the default flow. DSH and plugin versions remain in release metadata for maintenance and diagnostics. Only installable desktop releases produce end-user update prompts. Background checks remain quiet on failure; manual checks show a recoverable error and the validated release page.

Retain manual unsigned-preview installation and user-controlled signed stable download/restart. Only complete public releases for the compatible architecture and channel are candidates. Invalid metadata or signatures block installation. Shut down the backend before replacement; never swap active sessions. Hashes detect changed bytes but do not establish publisher identity for an unsigned preview.

## Data and failure recovery

A whole-app replacement does not prove data downgrade safety. Qualification records readable persisted formats, migrations, and whether the prior application can reopen new data. Shared DSH home requires accounting for other DSH processes; backup or migration cannot race another writer. An incompatible release needs a separately reviewed exclusive-access backup/restore procedure with restoration evidence, or publication is blocked. Do not promise automatic binary rollback after new data writes.

Offline checks and failed downloads preserve the running application. Failed startup preserves logs and user data and exposes a recovery instruction. Withdrawal prevents future discovery but does not downgrade installed copies. Recovery must distinguish a failed file replacement from a new runtime that already wrote incompatible data.

The desktop release maintainer owns adoption blockers, publication reconciliation, withdrawal and recovery. Each invocation allows at most three total attempts for classified transient network/service errors, bounded backoff and a finite timeout. Authentication, missing approval/evidence, identity/digest conflict, incompatible data and failed qualification block immediately. Exhaustion stops without automatically dispatching another workflow; schedules do not resume blocked mutations. One release-specific Issue names the phase, evidence digest, cause and correction. An unchanged blocker neither repeats mutation nor edits or creates an Issue. After correction, the maintainer explicitly resumes with release identity and expected manifest digest, or resumes the adoption PR. Resume revalidates evidence and approval; an already completed publication is reconciled without rebuilding.

## Migration

1. Resolve owner choices and independent review; snapshot current controller state, active PR, tags, Releases and credential identities without changing them.
2. Run replacement discovery and qualification with no remote writes to adoption PRs, branches, source locks, tags, Releases or Issues. Output proposed actions and qualify both architectures. Prove failed-build recovery; legacy automation remains the sole remote writer.
3. Pause legacy discovery, adoption and publication schedules; disable mutation entry points including delayed Observer callbacks and dispatches. Drain or cancel jobs and revoke mutation credentials before enabling any replacement writer. Verify delayed callbacks cannot mutate. Preserve the state ref as evidence and merge reviewed migration inputs for the exact active release and verified baseline. Enable replacement adoption and publication only after exclusion checks; do not skip or recreate published releases.
4. Promote one canary through the replacement. Verify download, installation, startup, preserved data and subsequent discovery. Preserve public URLs, preview-to-stable discovery and monotonic desktop versions.
5. Retire obsolete identities, receipts and state machinery only after canary acceptance. Cross-link and supersede only migrated responsibilities of old decisions.

Before publication, rollback restores valid legacy prerequisites and exactly one publisher. After replacement publication, legacy resumption requires a reviewed reconciliation of that release; never enable competing publishers or silently reset the cursor.

## Alternatives

**Retain transactional automation.** Preserves unattended delivery and independent configuration attestation, but retains cross-workflow recovery, renewal and multiple identities. It is appropriate only if those guarantees justify their operational cost.

**Replace Electron.** Requires revalidating native behavior while leaving observed adoption and publication failures unresolved. No evidence here justifies it.

**Update the backend separately.** Adds shell/backend/plugin negotiation, separate trust and migration recovery. Smaller downloads do not justify that complexity for these requirements.

**Consume pinned upstream packages.** Could reduce source conflicts, but needs proven published runtime closure and downstream-plugin compatibility first. Track unavoidable upstream modifications and their contribution/removal paths; repository extraction is a separate migration, not a prerequisite to repairing delivery.

## Acceptance

Test duplicate discovery, changed tag identity, source conflicts, workspace-version mismatch, one-architecture failure, stale approval, rejected signing provenance, interrupted draft upload, duplicate promotion and public digest mismatch/withdrawal. Validate offline/manual checks, invalid architecture and metadata, unsigned preview replacement, signed update verification, backend shutdown, incompatible data, and interruption during installation. Map each scenario to observed evidence; static and unit checks do not prove native installation or production permissions. The work-item verification record owns results; these are unexecuted implementation requirements.

Also test concurrent promotions, blocked/withdrawn predecessors, missing/conflicting lineage, successful publication followed by interrupted verification, approval invalidation after signing or requalification, shadow rejection of PR/branch writes, delayed legacy callbacks, retry exhaustion, unchanged deterministic blockers and explicit successful resume.

Verify that DSH-only, desktop-only and combined changes each produce one client update flow without requiring component choices. Verify maintainer notification delivery for ready adoption, blockers and qualified publication, and that an upstream discovery without an installable desktop release does not notify end users to update.

<a id="owner-confirmation"></a>

## Owner confirmation

On 2026-09-08 the owner confirmed implementation using GitHub branch, tag and release-environment protections with per-release confirmation, replacing three custom Apps and signed policy receipts, and accepting repository administrators as the final trust root. This product choice is resolved and needs no repeated confirmation. Exact implementation and cutover still require technical review and acceptance; public publication and installed-client replacement require authorization for those exact operations.
