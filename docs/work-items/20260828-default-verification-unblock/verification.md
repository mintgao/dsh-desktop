# Verification: Unblock default verification

English | [中文](verification.zh.md)

## Acceptance evidence

| Criterion | Evidence | Result |
|---|---|---|
| AC-1 | `scripts/ci-workflow.spec.ts` enumerates all 14 jobs in the six official workflows and requires each complete repository and event condition. | Pass |
| AC-2 | `packages/shell/tool-bash/tests/tools.spec.ts` requires the timeout marker without fixing the real process to exit zero; pure rendering cases continue to cover trapped exit zero and signal results. | Pass |
| AC-3 | The mirrored Bash and PowerShell sandbox classifiers consult the authoritative background status first. Pure tests cover killed numeric exits 143, 125, 1, and 127 while completed denial and runner-failure priority remains covered. | Pass |
| AC-4 | The five-file focused shell/workflow run passed 199 tests with 13 PowerShell application tests skipped because `pwsh` is absent. The focused type-aware Oxlint discovery test passed in 5.642 seconds. | Pass |
| AC-5 | Installed `./bin/vibe verify . --format json` returned `passed` with `all-configured` coverage: lint, typecheck, test, and build all passed. The full test check passed 879 files and 14,664 tests, with 9 files and 114 tests skipped by their existing environment conditions. | Pass |
| AC-6 | Installed Vibe Kit 0.6.0 doctor returned healthy; `pnpm run doc-sync` passed all 28 gates; `git diff --check` passed. | Pass |

## Automated checks

| Check | Result | Notes |
|---|---|---|
| Focused workflow and shell regression tests | Pass | 5 files; 199 passed; 13 skipped because this host has no `pwsh`. |
| Focused Oxlint project discovery | Pass | 1 passed; 12 filtered out; 5.642 seconds. |
| Full test gate | Pass | 879 files passed, 9 skipped; 14,664 tests passed, 114 skipped. |
| Default project verification | Pass | All four configured checks passed with default `all-configured` coverage. |
| Documentation synchronization | Pass | 28 of 28 gates passed after bilingual sidecars were refreshed. |
| Vibe Kit doctor | Pass | Installed 0.6.0 files, manifest, project configuration, and onboarding state are healthy. |
| Diff validation | Pass | `git diff --check` reported no whitespace errors. |

## Manual scenarios

- Reproduced the Bash process-tree settlement variance independently: 499 of 500 terminations surfaced a signal and one surfaced numeric exit 143, confirming that the handle status is the stable lifecycle fact.
- Inspected all six guarded workflow files and their 14 jobs rather than accepting substring-only guard coverage.

## Limitations and follow-ups

- PowerShell application-level sandbox tests did not run because this macOS host does not provide `pwsh`; the new pure PowerShell classification tests did run, and Windows CI remains responsible for the application-level process behavior.
- No keyless snapshot was added because the correction changes no model-visible or product-user-visible transcript. The numeric signal-settlement race is covered deterministically at the package classification seam.
