# Desktop delivery shadow verification

English | [中文](verification.zh.md)

## Candidate and ownership

The [brief](brief.md) defines SH-1–SH-7. Tech Lead `distribution_design` authored the [accepted decision](../../decisions/20260908-desktop-delivery-shadow.md); separate reviewer `distribution_review` approved it and the authenticated-readiness amendment. The orchestrator reopened and reconfirmed readiness before native edits. RD `shadow_implementation` owns implementation; independent QA owns final acceptance and one configured default verification.

The baseline is `507e5beb4f76b7e7dd9f4986ab7d88ff1b2eb936` with local changes. Existing onboarding, HMR and spill test changes and untracked development directories are unrelated and preserved. Local reports are diagnostic, not clean-commit qualification. No push, merge, publication, workflow dispatch, notification, credential change or installation was performed.

## Development evidence

| Check | Result | Evidence scope |
|---|---|---|
| Focused desktop, shadow delivery and existing workflow tests | Pass: 10 files, 60 tests | RD report; source CLI, identity/version failures, artifact alteration, two configurations, native readiness and diagnostic redaction |
| Scoped oxlint and host TypeScript | Pass | RD commands against affected source |
| Live public upstream discovery | Pass | Twelve observed public releases; alpha.4 is the next ordered candidate after the recorded alpha.3 baseline, not the latest release |
| Candidate command | Pass, diagnostic only | Exact HEAD, upstream ancestry and workspace version/dependency checks; modified checkout correctly remains ineligible |
| Source staging and unsigned ARM64 DMG build | Pass | Existing `desktop:stage` and explicit unsigned electron-builder invocation, no publication |
| Quick documentation checks | Pass: 15 gates | Corrected bilingual anchors included |
| Corrected ARM64 mounted-DMG smoke and artifact binding | Pass | Bootstrap, authenticated HTTP, backend shutdown and detach; DMG SHA-256 `a47fa900fa2f48de0d9744ab35bff5075acd0196c86aa7ee83c075bdb3973a48` |
| Complete documentation synchronization | Pass: 32 gates | Pairing, links, source documentation and site checks |
| Final independent QA and default verification | Pass: SH-1–SH-7; four configured checks | Lint, typecheck, test and build pass; 1,069 test files and 17,317 tests pass, 9 files and 116 tests conditionally skipped |

The first real DMG smoke reproduced a desktop parser timeout on the upstream authenticated root URL. The approved repair retains that URL and redacts diagnostics. The second smoke reached HTTP and exposed a harness assumption of 302 where BrowserAuth emits 303; the harness correction retains authenticated same-origin exchange and final HTML validation. Failed attempts are not qualification evidence.

Sandbox attempts hit local tsx IPC restrictions and packaging DNS restrictions. Identical host retries followed observed environmental failures; product assertions remained active. Diagnostic command logs and reports are under `/private/tmp/dsh-shadow-*` and are not published artifacts.

## Independent acceptance

QA `shadow_qa` independently reproduced and verified the multiline blocked-summary repair, checked the real mounted DMG payload against the rebuilt native entry, and found no remaining scoped defect. The packaged entry SHA-256 is `749e7c080fddeb6f6dfbf56aa60da70acbd3c2be89151127ef7ef5ae6b489ddd`. SH-1–SH-7 pass within the additive local scope.

The first default run failed under sandbox IPC and loopback restrictions and completed naturally; no process was terminated. An unchanged host retry passed typecheck, tests and build but found three test-format lint errors. RD corrected only callback formatting and checked the actual repository lint wrapper. QA then ran the final unchanged candidate with `./bin/vibe verify . --format json`: schema 2, `default`, `all-configured`, four checks passed and none failed. Final tracked-diff digest was `554e7dcecc331f5f8b0ca4a745543a4260e4a35629ff9d58afdfa68e3fc8f15f`; scoped source recheck showed no drift. Only this final receipt establishes default-check success.

Receipts are `/private/tmp/dsh-shadow-qa-default-final.json`, `/private/tmp/dsh-shadow-qa-final-candidate-state.json` and `/private/tmp/dsh-shadow-qa-packaged-parser.json`. Subsequent changes record verification/status only; implementation remains frozen.

## Limits

Native x64, remote Actions execution, Developer ID signing, notarization, installed-client replacement, user-data migration and notification delivery remain unexecuted. The added workflow is manual and read-only with respect to repository state. Existing production writers and controls remain active; this phase does not complete the proposed production migration.
