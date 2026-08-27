# Agent Note: Public desktop releases require stable macOS identity

Status: implemented

English | [中文](2026-08-25-signed-public-desktop-releases.zh.md)

## Problem

DSH Desktop uses native macOS capabilities whose operating-system identity is not represented by browser tests or an unsigned application bundle. Electron 43 delivers notifications through `UNUserNotificationCenter`, which rejects unsigned and ad-hoc-signed applications even when the renderer reports Web Notification permission as granted. A preview can therefore pass plugin tests, packaged startup smoke, and browser notification capture while the installed application never appears in macOS notification settings or presents a banner.

Public preview artifacts are also product artifacts: users install them under the same bundle identifier, rely on their Mint publisher identity, and use them for native acceptance testing. Allowing an unsigned preview path makes the release channel unable to prove the native behavior it advertises.

## Decision

This identity requirement governs the `signed` release stage. The explicit [pre-certificate unsigned-preview stage](2026-08-27-pre-certificate-unsigned-desktop-previews.md) is the temporary small-group exception and marks every artifact and version accordingly. After signed activation, every public `desktop-v*` artifact is signed with a Developer ID Application certificate and notarized. A prerelease suffix controls update behavior and asset selection, not trust level: preview tags create signed and notarized DMGs for manual replacement, while stable tags additionally create the ZIPs, blockmaps, and combined metadata used by `electron-updater`.

In signed mode, [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) requires the certificate and App Store Connect API-key secrets for both channels. Each native build forces code signing and notarization, verifies the complete bundle with `codesign`, rejects a missing Developer ID Application authority or an ad-hoc signature, and validates the stapled DMG ticket. An [automatic upstream adoption](2026-08-27-automatic-upstream-desktop-releases.md) publishes a signed artifact only after those checks and every required source check pass. A manually pushed desktop tag still creates a draft for exceptional releases.

Unsigned builds remain available for source iteration, package smoke, and the explicitly marked pre-certificate preview stage. They cannot provide acceptance evidence for notifications, updates, Keychain behavior, or another macOS capability that depends on stable application identity. The repository's [Mint feature workflow](../../../skills/dsh-mint-client-feature/SKILL.md) requires the relevant macOS interaction from a signed and notarized artifact.

This decision supersedes unsigned preview as a permanent public channel in [Mint desktop downstream development](2026-08-24-mint-desktop-downstream-development.md) and [manual preview release awareness](../feature/2026-08-24-desktop-manual-preview-updates.md). The later pre-certificate decision defines a bounded exception until the maintainer explicitly activates signing. The downstream repository model, manual preview update flow, signed stable updater, and signed-mode requirements remain unchanged. The automatic-upstream decision replaces maintainer-controlled draft publication for upstream-driven versions without weakening signed-mode identity.

## Alternatives considered

**Keep unsigned previews as the permanent public channel.** That preserves credential-free distribution but prevents a preview from validating the native features it is meant to test and presents a visible setting whose operating-system effect is unavailable. The pre-certificate stage accepts this limitation only until explicit signing activation.

**Use a complete ad-hoc signature.** Ad-hoc signing seals bundle resources and gives `codesign` structural validity, but it provides no stable publisher identity and macOS still rejects Electron 43 notifications.

**Downgrade to Electron 41.** The older notification backend can present from unsigned applications, but pinning an unsupported Electron generation trades current security and platform maintenance for a temporary release shortcut.

**Send notifications through AppleScript or a bundled notifier.** The banner would carry another application's identity or require a second native executable and activation protocol. That weakens the product identity and bypasses Electron's ownership of native application lifecycle.

## Verification

Workflow tests require signing secrets, forced signing, notarization, Developer ID identity inspection, and ticket validation on signed preview and stable paths while proving that only signed stable releases contain automatic-update assets. They also distinguish the explicit signed stage, immediate automatic publication, and the manual tag's draft fallback. Documentation checks keep the release-stage and local-build limitations synchronized in both languages.

Release acceptance installs a workflow-produced DMG, confirms the bundle identity and notarization ticket, runs the packaged smoke, enables the relevant setting, completes a real task while the application is in the background, observes the macOS notification, and activates it to return to the matching task. Renderer shims and unsigned local builds remain lower-tier evidence and never replace this interaction.

## Consequences

No signed preview or stable release can be created before the maintainer configures Apple Developer and App Store Connect credentials and explicitly activates signed mode; both architectures then pay signing and notarization time. In return, signed preview and stable artifacts share one persistent application identity, native feature tests exercise the same operating-system trust model users receive, Gatekeeper can verify the publisher, and signed release notes advertise only behavior that the artifact can perform.
