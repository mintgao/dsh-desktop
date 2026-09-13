# Agent Note: Native GUI capability before update qualification

Status: proposed

English | [中文](2026-09-13-forward-native-capability.zh.md)

## Problem

A packaged backend smoke does not establish that a hosted Mac can observe a normal desktop window or quit through its application menu. Expensive update qualification cannot succeed without those capabilities.

## Proposal

Use the [bounded capability probe](../../../../docs/decisions/20260913-forward-native-capability.md) with authenticated retained bytes before building another target. Keep its result diagnostic and preserve the [reviewed delivery](../../implemented/process/2026-09-08-reviewed-desktop-release-delivery.md) and [shadow evidence](../../implemented/process/2026-09-08-desktop-delivery-shadow.md) authority distinctions; neither existing decision is superseded.

## Alternatives considered

Reusing inspector-driven startup as ordinary entry would test another path. A general GUI runner would expand the task before the host capability is known. Reuse the existing PID-scoped Accessibility adapter instead.

## Acceptance criteria

The pinned architecture and package open normally, expose rendered content, quit through the application menu, and repeat on reopening within the deadline. Failed identity, missing access and cleanup failures remain visible and cannot qualify a release.

## Risks

Hosted Accessibility may be unavailable. Failure stops dependent qualification without granting permissions or substituting injected observations. A successful capability result still leaves actual update and public-delivery acceptance unverified.
