# Agent Note: Electron desktop shell over the ready Web application

Status: implemented

English | [中文](2026-08-24-electron-desktop-shell.zh.md)

## Problem

`dsh web` provides the complete local graphical application, but using it still starts in a terminal and hands the page to a browser. A macOS application needs Finder and Spotlight launch, a native window and icon, one owner for backend lifetime, and a relocatable bundle. Reimplementing the Agent or client composition for that shell would create a second product path, while copying workspace links into an application would make a bundle that works only beside the source checkout.

## Decision

The [Accepted target integration decision](../../../../docs/decisions/20260910-desktop-mint-target-integration.md) keeps this Mint adapter in `apps/desktop-mint` while preserving upstream `apps/desktop` and `apps/desktop-host` separately. Its migration registry owns qualification of existing data; this lifecycle adapter performs no data conversion.

`apps/desktop-mint` is a private, root-workspace-owned Electron main process rather than another publishable npm workspace. It reuses the official Web composition across a local process boundary. This decision replaces only the hypothetical first-use IPC carrier in [GUI layering and RPC protocol](../../archived/architecture/2026-07-19-gui-layering-and-rpc-protocol.md); the client, Host, API Proxy, and plugin layering in that note remains authoritative.

### Process and window lifecycle

The main process starts the packaged Electron executable in Node mode with `--expose-internals`, the packaged `@deepseek-ai/dsh` entry, and `web --no-open --port 0`. It inherits the ordinary environment and DSH home without injecting credentials or a second persistence root. Finder launches start the backend in the user's home directory because no terminal workspace is authoritative; the existing Web workspace selector owns the project choice.

The supervisor accepts only a complete official readiness line whose URL is HTTP on `127.0.0.1` with an assigned port. Arbitrary stdout, `localhost`, LAN addresses, and other protocols cannot select the renderer URL. Startup has a fixed upper bound and retains bounded stdout/stderr diagnostics. Closing the last window or quitting the application sends `SIGTERM`, waits a bounded grace period, then uses `SIGKILL`. An exit after readiness shows a native failure dialog. The application takes a single-instance lock and focuses the existing window on a later launch.

The BrowserWindow uses context isolation, renderer sandboxing, Web security, no Node integration, and no preload bridge. Navigation stays on the exact ready origin. External HTTP and HTTPS destinations go to the system browser; popups, other schemes, and cross-origin in-window navigation are denied.

While the supervisor waits for readiness, the asar-owned startup page presents the Mint ocean scene with separate whale-crossing, bobbing, bubble, water-drift, and progress-current timelines. The page uses only packaged local assets under its content security policy. A reduced-motion preference stops those timelines, hides the bubbles, and keeps the whale and progress indicator visible in a static state.

### Verified packaged runtime

The [versioned assembly decision](../../../../docs/decisions/20260913-desktop-versioned-assembly.md) owns frozen official runtime acquisition, separately packed Mint plugins and platform selection. electron-builder copies the verified runtime as an external application resource; the Electron main bundle and static startup page stay in asar. The shell embeds the assembly receipt digest and rejects substituted or altered payloads before launch. Runtime identity comes from the frozen official artifacts, independently of workspace and Mint package versions.

The public preview is an unsigned macOS arm64 application named DSH Desktop with the Mint wave icon and the `io.github.mintgao.dsh-desktop` bundle identifier. [Mint desktop downstream development](../process/2026-08-24-mint-desktop-downstream-development.md) owns signing and publication policy. [User-controlled signed desktop updates](2026-08-24-desktop-signed-auto-update.md) owns the signed update behavior; unsigned previews use manual downloads. Universal binaries are not present.

## Alternatives considered

**Keep browser launch and add a shell alias or PWA.** This shortens startup but does not give one process owner for the Web backend, reliable close semantics, or a self-contained local application.

**Embed the Agent runtime directly in Electron or implement the planned IPC fetch carrier first.** That can remove the loopback server later, but it creates a new Host assembly and privileged Electron bridge before the product has a desktop lifecycle. The loopback shell reuses the already guarded, tested Web carrier and leaves the IPC subclass as a later replacement behind the same client APIs.

**Use SwiftUI or Tauri with a Node sidecar.** Both still need a Node-compatible DSH runtime and sidecar lifecycle, while adding another toolchain and bridge. Electron already provides the required Node version and renders the existing client without a UI rewrite.

**Use pnpm legacy deploy for the backend.** It produced relative workspace links that resolved into `packages/` and `vendor/` outside the stage. A verified self-contained installation avoids that workspace dependency.

**Package all runtime dependencies from the development checkout.** This mixes unpublished changes into the runtime and couples official adoption to Mint feature builds. Frozen official artifacts and separately identified Mint tarballs preserve the intended runtime identity.

## Verification

Focused tests use real child processes to cover split readiness output, early failure diagnostics, clean stop, and unexpected exit, while pure tests cover exact-origin navigation, external URL filtering, and the startup page's visible copy, packaged asset roster, motion timelines, and reduced-motion state. The desktop TypeScript bundle and runtime staging complete. The packaged CLI reports the frozen official runtime version, every staged link resolves within the backend root, and the generated arm64 `.app` contains the expected CLI resource. A real packaged launch reaches a random loopback readiness URL, returns the built DSH HTML from that address, and closes the listener when the application exits.

## Consequences

The shell adds no model-visible input, session event, plugin behavior, or Agent loop branch. Existing `~/.dsh` data and Web workspace behavior remain shared with CLI launches. Electron and the installed DSH closure make the local application materially larger than a browser shortcut, and acquisition must verify the complete installed dependency closure. The loopback Web carrier remains present inside a desktop-only process pair; replacing it with IPC would change transport and privileged native integration, not the client capability layout. Unsigned local output may require an operator-controlled first launch, and it is not a public release artifact.
