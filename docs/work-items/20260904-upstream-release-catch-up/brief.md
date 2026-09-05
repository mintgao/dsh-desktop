# Catch up Mint Desktop releases with upstream DSH

English | [中文](brief.zh.md)

- ID: `20260904-upstream-release-catch-up`
- Size: `L`
- Status: in-progress
- Created: 2026-09-04

## Technical decision readiness

- Outcome: `covered-by-accepted-decision`
- Trigger evidence: recovery crosses the upstream Git repository, protected adoption state, integration pull request, immutable desktop tags, dual-architecture artifacts, and public GitHub Releases
- Decision owner: Tech Lead (`release_redesign_author`)
- Governing decision: [Transactional upstream adoption and verified Mint publication](../20260831-upstream-mint-release-incident/technical-decision.md) (`Status: Accepted`)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: independent Tech Lead `release_recovery_readiness_review` confirmed that the Accepted decision fully governs ordered conflict recovery, exact-head approval, protected state, split identities, immutable tags, artifact qualification, public verification, and withdrawal without introducing a new durable choice
- Material product decisions: none; preserve ordered upstream adoption, the active unsigned-preview trust stage, public verified publication, and user-controlled installation
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-04T18:35:08+08:00
- Confirmation basis: the exact persisted recovery boundary is covered by the Accepted decision, independent review approved it, every material product choice is preserved, and no implementation blocker or new durable decision remains
- Readiness history: 2026-09-04 — the workflow orchestrator classified production recovery as L and found the accepted transactional-adoption decision applicable; implementation remained blocked pending independent technical review. 2026-09-04T18:35:08+08:00 — independent review approved the exact recovery boundary and the workflow orchestrator confirmed `covered-by-accepted-decision + implementation-ready`.

## Goal

Resolve the blocked `dsh-v0.1.2-alpha.4` adoption and continue the ordered automatic release queue until Mint Desktop has publicly published every upstream DSH Release available at the final observation time.

## Current state and evidence

Protected adoption state records `dsh-v0.1.2-alpha.3` as the last published upstream Release and `dsh-v0.1.2-alpha.4` as an `adoption-blocked` delivery after a deterministic merge conflict. A fresh observation of [upstream public Releases](https://github.com/deepseek-ai/deepseek-harness/releases) on 2026-09-05 identifies `dsh-v0.1.3-alpha.1` at commit `d347e703908d0406b7a7ef80e3a0e594d86b2215` as the latest queued Release after `dsh-v0.1.2-rc.1`. The ordered recovery target is `dsh-v0.1.2-alpha.4` → `dsh-v0.1.2-alpha.5` → `dsh-v0.1.2-rc.1` → `dsh-v0.1.3-alpha.1`; no later Release can advance before its predecessor completes.

The recovered `alpha.4` candidate aligns its two downstream-only DSH package manifests with the target version and adds a trusted-main Controller helper that applies the same rule after future clean adoption merges. The receipt-pinned `.github/workflows/upstream-adoption-validation.yml` does not yet run the release-metadata gates and cannot change in this candidate without a separate owner-key receipt renewal. That follow-up is non-blocking for this recovery: `.github/workflows/release.yml` remains fail-closed on `release:verify` and npm install-layout verification, while the trusted helper and focused workflow specifications enforce current and future adoption-time alignment.

## Scope

- In: inspect and resolve the exact `alpha.4` semantic conflicts on its Controller-owned candidate branch; obtain required exact-head approval; run focused and configured checks; let the accepted Finalizer and Publisher paths advance protected state, tags, artifacts, and public Releases; continue through every later queued upstream Release; verify the final public cursor against a fresh upstream Release observation.
- Out: change adoption ordering, retry semantics, protected-state schema, App permissions, signing mode, release version mapping, updater behavior, or manually bypass the Finalizer and Publisher protocols.

## Acceptance criteria

- [ ] AC-1: The `dsh-v0.1.2-alpha.4` candidate resolves every conflict according to the owning upstream or Mint source, preserves protected downstream release controls, and passes the applicable local and GitHub checks.
- [ ] AC-2: The accepted control plane finalizes each queued upstream Release in publication order without manual state, tag, or Release mutation.
- [ ] AC-3: Every completed adoption has the expected immutable Desktop tag, public unsigned-preview Release, arm64 and x64 DMGs, checksums, and upstream/source provenance.
- [ ] AC-4: Protected state records the newest public upstream DSH Release observed at closure as `lastPublishedRelease`, with no older queued or active delivery left incomplete.
- [ ] AC-5: `main` contains the exact newest upstream Release commit and the downstream release controls and branding remain intact.
- [ ] AC-6: Independent QA verifies the unchanged final candidate, the public release set, protected cursor, and one complete default `./bin/vibe verify . --format json` result, or records why a newer upstream candidate invalidated the evidence and reruns it.

## Recovery constraints

- Resolve source conflicts through the integration PR required by the accepted decision; do not push directly to protected `main`.
- Regenerate derived documentation or catalogs from their authoritative sources instead of selecting an arbitrary conflict side.
- Preserve Mint-owned workflows, release policy, branding, product Bundle, and unsigned-preview defaults unless upstream evidence shows an intentional compatible replacement.
- Treat a newly published upstream Release before final closure as part of the queue; completion requires a fresh observation after the last Desktop publication.

## Risks and recovery

- A semantic conflict can compile while discarding either an upstream behavior change or a downstream release guard; review each conflict by ownership and run the checks selected for its affected surface.
- Public publication is recoverable through the existing withdrawal workflow, but immutable tags and recorded provenance must not be rewritten.
- Policy expiry, credential drift, runner failure, or a changed candidate head must stop the affected phase and retain the protected recovery state rather than invite an out-of-band release.
