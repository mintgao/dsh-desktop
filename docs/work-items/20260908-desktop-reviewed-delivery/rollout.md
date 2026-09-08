# Reviewed delivery rollout prerequisites

English | [中文](rollout.zh.md)

## Status

Remote preparation is partially executed; activation remains blocked. The [verification record](verification.md) contains observed protection and baseline evidence; the [accepted decision](../../decisions/20260908-desktop-reviewed-delivery.md) governs bootstrap and activation. Local verification cannot establish actual GitHub approval, notification receipt or publication.

## Authorized preparation results

The owner authorized rollout preparation on 2026-09-08. Repository and PR 64 identities were rechecked without drift. Bootstrap immutability ruleset `22549859` and the secret-free `mint-delivery-bootstrap` environment were created; the environment requires owner approval and permits only `desktop-bootstrap-*` tags. After separate explicit owner authorization of the combined PR-creation/review capability, the repository setting is `can_approve_pull_request_reviews: true`; default token permissions remain read-only. The initial automatic-review rejection was resolved by that specific authorization.

The outgoing candidate uses an isolated worktree based on `main` commit `089d92d9f6e051472c2522af32aac75ed3e04742`, preserving the actual development checkout and excluding unrelated recovery changes. Legacy workflows, App authority and PR 64 remain unchanged until the required bootstrap evidence succeeds. No public release or installed application has changed.

## Exact repository changes for review

The target is `mintgao/dsh-desktop`, repository ID `1344813014`. Preserve the existing public release and immutable tags.

| Control | Observed identity | Required result |
|---|---|---|
| Main protection | Ruleset `21944549` | Retain review and last-push approval; require `Desktop source checks`; remove App bypass |
| Desktop tag creation | Ruleset `21944575` | Retain maintainer creation; remove App bypass |
| Desktop tag immutability | Ruleset `21944588` | Preserve update/deletion protection without bypass |
| Release approval | Environment `mint-publication` | Protected-branch restriction plus required owner ID `154321591`; permit the sole owner's explicit approval |
| Actions defaults | Workflow permission settings | Default read-only token; enable bot PR creation |
| Initial bootstrap | Dedicated tag prefix and secret-free approval environment | Bind the reviewed implementation snapshot; verify actual bot authorship and last pusher |
| Legacy writers | Workflow inventory in distribution configuration | Disable entry points, drain jobs and verify revoked outstanding authority before activation |
| Replacement activation | Reviewed source-controlled activation record | Bind verified controls, historical baseline and migration report |

The three legacy App IDs are `4782984`, `4783001` and `4783016`. Removing workflow references or stored secrets alone cannot prove their outstanding authority has been revoked. Retain administrator evidence and historical receipts without presenting them as proof of current release authority.

## Preserve the pending adoption

After explicit owner authorization, close [legacy PR 64](https://github.com/mintgao/dsh-desktop/pull/64) without merging or deleting its branch. Verify repository, PR number, branch `automation/adopt/dsh-v0.1.2-alpha.4` and head `b02b0bc1ed4492715b7003a0b19b8fe38901cd20` before closure; changed identity blocks reconciliation. Disable and drain legacy writers before final closure verification.

Preserve that exact commit in a durable Git reference, its PR history and the pinned legacy state. The commit includes `scripts/upstream-adoption/align-downstream-package-versions.mjs` and distinct downstream workspace-version fixes that the subsequent alpha.4 adoption must inspect and reuse or explicitly reconcile. Record the disposition as “legacy PR closed; source preserved for replacement adoption.” The publication baseline and source lock remain alpha.3.

Re-run complete discovery and migration preflight. Alpha.4 must remain the next ordered upstream release, with no unresolved legacy adoption PR. The final activation report binds this observed disposition. Failed preservation, closure or verification blocks activation. No closure has been executed by recording this plan.

## Outgoing baseline verification

Two complete checks on the isolated `main` baseline failed only the unchanged spill cleanup boundary fixture; lint, typecheck and build passed. The fixture compared the requested timestamp with the filesystem-rounded timestamp. A separate supporting test correction uses the observed file timestamp as the exact cutoff, preserving the assertion and production cleanup behavior. Other recovery changes remain excluded. Bootstrap visibility uses reviewed seed-owned administrator evidence and fresh rule verification.

## Acceptance after authorization

Keep the initial bot PR open while checking actual bot authorship and owner review eligibility. A separate owner-approved bootstrap probe uses an exact nonpublic draft to verify asset upload, retrieval, deletion and reversible body editing with the ordinary Actions token. Successful cleanup is required; the probe cannot publish or retarget the draft.

After reconciling pending adoption and revoking legacy writers, capture final administrator preflight and baseline evidence. Refresh the same initial PR with matching evidence and active configuration, then review its final head. The first merge introduces the ordinary workflows and verified activation together; an inactive intermediate merge would retire bootstrap before normal adoption could run.

Both native architectures and a newly approved manifest precede any specific public preview. The ARM64 diagnostic smoke does not substitute for that release qualification. This rollout does not itself authorize a public release or replacement of an installed application.

## Initial live bootstrap

The reviewed seed `4944752aa6927b23ae73b18c631a4340b2584ef8` and protected tag `desktop-bootstrap-reviewed-20260908-4944752aa6` were pushed. Owner-approved run `34238478819` reached bootstrap execution but rejected the ruleset timestamp projection before PR creation. Administrator `2026-09-08T21:49:50.402+08:00` and public `2026-09-08T13:49:50.402Z` represent the same instant; all other compared fields matched. The reviewed timestamp correction requires a new seed and plan. No legacy cutover or publication occurred.

## Timestamp candidate verification

The shared timestamp correction passed focused tests, independent review and all 32 documentation gates; the retained administrator response bytes are unchanged. Complete verification passed lint, typecheck and build, with 17,296 tests passing and 116 skipped, but failed the unchanged HMR missing-parent creation test. The same case passes alone on the host; the full-run native watcher timeout remains unresolved. This candidate has not been committed or dispatched as a new bootstrap seed. Owner reauthentication succeeded; the live Controller installation page confirms access is limited to repository `1344813014`. Legacy authority remains unchanged until bootstrap verification succeeds.

## Supporting readiness correction

The [configuration readiness work item](../20260908-config-watch-readiness/brief.md) records the approved and independently verified target sampler. All HMR acceptance cases pass. The combined matrix remains blocked by a baseline compaction timing assertion and a table scroll callback after UI teardown; their local fixture corrections preserve production behavior and require independent verification before a new bootstrap seed is dispatched.

## Corrected candidate acceptance

Independent QA passed the complete configured lint, typecheck, test and build matrix after the two local fixture corrections: 17,306 tests passed and 116 skipped, with no unhandled errors. All 37 candidate file hashes and the committed base remained unchanged during the run. The HMR sampler and timestamp correction are accepted locally; live bootstrap, bot review eligibility, draft access and legacy cutover remain pending.
