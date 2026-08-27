# Agent Note: Automatic upstream adoption and desktop releases

Status: implemented

English | [中文](2026-08-27-automatic-upstream-desktop-releases.zh.md)

## Problem

DSH Desktop intentionally follows the DeepSeek Harness release stream for a personal and small-group distribution. Requiring a maintainer to create a review branch, merge it, choose another desktop version, inspect a draft, and publish it makes routine adoption depend on memory and availability even when the desired policy is to reuse every upstream release. The process must still stop on a real merge or verification failure, survive interrupted workflow runs, allow a problematic public Release to be withdrawn without erasing evidence, and leave enough durable state for another computer or Agent to continue.

## Decision

[`upstream-sync.yml`](../../../../.github/workflows/upstream-sync.yml) polls public `deepseek-ai/deepseek-harness` Releases twice an hour. [`.github/upstream-sync-state.json`](../../../../.github/upstream-sync-state.json) records the last adopted upstream tag, its commit and publication time, and the downstream desktop tag. The initial record points to the upstream release already contained by the downstream and its existing desktop release, so historical releases are not republished. The workflow orders public, non-draft `dsh-v*` Releases by publication time and handles exactly the next one on each run. A manual dispatch may select that queued release but cannot skip ahead.

The workflow fetches the exact upstream tag and merges its commit directly into release-ready `main`. Before pushing, it installs the locked dependencies and runs desktop tests, the desktop build, repository type checking, documentation checks, and a generated-source drift check. A conflict or failed check stops before any remote update and creates or updates a `Blocked: adopt DeepSeek Harness ...` Issue containing the workflow run. A maintainer resolves the exact adoption on a normal branch, merges that fix through the ordinary process, and reruns the workflow.

Each upstream `dsh-vX.Y.Z[-suffix]` Release maps to `desktop-vX.Y.Z[-suffix]`. After verification, the workflow updates the state file in a dedicated adoption commit, creates an annotated desktop tag, and atomically pushes `main` and that tag. It then explicitly dispatches [`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) with the upstream tag and commit. Explicit dispatch avoids relying on a second workflow trigger from a GitHub token push. The release workflow checks out the tag, builds, signs, notarizes, inspects, and packages both native architectures. It publishes an upstream-driven run immediately after every check passes; a prerelease is marked as such and a stable release becomes Latest. A manually pushed desktop tag continues to create a draft for an exceptional desktop-only release.

The state advances when the adoption commit and tag reach the remote, before native release construction completes. If the Release does not yet exist on a later poll but the recorded desktop tag does, the adoption workflow detects that interrupted state and redispatches the release unless an equivalent run is already active. It never skips to a newer upstream release while the recorded desktop Release is missing.

[`desktop-release-withdraw.yml`](../../../../.github/workflows/desktop-release-withdraw.yml) provides reversible withdrawal. It converts a selected public Release back to a draft while preserving its notes, tag, and assets. When a stable Release is withdrawn, it marks the newest remaining public stable Release as Latest. It creates or updates a `Desktop release withdrawn: ...` Issue with every withdrawal reason and workflow run, the fallback version, restoration command, and the fact that installed applications are not remotely downgraded. Rerunning an interrupted withdrawal repairs the fallback and missing Issue record without duplicating an already recorded run. Restoration republishes the unchanged retained draft; an already-installed application requires manual replacement with an earlier DMG when actual downgrade is needed.

Git owns every source change and immutable desktop tag. The state JSON owns queue position. Generated Release notes own the upstream tag, upstream commit, and desktop source commit. Actions runs own execution evidence. Blocker and withdrawal Issues own exceptional state and recovery instructions. These records, rather than a previous chat or one machine's filesystem, are the required handoff set for another maintainer or Agent. This decision replaces the manual upstream review and draft-publication portions of [Mint desktop downstream development](2026-08-24-mint-desktop-downstream-development.md), [public desktop signing](2026-08-25-signed-public-desktop-releases.md), [manual preview release awareness](../feature/2026-08-24-desktop-manual-preview-updates.md), and [user-controlled signed updates](../feature/2026-08-24-desktop-signed-auto-update.md); their repository, signing, update-installation, and user-consent decisions remain active.

## Alternatives considered

**Keep a review branch and manual draft publication for every upstream release.** This provides two human pauses but conflicts with the chosen policy that every upstream Release should be reused promptly. Source and artifact checks still stop invalid automation, and withdrawal handles problems found during real use.

**Adopt only the newest observed upstream release.** This can silently omit an intermediate Release and makes the historical mapping ambiguous. A one-at-a-time queue preserves upstream order and gives every change its own commit, tag, Release, and evidence.

**Delete the GitHub Release and tag when a version is bad.** Deletion weakens audit and makes restoration harder. Converting the Release to a draft removes it from public discovery while retaining the exact source and artifacts.

**Automatically downgrade installed applications after withdrawal.** The desktop updater and GitHub Release channel do not provide a safe remote uninstall or downgrade operation. Withdrawal prevents new discovery, restores the previous stable listing, and leaves any installed rollback as an explicit DMG replacement.

## Verification

Workflow tests parse the three Actions definitions and require ordered release-state use, the complete source check set, an atomic `main` and tag push, explicit release dispatch, automatic versus draft publication, signing and notarization gates, release withdrawal without tag deletion, stable fallback selection, and durable Issue creation. Documentation checks validate the bilingual instructions and Agent Notes. A production acceptance run requires the next real upstream Release: the adoption run must update the state and tag, the release run must publish the signed assets and generated provenance, and a test withdrawal and restoration must preserve assets while changing public visibility.

## Consequences

Routine upstream publication needs no maintainer action, and each successful adoption can become visible to users after the macOS jobs complete. This intentionally trusts upstream Releases plus automated merge, source, signing, notarization, and packaging checks rather than a per-version human review. Upstream changes that conflict with downstream files or fail checks stop the queue and require a normal fix. Release withdrawal is fast and reversible, but it cannot recall or remotely downgrade copies already installed. The repository and GitHub records provide a complete continuation point across machines and Agents.
