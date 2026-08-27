---
name: vibe-feature-flow
description: Deliver a new feature or end-to-end behavior change from problem framing through design, implementation, and independent verification.
---

# Feature flow

Use `.vibe/core/operating-model.md` to classify the work.

- For S work, confirm the behavior, implement directly, and run focused verification.
- For M/L work, create a work item with `./bin/vibe work-item <slug> --size <M|L>` if one does not exist.
- Delegate to `vibe_pm` to establish goal, scope, non-goals, and testable acceptance criteria when shaping is needed.
- Delegate to `vibe_ux` when user flow or interface behavior changes and independent design judgment is useful.
- Record only decisions that affect implementation or acceptance; do not create empty phase documents.
- Use one `vibe_rd` writer to implement the accepted scope and appropriate tests when delegating implementation.
- After implementation, delegate an independent pass to `vibe_qa` for M/L work and update the work item's `verification.md` with criterion-to-evidence results.

Delegate PM, UX, exploration, or QA work when independent analysis materially improves an M/L task. Parallelize read-heavy work only when the parts are genuinely independent, wait for requested results, and synthesize them before implementation. Ask the user only for decisions that would materially change the result.

Close with changed behavior, evidence, skipped checks, risks, and follow-ups. Update durable context only if the project truth changed.
