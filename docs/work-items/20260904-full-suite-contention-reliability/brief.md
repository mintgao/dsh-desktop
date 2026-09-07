# Stabilize full-suite verification under contention

English | [中文](brief.zh.md)

- ID: `20260904-full-suite-contention-reliability`
- Size: `L`
- Status: complete
- Created: 2026-09-04

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: The accepted Inspector readiness decision still governs its implementation. Final documentation checks also revealed that the exact Vibe Kit-managed root instruction block contains hard-wrapped prose and pushes the whole-file word count above the upgraded ceiling. Adapting the repository checker changes a shared documentation contract and requires a reviewed triggered-M decision inside this L work item.
- Decision owner: Tech Lead (`inspector_ack_decision_author`)
- Governing decision: [Correlated Client Console readiness](technical-decision.md) (`Status: Accepted`); [Preserve managed instructions in project documentation checks](managed-instruction-doc-gates.md) (`Status: Accepted`)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: Independent Tech Lead `inspector_ack_decision_review` approved both exact decisions. For the managed-instruction decision, review first required `bin/vibe`-compatible universal-newline hashing and independent negative coverage for every ownership predicate, then approved the persisted amendments.
- Material product decisions: none
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-04T14:42:44+08:00
- Confirmation basis: Both exact governing decisions are Accepted; the independent reviewer approved the managed-instruction amendments after checking hashing, failure coverage, masking, budget, recovery, and compatibility; no material product decision or open blocker remains.
- Readiness history: 2026-09-04T12:41:15+08:00 — `not-assessed + blocked` moved to `no-new-durable-decision + implementation-ready` based on the first test-only hypothesis. 2026-09-04 — concurrent reproduction proved that `Runtime.enable` can complete before Client Console installation and permanently lose a log event; the record reopened as `decision-required + blocked` and the work was reclassified from M to L before any shared implementation edit. 2026-09-04 — the Tech Lead decision author defined protocol versioning, correlation, readiness, failure, cleanup, compatibility, and deterministic verification. 2026-09-04 — independent review required explicit Runtime lifecycle serialization and additional failure coverage; the exact amendments were persisted. 2026-09-04T13:02:04+08:00 — the independent reviewer approved the amended decision, and the workflow orchestrator confirmed `decision-accepted + implementation-ready` with no remaining blocker. 2026-09-04T14:30:26+08:00 — focused documentation checks exposed a new shared-checker decision: the installed Vibe Kit-managed block cannot be reformatted without invalidating activation, yet it violates the project-owned wrap and budget checks. The record reopened as `decision-required + blocked` before any checker edit. 2026-09-04 — independent review required doctor-compatible universal-newline hashing and independent ownership-predicate failures. 2026-09-04T14:42:44+08:00 — the reviewer approved the exact amendments and the workflow orchestrator confirmed `decision-accepted + implementation-ready` with no remaining blocker.

## Goal

Restore a passing default Vibe verification receipt by closing the Inspector Console readiness race and making the other three load-sensitive tests express their existing behavioral contracts without depending on quiet-host timing.

## Context

Removing ignored build residue from a deleted package restored the Host library build. The next complete test run passed 17,249 tests and failed four: one two-pass Oxlint subprocess test exceeded Vitest's default five-second budget, one Inspector test lost a Console event, one Bash executor test treated a 150 ms return threshold as correctness, and one session-snapshot timeout test exposed Vitest's generic outer timeout instead of its owned diagnostic. Concurrent Inspector reproduction showed that `Runtime.enable` returns before the browser Client applies `client-console/enable`; a log in that interval is permanently lost. The other three failures reproduce as host-contention-sensitive test defects.

## Scope

- In: define and implement correlated Client Console enable acknowledgement and failure semantics; replace wall-clock correctness assertions with observable state; register asynchronous event observation before triggering the event; preserve owner-specific timeout diagnostics; assign finite lane-appropriate budgets to subprocess-heavy tests; update Inspector documentation and governing Agent Notes; define and implement exact handling for framework-managed root instructions in project documentation checks; and record focused plus default verification evidence.
- Out: public package APIs, session formats, shell process lifecycle, Oxlint behavior, global Vitest concurrency or retry policy, unrelated Inspector capabilities, and unrelated test cleanup.

## Acceptance criteria

- [x] AC-1: The Oxlint fix-retry contract still proves that only final diagnostics are printed and has a finite budget appropriate for two real subprocess passes under the configured full-suite worker topology.
- [x] AC-2: The Bash `start()` contract proves that the returned handle is running before the child is allowed to complete, without a machine-speed threshold.
- [x] AC-3: Inspector `Runtime.enable` remains pending until the browser Client has installed the Console observer for that exact source generation and Runtime session; disconnect, stale acknowledgement, and disposal fail or settle the pending enable without leaking provisional subscriptions.
- [x] AC-4: The session-snapshot child-turn timeout path reports its owned child and minimum-turn diagnostic instead of Vitest's generic `waitFor` timeout, including under scheduler delay.
- [x] AC-5: A deterministic protocol test holds the acknowledgement, proves enable is not ready before it, releases it, and proves Console delivery; focused tests for all four corrected paths pass without retries, global serialization, or fixed sleeps as correctness conditions.
- [x] AC-6: Inspector README and governing Agent Note describe the shipped acknowledgement, ownership, and failure behavior in both languages.
- [x] AC-7: One independent QA run of default `./bin/vibe verify . --format json` passes every configured check on the unchanged final candidate; doctor, documentation synchronization, and `git diff --check` are healthy.
- [x] AC-8: Documentation checks preserve the exact installed Vibe Kit-managed root block and its activation hash, exempt only that delimited managed region from project-owned prose wrapping, retain an explicit frozen whole-file word ceiling, and continue rejecting ordinary project-owned hard wraps and excess words.

## Design and technical notes

- Inspector readiness requires an Accepted technical decision and independent review before implementation.
- Synchronize on observable state or an event waiter registered before the trigger. A finite timeout remains a failure bound, not the success condition.
- Limit timeout expansion to subprocess-heavy tests whose work legitimately exceeds Vitest's default budget under configured contention.
- Keep one RD writer for the implementation and one independent QA owner for the final complete verification after the readiness gate is restored.

## Risks and open decisions

- A test-only Inspector timeout would conceal the lost-event interval; the protocol must make readiness observable.
- An unbounded waiter could turn a clear assertion failure into a hung suite; every waiter retains a finite owner-specific failure budget.
- A stale or disconnected Client acknowledgement could enable the wrong transport generation or leak provisional state; the technical decision must define correlation, cancellation, and disposal before code changes.
- Global retries, worker reduction, and suite-wide timeout increases would hide the affected ownership points and remain out of scope.
- Reformatting or locally regenerating the Vibe Kit-managed block would invalidate the activated installation; a broad Markdown exclusion would hide project-owned documentation defects.
