# Native integration and migration assessment

English | [中文](native-assessment.zh.md)

## Status

Proposed Phase B guidance from `upgrade_native_assessment`, comparing baseline `132ab869cbb800e1bf236efbaabfd4668fb3c67b` with target `b2e3b2a0125854567a4a5fcba75782e42fe84901`. No application launch or access to user data forms part of this assessment. A separately Accepted decision, independent review and readiness confirmation are required before implementation.

## Native ownership proposal

Retain Mint's Web-profile native adapter under `apps/desktop-mint`, preserving upstream `apps/desktop` and `apps/desktop-host`. Keep Mint's application ID, branding, desktop-mint profile, browser-state identity and manual-update preferences. Directory relocation must not change persisted identity.

Upstream owns reserved desktop profiles, framed-pipe transport and signed packaging assumptions. Mint uses authenticated loopback startup and independently versioned unsigned previews. Direct replacement would introduce additional profile, origin, permission and plugin-management changes. Avoid a shared ambiguous main process, wholesale upstream replacement or immediate shell adoption.

Mint must continue launching through the supported `dsh` profile path. Bundles own selection and defaults, reusable plugins own behavior, and native modules own lifecycle. Packed dependency closure and exact runtime compatibility require tests. Preserve upstream signing validation and keep any unsigned exception specific to Mint.

## Migration proposal

Use upstream session-format catalogs and frozen V0→V1→V2→V3 edges. Native code must not transform session data. Assess read-open behavior separately from durable write-open publication and retain source bytes. Settings, credentials, profiles and other durable stores need their own complete inventory across all seven releases.

Exercise disposable baseline homes and released historical fixtures through assembled list, read, resume, close and reopen scenarios. Record original hashes, immutable successor publication, interrupted-write recovery, source drift and malformed-input refusal. Header listing alone does not demonstrate full restoration. Check titles, workspaces, inheritance, compaction, references and notification behavior.

Manual recovery requires a quiescent disposable backup and separate retention of newer data. Replacing application files does not restore readable data. Automatic downgrade or deletion of newer generations is neither authorized nor claimed.

## Outstanding evidence

Phase B requires an Accepted native decision, independent review, a complete durable-store inventory, designed migration qualification and assembled/package tests. Native arm64/x64 closure, backend startup, cleanup, navigation and manual updates need verification. Signing-dependent notification behavior remains unverified. Phase A tooling acceptance does not satisfy these requirements or authorize merge, publication or installed-app replacement.
