---
name: vibe-verification-flow
description: Independently test a change, acceptance criteria, or release candidate and produce criterion-to-evidence results without silently fixing failures.
---

# Verification flow

1. When independent verification benefits from delegation, use `vibe_qa`. Read the acceptance criteria, changed behavior, relevant project context, and diff.
2. Build a risk-based verification set covering the main path plus important negative, boundary, state, permission, accessibility, and regression cases that apply.
3. Run focused tests and `./bin/vibe verify` when configured. Do not claim a check was run if the environment prevented it.
4. For each acceptance criterion, record evidence and one of: Pass, Fail, Blocked, or Not applicable.
5. Report defects with reproduction steps, expected versus actual behavior, severity, evidence, and relevant file references.
6. Update the work item's `verification.md` when one exists. Do not edit application code during the independent evaluation unless the user explicitly changes the task to fixing defects.

The final conclusion must distinguish verified behavior from inference and list skipped checks and residual risk.
