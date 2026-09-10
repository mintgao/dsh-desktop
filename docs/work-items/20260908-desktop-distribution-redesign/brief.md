# Desktop distribution principles and update redesign

English | [中文](brief.zh.md)

- ID: `20260908-desktop-distribution-redesign`
- Size: `L`
- Status: diagnosis and design; application implementation excluded
- Created: 2026-09-08

## Goal

Persist the owner's downstream development principles as standing project requirements, review the desktop architecture, and redesign upstream update delivery using evidence from repeated failures. The two product requirements are a desktop client over DSH and a way for desktop users to discover, obtain, and apply DSH updates. Every current and future addition must follow plugin composition and have an explicit reuse path, compatibility evidence, and value for other DSH developers.

## Scope

This task changes project rules, product context, and design records. It inspects source and remote history read-only. It does not implement the replacement pipeline, approve or merge adoption PRs, change repository controls, publish artifacts, or replace installed applications. Existing working-tree edits and recovery-branch experiments remain untouched.

## Acceptance criteria

- AC-1: root instructions and Vibe project rules point to one standing downstream policy covering current and future requirements, plugin ownership, reuse, compatibility, and scope control.
- AC-2: distinguish desktop runtime, reusable plugins, Mint defaults, native adapters, and release infrastructure; identify concrete deviations without assuming every recovery-branch change is shipped.
- AC-3: separate observed historical failures, current update blockage, and architectural inferences using source and GitHub evidence.
- AC-4: persist a replacement design covering upstream discovery, source adoption, artifact creation, publication, client update UX, compatibility, security, failure recovery, migration, and end-to-end acceptance; independently review the exact decision.
- AC-5: separate accepted project principles from proposed product trade-offs and unimplemented design; verify changed documentation and record skipped or blocked checks.

## Technical decision readiness

This section preserves the design-phase assessment. The owner subsequently resolved the trust model; the [reviewed delivery work item](../20260908-desktop-reviewed-delivery/brief.md) owns accepted implementation readiness and current verification.

- Outcome: `decision-required`
- Trigger evidence: redesign crosses source adoption, release permissions, artifact provenance, version compatibility, installation and recovery
- Decision owner: Tech Lead `distribution_design`
- Governing decision: [Reviewed adoption and artifact promotion](../../decisions/20260908-desktop-update-delivery.md) (`Status: Proposed`)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: independent Tech Lead `distribution_review` approved the amended exact ADR on 2026-09-08 after verifying source-lock/manifest ordering, final-artifact approval identity, sole-writer cutover and bounded retries; approval is conditional on owner choices
- Material product decisions: owner accepts Agent-assisted maintainer confirmation, GitHub notifications with optional email, and one whole-client update flow without component decisions; replacing signed attestation with GitHub platform protections remains pending; ordered delivery is retained
- Open blockers: release trust-model choice and review of subsequent owner clarifications remain pending; no replacement implementation authorized in this work item
- Gate: `blocked`
- Gate owner: Workflow orchestrator
- Confirmed at: none
- Confirmation basis: none
- Readiness history: 2026-09-08 — diagnosis and design opened; independent review requested four corrections, the author amended them without a separate completion ledger, and the reviewer approved the persisted design conditionally. Existing production decisions remain operational authority until reviewed migration is implemented

## Evidence baseline

The current checkout is a recovery branch at `507e5beb4f`. Comparison with adopted upstream commit `dd6322d604e00eec1ba5e0c8541159906a21094a` shows desktop, notification, release, and additional development changes; no committed `packages/core` difference. The focused desktop, Mint Bundle, and notification test run on 2026-09-08 passed 14 files and 56 tests; it does not prove packaged installation or live update delivery. GitHub state revision 33 records `alpha.3` published and `alpha.4` blocked on approval. The investigation owns further evidence.

## Investigation

Investigator `update_investigation` inspected source, incident records, current GitHub state, PR reviews and Actions on 2026-09-08. Historical explanations below identify their evidence type; no historical event was replayed.

| Finding | Evidence | Interpretation |
|---|---|---|
| Alpha.1 encountered 33 merge-conflict paths in 16 unchanged scheduled attempts; build and publication never started | [Prior incident](../20260831-upstream-mint-release-incident/brief.md), [failed run](https://github.com/mintgao/dsh-desktop/actions/runs/33130293188) | Historical source-adoption failure, amplified by retry behavior; not a signing failure |
| Successful validation produced skipped Observer jobs because routing used a dynamic run name | [Recovery decision](../20260831-upstream-mint-release-incident/technical-decision.md); current Observer uses stable workflow paths | Historical implementation defect recorded by the prior incident; current source contains its correction |
| Workflow hotfixes invalidated the first signed policy receipt before null-state initialization; sequence two could not initialize it | [Recovery decision](../20260831-upstream-mint-release-incident/technical-decision.md) and [policy verifier](../../../scripts/upstream-adoption/policy.ts) | Historical bootstrap/recovery coupling; the current policy is active at sequence 3 and expires on 2026-09-29 |
| Alpha.4 failed npm layout verification because desktop-mint had no workspace version matching alpha.4 | [Validation run](https://github.com/mintgao/dsh-desktop/actions/runs/33916918346) | Specific version-alignment defect; the current candidate has not been revalidated by this review |
| Alpha.4 currently has no approval for its protected-path candidate | [PR 64](https://github.com/mintgao/dsh-desktop/pull/64), remote state revision 33, `reviews=[]` | Current deterministic approval blocker; head is `b02b0bc1ed4492715b7003a0b19b8fe38901cd20`, `approvedHead=null` |
| The latest inspected Controller succeeds while alpha.4 remains blocked | [Controller run](https://github.com/mintgao/dsh-desktop/actions/runs/34195142617) and [reconciler](../../../scripts/upstream-adoption/controller-reconcile.sh) | Success means the unchanged blocker was deduplicated, not that a desktop update shipped |

The evidence supports separating source adoption, qualification and publication. The assessment that recurring policy proofs and cross-workflow dependencies impose excessive maintenance for two product requirements is an architectural judgment, not a measured reliability statistic. Alpha.1, alpha.2 and alpha.3 unsigned desktop releases are public; the system has delivered updates, and the review does not claim it has never worked.

## Scope and reuse assessment

Retain the desktop's standard launcher and shared Web client. The [Mint Bundle](../../../packages/bundle/desktop-mint/cordis.patch.yml) selects the independently owned notification plugin. Native update/process modules lack an external supported package; release repository identity is hardcoded in [GitHub release parsing](../../../apps/desktop/src/github-releases.ts). Package publisher metadata and external packed-install/version compatibility need separate verification before claiming reusable distribution. Recovery-branch Inspector, sandbox and development-tool changes require classification as upstream contributions or separate development work, not automatic inclusion in the desktop backlog.

## Delivery status

The [standing policy](../../context/downstream-policy.md) applies immediately through root and Vibe instructions. The replacement ADR is a proposal, not permission to modify production. Policy documentation extends the existing product-layer decision without superseding its plugin/native ownership rationale. Legacy update decisions remain active because their implementations still operate. No Agent Note was archived or replaced.

The [verification record](verification.md) owns independent review receipts, executed checks and remaining decisions.
