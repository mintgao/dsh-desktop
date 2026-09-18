# Verification: Restore a green default verification and dependency-layout check

English | [中文](verification.zh.md)

## Acceptance evidence

| Criterion | Evidence | Result |
|---|---|---|
| AC-1 | `pnpm run verify-npm-install-layout` passes, independently re-ran green by QA: `231 DSH package(s) per release and 2060 internal edge(s) verified`; `scripts/verify-npm-install-layout.spec.ts` (9 tests) keeps the official-package rejection as a negative control; the `Dependency layout` CI job reports success on pull request 88 | Passed |
| AC-2 | `pnpm exec vitest run scripts/desktop-delivery/tests/operations.spec.ts` passes with no environment override; QA found no failure for this file in the default lane | Passed |
| AC-3 | Default `./bin/vibe verify . --format json` on the current candidate: `status: passed`, `lint`, `typecheck`, `test` and `build` all passed, summary 4 passed, 0 failed, 0 skipped, 0 unconfigured (receipt `/tmp/vibe-takeover-55a67951/receipts/verify-final.json`) | Passed |
| AC-4 | `pnpm run doc-sync` 34 gates passed; QA read the work-item, Agent Note triplet and architecture context and confirmed they describe the changed checker rule and test command | Passed |
| AC-5 | Full corpus sweep `files=277 ok=272 baselineExempt=5 unexpectedBaselineFailure=0` under Node 24.21.0 and under Node 22.22.3; `transform-corpus.spec.ts` passes 7 of 7 under both lines, including the classification cases that still fail a `.foo` extension refusal and a non-extension failure | Passed |

## Automated checks

| Check | Result | Notes |
|---|---|---|
| `pnpm run verify-npm-install-layout` | Passed | Real checker against the workspace registry index, 31.8 s |
| `pnpm exec vitest run scripts/verify-npm-install-layout.spec.ts scripts/desktop-delivery/tests/operations.spec.ts` | Passed | 24 tests; the operations spec spawns the real delivery CLI twice |
| `pnpm run doc-sync` | Passed | 34 gates |
| `transform-corpus.spec.ts` under Node 22.22.3 and Node 24.21.0 | Passed | 7 tests per line |
| Corpus sweep under Node 22.22.3 and Node 24.21.0 | Passed | 277 files, 5 exempt, 0 unexpected failures per line |
| Default project verification (`./bin/vibe verify . --format json`) | Passed | 4 checks passed; receipt kept in the host work directory |

## Independent QA

The first QA run took the default lane once on the earlier candidate: `lint`, `typecheck` and `build` passed and the `test` check failed on the corpus sweep with `UNEXPECTED BASELINE FAILURE packages/client/ui-dockkit/lib/index.js`. That failure drove the corpus exemption correction recorded under AC-5; QA also confirmed the earlier work stayed inside the accepted boundary and found no out-of-boundary change.

The candidate changed after that run (the corpus checker and its spec), so a second independent QA run of the complete default lane is required on the new candidate; its receipt and verdict are appended to this record when it returns.

## Limitations and follow-ups

- The corpus import sweep stays in the unit lane, so a developer running `pnpm run test` on a tree with stale build output can still see a finding there; moving that sweep to an artifact lane remains open. The exemption predicate itself is now independent of the Node line.
- The first QA lane ran under Node v22.22.3 while the workspace documents Node 24; both lines now produce the same corpus verdict, so that difference no longer affects the outcome.
- The corpus sweep discovers and imports every bundle serially in one process, so a loaded runner can be slow; no change was made for that.