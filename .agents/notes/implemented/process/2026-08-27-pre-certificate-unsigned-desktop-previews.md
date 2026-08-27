# Agent Note: Pre-certificate unsigned desktop previews

Status: implemented

English | [中文](2026-08-27-pre-certificate-unsigned-desktop-previews.zh.md)

## Problem

DSH Desktop is a personal and small-group product while its maintainer has no Apple Developer certificate. Blocking upstream adoption on absent signing credentials defeats the product's primary release policy: every published upstream DSH Release must enter the desktop distribution automatically. Publishing a stable-version unsigned application would create a different failure because the client would select the signed automatic-update channel and the Release could appear to promise macOS trust that it does not have.

The release stage must therefore be durable project state rather than an assumption remembered from one conversation or machine. Future Agents need one default, one explicit transition, and artifact behavior that makes the current trust level visible.

## Decision

The repository variable `DESKTOP_RELEASE_SIGNING_MODE` owns the release trust stage. Its absent value and `unsigned-preview` both select the pre-certificate default. Only the maintainer's explicit confirmation that Apple Developer enrollment, the Developer ID Application certificate, and App Store Connect notarization credentials are ready authorizes setting it to `signed`. Adding Secrets alone does not change the stage.

In `unsigned-preview`, automatic upstream adoption does not require Apple Secrets. It maps a stable upstream version to `desktop-vX.Y.Z-unsigned.1` and appends `.unsigned.1` to an existing upstream prerelease suffix. The suffix makes the packaged application use manual preview discovery even when the upstream version is stable. The release workflow disables signing-identity discovery, builds arm64 and x64 DMGs, rejects an accidental Developer ID identity, writes checksums, and publishes a GitHub Pre-release titled **Unsigned Preview**. It publishes no ZIP, blockmap, `latest-mac.yml`, Latest designation, or claim that notifications and other identity-dependent native behavior work.

In `signed`, the existing signed-release rules apply. Upstream versions map exactly to desktop versions; signed prereleases remain manual previews, and a signed stable version may publish the automatic-update assets and become Latest. The workflow then requires all five Apple Secrets, forces signing and notarization, and validates the Developer ID identity and stapled ticket. The transition affects future tags only; immutable unsigned tags and their provenance remain unchanged.

The root [`AGENTS.md`](../../../../AGENTS.md) carries the standing order. The [desktop application reference](../../../../apps/desktop/README.md) owns operator procedure and limitations. [Automatic upstream desktop releases](2026-08-27-automatic-upstream-desktop-releases.md) owns queueing, adoption, publication, withdrawal, and handoff records. [Public desktop signing](2026-08-25-signed-public-desktop-releases.md) remains the authority for signed-mode identity and acceptance requirements; this decision is its explicit pre-certificate exception.

## Alternatives considered

**Block adoption until Apple enrollment completes.** This preserves a signed-only public history but abandons automatic upstream following for an indefinite administrative prerequisite and turns credentials into a source-integration dependency.

**Publish an unsigned artifact under the exact stable version.** The stable semantic version would select the signed updater lifecycle, allow Latest publication, and obscure the missing trust identity. An explicit prerelease suffix keeps distribution and client behavior aligned.

**Enable signed mode whenever all Secrets happen to exist.** Secret presence does not record the maintainer's product decision and could switch the public channel after a credential experiment or partial handoff. A named repository variable makes activation deliberate and reviewable.

**Remove signing and notarization permanently.** Small-group previews do not justify discarding the signed stable path. The staged policy keeps current delivery moving while preserving a defined transition to Gatekeeper-verifiable identity, native acceptance, and signed automatic updates.

## Verification

Workflow tests require `unsigned-preview` as the default, deterministic unsigned version suffixes, disabled signing discovery, absence of stable update assets, and conditional Apple Secret validation. They retain signed preview and signed stable assertions behind the explicit variable. Release notes identify unsigned artifacts in English and Chinese, explain manual Gatekeeper handling, and exclude identity-dependent native claims. Documentation checks keep the root standing order, contributor procedure, desktop reference, and active Agent Notes synchronized.

A real upstream Release is the production acceptance path: adoption advances without Apple Secrets, the desktop tag contains `unsigned.1`, both native jobs publish DMGs and checksums, and GitHub marks the Release as a Pre-release rather than Latest. Signed-mode acceptance remains the signed and notarized macOS interaction required by the Mint feature workflow.

## Consequences

Upstream following and public small-group previews continue before Apple enrollment, and every machine or Agent can determine the active trust stage from repository state. Users must explicitly bypass Gatekeeper and cannot rely on notifications, stable automatic updates, or a verified publisher identity. Native release jobs still consume both macOS architectures. Switching to signed mode requires the maintainer's explicit confirmation, the repository variable change, all five Apple Secrets, and signed acceptance evidence; it does not retrofit past unsigned versions.
