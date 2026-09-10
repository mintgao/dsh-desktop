# Verification of downstream policy and update design

English | [中文](verification.zh.md)

## Candidate and scope

This is a documentation-only review against [the work item](brief.md), based on checkout `507e5beb4f76b7e7dd9f4986ab7d88ff1b2eb936`. No application, workflow, credential, release or installed-client change was made. Existing onboarding and test edits and the untracked development directories are outside this task.

## Independent evidence

Investigator `update_investigation` inspected remote state and Actions on 2026-09-08. The [state branch](https://github.com/mintgao/dsh-desktop/tree/automation/upstream-adoption-state) returned revision 33, updated at `2026-09-05T05:48:22Z`. PR 64 had no reviews and head `b02b0bc1ed4492715b7003a0b19b8fe38901cd20`. The linked brief records historical evidence and the current approval blocker separately.

Tech Lead `distribution_review` approved the prior [ADR](../../decisions/20260908-desktop-update-delivery.md) after checking ordering, final-artifact approval, sole-writer migration and bounded retries. That reviewed English revision has SHA-256 `4b7a68be4ac5bf00431ab75fec8be82d50d9b80c7cc0a4780ecd921929c9e6f3`; the receipt does not cover subsequent owner clarifications about notifications and unified client updates. The design remains Proposed; this receipt does not approve implementation.

Independent QA `documentation_qa` found no material content defect and passed AC-1 through AC-4 using exact files and the bounded investigation/review receipts. The orchestrator owns command evidence for AC-5 below. The QA did not run native or release operations.

## Checks

| Check | Result | Scope |
|---|---|---|
| `pnpm run test:docs` | Pass: 15 gates | Final root-rule budget correction included |
| `pnpm run lint` | Pass | Configured lint, including its build prerequisite |
| `pnpm run doc-sync` | Pass: 32 gates | Includes bilingual pairing, links, documentation tests and corrected root-word budget |
| `git diff --check` | Pass | Documentation edits |
| Targeted desktop, Bundle and notification tests | Prior-turn Pass: 14 files, 56 tests | Existing implementation only; not proof of the redesign |
| Full default Vibe verification | Not applicable | No application implementation candidate; documentation commands provide task-specific evidence |
| Packaged native, signed installation, upgrade and production permissions | Not run | Required future implementation acceptance, not delivered behavior in this task |

The first sandboxed check attempts failed because tsx could not open a local IPC pipe; unchanged host retries were used. No product failure was bypassed. Root-rule word-budget failures were corrected by shortening the new rule. Local command logs are under `/private/tmp/dsh-redesign-*.log`; they are not committed product artifacts.

## Remaining decisions

The owner subsequently confirmed the GitHub-protection trust model. The [reviewed delivery work item](../20260908-desktop-reviewed-delivery/brief.md) owns the accepted implementation decision; its [verification record](../20260908-desktop-reviewed-delivery/verification.md) owns later implementation results. This design-only record does not establish native recovery or live release reliability.
