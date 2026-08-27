# Agent Note: Manual preview release awareness

Status: implemented

English | [中文](2026-08-24-desktop-manual-preview-updates.zh.md)

## Problem

Small-group testing needs a prerelease channel that remains outside the stable automatic-update feed. Leaving update discovery entirely outside the application makes testers depend on messages from the maintainer and encourages indefinite use of old embedded Harness versions. Polling or opening arbitrary API fields would also expose users to unnecessary GitHub rate usage and unsafe external navigation.

## Decision

A packaged desktop version with a semantic prerelease suffix uses a manual release-awareness controller. A stable version continues to use the signed automatic lifecycle. Source builds and unsupported architectures do not query the public repository and explain that state when the menu command is used.

### Release discovery

The preview application reads the public `mintgao/dsh-desktop` Releases API without credentials thirty seconds after startup and every six hours thereafter. It sends the stored ETag on later requests, accepts both prereleases and stable releases, ignores drafts and unrelated tags, and selects the greatest semantic version that includes the exact `DSH-Desktop-Mint-<version>-<arch>.dmg` asset for the running arm64 or x64 process. The application constructs the Release URL from the validated repository and tag instead of trusting an API-provided external URL.

The main process performs the request through Electron networking. No renderer permission or preload bridge is added. The current release, ETag, skipped version, last notification, and one reminder time are validated at the local JSON boundary and replaced atomically in the application user-data directory. An unreadable or unsupported document resets to defaults and produces a diagnostic rather than preventing startup.

### User attention and decisions

The first background discovery of each version changes the application menu, adds an attention badge, and requests one native notification. A signed application can present that notification; an unsigned pre-certificate preview may not receive a macOS banner and relies on the menu, badge, and manual command. It never downloads the DMG. A clicked notification or the native **Open Release** decision opens the exact Release page, identifies the Mac architecture and recommended filename, and schedules one reminder for 24 hours later. **Remind Me Tomorrow** uses the same delay. **Skip this version** suppresses background attention for that version only; a greater version can notify normally. The menu command always lets the user revisit a known release.

Background failures are written to the desktop log. A manual failure uses a native dialog and can open the repository's general Releases page. Teardown cancels both schedules and closes any process-owned notification.

### Release and trust-stage transition

A tag with a prerelease suffix selects manual release awareness. In the default [pre-certificate stage](../process/2026-08-27-pre-certificate-unsigned-desktop-previews.md), the release workflow builds unsigned arm64 and x64 DMGs and identifies their missing Apple trust in the title and notes. After explicit signed activation, prerelease tags build Developer ID-signed and notarized DMGs. An [automatic upstream adoption](../process/2026-08-27-automatic-upstream-desktop-releases.md) publishes the prerelease after all checks required by the active stage pass, while a manually pushed desktop tag creates a draft. Both contain only the two DMGs and SHA-256 checksums. The checksum file records asset basenames so downloading it beside the DMGs makes the standard verification command work without recreating a CI directory. Generated release notes identify the distribution and trust stage, link each architecture directly, explain manual replacement, and record the embedded Harness tag and commit plus the desktop source commit.

A preview client can discover a later stable release and guide the user through one final manual installation. Stable versions do not contain a prerelease suffix, so the newly installed application switches to the `electron-updater` lifecycle. Preview artifacts do not provide channel metadata or enter automatic installation.

## Alternatives considered

**Require users to watch GitHub or maintainer messages.** This removes application code but gives no durable signal or architecture guidance. Native release awareness keeps installation manual while making version status visible where the work happens.

**Download the preview DMG inside the application.** A download button could be mistaken for the stable automatic-update path even though installation remains manual. Opening the exact Release page keeps provenance, checksums, and notes together.

**Use a private endpoint or bundled GitHub token.** A distributed credential is not secret, and per-user authentication adds unrelated setup. Anonymous conditional requests remain well below GitHub's public rate limit at the selected interval.

**Replace the signed stable updater permanently.** Manual replacement is acceptable for informed preview testers, but it is a worse long-term safety and convenience model. The version suffix provides a deterministic transition to the signed channel.

## Verification

Controller tests cover notification deduplication, 24-hour one-shot reminders, skipped-version isolation, manual results, failure visibility, scheduling, and teardown. API tests cover ETags, HTTP failures, semantic ordering, draft and unrelated-tag filtering, architecture assets, and exact Release URLs. Preference tests cover atomic round trips and invalid-document reset. Workflow tests prove that prerelease tags exclude automatic-update assets, use unsigned packaging by default, and require signing and notarization only after explicit activation; signed stable tags retain update metadata, and automatic versus manual dispatch selects public or draft publication. The Electron TypeScript build verifies the native integration.

## Consequences

Early testers can receive version awareness without silent code download, and the first signed stable release remains reachable. Pre-certificate previews need no Apple credentials but cannot validate identity-dependent native capabilities and may require explicit Gatekeeper bypass; signed previews later provide stable application identity for native acceptance. Testers still verify the tag, filename, and checksum and perform a manual replacement. GitHub availability affects background awareness but never application startup or existing DSH work. The maintainer owns clear release notes and must not present preview artifacts as suitable for unattended installation.
