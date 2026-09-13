# Verification: Desktop versioned assembly

English | [中文](verification.zh.md)

## Candidate and result

Independent QA evaluated clean commit `3077ec381584833bf81321f36780ff61686a2d3b` under the [accepted criteria](brief.md) and [reviewed decision](technical-review.md). The bounded assembly scenarios pass. Overall acceptance remains blocked by three default-suite timeouts under investigation. QA changed no application code; this report is an evidence-only addition after testing.

The application archive SHA256 is `d91e5a66638fa1fc64ddc1762bc27e7a4e6a6e20336fd774a238d76296d33184`; assembly receipt SHA256 is `ef5db71ff7ac3c4bba190b7b052a5c4d5ddecd9265eff89d53ac38e441b94ea2`. Raw local evidence is retained in `/private/tmp/dsh-assembly-qa-3077ec3`; filenames below are relative to that directory.

## Acceptance evidence

| Criterion | Result | Evidence |
|---|---|---|
| AC-1 | Pass | Exact official RC.2 CLI identity, frozen inputs and real assembled-runtime check; `after-use.json` verifies all 25,484 entries in both staged and packaged backends after real use. |
| AC-2 | Pass | Actual distinct component identities; `packaged-paired-tamper/result.json` records exit 1 with the embedded-shell identity diagnostic after both payload and receipt were changed. |
| AC-3 | Pass | Valid compiled smoke exits 0; forbidden CLI override exits 1; actual authentication and ordinary quit pass. `shutdown/result.json` proves a child ignoring SIGTERM is terminated after escalation. Default tests cover malformed readiness, navigation and diagnostic redaction. |
| AC-4 | Pass | `assembled-runtime.log`: independent plain Web configuration excludes Mint; external packed Mint Host/Client load, authentication succeeds and the actual advertised Client asset returns HTTP 200. |
| AC-5 | Pass | `native-ui-rc2/result.json` and `evidence/conversation.png`: actual arm64 window, composer submission, deterministic answer and ordinary quit. Renderer sandbox and context isolation are enabled; Node integration is disabled. |
| AC-6 | Pass | Fresh profile and existing synthetic profile reopen; prior history, profile manifest, patch and data sentinel preserved. Interrupted-lock and conflicting-package refusals pass. User installation and old-format migration are reported separately as unverified. |
| AC-7 | Pass | Negative assembly/coupling tests pass; the replaced staging path and regular source/native qualification pipelines invoke `test:desktop:assembly`; source CI also invokes the compiled packaged smoke. |

## Complete checks

The installed Vibe CLI supports no `--format json`. QA ran the supported complete `./bin/vibe verify .` exactly once for this candidate with host access established by prior sandbox IPC failures. Lint, typecheck and build passed. Tests reported 22,493 passed, 129 skipped and three failures. No native probes ran concurrently. Receipt: `default-verify.json`; complete output: `default-verify.log`.

`pnpm run doc-sync` passed all 34 checks. Its quick leaves include all `test:docs` checks. Receipt: `doc-sync.json`. The real `pnpm run test:desktop:assembly` also passed. No additional complete verification run occurred. A separately justified diagnostic reran only `pnpm run test` with an external operations-phase tracer and unchanged deadlines/workers. It reproduced the CLI preparation timeout: 22,495 passed, 129 skipped and one failed. `/private/tmp/dsh-operations-aggregate-3077ec3/test-lane-result.json` records the failed-prior reason, frozen report digests and exit 1; its trace files retain the subprocess phase evidence. Passing lanes were not repeated.

## Unresolved default-suite failures

[Operations tests](../../../scripts/desktop-delivery/tests/operations.spec.ts) contain all three failures. The actual CLI preparation case reports child `spawnSync` ETIMEDOUT at line 213. The successive desktop-fixes/upstream-adoption case at line 254 and catch-up desktop-successor case at line 450 exceed the 5,000 ms test limit. Expected behavior is successful completion with preserved adoption/provenance assertions. These failures recur without concurrent native probes; a focused pass does not establish full-suite reliability. The independent investigator owns root-cause evidence before acceptance. An unchanged focused run with external process tracing passed all 15 cases in 19.38 seconds; it recorded 1,124 synchronous Git calls with 15.1 seconds of summed duration. Evidence: `/private/tmp/dsh-operations-diagnostic-3077ec3/findings.md`, `focused.log` and `process.jsonl`. The historical 30-second child stall remains unexplained; this focused result does not replace the failed default receipt.

## Native observations

The compiled valid smoke exits 0 in 2.38 seconds. Forbidden override exits 1 in 0.127 seconds with `Packaged CLI overrides are unavailable`. Combined payload/receipt tampering exits 1 in 2.66 seconds with `Assembly receipt differs from native shell identity`. All three complete without forced cleanup; `negative.py` records the exact private invocations.

Electron 43.4.1 resolves home, logs, user data, session data and temp paths into synthetic roots. The app reaches usable UI in 5.056 seconds on fresh launch and 4.613 seconds on reopen; these are observations, not benchmarks. Both scenarios submit a real composer message and show the deterministic response. Persisted events after the final user event include `assistant/message`, `step/end` and `turn/end`. Both scenarios quit normally. The backend log redacts readiness tokens; both complete backend inventories remain unchanged after Host/Client use and native quit.

The temporary native observer uses public RC.2 `snapshotEvents()`. `native-ui-rc2/result.json`, `reopen-result.json`, the conversation screenshots and stored event receipts distinguish the fresh and existing-data scenarios. The synthetic session/data evidence makes no old-format compatibility claim.

## Prior candidate and limits

Candidate `024eaa1` failed two hanging packaged negatives and seven default tests. Its receipts remain in `/private/tmp/dsh-assembly-qa-024eaa1`; the prior report remains in Git history. Changed smoke handling, delivery fixtures and pipeline wiring changed the source and packaged artifact, requiring this new full verification. Corrected negative smokes and delivery/workflow assertions pass; operations timeouts remain unresolved. The initial native observer failure used an obsolete session property; only corrected temporary-fixture scenarios establish ordinary quit.

No signed notification, real model, remote publication, installed-user replacement, old-data downgrade or arbitrary-version compatibility claim is made. The source-lock proposal remains unfinalized. No application changes or default-suite retry may be inferred from this evidence-only report.
