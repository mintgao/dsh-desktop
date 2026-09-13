# Implementation report

English | [中文](implementation-report.zh.md)

## Candidate and ownership

RD implemented the [accepted brief](brief.md) within the [accepted decision](../../decisions/20260913-desktop-versioned-assembly.md). The isolated checkout is `/private/tmp/dsh-desktop-rc2-plugin-assembly`, branch `codex/desktop-rc2-plugin-assembly`, baseline `8e1df6fd25166943e6105859832b42a4da258755`. The exact upstream commit `fb2c4b9e698e30edb738bca4cf0618587db7d203` merged without conflicts; the orchestrator committed the initial candidate as `024eaa1dd70cb741249e70faf15491610d041fbc`; the corrective changes await a new local commit. Original recovery changes were untouched.

## Changes

- Restored upstream CLI dependencies, shipped profile templates and their owning documentation/tests to RC.2 bytes. Mint remains in its own packages and native directory.
- Replaced `prepare-desktop-backend.ts` with frozen official npm acquisition, complete installed tarball comparison, contained-link checking, separately packed Mint payloads, dependency/export validation and atomic stage replacement. The shell embeds the resulting receipt digest.
- Added native custom-profile initialization through installed public DSH APIs, atomic fresh-profile publication, refusal of incomplete/interrupted state and pre-healing conflict checks. Readiness admission performs the real authentication exchange. Packaged CLI overrides fail; package smoke executes the compiled verification and initialization path.
- Updated candidate, native smoke, release manifest and forward validators together. Actual installed components carry integrity and provenance; protected Mint configuration requires assembly inputs. Historical fixture configuration retains its earlier policy. Existing CI callers stage before binding the native shell.
- Updated downstream policy, architecture context, onboarding evidence, Mint documentation and the retained product-layer Agent Note. The original ownership rationale remains useful and was not archived. Accepted English decision and readiness bodies changed only by adding language switchers; Chinese counterparts preserve their authority and scope.

## Focused evidence

- `node --import tsx scripts/build-mint-plugins.ts`: passed, including standard Host declaration generation and Mint TypeScript compilation. Runtime packing does not consume those upstream build outputs; development typing still uses the repository generator.
- `node --import tsx scripts/prepare-desktop-backend.ts`: passed; 582 frozen official inputs, 522 installed platform-selected official packages and 2 Mint packages. Every installed official package was compared against its integrity-verified npm tarball.
- `tsc -b apps/desktop-mint`, native tsdown, changed-file oxlint and `tsc -p tsconfig.host.json --noEmit`: passed.
- Focused Desktop, Mint, workflow and delivery run: 97 of 104 tests passed; seven forward fixtures lacked newly required assembly evidence. After fixture updates, the affected forward and assembly files passed all 15 tests. The other 18 files had passed. Earlier focused assembly/backend checks passed all 14 tests.
- `node apps/desktop-mint/tests/fixtures/assembled-runtime.mjs`: passed under host loopback access with scrubbed synthetic roots. It proves plain Web exclusion, public Mint initialization, unchanged existing manifest, interrupted-lock refusal, preserved conflicting user package, authenticated HTML and the actual advertised Mint Client asset, followed by awaited shutdown.
- Eight scoped bilingual pairs and `git diff --check`: passed. Full `doc-sync` remains for QA.
- Unsigned arm64 electron-builder directory packaging: passed. Sandbox DNS and loopback failures were rerun unchanged with host access; no product sandbox was disabled.

## Exact local artifact

The local application is `apps/desktop-mint/dist/mac-arm64/DSH Desktop.app`. Its runtime inventory digest is `c9b70ef0aafc9516660d9b0c60cb2d9a895c0e11d2d47ba47da742a8a9961a3e`; `Contents/Resources/app.asar` SHA256 is `d91e5a66638fa1fc64ddc1762bc27e7a4e6a6e20336fd774a238d76296d33184`. The staged and packaged assembly receipts both have SHA256 `ef5db71ff7ac3c4bba190b7b052a5c4d5ddecd9265eff89d53ac38e441b94ea2`.

The shell source digest is `84ebce2f2fd6af7ad541c51236987c296ca1a935b98208d3edf175420c83f3f6`. The official lock digest is `afa439f37a8b544b3884460a10634c6b474736958942aa4543ea048a95d348df`; the descriptor digest is `9157bc2a957d3bd51c93b41d5747b6a28226099de3ef215d530e2030295f9aa0`. Runtime and shell source versions are `0.1.5-rc.2`; the separately identified Mint package versions remain `0.1.5-alpha.2`, with exact tarball integrity in the receipt.

## QA handoff and limitations

QA owns AC-1 through AC-7, the unchanged-candidate complete `./bin/vibe verify .` exactly once, full documentation checks, and the real packaged UI/keyless conversation/exit scenario. The installed CLI does not support `--format json`; retain its supported command output as verification evidence. Use the verified synthetic Electron isolation method supplied by the orchestrator; ordinary HOME changes alone do not prove macOS isolation. No ordinary packaged UI was launched by RD.

[The source-lock proposal](source-lock.proposal.json) contains the exact RC.2 observation and no bot finalization evidence. The published `.github/desktop-delivery/source-lock.json` remains unchanged. Production qualification requires normal reviewed adoption finalization and the source-lock/assembly match; local packaging is not publication, user installation, old-data migration acceptance or product acceptance. Notifications needing signed identity, real model calls, DMG production and installed-user replacement remain unverified. No full default verification, global memory update, remote push, publication or installed-app replacement was performed.

## Corrective evidence after independent QA

The [QA report](verification.md) remains the factual record for `024eaa1`. RD corrected synchronous packaged-smoke failure handling by awaiting the complete initialization operation, including CLI override and embedded receipt checks. The persistent `test:desktop:packaged` fixture executes the compiled application with isolated native roots and requires normal exit 0 and forbidden-override exit 1 within 30 seconds. The real `test:desktop:assembly` fixture now runs after staging in source CI and native qualification, with an environment allowlist. Delivery fixtures explicitly supply required assembly inputs; the version-mismatch fixture includes both Mint manifests and still proves inconsistent official versions are refused.

Unchanged focused catch-up provenance reproduction passed in 2.56 seconds; no timeout or reliability implementation was changed. Corrected delivery/workflow/assembly tests passed all 25 cases; existing desktop workflow tests passed all 14 cases. Changed-file oxlint, Host typecheck, final `npm run desktop:stage`, the real assembled fixture, unsigned arm64 directory packaging, and the compiled packaged positive/negative fixture passed. Sandbox IPC, loopback, DNS and Electron SIGABRT failures were retried unchanged with host access. Node was v22.22.3. The exact artifact section identifies this rebuilt corrective application. RD did not repeat the complete default matrix; QA must verify the changed candidate, including combined payload/receipt tampering and final document synchronization.
