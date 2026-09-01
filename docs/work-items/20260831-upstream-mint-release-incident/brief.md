# Diagnose blocked upstream adoption and Mint release alerts

English | [中文](brief.zh.md)

- ID: `20260831-upstream-mint-release-incident`
- Size: `L`
- Status: implementation-ready
- Created: 2026-08-31

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: the repair changes durable adoption state, retry and recovery semantics, GitHub workflow ownership, publication completion criteria, notification behavior, and the owner-authenticated policy-attestation boundary across the upstream-sync and desktop-release workflows
- Decision owner: Tech Lead (`release_redesign_author`)
- Governing decision: [Transactional upstream adoption and verified Mint publication](technical-decision.md) (`Status: Accepted`, including the Observer-path and initial-policy-bootstrap amendment)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: independent Tech Lead `policy_bootstrap_decision_review` approved the exact persisted amendment after verifying stable path routing, pre-credential authorization, executable historical verification, one-time monotonic initialization, field-limited CAS mutation, drift blocking, and sequence-plus-one recovery
- Material product decisions: none; the recommendation preserves ordered adoption, unsigned-preview defaults, and user-controlled installation
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-01T10:13:30+08:00
- Confirmation basis: the independent review approved the exact persisted recovery boundary and found no unresolved trigger, product decision, or implementation blocker
- Readiness history: 2026-08-31 — diagnosis completed without editing production workflows; implementation remained blocked pending decision and review. 2026-08-31 — the first independent review reclassified the work from M to L and required six boundary corrections. 2026-08-31 — subsequent review required exact state-writer, finalizer/publication credential, and tag-creation separation; the persisted three-App and two-tag-ruleset design satisfied those changes and received approval. 2026-08-31T15:10:27+08:00 — implementation reopened readiness before shared code edits because GitHub hides `bypass_actors` without ruleset write access and requires `Environments: read` to list environment secret names, neither of which belongs to the accepted three-App least-privilege model. 2026-08-31T15:18:25+08:00 — the owner-authenticated policy-attestation amendment received independent approval and restored the implementation gate; production remains activation-blocked until live Apps, rulesets, environments, activation record, signed receipt, and verify-only evidence exist. 2026-08-31T15:41:26+08:00 — implementation invalidated the gate after proving that an activation file cannot contain the SHA of the commit whose tree includes that file; the owner proof must be non-self-referential before activation code resumes. 2026-08-31T15:55:48+08:00 — independent review approved the persisted squash-only authorization and monotonic receipt-renewal amendment, restoring implementation-ready while leaving production activation as a separate live-evidence gate. 2026-09-01 — live validation succeeded, but Observer jobs skipped because control flow used a dynamic run name; after required workflow hotfixes, sequence-one policy verification drifted before protected state initialization, and monotonic sequence-two renewal correctly rejected the null predecessor. The gate reopened for the Observer-path and one-time bootstrap amendment. 2026-09-01T10:13:30+08:00 — independent review approved the exact persisted amendment and restored implementation-ready.

## Goal

Identify why automatic DeepSeek Harness adoption did not produce a new Mint DSH release, explain the repeated scheduled-workflow notifications, and produce an approved implementation-ready redesign.

## Context

The downstream repository polls public upstream `dsh-v*` Releases in publication order. Its durable state remains at `dsh-v0.1.1-rc.2` and `desktop-v0.1.0-preview.5`. Upstream published [`dsh-v0.1.2-alpha.1`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.1) on 2026-08-27 and `dsh-v0.1.2-alpha.2` on 2026-08-30, but neither reached a downstream Desktop Release.

## Scope

- In: inspect scheduled Actions, exact failed steps and logs, upstream/downstream release state, blocker records, workflow behavior, recovery documentation, and notification amplification; define and independently review a durable automation design.
- Out: change GitHub repository state, rerun or disable workflows, resolve the upstream merge, advance adoption state, create tags or Releases, or edit production workflows in this diagnosis.

## Acceptance criteria

- [x] AC-1: identify the first failing release, repeated failed stage, and affected downstream release state from remote evidence.
- [x] AC-2: distinguish the primary cause from credentials, signing, packaging, runner flakiness, and unrelated scheduled workflows.
- [x] AC-3: explain why the same incident generates repeated Action failures and blocker Issue activity.
- [x] AC-4: provide an ordered recovery that preserves queue and release provenance.
- [x] AC-5: define an optimization with retry deduplication, reviewable conflict handling, publication verification, alert hygiene, and focused test coverage.
- [x] AC-6: persist an Accepted technical decision with complete state, identity, receipt, artifact, signing, finalization, publication, recovery, migration, and compatibility boundaries, approved by an independent Tech Lead.

## Incident evidence and root cause

The last successful scheduled poll was [run 33087024368](https://github.com/mintgao/dsh-desktop/actions/runs/33087024368) at 2026-08-27 15:17:43Z, before `alpha.1` was published. From [run 33130293188](https://github.com/mintgao/dsh-desktop/actions/runs/33130293188) at 2026-08-28 00:37:07Z through [run 33348210396](https://github.com/mintgao/dsh-desktop/actions/runs/33348210396) at 2026-08-31 01:38:44Z, all 16 observed scheduled failures targeted the same upstream tag and commit, `dsh-v0.1.2-alpha.1` at `cd5ef8148158c3a752a658978873241fdf8e2bbc`, from the same downstream head, `f97cfe48d55e9f52cf100718088f6f7629369d88`.

Every failure stopped at `Merge upstream release` with the same 33 content-conflict paths. The conflicts cover generated and translated documentation, official CI workflows, root instructions, the lockfile, notices and catalogs, plus shared CLI, boot-profile, script, and TypeScript configuration code. Fetch and release resolution succeeded, while dependency installation, verification, Mint packaging, state advancement, tag push, and release dispatch were skipped. The current incident is therefore an upstream/downstream merge conflict, not a credential, Apple signing, packaging, network, or flaky-runner failure. The scheduled real-API E2E workflow was skipped by its official-repository guard and did not contribute another failure source.

Stopping the first conflicting adoption is consistent with the current automatic-adoption decision. The operational defect is the retry policy after that stop: the twice-hourly schedule repeatedly attempts an unchanged deterministic conflict. [Issue 25](https://github.com/mintgao/dsh-desktop/issues/25) was opened on the first failure, and later identical failures appended substantially identical Action links. GitHub failed-run notifications are the primary proven alert source; Issue subscription notifications can add a second source depending on the recipient's notification settings.

Because ordered adoption intentionally does not skip releases, `alpha.2` remains behind the blocked `alpha.1`. No upstream-driven `Release DSH Desktop` workflow was dispatched, so the latest downstream artifact remains `desktop-v0.1.0-preview.5`.

## Immediate recovery

Create a normal recovery branch from current `main`, merge the exact `dsh-v0.1.2-alpha.1` commit, and resolve conflicts by ownership: regenerate generated and i18n artifacts from their authoritative English or source inputs, retain Mint-owned overlays and downstream workflow guards, and review true shared-code conflicts individually. Run checks matched to the resolved surfaces, merge the reviewed branch into `main`, then rerun the adoption workflow for `alpha.1`. Do not edit `.github/upstream-sync-state.json`, create the desktop tag, or publish a Release manually; the workflow must record the ordered adoption and provenance consistently. After `alpha.1` publishes successfully, handle `alpha.2` as the next independent queue entry.

Until that recovery is ready, suppress the alert storm at the workflow level rather than through personal email rules: an unchanged known blocker should become a successful scheduled no-op. Disabling the schedule is an acceptable temporary operator action only if its re-enable owner and condition are recorded.

## Recommended durable optimization

The Accepted [technical decision](technical-decision.md) and its [governing proposal](../../../.agents/notes/proposed/process/2026-08-31-transactional-upstream-adoption-and-verified-desktop-publication.md) own the implementation boundary. The summary below remains an incident-level orientation rather than a substitute for those contracts.

Use one durable attempt identity composed of the upstream tag and commit, downstream `main` commit, failed stage, and normalized failure fingerprint. The first scheduled failure creates or updates one blocker Issue. Later scheduled polls with the same identity return success without repeating the merge or adding a comment. A changed downstream head, changed target or fingerprint, explicit manual force input, or cleared blocker authorizes a new attempt.

Move conflicted adoption onto a bot-managed integration branch and pull request. A clean merge can proceed automatically after required checks, while a conflict becomes a visible review surface instead of an ephemeral runner-only working tree. After the adoption pull request merges, a finalizer advances state and the immutable desktop tag.

Track source adoption and artifact publication as explicit phases such as detected, adoption-blocked, adopted, release-pending, and published. Publication owns its own deduplicated blocker and retry policy. Completion requires verifying the expected tag commit, public versus draft state, both architecture DMGs, checksums, release mode, and upstream/downstream provenance; merely dispatching the release workflow or finding a Release object is insufficient.

Notify only on the first failure, a changed stage or fingerprint, recovery, or a prolonged service-level breach. Add scenario tests for first failure, identical scheduled retry, changed-head retry, manual force, successful blocker closure, ordered next-release handling, partial or draft publication, publication failure, and in-progress deduplication. Replace workflow tests that hard-code the initial state with schema and transition invariants, and execute those tests in the downstream adoption and CI paths.

## Risks and open decisions

- The approved redesign requires three repository-installed App identities, protected environments, active branch and tag rulesets, and a passing live preflight before migration; the current repository has not yet activated those external controls.
- Generated and bilingual file ownership must be encoded so recovery regenerates authoritative outputs instead of preserving accidental merge results.
- Email headers or personal GitHub notification settings would be required to quantify failed-run mail versus Issue-subscription mail, but that distinction does not change the repository-level fix.
