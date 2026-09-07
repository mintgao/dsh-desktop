---
name: vibe-implementation-flow
description: Implement an already specified requirement, design, or technical plan with focused tests and traceable evidence.
---

# Implementation flow

When an unfinished implementation request crosses a Vibe Kit upgrade boundary, resume only in the activated target-version task after adaptation and default verification. Re-evaluate the work item and technical-decision gate under the target rules before shared edits; do not rely on source-task self-report or an apply/doctor receipt as activation evidence.

1. Read the governing brief, acceptance criteria, design notes, project rules, relevant architecture, and `.vibe/core/technical-decision-readiness.md`.
2. Resolve contradictions before editing. Make reasonable local assumptions when they do not alter product scope, and record them.
3. Before the first application/shared code edit—even when the user asks directly for implementation—preflight size, risks, open decisions, relevant architecture, readiness outcome, governing decision status, review evidence, blockers, and gate confirmation.
4. If the core contract applies and evidence is missing or invalid, stop implementation. Record the blocking reason and next handoff; route read-only `vibe_tech_lead` decision/review passes as required. Do not turn an unresolved technical trade-off into a local assumption.
5. Use one writer for shared application code only when the gate is
   `implementation-ready` (or the work is a qualifying S task). A qualifying S
   task may span multiple tightly coupled implementation, test, or documentation
   files; file count alone is not an M trigger. User-flow, shared contract/API,
   or unresolved acceptance work is at least M, and cross-system/high-risk work
   is L.
6. Implement the smallest coherent change inside the accepted decision boundary, including error paths, compatibility, and documentation affected by the behavior. If a new durable/high-risk choice appears, stop the affected edit and reopen readiness before continuing.
7. RD runs focused checks during development: changed units, affected
   integrations, important error paths, and directly related regressions. For an
   unchanged normal M/L candidate, do not run the complete default matrix.
8. Hand the completed M/L change to independent `vibe_qa` with the accepted
   criteria, governing boundary/readiness evidence, implementation report, final
   diff or baseline, and configured checks. QA records each criterion as `Pass`,
   `Fail`, `Blocked`, or `Not applicable` and owns exactly one complete default
   `./bin/vibe verify . --format json` run for that candidate.

Every delegated packet names the role/mode, bounded objective, work item,
minimum authoritative evidence, applicable criteria, ownership boundary,
expected output/evidence, blockers, and capability limitations. Exclude complete
conversation history and unrelated files by default, and use the smallest viable
or no-history fork when the host supports it. Missing evidence is requested or
reported, not invented; absent/uncertain transport bounding is disclosed as
`transport context bounding unavailable` without removing a required role.

A repeated complete default run is allowed only after failed, blocked,
malformed, partial, stale or otherwise invalid evidence; after shared
candidate-defining state changes; or for a post-upgrade, release, or other
specialized gate with its own complete-verification requirement. Record the
reason and candidate state. Static prompt/distribution checks do not prove live
host behavior or measured token savings.

Report files changed, important decisions, verification evidence, checks not run, and remaining risks. Do not broaden the feature to satisfy unrelated cleanup preferences.
