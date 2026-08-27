# Quality gates

Apply gates in proportion to the work size and risk.

## Required for every code change

- The changed behavior is understood and described.
- The smallest relevant automated or manual check is run.
- Existing unrelated behavior is not intentionally changed.
- Failures and skipped checks are reported plainly.

## Additional for M work

- Acceptance criteria exist before implementation is considered complete.
- User-visible states are covered when relevant: loading, empty, success, error, disabled, and permission states.
- Relevant lint, type, test, and build commands from `.vibe/project.yaml` are run when available.
- QA maps each acceptance criterion to evidence.

## Additional for L work

- Risks, migration, compatibility, and rollback are explicit.
- New or changed security and privacy boundaries are reviewed.
- Critical paths have regression coverage or a documented reason why they do not.
- A decision record exists for durable architectural choices.

## Vibe Kit feedback gate

- At M/L Close, classify observed workflow friction as business-specific, environmental, or a reusable Vibe Kit gap.
- Create local feedback only for evidence-backed framework gaps; an empty retrospective produces no artifact or notification.
- Feedback remains local and non-blocking unless the user approves the exact outbound payload for an external destination.

Use `./bin/vibe verify` to run the configured project checks. The command complements task-specific validation; it does not replace it.
