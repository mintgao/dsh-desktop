# Mint target integration and migration qualification

Status: Accepted

English | [中文](20260910-desktop-mint-target-integration.zh.md)

## Authority and exact scope

Technical authors: `upgrade_native_assessment` and `upgrade_decision`. Independent reviewer: `classification_review`, result `approved-design-only`. The [review record](../work-items/20260910-dsh-015-upgrade/phase-b-design-review.json) binds the reviewed source artifacts by SHA256. The [normative registry](20260910-desktop-mint-migration-registry.md) takes precedence over composition, scenario or report placeholders in the original proposal. Design approval is not runtime qualification or an implementation gate.

The [work item](../work-items/20260910-dsh-015-upgrade/brief.md) authorizes one catch-up upgrade PR and one Desktop release. Phase A tooling is a prerequisite without an intermediate product release. The direct-upgrade and restore baseline is delivered `desktop-v0.1.2-alpha.3.unsigned.1`, downstream `67406fc6af451f7f68874cb31c2d0f3242c0c8ad`, upstream `dd6322d604e00eec1ba5e0c8541159906a21094a`. The target is `b2e3b2a0125854567a4a5fcba75782e42fe84901`, tagged `dsh-v0.1.5-alpha.2`. Authority comes from the committed legacy-baseline digest and retained architecture artifact digests, not a bare upstream runtime. Merge, publication and installed-app replacement remain separately authorized operations.

## Native ownership

Move Mint's native adapter to `apps/desktop-mint`; preserve upstream `apps/desktop` and `apps/desktop-host` independently. Keep `io.github.mintgao.dsh-desktop`, branding, browser-state identity, desktop-mint profile and manual-update preferences. There is no shared main process or wholesale ours/theirs resolution. Mint Bundles select generic plugins; native modules own window, backend and updater lifecycle and launch supported `dsh --profile desktop-mint`. Do not import private DesktopHost or reproduce Agent/Session semantics.

Upstream's native application owns exact shell/seed/DSH versions, reserved desktop profiles, framed-pipe transport and signing requirements. Preserve its signing checks. Mint remains an unsigned manual preview without stable-feed assets. Retain Electron-as-Node only after exact target-engine, native-dependency and built-startup checks; a needed runtime replacement reopens readiness. Prove packed Mint Bundle and notification dependency resolution without aliases on both architectures. Identity-dependent notification acceptance remains unverified without signed/notarized artifacts.

The existing and intended Mint launch paths use an ephemeral port. Preserve existing origin policy and qualify same-origin browser state. Identical storage keys do not prove cross-origin draft retention; this change introduces no cross-origin draft migration.

## Data ownership and compatibility

Native code performs no session transformation. Reuse upstream's static format catalog and frozen V0→V1→V2→V3 stages. Read-open conversion remains in memory; write-open validates and publishes an immutable successor after source-revision checks. Verify original bytes, reconstructed request meaning, system messages, inheritance cuts, references, compaction, PTC/preset aliases, titles and workspaces. Header listing or codec admission is insufficient. Older binaries must not open upgraded homes as a rollback shortcut.

The registry defines the complete bounded composition, store owners and mandatory settings scenarios. Preserve settings YAML/JSON and unrelated keys, credential v1 records and synthetic references, workspace v2 state, anonymous identity, upload-index records, authored presets, image objects, browser state and Mint preferences. Projection cache moves from 4 to 7: compatible old hints support listing, while authoritative folds rebuild. Query SQLite remains schema 8 and in memory; generic SQLite schema 1 is not selected. Attachment file objects and aliases require restart, conflict and interrupted-publication evidence. Home environment files may supply proxy variables; project files may not. These are scenario requirements, not assertions that unchanged syntax proves unchanged consumer behavior.

Pin a versioned compatibility policy containing exact baseline/target, supported stores, fixture manifests, catalog edges, recovery procedure and unsupported downgrades. Generated execution reports remain outside candidate source to avoid digest recursion. User-authored skills, instructions, external roots, third-party plugins and arbitrary overrides remain user-owned or explicitly outside qualification. A custom durable query database is unsupported/unverified unless separately covered.

## Admission and runtime qualification

Before target merge, source assessment may truthfully record `persistedFormatsChanged: true` and blocked or unverified scenarios. Schema-3 adoption validates identity, completeness, digest and ancestry; it does not require post-merge packaged reports. Phase A publication rejects changed formats. After the Phase B evaluator reaches protected main, changed formats qualify only through the complete reports in the registry. Never record false to pass adoption.

Each architecture's credential-free job materializes synthetic data with the exact delivered baseline runtime and records runtime/package identity and fixture-tree digest. Supplement released V0/V1/V2 plain and zstd fixtures. Include sessions, settings, credentials, workspaces, images and browser state. Close all handles and processes, prove quiescence, and hash backups of every configured root and Electron userData. Run the exact packaged target on a copy through list/read/resume/write/flush/close/reopen and all registry scenarios. Record source preservation, valid successor publication and reconstructed state. Exercise interrupted publication, source drift and malformed highest generations through upstream test seams; separately require the built plain-Node migration worker.

Stop the target and retain upgraded data separately. Restore the complete backup into empty fixture locations, run the exact delivered baseline and verify original observables. Do not mix target data into restoration or delete retained newer data. Use a deterministic keyless provider and isolated home, agents home, working directory, temporary/spill roots and Electron userData. Never use real DSH homes or model credentials.

The trusted aggregator requires one report per architecture, exact candidate/run/native-DMG identity, every fixed scenario ID passed, all referenced artifacts rehashed and successful restoration. Bind reports and payload inventory into the production manifest, qualification archive and public-byte verification. Both `releaseManifest` and `checkedManifest` may admit changed formats only through this path. Missing, skipped, failed, stale or substituted evidence blocks; booleans and prose cannot replace runtime proof.

## Upstream test reuse

Reuse upstream session persistence tests and generation helpers rather than duplicate converters. Relevant owners include `packages/session/session-persistence-jsonl/tests/multi-edge-publication.spec.ts`, `packages/session/session-persistence-jsonl/tests/generation.spec.ts`, `packages/session/session-persistence-jsonl/tests/migration-refusal.spec.ts`, `packages/session/session-persistence-jsonl/tests/lease.two-process.e2e.ts`, `packages/session/session-persistence-jsonl/tests/v2-system-migration.spec.ts`, `packages/session/session-persistence-jsonl/tests/v2-ptc-migration.spec.ts`, `packages/session/session-persistence-jsonl/tests/built-migration-worker.e2e.ts` and `packages/session/session-persistence-jsonl/src/testing/generation.ts`. Projection fixtures belong to `packages/session/session-projection-cache/tests/fixtures.spec.ts`. Their presence is not executed qualification; a skipped built-worker test cannot qualify packaging.

## Alternatives and consequences

Replacing Mint with upstream's shell changes profile, origin, permissions, plugin management and unsigned-release behavior beyond this upgrade. Combining both main processes obscures ownership. Preserving a separate Mint adapter retains existing behavior while leaving upstream native architecture intact.

Duplicating migration converters would create competing persistence authority. Reusing frozen upstream edges preserves their ownership but still requires assembled and packaged proof. A blanket format-change exception or clean-install smoke cannot establish existing-data safety.

The evaluator runs from newly reviewed protected main after target merge; candidate execution receives no writer credentials and no bootstrap exception. Users must stop every process sharing their home before manual backup or restore. Fixture proof is not a universal home lock. No automatic migration controller, downgrade or rollback guarantee is introduced. Independent QA owns final default verification; actual arm64/x64 qualification and native/migration scenarios remain required. An upstream-owned native or migration fix, or runtime replacement, reopens decision review.
