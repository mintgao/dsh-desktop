# Agent Note: User-controlled signed desktop updates

Status: implemented

English | [中文](2026-08-24-desktop-signed-auto-update.zh.md)

## Problem

A self-contained DSH Desktop application cannot inherit a globally installed Harness update, and replacing its embedded runtime independently would break the source-built application proof. Manual DMG replacement gives users no in-application signal, while downloading or restarting without consent could interrupt a live local Agent session. The public release also contains native arm64 and x64 applications, so one update feed must select the correct architecture without exposing a repository credential.

## Decision

Signed stable macOS builds use `electron-updater` against public GitHub Releases in `mintgao/dsh-desktop`. The updater accepts stable releases only, never downloads automatically, and never installs automatically on ordinary application quit unless the user selected that behavior. Source and unpackaged builds have no feed and explain that state when the manual command is used. Signed prereleases use the separate [manual preview release awareness](2026-08-24-desktop-manual-preview-updates.md) lifecycle.

### Checks and user decisions

The controller checks ten seconds after the backend becomes usable and every six hours thereafter. **DSH Desktop > Check for Updates…** invokes the same check manually. A newer release produces a native choice to download, defer, or open its public release page. Download progress appears in the application menu, Dock, and window. A completed download produces a second choice to restart and install, install on the next normal quit, or defer. No path forces a restart.

Automatic network failures are written to the persistent desktop log without interrupting work. A manual check or user-selected download reports its failure in a native dialog and offers the public Releases page. The lifecycle-independent controller owns duplicate-operation suppression and user decisions; the Electron adapter owns transport events, and the main process owns native presentation.

### Release feed

Each stable `desktop-vX.Y.Z` build emits a signed and notarized DMG plus a ZIP and blockmap for arm64 and x64. The release workflow preserves electron-builder's architecture-specific metadata, validates its version and required architecture-labelled ZIPs, and merges it into one `latest-mac.yml`. The combined feed retains both file hashes so MacUpdater selects the running architecture. An automatic upstream dispatch publishes after every release check passes and activates the stable update feed; a manually pushed desktop tag remains a draft until explicitly published. The application contains only the public repository identity and no GitHub token.

The desktop and embedded DSH runtime update as one tested application unit. The [automatic upstream desktop release](../process/2026-08-27-automatic-upstream-desktop-releases.md) process observes published upstream `dsh-v*` Releases, adopts them in order, runs the required checks, maps each version to a desktop tag, and publishes the signed application. A failure stops before the adoption push and records a blocker Issue. Withdrawal removes a problematic Release from update discovery without deleting its tag or assets; installed applications are never remotely downgraded.

### Installation shutdown

Immediate installation and install-on-quit use the same bounded backend shutdown path as a normal application quit. The main process disposes update timers, stops the local DSH process tree, closes its log, and only then delegates the cached signed application to Squirrel.Mac. A second quit event sees the backend as stopped and can proceed without repeating teardown.

## Alternatives considered

**Download every update in the background and restart automatically.** This minimizes clicks but consumes bandwidth without consent and can terminate active local work. Two explicit decisions keep checking unobtrusive while leaving interruption under user control.

**Update only the embedded Harness packages.** That would create an application combination that the desktop release never built, signed, or tested. Whole-application replacement keeps Electron code, Web assets, native dependencies, and the DSH runtime on one reviewed version.

**Use a private repository or authenticated update endpoint.** A distributed token would be recoverable from the application, while per-user GitHub authentication would add setup unrelated to DSH. A public repository gives read-only update access without client credentials.

**Publish one metadata document per architecture.** MacUpdater expects one channel document at the release URL. A deterministic merge preserves both generated file records and rejects missing or mislabeled architecture ZIPs before the draft is created.

## Verification

Controller tests snapshot the visible download and installation decision sequence and cover deferred re-entry, manual and background failures, scheduling, development-build feedback, and install-on-quit. Metadata tests cover deterministic two-architecture output plus version, file-hash, and missing-architecture rejection. The desktop TypeScript build keeps `electron-updater` as a packaged CommonJS runtime dependency, and both package-smoke paths use the shipped Electron executable to load the packaged main-process module graph before accepting an artifact. Release CI additionally builds, signs, notarizes, and checks both native artifacts before it can publish. Workflow tests cover automatic and draft publication plus recoverable withdrawal. A complete update installation still requires two signed public releases and is therefore verified in release acceptance rather than a keyless source test.

## Consequences

Installed users receive update awareness and can finish work before installation, while the public release page remains the manual fallback. The release carries ZIPs, blockmaps, and channel metadata in addition to DMGs, and publication must not omit those assets. Automatic publication trusts upstream Releases plus the configured source and signing checks instead of requiring draft inspection. Apple signing and notarization, checksums, secret scanning, withdrawal records, and private vulnerability reporting remain independent controls.
