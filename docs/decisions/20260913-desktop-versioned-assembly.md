# Official runtime artifacts and Mint-owned assembly

Status: Accepted

English | [中文](20260913-desktop-versioned-assembly.zh.md)

## Authority

Tech Lead author: `assembly_architecture`. The [work item](../work-items/20260913-desktop-versioned-assembly/brief.md) owns AC-1 through AC-7. This decision extends the [Mint ownership decision](20260910-desktop-mint-target-integration.md), retaining data-preservation obligations and the [arm64 scope](20260913-mint-arm64-scope.md). External installation and packaged behavior remain unverified at authoring.

## Versioned inputs

The Desktop contains three independently identified inputs: the official DSH runtime closure, locally packed Mint extensions and the Mint Electron shell. Users receive one Desktop version.

Synchronize development source with upstream `fb2c4b9e698e30edb738bca4cf0618587db7d203` through reviewed source adoption. Package the runtime exclusively from official npm artifacts, beginning with `@deepseek-ai/dsh@0.1.5-rc.2`. Source ancestry does not establish installed artifact identity. The CLI artifact integrity is `sha512-8Xc8hCQHcIWRmTCVU/xZdp6/qMsWMeAd2ObChKDEsfhUPJFXx6H0lgeb1DxUMD86HZrrVN+1bCvn1ppjZ/fOxw==`.

A complete frozen lock records exact versions, resolved locations and integrity for transitive dependencies and platform selection. Assembly also records Mint tarball digests and shell identity. Build acquisition retrieves only recorded artifacts and verifies integrity. Startup performs no installation, registry lookup or workspace fallback.

Replace source-wide packing in the existing backend preparation entry. Install the official frozen closure, then add only explicit Mint payloads at unused package locations. Reject collisions. Never run an unconstrained install afterward that can replace official dependencies. A missing Mint runtime dependency requires an additional locked input. A shared installation directory is allowed; separate provenance and effective resolution establish separation, not directory names.

Upstream manifests, profiles and executable payloads remain unchanged. Verify payloads, contained links, native and client assets. Record necessary installation-generated files separately. Remove Mint's CLI dependency and built-in profile template. Keep the previous complete stage until the replacement passes validation; interrupted preparation must retain it or explicitly fail the build.

<a id="frozen-platform-selection"></a>

## Frozen platform selection

Frozen lock installation paths identify dependency graph nodes, including nested and scoped packages. Required dependencies and peers must resolve; optional dependencies override matching required declarations, and optional peer metadata permits an absent peer. Platform selection cuts only optional edges to explicitly incompatible operating-system, CPU or libc selectors. Required incompatible edges reject. Shared required paths remain selected and cycles terminate.

An absent entry is admitted only when it is marked optional, reachable from the root before platform selection, unreachable afterward, and absent from npm's hidden installation inventory. The hidden inventory cannot independently authorize omission. Reconcile its paths and identities with the frozen lock and installed directories; reject missing, malformed, unknown or inconsistent records. Every installed package retains required dependency resolution and integrity-authenticated complete payload comparison, including optional descendants retained by older npm. Receipts enumerate actual installed packages.

Selectors use npm allow/exclude semantics. Missing selectors provide no exclusion evidence; package names do not establish libc. The current frozen lock has no libc fields and remains unchanged. Unknown host libc when required by a selector rejects. Actual platform installation evidence is required; ideal-tree analysis alone does not qualify a release.

The platform clarification was authored by `assembly_architecture` and independently approved by `assembly_review`, bound to proposal SHA256 `f5c17094da5afb13f6421f50097c546da053b39dcf9189612943648ba1018e19` and source `37e92ae15712b1826b764ba49c92bd2977dd4930`. Skipping all optional packages, trusting the hidden inventory alone and downgrading npm would conceal missing-payload defects. The [release work item](../work-items/20260913-mint-rc2-release/brief.md#technical-decision-readiness) owns implementation and verification readiness.

## Profiles and extension loading

Retain `desktop-mint` under the existing DSH home. Fresh initialization uses supported RC.2 profile facilities to select ordered Base, Web and Mint bundles before the user patch. The Mint Bundle contains configuration; its notification plugin owns disposable behavior.

RC.2 supplies `--from-default-profile web`, `dsh.profile.bundles`, public profile initialization utilities, installation/profile lookup and selected-bundle dependency projection. Real artifact tests must establish resolution and client loading. The creation flag is one-time only and must never be passed unconditionally to existing profiles.

Native initialization owns an exclusive operation and recoverable completion state. Multi-write initialization records its exact owned files and expected contents. Recovery completes only positively identified output; ambiguous directories fail with a concrete diagnostic. A partial Web-only profile must not be accepted as completed Mint initialization.

Preserve existing manifests, custom bundle ordering, patches, lockfiles and dependencies. Do not reset existing profiles. Check effective required-package resolution so a conflicting user package cannot silently substitute for an attested component; preserve conflicting files and report incompatibility. Arbitrary third-party overrides remain outside qualification.

## Desktop interfaces

- Launch uses the verified CLI path, existing home, selected profile and working directory, explicit Electron Node mode and fixed loopback arguments.
- Readiness consumes the official announcement, retains the token only for navigation and proves real authenticated admission. Malformed, non-loopback and unsupported output is rejected; logs and displayed diagnostics redact query values.
- Shutdown distinguishes startup failure, normal quit and unexpected exit; termination awaits process closure and tests escalation.
- Native integration retains sandboxed rendering, same-origin navigation, external-link policy and Web Notifications. Native code does not infer Agent or Session semantics; reusable Client plugins never import Electron.

A packaged release rejects CLI path substitution; development overrides are unavailable in packaged mode. The ephemeral-port policy stays in force. No cross-origin browser-state migration or unsigned notification guarantee is introduced.

## Compatibility and recovery

Support the exact installed RC.2 closure. Verify packed Mint Host and Client exports without source aliases, and an independent plain Web composition without Mint defaults. Native code never transforms sessions or replaces data roots. Test existing synthetic profiles/data separately from fresh installation. Quiesce fixture processes before backup/restoration; retain upgraded data separately. Application replacement does not authorize downgrade reads.

## Release evidence

Retain source-lock, ancestry, activation, configuration and qualification checks. The source-lock target and actual CLI must both identify RC.2. Workspace component enumeration is development-source evidence; enumerate runtime components from the staged installation and bind them and assembly-input digests into qualification/release metadata. Update producers and validators together. Never substitute workspace versions for installed versions or merely remove equality checks.

Desktop and DSH versions have separate meanings even if equal. Historical records remain unchanged. Missing or stale assembly evidence blocks qualification. Remote publication, bot finalization and installed-app replacement are outside this implementation task; prepare the exact candidate for normal finalization without inventing bot provenance.

## Alternatives and ownership

Source-built mixed runtime fails unmodified-artifact acceptance. Patching official manifests recreates CLI coupling. Startup plugin installation adds network and package-manager state to offline launch. Upstream private Desktop Host changes unsigned behavior, transport and profile ownership beyond scope. Deferring development-source sync needs an independent adoption-provenance redesign and is unnecessary here.

Mint build/native tooling owns assembly checks, initialization and supervision; upstream owns runtime/data formats; Mint plugins own their feature behavior. Independent QA owns final acceptance. Missing official dependencies, unavailable public extensions or any need to modify official bytes reopen this decision.

## Required evidence

AC-1/2 require frozen official installation, explicit Mint packs, payload/resolution/link verification and negative missing-package, collision and tampering cases. AC-3 requires actual official CLI readiness/authentication and process lifecycle alongside parser failures. AC-4 requires external Host/Client loading and plain Web composition. AC-5 requires isolated arm64 packaged UI, keyless conversation and exit. AC-6 requires fresh/existing/interrupted profile scenarios and actual component metadata. AC-7 requires an executed coupling check and updated standing policy connected to existing packaging callers. No test result is claimed by this design record.
