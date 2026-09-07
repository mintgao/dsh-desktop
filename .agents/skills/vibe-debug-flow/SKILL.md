---
name: vibe-debug-flow
description: Investigate a bug, incident, flaky test, performance regression, or unexplained behavior before implementing and verifying a fix.
---

# Debug flow

If a fix request crosses a Vibe Kit upgrade boundary, the activated target-version task must complete evidence-backed adaptation and default verification, then re-evaluate the fix/readiness gate under target rules before shared edits. The source task stops after handoff or manual-new-task degradation.

Follow evidence before edits.

1. Establish expected and observed behavior, impact, environment, frequency, and the smallest reproducible case.
2. Delegate evidence gathering to `vibe_investigator` only for an identified
   independent question. Supply a bounded packet with the role, reproduction
   objective, authoritative references, relevant files/state, expected evidence,
   and limitations; exclude complete conversation history, broad logs, and
   unrelated files. Missing evidence is reported, not invented.
3. Confirm the likely root cause with a discriminating test or observation when feasible.
4. If the user asked only for diagnosis, stop with the evidence-backed cause and proposed next step.
5. If the user asked for a fix, classify the fix and apply `.vibe/core/technical-decision-readiness.md` before the first code edit. For M/L work, scan whether the fix introduces or changes a durable/high-risk boundary; root-cause confirmation alone does not release implementation.
6. When readiness is blocked, route the required read-only `vibe_tech_lead` decision and review passes and stop before editing application/shared code. Follow the core sequential-perspective fallback when native subagents are unavailable.
7. Only after the orchestrator confirms readiness, hand one `vibe_rd` writer the
   confirmed cause, accepted technical boundary, ready-gate evidence, owned
   paths, and expected implementation report. Add regression coverage, keep the
   patch narrowly tied to the cause, and run focused development checks. Reopen
   the gate if implementation discovers a new durable/high-risk choice.
8. Every M/L fix receives independent `vibe_qa` with accepted criteria, final
   diff/baseline, readiness boundary, and configured checks. QA reruns the
   reproduction, maps each criterion to `Pass`, `Fail`, `Blocked`, or
   `Not applicable`, and owns one complete default verification for the unchanged
   candidate. A repeat requires invalid evidence, changed candidate state, or a
   distinct specialized gate, with the reason recorded.

Use the smallest viable/no-history fork when supported. If transport bounding is
absent or uncertain, preserve required perspectives and record
`transport context bounding unavailable`; do not claim prompt isolation.

For M/L incidents, create or update a work item. Record root cause, evidence, fix, regression coverage, skipped checks, and follow-ups. Do not present temporal correlation or a plausible code path as proven causation.
