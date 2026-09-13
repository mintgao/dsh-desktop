# Agent Note: Mint homepage and release highlights

Status: implemented

English | [中文](2026-09-13-mint-homepage-maintenance.zh.md)

## Problem

Desktop visitors need a download path, supported-platform information, and useful release highlights. An upstream-first introduction and release history available only on another page obscure the Mint application and let installation advice drift from public artifacts.

## Decision

The root README pair presents Mint branding, project status, installation, and the latest published Desktop highlights. The [homepage maintenance rule](../../../../README.md#homepage-maintenance) defines release-owner obligations and the publication sequence; [project rules](../../../../.vibe/project-rules.md) make it part of future task context. The [downstream development decision](2026-08-24-mint-desktop-downstream-development.md) continues to own repository and distribution identity.

## Alternatives considered

**Keep updates only in Releases.** Releases remain the full history, but visitors cannot assess the current desktop version directly on the project homepage.

**Copy every upstream change into the homepage.** This buries Desktop improvements and can imply availability before a Mint artifact is public. Curated user-visible highlights retain the desktop focus.

## Verification

Translation pairing and documentation checks verify matching records and valid links. Release review verifies version, date, assets, and user-facing claims against the public release; Markdown checks alone cannot prove feature availability.

## Consequences

The release owner maintains a short bilingual summary alongside each relevant publication. This is a required editorial step, not an automatic release-note generator; internal changes without user-visible effects need no entry.
