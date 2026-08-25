# Agent Note: Manual preview release awareness

Status: implemented

English | [中文](2026-08-24-desktop-manual-preview-updates.zh.md)

## Problem

Small-group testing must be possible before the maintainer can obtain a Developer ID certificate and notarization credentials. An unsigned DMG cannot use the supported Squirrel.Mac installation path, but leaving update discovery entirely outside the application makes testers depend on messages from the maintainer and encourages indefinite use of old embedded Harness versions. Polling or opening arbitrary API fields would also expose users to unnecessary GitHub rate usage and unsafe external navigation.

## Decision

A packaged desktop version with a semantic prerelease suffix uses a manual release-awareness controller. A stable version continues to use the signed automatic lifecycle. Source builds and unsupported architectures do not query the public repository and explain that state when the menu command is used.

### Release discovery

The preview application reads the public `mintgao/dsh-desktop` Releases API without credentials thirty seconds after startup and every six hours thereafter. It sends the stored ETag on later requests, accepts both prereleases and stable releases, ignores drafts and unrelated tags, and selects the greatest semantic version that includes the exact `DSH-Desktop-Mint-<version>-<arch>.dmg` asset for the running arm64 or x64 process. The application constructs the Release URL from the validated repository and tag instead of trusting an API-provided external URL.

The main process performs the request through Electron networking. No renderer permission or preload bridge is added. The current release, ETag, skipped version, last notification, and one reminder time are validated at the local JSON boundary and replaced atomically in the application user-data directory. An unreadable or unsupported document resets to defaults and produces a diagnostic rather than preventing startup.

### User attention and decisions

The first background discovery of each version creates one native notification, changes the application menu, and adds an attention badge. It never downloads the DMG. A clicked notification or the native **Open Release** decision opens the exact Release page, identifies the Mac architecture and recommended filename, and schedules one reminder for 24 hours later. **Remind Me Tomorrow** uses the same delay. **Skip this version** suppresses background attention for that version only; a greater version can notify normally. The menu command always lets the user revisit a known release.

Background failures are written to the desktop log. A manual failure uses a native dialog and can open the repository's general Releases page. Teardown cancels both schedules and closes any process-owned notification.

### Release and signed-channel transition

A tag with a prerelease suffix makes the release workflow build unsigned arm64 and x64 DMGs with signing discovery disabled. It creates a draft GitHub prerelease containing only those DMGs and SHA-256 checksums. The checksum file records asset basenames so downloading it beside the DMGs makes the standard verification command work without recreating a CI directory. The release-note template identifies the distribution and unsigned status, links each architecture directly, explains manual replacement and Gatekeeper confirmation, and requires the embedded Harness revision, changes, and migration notes before publication.

A preview client can discover a later stable release and guide the user through one final manual installation. Stable versions do not contain a prerelease suffix, so the newly installed application switches to the signed `electron-updater` lifecycle. Unsigned artifacts never provide channel metadata or enter automatic installation.

## Alternatives considered

**Require users to watch GitHub or maintainer messages.** This removes application code but gives no durable signal or architecture guidance. Native release awareness keeps installation manual while making version status visible where the work happens.

**Download an unsigned DMG inside the application.** A download button could be mistaken for a verified automatic update and would still end at a Gatekeeper-controlled manual installation. Opening the exact Release page keeps provenance, warnings, checksums, and notes together.

**Use a private endpoint or bundled GitHub token.** A distributed credential is not secret, and per-user authentication adds unrelated setup. Anonymous conditional requests remain well below GitHub's public rate limit at the selected interval.

**Replace the signed stable updater permanently.** Manual replacement is acceptable for informed preview testers, but it is a worse long-term safety and convenience model. The version suffix provides a deterministic transition to the signed channel.

## Verification

Controller tests cover notification deduplication, 24-hour one-shot reminders, skipped-version isolation, manual results, failure visibility, scheduling, and teardown. API tests cover ETags, HTTP failures, semantic ordering, draft and unrelated-tag filtering, architecture assets, and exact Release URLs. Preference tests cover atomic round trips and invalid-document reset. Workflow tests prove that prerelease tags avoid signing secrets and automatic-update assets while stable tags retain forced signing, notarization metadata, and draft publication. The Electron TypeScript build verifies the native integration.

## Consequences

Early testers can receive version awareness without Apple credentials or silent code download, and the first signed stable release remains reachable. They must still understand that preview DMGs are unsigned, verify the tag, filename, and checksum, and approve the current macOS Gatekeeper flow themselves. GitHub availability now affects background awareness but never application startup or existing DSH work. The maintainer owns clear release notes and must not present preview artifacts as signed, notarized, or suitable for unattended installation.
