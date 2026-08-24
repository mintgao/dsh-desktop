# Agent Note: Mint desktop downstream development and releases

Status: implemented

English | [中文](2026-08-24-mint-desktop-downstream-development.zh.md)

## Problem

DSH Desktop ships a personalized application while its backend is assembled from the current DeepSeek Harness source tree. Extracting only the Electron files would lose unpublished Harness changes and the source-built packaging proof, but treating the checkout as the official repository would expose organization-specific workflows, release controls, and branding that do not belong to a personal distribution. Development also moves between computers whose Node installation, CPU architecture, local credentials, and generated dependency trees differ.

Public macOS distribution adds a second integrity requirement: users must be able to distinguish the Mint application from an official DeepSeek product and must receive an artifact whose code signature, notarization ticket, architecture, version, and checksum are produced by one reviewable process.

## Decision

The Mint project keeps the complete DeepSeek Harness Git history in `mintgao/dsh-desktop`. The local `origin` names that downstream repository, while `upstream` names `deepseek-ai/deepseek-harness`. The downstream `main` branch is release-ready and receives feature, fix, documentation, dependency, and upstream-sync branches through pull requests. Upstream updates merge through a dedicated `chore/sync-upstream-*` branch so conflicts with desktop code and workflow guards remain visible.

The root [`CONTRIBUTING.md`](../../../../CONTRIBUTING.md) owns the cross-device procedure. Source moves only through Git; a live checkout, dependency directory, staged backend, and build output never move through cloud-file synchronization or between CPU architectures. [`.node-version`](../../../../.node-version) selects Node 24, `package.json#packageManager` selects the exact pnpm version, and the lockfile remains authoritative. Credentials, `~/.dsh`, logs, Apple signing materials, and App Store Connect keys stay outside Git.

The official repository's automatically triggered CI, E2E, issue-management, and package-release jobs carry a `github.repository == 'deepseek-ai/deepseek-harness'` job condition. This keeps their source and upstream behavior intact while preventing the downstream repository from allocating organization-specific runners, mutating the official Project board, consuming external API credentials, or publishing official packages. [`desktop-ci.yml`](../../../../.github/workflows/desktop-ci.yml) supplies the downstream keyless checks and an explicit two-architecture package smoke.

Desktop releases use immutable `desktop-vX.Y.Z` tags independently of the Harness npm version. [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) builds arm64 on a native Apple Silicon runner and x64 on a native Intel runner. It requires a Developer ID Application certificate plus App Store Connect API-key credentials, forces signing, enables hardened runtime entitlements, submits the application for notarization, validates the stapled ticket, and creates a draft GitHub Release containing both DMGs and their SHA-256 checksums. A maintainer tests and manually publishes that draft; local unsigned packages never enter the release workflow.

The application uses `io.github.mintgao.dsh-desktop` as its bundle identifier and `DSH-Desktop-Mint-*` as its artifact prefix. The Mint wave icon, root repository notice, application README, security policy, release notes, and repository description identify it as an unofficial distribution without removing truthful DeepSeek Harness attribution.

## Alternatives considered

**Extract the Electron application into a small independent repository.** The application currently packages the DSH runtime built from this checkout, including unpublished package changes and vendored dependencies. A separate consumer repository would either install a published version that differs from development or add a submodule and duplicate the build and release coordination. The complete-history downstream keeps one source and one lockfile until a stable published Harness dependency can replace that requirement.

**Create a GitHub fork and leave every upstream workflow active.** Public forks preserve the network relationship but inherit pull-request jobs that require DeepSeek organization runners, applications, secrets, labels, and Project configuration. Repository guards preserve upstream workflow files while giving the downstream project an independent required-check set.

**Synchronize the checkout or `node_modules` through a cloud drive.** File synchronization can merge partial Git state, compiled native modules, symlinks, and ignored credentials without commits or review. Git branches plus per-device immutable installation make the transferred state explicit and reproducible.

**Publish unsigned or ad-hoc-signed DMGs for early testers.** Those artifacts weaken identity and Gatekeeper expectations precisely where the Mint branding must establish a clear publisher. Local packages remain available for development, while GitHub Releases wait for Developer ID signing and notarization.

## Verification

Desktop source tests, the Electron main-process build, type checking, documentation gates, and a real arm64 package smoke cover ordinary changes. The package smoke verifies that electron-builder converts the committed 1024px Mint PNG into a transparent macOS icon. Release jobs additionally verify native architecture selection, required secrets, code signing, notarization stapling, DMG assessment, checksums, and draft-only publication.

## Consequences

The downstream repository remains larger than a standalone Electron client and upstream sync can conflict with release and workflow files. Two native macOS jobs increase release time, and public releases cannot start until the maintainer provides an Apple Developer certificate and App Store Connect API key. In return, one Git history carries desktop and Harness iteration across devices, upstream changes remain attributable, official infrastructure cannot run accidentally, and every supported download has an explicit personal identity and verifiable Apple release chain.
