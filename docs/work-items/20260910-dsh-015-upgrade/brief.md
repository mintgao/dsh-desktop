# DSH Desktop upgrade to 0.1.5-alpha.2

English | [中文](brief.zh.md)

## Objective and scope

The owner authorized preparation of an upgrade to `dsh-v0.1.5-alpha.2` on 2026-09-10. Produce a reviewable candidate with verification evidence. Preserve the original dirty checkout and PR 64 follow-up branch. Merge and publication require separate owner decisions. This is L work because it spans seven upstream releases, persisted data, native ownership and protected delivery.

Phase A installs reusable catch-up delivery validation and evidence. Phase B integrates upstream application and native changes under its own accepted decisions. Phase A does not qualify the actual target's migration or packaged installation.

## Accepted criteria

- AC1: Pin the exact target ancestry and version provenance and account for all seven intervening releases.
- AC2: Preserve reusable plugin ownership and Desktop Mint composition.
- AC3: Assess data compatibility with migration and recovery evidence where required.
- AC4: Record focused checks, independent final default verification and desktop qualification limitations.
- AC5: Produce a reviewable PR and seed through accepted bot adoption without bypassing protection or publication lineage.

<a id="owner-decision--2026-09-10"></a>

## Owner decision — 2026-09-10

The owner approved one catch-up source-adoption PR and one Desktop release. Preserve all upstream ancestry and review the complete intervening range and migration edges. No intermediate Desktop releases or repeated owner merge rounds are required. The target remains `dsh-v0.1.5-alpha.2` even when later upstream releases appear. A tooling PR installs trusted validators before the actual catch-up PR and publishes no intermediate product release. Merge and public release remain separately approved operations.

The [initial assessment](technical-decision.md) records the ordering question that preceded this decision. The [catch-up ADR](../../decisions/20260910-desktop-catch-up-delivery.md) is Accepted and independently reviewed. The [native assessment](native-assessment.md) points to the Accepted Phase B decision and mandatory scenario registry.

## Phase A technical decision readiness

- Outcome: decision-accepted
- Trigger evidence: source-lock/manifest schemas, cross-system validation and publication lineage
- Decision owner: upgrade_decision
- Governing decision: [catch-up delivery](../../decisions/20260910-desktop-catch-up-delivery.md) (Accepted)
- Review mode: independent-agent
- Review result: approved
- Review evidence: upgrade_readiness_review approved exact Phase A ADR on 2026-09-10; baseline-from check applies only to catch-up, migration rejection stays
- Material product decisions: owner approved one catch-up upgrade PR and one Desktop release; tooling installation precedes target upgrade without intermediate product release
- Open blockers: none
- Gate: implementation-ready
- Gate owner: Workflow orchestrator /root
- Confirmed at: 2026-09-10T03:27:11.771053+00:00
- Confirmation basis: Accepted Phase A ADR, independent review approval, owner catch-up decision, baseline host verification passed lint/typecheck/test/build (17,351 passed, 119 skipped), doctor: 0 warnings; Phase B excluded
- Readiness history: overall Phase B remains separately blocked; Phase A design accepted and independently approved

## Phase B technical decision readiness

- Outcome: decision-accepted
- Trigger evidence: native ownership, persisted-format migration, packaged-runtime compatibility and publication evidence schemas
- Decision owner: upgrade_native_assessment and upgrade_decision
- Governing decision: [Mint target integration](../../decisions/20260910-desktop-mint-target-integration.md) and [normative migration registry](../../decisions/20260910-desktop-mint-migration-registry.md) (Accepted); the registry takes precedence for composition, scenarios and report fields
- Review mode: independent-agent
- Review result: approved
- Review evidence: [classification_review design-only approval](phase-b-design-review.json), binding the original proposal and normative registry hashes; design approval does not prove runtime qualification
- Material product decisions: one catch-up upgrade PR and one Desktop release; exact target retained; merge, publication and installed replacement remain separately authorized operations
- Open blockers: none
- Gate: implementation-ready
- Gate owner: Workflow orchestrator /root
- Confirmed at: 2026-09-10T04:40:43Z
- Confirmation basis: Owner exact-target and catch-up approval; Phase A merged at 6ee47a62b853cde7a91b4e43aca6da29754c40fd; Accepted ADR and registry; classification_review approved persisted bilingual fidelity and all 56 IDs; Workflow orchestrator /root confirms no open product or technical choice.
- Readiness history: approved external design persisted as bilingual authoritative artifacts; no Phase B application or shared implementation edit has occurred
