---
name: vibe-feature-flow
description: Deliver a new feature or end-to-end behavior change from problem framing through design, implementation, and independent verification.
---

# Feature flow

Use `.vibe/core/operating-model.md` to classify the work and apply
`.vibe/core/technical-decision-readiness.md` before implementation.

If this flow resumes an unfinished goal after a Vibe Kit upgrade, first require positive target-version activation, completed evidence-backed adaptation, and a passing default verification receipt under `AGENT_INSTALL.md`. Reclassify and rerun the readiness scan under the target rules before any further shared edit; an old-task apply receipt cannot release implementation.

- For S work, confirm the behavior and scan for readiness triggers. It may touch
  multiple tightly coupled implementation, test, or documentation files; file
  count alone does not require M. Implement directly only when it remains clear,
  local, reversible, and low risk; otherwise reclassify it before editing.
- For M/L work, create a work item with `./bin/vibe work-item <slug> --size <M|L>` if one does not exist.
- Delegate to `vibe_pm` to establish goal, scope, non-goals, and testable acceptance criteria when shaping is needed.
- Delegate to `vibe_ux` when user flow or interface behavior changes and independent design judgment is useful.
- Treat product-shaped and implementation-ready as separate states. After shaping, scan size, risks, open decisions, relevant architecture, and governing decisions; record the required readiness outcome for M/L work.
- Treat user-flow, shared contract/API, and unresolved acceptance work as at least
  M; cross-system and high-risk boundaries are L. When a decision or review is
  required, route a read-only `vibe_tech_lead` author pass, persist its exact
  proposal, and use a different Tech Lead instance for required native review.
  Follow the core sequential-perspective fallback when independent subagents are
  unavailable.
- The orchestrator confirms `implementation-ready` only when the core release conditions are complete. While blocked, do not edit application/shared code; return the single next decision or review handoff and ask the user only for material product choices.
- Record only decisions that affect implementation or acceptance; do not create empty phase documents or ceremonial ADRs.
- Use one `vibe_rd` writer to implement the accepted scope, governing decision
  boundary, and appropriate tests only after the gate is ready. RD runs focused
  development checks, not the complete default matrix for an unchanged normal
  M/L candidate.
- If implementation discovers a new durable/high-risk choice, stop the affected edit, reopen readiness, and complete the decision/review path before resuming.
- After implementation, hand independent `vibe_qa` the accepted criteria,
  governing boundary/readiness evidence, implementation report, final diff or
  baseline, and configured checks. QA records every criterion as `Pass`, `Fail`,
  `Blocked`, or `Not applicable` and owns exactly one complete default
  `./bin/vibe verify . --format json` run for the unchanged normal M/L candidate.

Every specialist handoff names the role/mode, bounded task, work item, minimum
authoritative evidence, applicable criteria, ownership boundary, expected output
and evidence, blockers, and capability limitations. Exclude full conversation
history and unrelated files by default; use the smallest/no-history fork when
supported. If evidence is missing, request or report the exact artifact instead
of guessing. When transport bounding is unavailable or uncertain, record
`transport context bounding unavailable` and preserve required roles.

Use PM, UX, exploration, or QA only for an identified ownership question. A
specialist does not self-expand or recursively delegate unless its packet names
a genuinely independent subproblem. Ask the user only for decisions that would
materially change the result. A later complete default verification requires an
invalid prior receipt, changed candidate state, or a distinct specialized gate;
record the reason and candidate state.

Close with changed behavior, evidence, skipped checks, risks, and follow-ups. Update durable context only if the project truth changed.
