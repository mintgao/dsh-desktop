# Agent Note: Desktop delivery evidence before publication

Status: implemented

English | [中文](2026-09-08-desktop-delivery-shadow.zh.md)

## Problem

Upstream discovery, source adoption and desktop publication have different failure and approval requirements. A successful release lookup cannot establish that an adopted checkout builds, that its installed backend starts, or that both desktop architectures contain the same candidate. Changing production writers before testing these relationships risks replacing one opaque failure with another.

## Decision

The [reviewed delivery tooling](2026-09-08-reviewed-desktop-release-delivery.md) has separate production qualification and activation requirements. Shadow evidence retains its non-authorizing purpose.

The [shadow CLI](../../../../scripts/desktop-delivery/cli.ts) and [manual workflow](../../../../.github/workflows/desktop-delivery-shadow.yml) produce versioned, unsigned evidence with no publication authority. Explicit distribution configuration keeps Mint identity out of reusable validation logic. Complete release observations reconcile against recorded identities; source checks precede packaging; file digests and mounted-backend smoke bind each architecture to its candidate. Aggregation independently checks downloaded evidence and requires every configured architecture.

The [shadow decision](../../../../docs/decisions/20260908-desktop-delivery-shadow.md) owns exact validation and native-smoke requirements. The [operator guide](../../../../docs/cookbook/desktop-delivery-shadow.md) owns local discovery commands. Existing [production adoption](2026-08-27-automatic-upstream-desktop-releases.md) and [signing policy](2026-08-27-pre-certificate-unsigned-desktop-previews.md) remain active; this additive workflow does not supersede their writers or controls.

## Alternatives considered

**Replace production writers before package evidence exists.** A new approval model cannot prove packaged backend startup or architecture completeness. Read-only qualification exposes those failures without changing release state.

**Treat Electron bootstrap as a complete startup test.** The bootstrap command exits before backend startup. A mounted backend launch is necessary to exercise the packaged runtime and authenticated HTTP readiness.

**Qualify a modified local checkout as an exact commit.** A commit identifier omits local edits. Modified-checkout reports remain diagnostics; clean workflow evidence is required for qualification.

## Consequences

Maintainers can reproduce discovery and package failures locally and inspect a shared summary before production migration. The additional workflow consumes native build time but cannot create an adoption PR or publish a release. Unsigned evidence proves neither publisher identity nor installed-client replacement. One native architecture does not establish two-architecture success, and no shadow report authorizes publication.
