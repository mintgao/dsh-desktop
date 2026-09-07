---
name: vibe-verification-flow
description: Independently test a change, acceptance criteria, or release candidate and produce criterion-to-evidence results without silently fixing failures.
---

# Verification flow

1. For every M/L implementation, use an independent `vibe_qa` perspective. Its
   bounded packet names the role, verification objective, work item, accepted
   criteria, governing technical boundary, readiness/review evidence,
   implementation report, current diff/baseline, configured checks, expected
   criterion-to-evidence output, blockers, and capability limitations. Exclude
   the implementation author's full conversation/reasoning and unrelated files.
   Missing evidence is reported or requested, never reconstructed from guesswork.
   Apply the readiness and review boundary in
   `.vibe/core/technical-decision-readiness.md`; QA does not replace that gate.
2. Build a risk-based verification set covering the main path plus important negative, boundary, state, permission, accessibility, and regression cases that apply. Verify that implementation stayed inside the accepted technical boundary; do not use post-implementation QA as a substitute for missing readiness evidence.
3. Inspect prior verification evidence and candidate identity first. For one
   unchanged normal M/L final candidate, run default
   `./bin/vibe verify . --format json` exactly once as the canonical full matrix,
   plus applicable task-specific scenarios. Run it again only when the prior
   evidence failed, was blocked, malformed, partial, stale or otherwise invalid;
   shared candidate-defining state changed; or a post-upgrade, release, or other
   specialized gate independently requires a complete run. Record the reason and
   candidate state. A partial `--only` receipt cannot close post-upgrade takeover.
4. Treat configured failed/skipped checks as blocking, report unconfigured checks
   explicitly, and do not claim a check ran when the environment prevented it.
   For each acceptance criterion, record evidence and exactly one of: `Pass`,
   `Fail`, `Blocked`, or `Not applicable`. For readiness behavior, distinguish
   deterministic artifact/distribution checks from live Agent or host scenarios;
   static string assertions are not evidence that an Agent actually stopped or
   routed correctly and do not prove measured token reduction.
5. Report defects with reproduction steps, expected versus actual behavior, severity, evidence, and relevant file references.
6. Update the work item's `verification.md` when one exists. Do not edit application code during the independent evaluation unless the user explicitly changes the task to fixing defects.

The final conclusion must distinguish verified behavior from inference and list skipped checks and residual risk.

Use the smallest viable/no-history fork when supported. If transport bounding is
absent or uncertain, preserve QA independence and record
`transport context bounding unavailable`; do not claim prompt isolation or token
reduction.
