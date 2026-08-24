# Agent Note: Electron desktop shell over the ready Web application

Status: implemented

English | [中文](2026-08-24-electron-desktop-shell.zh.md)

## Problem

`dsh web` provides the complete local graphical application, but using it still starts in a terminal and hands the page to a browser. A macOS application needs Finder and Spotlight launch, a native window and icon, one owner for backend lifetime, and a relocatable bundle. Reimplementing the Agent or client composition for that shell would create a second product path, while copying workspace links into an application would make a bundle that works only beside the source checkout.

## Decision

`apps/desktop` is a private, root-workspace-owned Electron main process rather than another publishable npm workspace. It reuses the official Web composition across a local process boundary. This decision replaces only the hypothetical first-use IPC carrier in [GUI layering and RPC protocol](../architecture/2026-07-19-gui-layering-and-rpc-protocol.md); the client, Host, API Proxy, and plugin layering in that note remains authoritative.

### Process and window lifecycle

The main process starts the packaged Electron executable in Node mode with `--expose-internals`, the packaged `@deepseek-ai/dsh` entry, and `web --no-open --port 0`. It inherits the ordinary environment and DSH home without injecting credentials or a second persistence root. Finder launches start the backend in the user's home directory because no terminal workspace is authoritative; the existing Web workspace selector owns the project choice.

The supervisor accepts only a complete official readiness line whose URL is HTTP on `127.0.0.1` with an assigned port. Arbitrary stdout, `localhost`, LAN addresses, and other protocols cannot select the renderer URL. Startup has a fixed upper bound and retains bounded stdout/stderr diagnostics. Closing the last window or quitting the application sends `SIGTERM`, waits a bounded grace period, then uses `SIGKILL`. An exit after readiness shows a native failure dialog. The application takes a single-instance lock and focuses the existing window on a later launch.

The BrowserWindow uses context isolation, renderer sandboxing, Web security, no Node integration, and no preload bridge. Navigation stays on the exact ready origin. External HTTP and HTTPS destinations go to the system browser; popups, other schemes, and cross-origin in-window navigation are denied.

While the supervisor waits for readiness, the asar-owned startup page presents the Mint ocean scene with separate whale-crossing, bobbing, bubble, water-drift, and progress-current timelines. The page uses only packaged local assets under its content security policy. A reduced-motion preference stops those timelines, hides the bubbles, and keeps the whale and progress indicator visible in a static state.

### Source-built packaged runtime

The macOS stage runs the official client build, packs both release families from the current checkout, reads the packed manifests, and selects the local dependency, optional-dependency, and peer closure reachable from `@deepseek-ai/dsh`. npm installs those tarballs and external dependencies into `apps/desktop/backend`. A version smoke check drives the installed CLI, and a recursive link check rejects any symlink whose resolved destination leaves that staging root. electron-builder copies this isolated tree as an external application resource rather than packing it into asar; the Electron main bundle and static startup page stay in asar.

The local targets are unsigned macOS arm64 and x64 applications named DSH Desktop with the Mint wave icon and the `io.github.mintgao.dsh-desktop` bundle identifier. They are suitable for source builds and user-level installation. [Mint desktop downstream development](../process/2026-08-24-mint-desktop-downstream-development.md) owns Developer ID signing, hardened runtime, notarization, native-architecture artifacts, and public publication. [User-controlled signed desktop updates](2026-08-24-desktop-signed-auto-update.md) owns update-feed and installation behavior. Universal binaries are not present.

## Alternatives considered

**Keep browser launch and add a shell alias or PWA.** This shortens startup but does not give one process owner for the Web backend, reliable close semantics, or a self-contained local application.

**Embed the Agent runtime directly in Electron or implement the planned IPC fetch carrier first.** That can remove the loopback server later, but it creates a new Host assembly and privileged Electron bridge before the product has a desktop lifecycle. The loopback shell reuses the already guarded, tested Web carrier and leaves the IPC subclass as a later replacement behind the same client APIs.

**Use SwiftUI or Tauri with a Node sidecar.** Both still need a Node-compatible DSH runtime and sidecar lifecycle, while adding another toolchain and bridge. Electron already provides the required Node version and renders the existing client without a UI rewrite.

**Use pnpm legacy deploy for the backend.** It produced relative workspace links that resolved into `packages/` and `vendor/` outside the stage. Packing and installing the current release-family artifacts is slower but proves the application contains the source-built runtime it claims to ship.

**Install the published `@deepseek-ai/dsh` version during packaging.** That is smaller to implement but silently drops unpublished changes made in the checkout. Local tarballs preserve development iteration and still use npm only for external packages.

## Verification

Focused tests use real child processes to cover split readiness output, early failure diagnostics, clean stop, and unexpected exit, while pure tests cover exact-origin navigation, external URL filtering, and the startup page's visible copy, packaged asset roster, motion timelines, and reduced-motion state. The official source build, desktop TypeScript bundle, and runtime staging complete. The packaged CLI reports the repository version, every staged link resolves within the backend root, and the generated arm64 `.app` contains the expected CLI resource. A real packaged launch reaches a random loopback readiness URL, returns the built DSH HTML from that address, and closes the listener when the application exits.

## Consequences

The shell adds no model-visible input, session event, plugin behavior, or Agent loop branch. Existing `~/.dsh` data and Web workspace behavior remain shared with CLI launches. Electron and the installed DSH closure make the local application materially larger than a browser shortcut, and source packaging spends time packing the release families. The loopback Web carrier remains present inside a desktop-only process pair; replacing it with IPC would change transport and privileged native integration, not the client capability layout. Unsigned local output may require an operator-controlled first launch, and it is not a public release artifact.
