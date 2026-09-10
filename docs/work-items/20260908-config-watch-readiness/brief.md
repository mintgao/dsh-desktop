# Repair configuration watcher readiness

English | [中文](brief.zh.md)

- ID: `20260908-config-watch-readiness`
- Size: `M`, shared readiness behavior; supporting the existing L delivery work
- Status: sampler and corrected combined candidate acceptance passed

## Scope

Apply the [accepted decision](../../decisions/20260908-config-watch-readiness.md) to the reusable HMR plugin and its configuration consumers. Preserve the original checkout and all target creation assertions. The decision owns acceptance and resource limits. No module-watching redesign, upstream submission or public release belongs here.

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: shared configuration watcher readiness and backend defaults
- Decision owner: Tech Lead `distribution_design`
- Governing decision: [Accepted configuration readiness decision](../../decisions/20260908-config-watch-readiness.md)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: distribution_review approved owned initial baseline and separate I/O, cleanup and notification
- Material product decisions: none
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-08T15:29:42.746770+00:00
- Confirmation basis: Accepted replacement decision and independent lifecycle approval; controlled baseline failure retained
- Readiness history: unbounded polling rejected; bounded Chokidar approved then failed complete verification; owned baseline and lifecycle replacement independently approved

## Ownership and verification

The orchestrator owns decision/work-item documents. One RD writer owns the HMR correction, focused tests and affected implementation documentation after readiness approval. Independent QA owns acceptance and the complete configured checks for the combined final candidate; the preceding matrix failed and cannot be reused. Native diagnostics and polling experiments remain evidence, not final acceptance.

## Anchor clarification review

Independent reviewer `distribution_review` approved the persisted initial-anchor assumption. The orchestrator confirms the clarified scope remains `implementation-ready` at `2026-09-08T15:05:17.689280+00:00`; no additional ancestor subscription or re-anchoring is authorized by this correction.

## Verification failure

At `2026-09-08T15:19:20.125294+00:00`, the orchestrator reopened the affected implementation decision after complete verification failed two existing HMR cases: immediate file creation and serialized disposal. Lint, typecheck and build passed; 17,298 tests passed and 116 skipped. The failed receipt cannot establish default readiness. Previous approvals remain historical; no further production edit is permitted until the new cause and remedy are independently reviewed.

## Replacement readiness

The orchestrator accepted the independently reviewed owned-baseline replacement at `2026-09-08T15:29:42.746770+00:00`. The failed Chokidar candidate remains historical evidence; implementation is limited to the replacement decision and its synchronization correction.

- Capability limitation: transport context bounding unavailable for reused agents; no isolated-host claim.

## Sampler acceptance

Independent source review approved the final sampler. Independent QA passed all 15 HMR tests in each of six concurrent host processes and both HMR suites in the complete matrix. Documentation passed all 32 checks. The combined matrix passed lint, typecheck and build, with 17,305 tests passing and 116 skipped, but failed an unchanged compaction duration assertion and reported one UI teardown exception. Those failures remain delivery blockers; no retry or release is justified by the sampler result alone.

The separately scoped fixture corrections passed the subsequent complete matrix: 17,306 tests passed, 116 skipped, no unhandled errors; lint, typecheck and build passed. The sampler source remained unchanged.
