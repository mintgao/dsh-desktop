# Agent Note: Mint desktop downstream development and releases

Status: implemented

English | [中文](2026-08-24-mint-desktop-downstream-development.zh.md)

## Problem

DSH Desktop ships a personalized application while its backend is assembled from the current DeepSeek Harness source tree. Extracting only the Electron files would lose unpublished Harness changes and the source-built packaging proof, but treating the checkout as the official repository would expose organization-specific workflows, release controls, and branding that do not belong to a personal distribution. Development also moves between computers whose Node installation, CPU architecture, local credentials, and generated dependency trees differ.

Public macOS distribution adds a second integrity requirement: users must be able to distinguish the Mint application from an official DeepSeek product and must receive an artifact whose code signature, notarization ticket, architecture, version, and checksum are produced by one reviewable process.

## Decision

The Mint project keeps the complete DeepSeek Harness Git history in the public `mintgao/dsh-desktop` repository. The local `origin` names that downstream repository, while `upstream` names `deepseek-ai/deepseek-harness`. The downstream `main` branch is release-ready and receives human feature, fix, documentation, and dependency branches through pull requests. The [automatic upstream desktop release](2026-08-27-automatic-upstream-desktop-releases.md) process is the documented exception: it merges a queued published upstream tag directly only after its required checks pass, then records and releases that adoption. Conflicts and check failures stop before the push and remain visible through a blocker issue.

The root [`CONTRIBUTING.md`](../../../../CONTRIBUTING.md) owns the cross-device procedure. Source moves only through Git; a live checkout, dependency directory, staged backend, and build output never move through cloud-file synchronization or between CPU architectures. [`.node-version`](../../../../.node-version) selects Node 24, `package.json#packageManager` selects the exact pnpm version, and the lockfile remains authoritative. Credentials, `~/.dsh`, logs, Apple signing materials, and App Store Connect keys stay outside Git.

The official repository's automatically triggered CI, E2E, issue-management, and package-release jobs carry a `github.repository == 'deepseek-ai/deepseek-harness'` job condition. This keeps their source and upstream behavior intact while preventing the downstream repository from allocating organization-specific runners, mutating the official Project board, consuming external API credentials, or publishing official packages. [`desktop-ci.yml`](../../../../.github/workflows/desktop-ci.yml) supplies the downstream keyless checks and an explicit two-architecture package smoke.

Desktop releases use immutable semantic `desktop-v*` tags. Automated upstream adoption maps the exact Harness Release version to the desktop tag; exceptional desktop-only tags remain possible. [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) builds arm64 on a native Apple Silicon runner and x64 on a native Intel runner. Every tag requires a Developer ID Application certificate and App Store Connect API-key credentials, forces signing, submits both architectures for notarization, and validates the identities and stapled tickets. An automatic upstream dispatch publishes after all checks pass, while a manually pushed tag creates a draft. A prerelease contains two DMGs plus SHA-256 checksums; a stable `desktop-vX.Y.Z` release additionally includes both update ZIPs and blockmaps plus combined update metadata. [Signed public desktop releases](2026-08-25-signed-public-desktop-releases.md) owns the application-identity requirement, while [manual preview release awareness](../feature/2026-08-24-desktop-manual-preview-updates.md) owns the channel transition.

The application uses `io.github.mintgao.dsh-desktop` as its bundle identifier and `DSH-Desktop-Mint-*` as its artifact prefix. The Mint wave icon, root repository notice, application README, security policy, release notes, and repository description identify it as an unofficial distribution without removing truthful DeepSeek Harness attribution.

## Alternatives considered

**Extract the Electron application into a small independent repository.** The application currently packages the DSH runtime built from this checkout, including unpublished package changes and vendored dependencies. A separate consumer repository would either install a published version that differs from development or add a submodule and duplicate the build and release coordination. The complete-history downstream keeps one source and one lockfile until a stable published Harness dependency can replace that requirement.

**Create a GitHub fork and leave every upstream workflow active.** Public forks preserve the network relationship but inherit pull-request jobs that require DeepSeek organization runners, applications, secrets, labels, and Project configuration. Repository guards preserve upstream workflow files while giving the downstream project an independent required-check set.

**Synchronize the checkout or `node_modules` through a cloud drive.** File synchronization can merge partial Git state, compiled native modules, symlinks, and ignored credentials without commits or review. Git branches plus per-device immutable installation make the transferred state explicit and reproducible.

**Treat unsigned or ad-hoc-signed DMGs as public previews.** Those artifacts weaken identity and Gatekeeper expectations precisely where Mint branding must establish a clear publisher, and Electron rejects identity-dependent native capabilities such as notifications. Local development may use them, but every public channel requires Developer ID signing and notarization.

## Verification

Desktop source tests, update-metadata tests, the Electron main-process build, type checking, documentation gates, and native arm64 and x64 package smokes cover ordinary changes. Each package smoke runs the shipped executable with an internal smoke argument and loads the packaged main-process module graph, so ESM/CommonJS interoperation is checked inside `app.asar` rather than inferred from the TypeScript build. Workflow tests pin that artifact check, signing credentials on both channels, stable-only update assets, automatic versus manual publication, ordered upstream state, required pre-push checks, and recoverable withdrawal. Release jobs additionally verify native architecture selection, required secrets, Developer ID signing, notarization stapling, DMG assessment, architecture update metadata, and checksums before publication.

## Consequences

The downstream repository remains larger than a standalone Electron client, and automatic upstream adoption can still stop on conflicts with release or workflow files. Two native macOS jobs plus signing and notarization increase release time and storage. No public desktop channel can publish before Apple credentials exist; previews still require informed manual replacement, while automatic installation remains stable-only. One Git history plus explicit state, Release, workflow, and Issue records carries desktop and Harness iteration across devices and Agents, and official infrastructure cannot run accidentally.
