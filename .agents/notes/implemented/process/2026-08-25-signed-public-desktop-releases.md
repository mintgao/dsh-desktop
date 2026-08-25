# Agent Note: Public desktop releases require stable macOS identity

Status: implemented

English | [中文](2026-08-25-signed-public-desktop-releases.zh.md)

## Problem

DSH Desktop uses native macOS capabilities whose operating-system identity is not represented by browser tests or an unsigned application bundle. Electron 43 delivers notifications through `UNUserNotificationCenter`, which rejects unsigned and ad-hoc-signed applications even when the renderer reports Web Notification permission as granted. A preview can therefore pass plugin tests, packaged startup smoke, and browser notification capture while the installed application never appears in macOS notification settings or presents a banner.

Public preview artifacts are also product artifacts: users install them under the same bundle identifier, rely on their Mint publisher identity, and use them for native acceptance testing. Allowing an unsigned preview path makes the release channel unable to prove the native behavior it advertises.

## Decision

Every public `desktop-v*` artifact is signed with a Developer ID Application certificate and notarized. A prerelease suffix controls update behavior and asset selection, not trust level: preview tags create signed and notarized DMGs for manual replacement, while stable tags additionally create the ZIPs, blockmaps, and combined metadata used by `electron-updater`.

[`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) requires the certificate and App Store Connect API-key secrets for both channels. Each native build forces code signing and notarization, verifies the complete bundle with `codesign`, rejects a missing Developer ID Application authority or an ad-hoc signature, validates the stapled DMG ticket, and creates only a draft Release. A maintainer publishes after testing the installed artifact.

Unsigned local builds remain available for source iteration and package smoke. They are never public release artifacts and cannot provide acceptance evidence for notifications, updates, Keychain behavior, or another macOS capability that depends on stable application identity. The repository's [Mint feature workflow](../../../skills/dsh-mint-client-feature/SKILL.md) requires the relevant macOS interaction from a signed and notarized artifact.

This decision supersedes only the unsigned-preview portion of [Mint desktop downstream development](2026-08-24-mint-desktop-downstream-development.md) and [manual preview release awareness](../feature/2026-08-24-desktop-manual-preview-updates.md). The downstream repository model, manual preview update flow, signed stable updater, and maintainer-controlled draft publication remain unchanged.

## Alternatives considered

**Keep unsigned previews and document that notifications do not work.** That preserves credential-free distribution but prevents a preview from validating the native features it is meant to test and presents a visible setting whose operating-system effect is unavailable.

**Use a complete ad-hoc signature.** Ad-hoc signing seals bundle resources and gives `codesign` structural validity, but it provides no stable publisher identity and macOS still rejects Electron 43 notifications.

**Downgrade to Electron 41.** The older notification backend can present from unsigned applications, but pinning an unsupported Electron generation trades current security and platform maintenance for a temporary release shortcut.

**Send notifications through AppleScript or a bundled notifier.** The banner would carry another application's identity or require a second native executable and activation protocol. That weakens the product identity and bypasses Electron's ownership of native application lifecycle.

## Verification

Workflow contract tests require signing secrets, forced signing, notarization, Developer ID identity inspection, and ticket validation on both preview and stable paths while proving that only stable releases contain automatic-update assets. Documentation checks keep the public release and local-build limitations synchronized in both languages.

Release acceptance installs a workflow-produced DMG, confirms the bundle identity and notarization ticket, runs the packaged smoke, enables the relevant setting, completes a real task while the application is in the background, observes the macOS notification, and activates it to return to the matching task. Renderer shims and unsigned local builds remain lower-tier evidence and never replace this interaction.

## Consequences

No public preview can be created before the maintainer configures Apple Developer and App Store Connect credentials, and both architectures pay signing and notarization time. In return, preview and stable artifacts share one persistent application identity, native feature tests exercise the same operating-system trust model users receive, Gatekeeper can verify the publisher, and release notes no longer advertise behavior that the artifact cannot perform.
