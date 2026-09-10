# Reviewed delivery verification

English | [中文](verification.zh.md)

## Scope and decision evidence

[RD-1–RD-6](brief.md) follow the [accepted operational decision](../../decisions/20260908-desktop-reviewed-delivery.md). The owner confirmed the administrator trust model. Tech Lead `distribution_design` authored the decision; `distribution_review` independently approved repeatable seed finalization and scheduled notification identity. The orchestrator reconfirmed implementation readiness at `2026-09-08T12:14:46Z`. No remote writer or notification has been activated by this implementation task.

## Live baseline inspection

On 2026-09-08, read-only GitHub inspection identified repository `mintgao/dsh-desktop` (ID `1344813014`), protected default branch `main`, existing release environment `mint-publication`, and the legacy controller/finalizer/publisher Apps. The environment had branch restrictions but no required reviewers. Main protection required review but had no required status checks; Actions PR creation was disabled. These observations are activation blockers, not assumed corrected configuration.

The last public release is `desktop-v0.1.2-alpha.3.unsigned.1`, Release ID `380641449`, with annotated tag object `e9ee382654e1df501f21ddd012948157a1124adb` resolving to source `67406fc6af451f7f68874cb31c2d0f3242c0c8ad`. Its recorded upstream is `dsh-v0.1.2-alpha.3` at `dd6322d604e00eec1ba5e0c8541159906a21094a`; a Git ancestry check passed. The unresolved adoption remains [PR 64](https://github.com/mintgao/dsh-desktop/pull/64), head `b02b0bc1ed4492715b7003a0b19b8fe38901cd20`.

Both actual public DMGs were downloaded and matched their retained checksums. The legacy checksum entries use a single `bundle/` prefix, so direct `shasum -c` from the flat download directory could not locate them. Explicit validation of that prefix and exact basenames preserved the original expected digests; no release file was modified.

| Architecture | Bytes | SHA-256 |
|---|---|---|
| arm64 | 176212489 | `e7f45dc0ec39504171f2248732de3c1eeab756c6e2f1388d745f022ffa7020ce` |
| x64 | 179047088 | `2be2e3fc1ece76132fd7ba2ce5b5d87010fc8895f68213e0148c4c779ebe3e49` |

Pinned legacy adoption evidence was read from `state/upstream-adoption.json` at commit `fd2ad450f6524d7e9047743064e19cfa235373bd` of the existing state branch. Its byte digest is `290e509f5ad48ac13233ef7bfdf252770054ed26d48323240efc54de563812aa`. Schema 2 records alpha.3 as last published and alpha.4/PR 64 as blocked. This agrees with the actual public baseline; the older `.github/upstream-sync-state.json` records a stale version and cannot seed bootstrap.

## Executed operational checks

The authenticated read-only `migration-preflight` command generated the same baseline asset hashes and identified PR 64 as the unresolved adoption. It returned `blocked` for the actual protection, legacy-writer and administrator-evidence prerequisites. This is a successful refusal check; it does not establish activation readiness. The live command used maintainer credentials. Runtime-token behavior requires its separate permission fixtures and actual Actions acceptance.

The ARM64 copied-installation smoke passed using the local `0.1.2-alpha.3` DMG with SHA-256 `a47fa900fa2f48de0d9744ab35bff5075acd0196c86aa7ee83c075bdb3973a48`. Both read-only mounting and temporary copied installation started the bootstrap and HTTP backend, stopped them, and cleaned up their resources. The dirty diagnostic candidate correctly remained ineligible for qualification. This check does not cover x64, a visible application window or existing user data.

## Data compatibility

The source comparison from the retained release commit through the current development baseline and scoped changes does not alter DSH session, settings, credential or workspace persistence owners. Existing differences include sandbox execution helpers, private experimental Inspector wire changes, dependency declarations and test/development tooling; these are not evidence of a persisted user-format migration. The candidate [assessment](../../../.github/desktop-delivery/data-compatibility.json) explicitly excludes future upstream adoptions and untested downgrade/restore behavior.

Temporary native installation tests use isolated application data. They cannot establish that an existing user's data can be upgraded or reopened by an older runtime. A future adoption that changes persistence requires new assessment and the governing migration evidence before promotion.

## Implementation acceptance

Independent QA accepted RD-1–RD-6 for the frozen local implementation. The initial 34 focused tests and 13 affected recovery/notification tests passed. Real Git scenarios cover human correction, stale-seed refusal, lock-only refinalization, two successive desktop fixes and subsequent ordered upstream adoption. Approved mutation failures create deduplicated status notices; invalid approval cannot create notices.

The canonical `./bin/vibe verify . --format json` ran once for the final implementation and passed all four configured commands: lint, typecheck, test and build. Vitest reported 1,076 files and 17,339 tests passed, with 9 files and 116 tests skipped. No configured command failed or skipped. All 45 implementation fingerprints and the tracked diff remained unchanged during verification. The complete documentation check passed 32 gates before this evidence-only update.

QA refreshed the diagnostic candidate and repeated the actual ARM64 copied-installation smoke with final configuration. The report digest is `f1dc4c3d4fcb5165c3ac0e0840304e5e1a94b9250f493bcb182f41f865f842b8`; mounted and copied application startup, authenticated HTTP, process cleanup, unmounting and removal passed. Qualification and publication eligibility remained false because the checkout is dirty.

Local receipts are `/private/tmp/dsh-reviewed-final-default.json`, `/private/tmp/dsh-reviewed-final-candidate-state.json`, `/private/tmp/dsh-reviewed-final-copy-smoke.json` and `/private/tmp/dsh-reviewed-final-qa.md`. QA used a separate agent from implementation; transport context bounding was unavailable, so no isolated-host claim follows.

Live rollout remains blocked by the documented protection, legacy authority, bot-review, draft-access and pending-adoption prerequisites. No public release, GitHub mutation, installed-application replacement, x64 qualification, signed artifact, native GUI or existing-user-data migration was verified. The [rollout record](rollout.md) owns the next authorized actions; local acceptance does not activate the replacement.

## Outgoing main-based candidate

The isolated outgoing branch starts from protected `main` at `089d92d9f6e051472c2522af32aac75ed3e04742` and includes the separate spill timestamp fixture correction `32ad30353e25aedfc9dfb75775136a78b014dba5`. It excludes the recovery commit and other unrelated working-tree changes. The bootstrap visibility correction and actual administrator evidence received independent technical review.

Independent QA ran the supported complete `./bin/vibe verify .` command from this baseline, whose Vibe CLI does not support `--format`. After two candidates failed the unchanged spill fixture, the corrected final candidate passed lint, typecheck, test and build: 17,294 tests passed and 116 skipped, with 1,074 files passed and 9 skipped. All 107 outgoing file hashes remained unchanged during the final run. This evidence-only update follows that run.

The retained receipt is `/private/tmp/dsh-rollout/qa-default-ready.log`, SHA-256 `7d0d45fa84002633a750b9217e0ba6d56d66c356352d288ff5c417263dba96ce`; `/private/tmp/dsh-rollout/qa-final.md` retains both earlier failures and final acceptance. The outgoing documentation check passed 32 gates, with final evidence text separately checked for pairing, links and wrapping. No new native qualification or remote execution is implied by these source checks.
