# Verification: Desktop versioned assembly

English | [中文](verification.zh.md)

## Candidate and result

Independent QA evaluated commit `024eaa1dd70cb741249e70faf15491610d041fbc` under the [accepted criteria](brief.md) and [reviewed decision](technical-review.md). The candidate is not accepted: packaged negative smokes hang and seven default tests fail. QA changed no application code. This report is an evidence-only addition after testing.

The application archive SHA256 is `469881e6f1a185d3a1cad75e2eef7d91b1130c82e66055cd53d058d6b6a31f53`; assembly receipt SHA256 is `52429c42995c1b7e14b11865acb2d7332d98483b78bf9f19dc482489768c8b2d`. Raw local evidence is retained in `/private/tmp/dsh-assembly-qa-024eaa1`; filenames below are relative to that directory.

## Acceptance evidence

| Criterion | Result | Evidence |
|---|---|---|
| AC-1 | Pass | Official RC.2 CLI identity and frozen assembly; `after-use.json` verifies all 25,484 entries in both staged and packaged backends after real use. |
| AC-2 | Fail | Installed identities are recorded, but `packaged-paired-tamper/result.json` shows a 20-second hang after changing both payload and receipt; no bounded diagnostic exit. |
| AC-3 | Fail | Actual authenticated native UI and ordinary quit pass; `packaged-override/result.json` shows the forbidden CLI override also hangs for 20 seconds. |
| AC-4 | Pass | `assembled-runtime-node22.log`: plain Web excludes Mint; external packed Mint Host/Client load, authentication succeeds and the actual advertised Client asset returns HTTP 200. |
| AC-5 | Pass | `native-ui-rc2/result.json` and `evidence/conversation.png`: actual arm64 window, composer submission, deterministic assistant answer and ordinary quit; sandbox enabled, Node integration disabled, context isolation enabled. |
| AC-6 | Pass | Fresh native profile, unchanged existing manifest, interrupted-lock refusal, preserved conflicting package and synthetic prior-data sentinel; no real user data used. User installation and old-format migration remain unverified. |
| AC-7 | Fail | Assembly coupling tests execute, but delivery regression tests fail and the real external compatibility fixture has no regular pipeline caller. |

## Checks and defects

The installed Vibe CLI supports no `--format json`. QA ran the supported complete `./bin/vibe verify .`; sandbox IPC denial invalidated lint/test/build. An unchanged host retry completed: lint, typecheck and build passed; tests reported 22,485 passed, 133 skipped and seven failures. Receipts: `default-verify.json`, `default-verify-host.json` and their logs. No further complete run occurred on this candidate.

- High: [native smoke](../../../apps/desktop-mint/src/main.ts) calls CLI resolution and assembly verification synchronously before its promise rejection handler. Run the packaged executable with `--dsh-package-smoke` plus a forbidden `DSH_DESKTOP_CLI_PATH`, or run a private copy with altered CLI bytes and a correspondingly altered receipt. Both require forced cleanup after 20 seconds; expected behavior is a nonzero diagnostic exit. The valid smoke exits zero in 3.60 seconds. See `negative.py` and the three `packaged-*/result.json` files.
- Blocking regression: [delivery tests](../../../scripts/desktop-delivery/tests/delivery.spec.ts) fail in five cases: combining exact files; rejecting substitutions; blocking changed candidate identity; rejecting source/version mismatches; offline artifact/combine CLI. Four fail with `Missing required versioned assembly inputs`; the version assertion receives a missing Mint manifest error.
- Blocking regression: [workflow test](../../../scripts/desktop-delivery/tests/workflows.spec.ts) requires the literal `build:desktop` after qualification switched to `desktop:stage`.
- Unresolved timeout: [operations test](../../../scripts/desktop-delivery/tests/operations.spec.ts), `preserves catch-up provenance when preparing and finalizing a desktop-only successor`, exceeds 5,000 ms in the complete host run. This receipt does not establish a timing root cause.

`pnpm run doc-sync` completed 33 checks and failed only translation pairing for the verification placeholder. Its quick leaves include all `test:docs` checks. This paired report replaces that placeholder; the pair requires a focused refresh. Receipt: `doc-sync-host.log`.

## Native scope and limitations

Electron 43.4.1 resolved home, logs, user data, session data and temp paths into synthetic roots. The actual packaged app reached usable UI in 6.257 seconds; this is one observed launch, not a benchmark. The screenshot shows the submitted question and answer. Both backend inventories remained unchanged after Host/Client use and native quit. The backend log redacts the readiness token.

The existing native observer uses an obsolete `session.events` property during population. The initial fixture therefore failed before UI readiness; `native-ui` retains that evidence. A temporary fixture using public RC.2 `snapshotEvents()` passed in `native-ui-rc2`. The failed fixture required PID-verified forced cleanup; its harness `normalQuit` field was emitted after that kill and is not evidence of ordinary quit. Only the corrected scenario establishes ordinary quit.

No signed notification, real model, remote publication, installed-user replacement, old-data downgrade or arbitrary-version compatibility claim is made. The source-lock proposal remains unfinalized. A corrected application candidate needs rebound artifacts and independent final verification.
