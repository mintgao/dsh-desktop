# Verification: Restore a green default verification and dependency-layout check

English | [中文](verification.zh.md)

## Acceptance evidence

| Criterion | Evidence | Result |
|---|---|---|
| AC-1 | `pnpm run verify-npm-install-layout` passes and independently re-ran green by QA: `231 DSH package(s) per release and 2060 internal edge(s) verified`; `scripts/verify-npm-install-layout.spec.ts` (9 tests) keeps the official-package rejection as a negative control | Passed |
| AC-2 | `pnpm exec vitest run scripts/desktop-delivery/tests/operations.spec.ts` passes with no environment override; QA found no failure for this file in the default lane | Passed |
| AC-3 | Default `./bin/vibe verify . --format json` on the frozen candidate | **Not met** |
| AC-4 | `pnpm run doc-sync` 34 gates passed; QA read the work-item, Agent Note triplet and architecture context and confirmed they describe the changed checker rule and test command | Passed |

## Automated checks

| Check | Result | Notes |
|---|---|---|
| `pnpm run verify-npm-install-layout` | Passed | Real checker against the workspace registry index, 31.8 s |
| `pnpm exec vitest run scripts/verify-npm-install-layout.spec.ts scripts/desktop-delivery/tests/operations.spec.ts` | Passed | 24 tests; the operations spec spawns the real delivery CLI twice |
| `pnpm run doc-sync` | Passed | 34 gates, author run |
| Default project verification, independent QA run | **Failed** | `lint`, `typecheck`, `build` passed, `test` exit 1; receipt `/tmp/dsh-mint-qa-verify-receipt.json` |

## Independent QA

QA ran the complete default `./bin/vibe verify . --format json` lane exactly once on the frozen candidate (`HEAD c93700a9d4` plus the eight modified files and the two new untracked records) and re-ran the allowed focused checks. It found no out-of-boundary change.

The lane's single failing test is `packages/experimental/webworker-runtime/tests/compile/transform-corpus.spec.ts > every built bundle imports under Node`: `UNEXPECTED BASELINE FAILURE packages/client/ui-dockkit/lib/index.js: Unknown file extension ".css" for ./packages/client/ui-primitives/src/StateDot.module.css`. The lane built the library plane itself before the unit lane, so the sweep read output that lane had just built and still reported the finding. Suite totals were 22,518 passed, 1 failed, 129 skipped.

## Limitations and follow-ups

- The configured `test` command no longer explains the corpus failure: the sweep reports the same finding on output the lane built itself. The earlier premise in this work item is corrected by this record. The finding is pre-existing and independent of the changed files, but AC-3 as written is unmet and the work item's readiness claim stops there.
- The failure reproduces inside the full unit lane while the same spec passes when run alone, so a concurrent or preceding suite member is the leading hypothesis for the artifact state the sweep reads; that investigation is a follow-up.
- The QA lane ran under Node v22.22.3 (this agent environment's shell) while the workspace's documented interactive toolchain is Node 24; the corpus sweep's Node-version sensitivity remains unmeasured and no conclusion is claimed.
- The corpus sweep stays in the unit lane; moving it to an artifact lane remains open.