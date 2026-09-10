# Reviewed catch-up adoption and desktop publication

Status: Accepted

English | [中文](20260910-desktop-catch-up-delivery.zh.md)

## Scope and authority

The [work item](../work-items/20260910-dsh-015-upgrade/brief.md) records owner approval for one catch-up upgrade PR and one desktop release covering the complete intervening upstream range. This extends the [reviewed delivery decision](20260908-desktop-reviewed-delivery.md). The pinned target is `dsh-v0.1.5-alpha.2`; later releases do not change it. Merge and publication remain separately approved operations.

Phase A implements reusable evidence and validation in `scripts/desktop-delivery/`, CLI wiring, workflows, tests and governing documentation. Distribution identity stays configuration-owned. Phase B prepares upstream application changes under the installed policy; native ownership and data migration require their own decision and qualification. Phase A does not enable signing, merge upstream source, mutate installed data, or add a writer.

Trusted workflow code owns external validation and mutation. Candidate code runs without write credentials. Existing protections, bot authorship, substantive lock-only finalization, immutable tags, protected publication approval and bounded retries remain. The desktop delivery maintainer owns failures and recovery.

## Explicit selection

Add `catch-up` alongside `upstream`, `desktop` and `replacement`, retaining existing kinds' semantics. `adoption-plan --kind catch-up` requires `--target-tag` and `--target-commit`. Complete discovery binds the target's release ID, tag, commit and publication time and every configured release in the interval after the current lock through that exact target, using publication-time/ID order.

Catch-up requires at least two releases; one successor uses `upstream`. Reject absent or non-advancing targets, wrong commits, incomplete observations and conflicting identities. Never substitute latest. Scheduled discovery and notifications retain immediate-next behavior and cannot authorize adoption. New releases strictly after the pinned target do not invalidate its range.

## Source and assessment evidence

Source-lock schema 3 retains schema-2 fields and requires `catchUp`, either null or `{ schemaVersion: 1, from: Release, to: Release, releases: Release[], assessment: { path: string, sha256: string } }`. Its `from` equals predecessor; `to` equals current release. Its release list equals the exact ordered interval `(from, to]` in observed identities, without omissions, additions or duplicates.

Readers accept historical schemas 1 and 2 where already permitted. Production finalization requires schema 2 or 3 seed binding. New finalizations emit schema 3; ordinary advancement sets catchUp null. Same-upstream desktop preparation, replacement and human-fix refinalization preserve existing catch-up evidence byte-for-byte while rebinding the seed. Reject catch-up fields in older schemas and unknown schemas. Never rewrite historical locks or manifests.

The versioned committed assessment binds exact from/to/range identities, one assessment per consecutive release edge, and a separate direct baseline-to-target upgrade assessment. It records persisted-format changes, unsupported downgrades, compatibility findings, repository-relative evidence paths/content digests and verified, blocked or unverified scenario status. Assessment and references must be contained regular files. Reject self/source-lock references, cycles, escaping paths and altered bytes. Evidence files are leaves, not recursively interpreted assessments. Review and protected approval provide authority; assessment metadata alone does not prove human approval or direct-upgrade safety.

## Preparation and bot finalization

Planning binds range, current lock digest, exact protected base, explicit target, desktop version and verified delivery-baseline identity. Keep target-derived branch naming and pending-PR detection. Initial catch-up requires the source baseline and delivered upstream baseline to agree; pending unpublished source advancement is a lineage blocker.

Preparation merges the exact target into the exact downstream base in a retained isolated checkout. Verify baseline and every selected upstream commit are ancestors of target, and target remains in seed ancestry. Non-ancestral ranges block without synthetic merges, cherry-picks or omitted identities. Conflicts require reviewed resolution. Seed includes assessment/referenced evidence; proposed lock stays separate and binds seed commit/tree. Version/dependency checks remain credential-free.

Before any bot write, finalization independently validates schema/range/assessment, exact protected-main/base ancestry and prior-lock digests. It retrieves complete live observations and recomputes the interval, rejects missing/changed/newly inserted identities at or before target, checks every commit's ancestry, and reads assessment/referenced bytes from exact seed. New releases after target remain acceptable. Fixture completeness is not live authority.

Retain seed/tree binding, sole-parent lock-only changes, bot identity, remote-head equality and non-force updates. Recheck current main and branch immediately before mutation under existing concurrency. Matching retries do not write. Human changes require a new seed and substantive finalization; changed range/assessment requires a new reviewed plan.

## Qualification and publication

Production-manifest schema 2 requires catchUp copied from normalized lock evidence or null. Its digest-bound bundle includes the assessment and all referenced evidence with exact file inventory. Readers retain schema-1 historical support without granting catch-up authority.

For catch-up, manifest/lock target must match; actual verified public desktop tip or activated legacy baseline must match range.from and lock.predecessor. Require complete range and direct-upgrade evidence, with no invented intermediate desktop manifests. Ordinary upstream remains immediate-successor; desktop/replacement retain unchanged identity and withdrawn-tip rules. Same-upstream fixes and replacements preserve catch-up provenance without advancing again.

Update all consumers consistently: releaseManifest, checkedManifest, verifyFinalization, verifyQualification, verifyDelivery, retained bundles, withdrawal identity and predecessor traversal. No path may silently discard range evidence. Promotion planning, maintainer tag/draft preparation and publisher each independently revalidate live interval and delivery tip before writes. Changed identities/range, withdrawn predecessors, changed manifests or remote movement block. Qualification/approval remain byte-bound.

Withdrawal may hide an exactly identified damaged release. Restore verifies retained exact publication and ancestry evidence; it is not a new adoption. Keep exact-byte recovery, replacement restrictions and unsupported-downgrade rules.

Phase A leaves the existing production-qualification rejection of persistedFormatsChanged true intact until a separately reviewed migration qualification exists. Catch-up publication requires verified direct baseline-to-target compatibility, not merely edge inventory or clean-install smoke. Blocked/unverified assessments cannot qualify. Never test against the user's real DSH home or claim automatic downgrade safety.

## Trusted rollout and recovery

First prepare a policy/tooling PR at the existing upstream identity using the old trusted desktop-kind preparation/finalization path. Required checks and owner merge install new tools on protected main; no desktop publication occurs. Then prepare the single actual catch-up upgrade PR against that new main; new trusted tools finalize it. Target merge, native qualification and exact approval precede one desktop release.

The tooling PR is a prerequisite, not an intermediate upstream adoption or product release. Offline target previews may be prepared earlier but cannot finalize using old tools. Do not use historical bootstrap exceptions, label target code as desktop-only, or execute candidate tools with write credentials.

Before policy merge, retaining existing policy/seed is recovery. Once schema-3 evidence exists, retain compatible readers or stop writers; old tools cannot validate it. Published evidence stays immutable and uses accepted withdrawal/restore.

## Verification

Exercise actual CLI entry paths. Reject missing target arguments, wrong/absent/non-advancing target and one-release catch-up; incomplete/duplicate/conflicting observations, omissions, wrong range order, changed identity or inserted release; non-ancestral range, fabricated prior lock or stale base; absent/tampered assessment, missing edge/direct evidence, path escapes/cycles/digest mismatch; catch-up in schema2, unknown schemas or null evidence; stale seed, branch/tree changes, non-lock finalization and remote movement.

Reject manifest/lock range disagreement, wrong/non-tip/withdrawn baseline, missing/tampered range assets, blocked/unverified compatibility, unqualified format changes, incomplete native architectures, stale approval, live interval changes after qualification, candidate orchestration, bootstrap reuse and candidate execution with write credentials. Include seven-release success, later releases beyond target, no-write retries, interrupted draft resume, human refinalization, ordinary advancement after catch-up, same-upstream fixes, withdrawn-tip replacement, exact restore and historical schema support.

RD owns focused checks; independent QA owns the unchanged Phase A candidate's complete configured verification once. Phase B requires separate readiness and verification. Fixtures prove encoded behavior; live owner-review eligibility, native qualification and publication remain separate evidence.

## Alternatives and decision evidence

Changing ordinary upstream semantics would make skipping implicit. Synthetic intermediate locks would obscure actual adoption/delivery. Candidate-controlled finalization would weaken trusted-main authority. Explicit kind and versioned evidence preserve inspection without a new controller, ledger, permission class or recurring writer.

Technical author: upgrade_decision. Independent reviewer upgrade_readiness_review approved this Phase A decision on 2026-09-10. Orchestrator readiness confirmation is required before implementation. No additional material product choice is identified; Phase B native/migration decisions remain separate.
