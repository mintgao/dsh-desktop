# Verification: Desktop versioned assembly

English | [中文](verification.zh.md)

## Candidate and result

Independent QA evaluated clean commit `02340c796b8cb9a97ef0233a86cdae56bc1dc5bc` under the [accepted criteria](brief.md) and [reviewed decision](technical-review.md). AC-1 through AC-7 and the complete default verification pass. The candidate is accepted for the bounded local assembly scope; publication and user installation are excluded. QA changed no application code; this report is an evidence-only addition after testing.

The application archive SHA256 is `d91e5a66638fa1fc64ddc1762bc27e7a4e6a6e20336fd774a238d76296d33184`; assembly receipt SHA256 is `ef5db71ff7ac3c4bba190b7b052a5c4d5ddecd9265eff89d53ac38e441b94ea2`. Native/scenario evidence remains in `/private/tmp/dsh-assembly-qa-3077ec3`; scenario filenames below are relative to that directory. Final default evidence is in `/private/tmp/dsh-assembly-qa-02340c7`. QA confirmed the application/runtime sources and inputs are unchanged from `3077ec3` and both artifact hashes still match; the fixture-only correction requires no native rebuild or repeated native scenarios.

## Acceptance evidence

| Criterion | Result | Evidence |
|---|---|---|
| AC-1 | Pass | Exact official RC.2 CLI identity, frozen inputs and real assembled-runtime check; `after-use.json` verifies all 25,484 entries in both staged and packaged backends after real use. |
| AC-2 | Pass | Actual distinct component identities; `packaged-paired-tamper/result.json` records exit 1 with the embedded-shell identity diagnostic after both payload and receipt were changed. |
| AC-3 | Pass | Valid compiled smoke exits 0; forbidden CLI override exits 1; actual authentication and ordinary quit pass. `shutdown/result.json` proves a child ignoring SIGTERM is terminated after escalation. Default tests cover malformed readiness, navigation and diagnostic redaction. |
| AC-4 | Pass | `assembled-runtime.log`: independent plain Web configuration excludes Mint; external packed Mint Host/Client load, authentication succeeds and the actual advertised Client asset returns HTTP 200. |
| AC-5 | Pass | `native-ui-rc2/result.json` and `native-ui-rc2/evidence/conversation.png`: actual arm64 window, composer submission, deterministic answer and ordinary quit. Renderer sandbox and context isolation are enabled; Node integration is disabled. |
| AC-6 | Pass | Fresh profile and existing synthetic profile reopen; prior history, profile manifest, patch and data sentinel preserved. Interrupted-lock and conflicting-package refusals pass. User installation and old-format migration are reported separately as unverified. |
| AC-7 | Pass | Negative assembly/coupling tests pass; the replaced staging path and regular source/native qualification pipelines invoke `test:desktop:assembly`; source CI also invokes the compiled packaged smoke. |

## Complete checks

The installed Vibe CLI supports no `--format json`. QA ran the supported complete `./bin/vibe verify .` exactly once for this final candidate with host access established by prior sandbox IPC failures. The uninstrumented run passed lint, typecheck, test and build in 169.99 seconds: 22,496 tests passed, 129 skipped; 1,282 test files passed, 12 skipped. No native probes or other QA tests ran concurrently. Receipt: `/private/tmp/dsh-assembly-qa-02340c7/default-verify.json`; complete output: `default-verify.log` in that directory.

`pnpm run doc-sync` passed all 34 checks on `3077ec3`; later implementation-report, verification-report and brief changes are evidence-only. Its quick leaves include all `test:docs` checks. Receipt: `/private/tmp/dsh-assembly-qa-3077ec3/doc-sync.json`. The real `pnpm run test:desktop:assembly` passed. Final report/brief updates are evidence-only; their pairing and whitespace checks pass without repeating complete verification.

## Verification history

The `3077ec3` default run failed three operations timeouts. A justified test-lane-only diagnostic with external phase tracing reproduced one CLI timeout, with 22,495 tests passed and 129 skipped. The trace located the stalled phase inside `pnpm install`. A private loopback comparison showed that the frozen local-link install remained alive while pnpm update metadata was held; fixture-local `updateNotifier: false` completed with zero registry requests. Evidence: `/private/tmp/dsh-operations-aggregate-3077ec3/phase-findings.md`, `test-lane-result.json` and `pnpm-notifier-0i28rev6/result.json`. The precise external network condition of the original failure is unknown.

The final correction changes only the synthetic install fixture, retaining real CLI execution, version rejection, credential isolation and all deadlines. That changed test candidate and the failed prior receipt justify the new canonical default run. Both historical 5-second cases also pass in the final aggregate; their earlier timing variation was not independently eliminated by a timeout change. No passing result replaces or hides the historical failures.

## Native observations

The compiled valid smoke exits 0 in 2.38 seconds. Forbidden override exits 1 in 0.127 seconds with `Packaged CLI overrides are unavailable`. Combined payload/receipt tampering exits 1 in 2.66 seconds with `Assembly receipt differs from native shell identity`. All three complete without forced cleanup; `negative.py` records the exact private invocations.

Electron 43.4.1 resolves home, logs, user data, session data and temp paths into synthetic roots. The app reaches usable UI in 5.056 seconds on fresh launch and 4.613 seconds on reopen; these are observations, not benchmarks. Both scenarios submit a real composer message and show the deterministic response. Persisted events after the final user event include `assistant/message`, `step/end` and `turn/end`. Both scenarios quit normally. The backend log redacts readiness tokens; both complete backend inventories remain unchanged after Host/Client use and native quit.

The temporary native observer uses public RC.2 `snapshotEvents()`. `native-ui-rc2/result.json`, `native-ui-rc2/reopen-result.json`, the conversation screenshots and stored event receipts distinguish the fresh and existing-data scenarios. The synthetic session/data evidence makes no old-format compatibility claim.

## Prior candidate and limits

Candidate `024eaa1` failed two hanging packaged negatives and seven default tests. Its receipts remain in `/private/tmp/dsh-assembly-qa-024eaa1`; the prior report remains in Git history. Changed smoke handling, delivery fixtures and pipeline wiring changed the source and packaged artifact, requiring this new full verification. Corrected negative smokes, delivery/workflow assertions and the final operations aggregate pass. The initial native observer failure used an obsolete session property; only corrected temporary-fixture scenarios establish ordinary quit.

No signed notification, real model, remote publication, installed-user replacement, old-data downgrade or arbitrary-version compatibility claim is made. The source-lock proposal remains unfinalized. The final report and locally verified work-item status do not authorize publication or installed-app replacement.
