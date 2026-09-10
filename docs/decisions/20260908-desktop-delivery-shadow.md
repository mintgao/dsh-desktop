# Desktop discovery and unsigned qualification in shadow mode

English | [中文](20260908-desktop-delivery-shadow.zh.md)

Status: Accepted

- Decision owner: Tech Lead `distribution_design`
- Work item: [Desktop delivery shadow implementation](../work-items/20260908-desktop-delivery-shadow/brief.md), SH-1–SH-7
- Review: independent Tech Lead `distribution_review` approved the exact decision on 2026-09-08; limited to the additive shadow phase

## Authority and scope

Implement migration stage two of the [delivery proposal](20260908-desktop-update-delivery.md): executable discovery, candidate validation, unsigned packaging evidence and maintainer summaries. The [downstream policy](../context/downstream-policy.md) governs reuse. Existing production workflows, policy receipts, credentials and state remain authoritative and unchanged.

This decision authorizes local output and opt-in workflow summaries/artifacts. It introduces no adoption writer, publication operation, notification sender, signing job, scheduler or production approval receipt. Production trust-model replacement remains unresolved and outside this decision.

## Executable tooling

Add one source-plane CLI at `scripts/desktop-delivery/cli.ts`, with a root `desktop:delivery` command. Keep parsing, GitHub reads, candidate validation and artifact verification in small adjacent modules with behavior tests. Every exported operation must be exercised through a CLI command or the workflow; no unused promotion framework.

Use explicit JSON distribution configuration for upstream repository, release-tag selection and required architectures. Keep Mint values in a configuration file, outside generic validation logic. Repository-owned packaging commands remain fixed commands, not executable strings supplied through configuration.

- `discover`: consume configuration and a baseline/source-lock input, query all public upstream release pages and resolve tags to commits, or consume an equivalent offline fixture. Emit ordered observations and `next`, `current` or `blocked`. Distinguish incomplete/API-failed discovery from no update. Identical duplicate identities deduplicate; conflicting duplicates, changed tags, missing recorded identities and unexpected earlier releases block. Discovery writes only the requested local output.
- `candidate`: validate an explicit source-lock input against the checked-out downstream commit and upstream commit ancestry, and record distribution identity, exact component versions and source-lock digest. Run existing workspace dependency/version checks before packaging. A discovered release is not an adopted candidate; lack of matching source evidence blocks packaging.
- `artifact`: hash one architecture's produced DMG and bind its size, digest, candidate digest and smoke evidence to an architecture report.
- `combine`: independently rehash downloaded files and require exactly the configured architecture set with matching candidate identity and successful required smoke evidence. Produce a combined shadow manifest and maintainer summary.

A source lock names upstream repository, release ID, publication time, tag, commit and predecessor identity. This stage validates supplied locks and generates proposed local outputs; it does not establish a production adoption history or mutate a committed lock automatically.

Reports use a versioned schema and explicit `purpose: desktop-delivery-shadow`, `signing: unsigned` and `publicationEligible: false`. Hashes bind exact serialized evidence bytes. Reject malformed fields, duplicate assets, unsafe paths, symlinks escaping the artifact directory, absent evidence and changed file bytes. These reports cannot serve as final production qualification.

## Workflow and packaged evidence

Add only `.github/workflows/desktop-delivery-shadow.yml`, triggered by `workflow_dispatch`. Pin checkout and reported candidate identity to the dispatched `GITHUB_SHA`; do not accept arbitrary candidate checkout refs. Use `permissions: contents: read`, no protected environment, no App/Apple secrets, no persistent checkout credentials and no production state reads. Workflow artifact upload and job summaries are the only remote outputs.

Provide explicit discovery-only and unsigned-qualification modes. Qualification consumes source evidence from the same checkout and blocks if it is absent or inconsistent. Discovery of a newer release does not prevent qualifying the separately identified current checkout.

Use native `macos-15` arm64 and `macos-15-intel` x64 jobs, frozen dependency installation and the existing `desktop:stage` path. Invoke electron-builder with explicit unsigned settings, notarization disabled and `--publish never`. Preserve the existing packaging layout and application behavior.

Run `--dsh-package-smoke` and label its result Electron bootstrap smoke: the current command exits before backend startup. Add a test-only packaged-backend smoke script that launches the staged CLI using the packaged Electron executable in Node mode, the existing `BackendSupervisor`, `desktop-mint`, and the canonical readiness parser. Use a temporary workspace and DSH home, an allowlisted environment without user credentials, and guaranteed bounded cleanup. Require loopback readiness, a successful local HTTP response and process termination. This proves packaged backend launch, not installed-client operation.

Mount each resulting DMG read-only, locate exactly one expected application and run the smoke against that packaged payload, then detach in `finally`. Record architecture from the native executable rather than trusting the filename. Do not copy the application into a user installation directory.

Only the aggregation job combines both architectures. A failed or absent architecture cannot produce success. Logs and partial evidence remain useful failure outputs.

## Summaries, retries and reuse

The summary names the candidate, observed upstream release, completed checks, blocker and next maintainer action. Successful output says shadow preview checks passed, never ready to publish. Produce notification-ready Markdown locally and in the workflow summary; send no notification and claim no GitHub/email delivery.

GitHub reads allow at most three total attempts for classified transient failures, bounded backoff and finite request/job timeouts. Authentication, malformed evidence and identity conflicts fail immediately. Packaging and smoke failures are not retried automatically. The maintainer corrects the cause and explicitly reruns; a new attempt produces new evidence.

Reuse is demonstrated through a second distribution configuration and executable fixture runs. No native-package extraction is needed for this stage: the reusable delivery tooling has a real consumer in the new workflow, while the existing desktop supervisor is reused by its own test harness.

## Recovery and limits

Failure changes no production state. Remove local output or rerun qualification after correction. Shadow artifacts expire according to declared workflow retention and never establish durable publication authority. Existing installations and DSH data remain untouched.

Local dirty-tree runs must record their source difference and remain non-qualifying diagnostics; CI success requires the exact clean checkout. A single local architecture cannot establish dual-architecture success. Unsigned smokes establish neither Developer ID identity, notarization, notification delivery, installed application replacement nor persisted-data migration safety.

## Implementation acceptance

### Authenticated desktop readiness amendment

The Web Bundle emits `connection.authenticatedUrl(...)`; BrowserAuth produces the root URL with one `token` parameter. The desktop parser currently rejects that slash and query, while logging the raw readiness line. Update only `apps/desktop/src/backend.ts`, its tests, the startup-error sanitizer call in `apps/desktop/src/main.ts`, and affected documentation. Preserve process ownership, timeout and bounded shutdown.

Parse the complete first URL after the exact `dsh web: ` prefix and preserve its token for `BrowserWindow.loadURL`. Require literal `http://127.0.0.1`, an explicit decimal port from 1 through 65535, no credentials, root path, and no fragment. Accept either no query or exactly one nonempty `token` parameter. Reject normalization tricks, unexpected paths, extra or duplicate parameters and malformed URLs without throwing from stream callbacks. Preserve tokenless readiness and optional trailing LAN annotations; the LAN URL never determines readiness.

Redact authentication query values before log callbacks, diagnostic retention and startup-error presentation, including stderr, malformed readiness lines and LAN annotations. Parse original input only in memory; the authenticated URL remains transient launch input. Reuse one narrowly scoped sanitizer for backend diagnostics and `reportStartupFailure`.

SH-7 requires synthetic-token tests for accepted and rejected URLs, an authenticated readiness line split across subprocess output chunks, clean termination, and absence of tokens from logs, timeout/early-exit errors, unexpected-exit diagnostics and startup-error presentation. Rerun the real ARM64 DMG smoke through the corrected supervisor with the authenticated URL retained. This remains packaged-backend evidence, not installation or signed-release qualification.

- SH-1: CLI fixture and mocked paginated HTTP tests cover ordering, duplicates, missing/changed identities, incomplete retrieval and transient exhaustion.
- SH-2: The real candidate command rejects source mismatch and workspace-version inconsistency before invoking packaging.
- SH-3: Executable artifact tests reject altered bytes, wrong executable architecture, missing smoke evidence and one missing/failed architecture.
- SH-4: Workflow tests verify its trigger, permissions, fixed checkout, unsigned commands and absence of repository mutations; tests also prove the workflow actually invokes the implemented CLI.
- SH-5: Two configurations exercise the same CLI; summaries accurately distinguish discovered, blocked and shadow-qualified output without component update choices.
- SH-6: RD runs focused checks and feasible local packaging/smoke evidence. Independent QA owns final acceptance and the unchanged candidate's configured default verification. Unrun native architectures and remote workflow execution remain explicit limitations.

Owned implementation paths are `scripts/desktop-delivery/**`, the new workflow, configuration/fixtures, root command wiring, necessary documentation and the explicitly scoped authenticated-readiness amendment. Other native application or production workflow edits require reopening this decision.
