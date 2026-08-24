# DSH Desktop Mint

English | [中文](README.zh.md)

DSH Desktop Mint is an unofficial Electron shell for the existing `dsh web` application, maintained by Mint. It does not define another Agent composition or Web client: it supervises the built `@deepseek-ai/dsh` CLI, waits for its canonical loopback readiness line, and loads that URL in a native macOS window.

The name, Mint wave icon, repository identity, and release metadata distinguish this application from an official DeepSeek product. DeepSeek does not endorse, cooperate with, or authorize this distribution.

![DSH Desktop Mint application icon](build/icon.png)

## Run from source

Install the repository dependencies, then run:

```sh
pnpm run desktop:start
```

The command builds the repository and Electron main process before opening the window. A Finder-style launch has no invoking project directory, so the backend starts in the user's home directory; select or add the intended workspace in the Web UI. DSH data, settings, credentials, profiles, and sessions continue to use the ordinary DSH home, `~/.dsh` by default.

## Build a local macOS application

Build an unsigned Apple Silicon application from the current source tree:

```sh
pnpm run desktop:app:mac
```

Build the Intel application with `pnpm run desktop:app:mac:x64`. Replace `app` with `dmg` in either command to create a local DMG. The default Apple Silicon result is `apps/desktop/dist/mac-arm64/DSH Desktop.app`; electron-builder may use `mac/DSH Desktop.app` for an Intel result.

Each command runs the official client build, packs the current local DSH and vendored packages, installs the selected runtime closure in an isolated resource directory, rejects links that escape that directory, and invokes electron-builder. An unpublished local backend change is therefore included instead of being replaced by the same version from npm.

Local commands disable signing-identity discovery and never create a supported public release. Install a local Apple Silicon build for the current user with:

```sh
ditto "apps/desktop/dist/mac-arm64/DSH Desktop.app" "$HOME/Applications/DSH Desktop.app"
```

## Runtime behavior

The Electron main process runs its own executable in Node mode with the packaged CLI and `dsh web --no-open --port 0`. It accepts only the official `dsh web: http://127.0.0.1:<port>` readiness line. The startup page remains visible until that line arrives; startup failure or an unexpected backend exit produces a native error dialog. Closing the last window stops the backend with `SIGTERM`, then uses `SIGKILL` after a bounded grace period if required. A second application launch focuses the existing window.

The backend log is `~/Library/Logs/DSH Desktop/backend.log`. External HTTP and HTTPS links open in the system browser. Same-origin application navigation stays inside the DSH window; new windows and all other schemes are denied.

## Security and local data

The renderer is sandboxed with context isolation, Web security, and no Node integration or preload bridge. The backend binds a random loopback port, and the shell never enables a LAN host. The application identifier is `io.github.mintgao.dsh-desktop`.

Credentials and sessions remain under the user's normal environment and DSH home; the desktop shell does not copy them into the application bundle. Follow the root [security policy](../../SECURITY.md) for private vulnerability reporting and supported release artifacts.

## GitHub development

The root [contributor guide](../../CONTRIBUTING.md) defines remotes, branches, cross-device synchronization, dependencies, secrets, upstream updates, and pull requests. `main` stays release-ready, and each device installs its own dependency tree rather than copying architecture-specific output.

[`desktop-ci.yml`](../../.github/workflows/desktop-ci.yml) runs desktop tests, the desktop build, repository type checking, and documentation checks on pull requests and `main`. Its manual package smoke uses native GitHub macOS runners for both arm64 and x64. Official DeepSeek Harness workflows retain repository guards and do not allocate their organization-specific jobs in this downstream repository.

## Signed releases

Desktop versions use semantic tags named `desktop-vX.Y.Z`. The tag version becomes the application's release version independently of the root Harness package version.

The repository requires these encrypted GitHub Actions secrets before its first release:

- `MACOS_CERTIFICATE_P12_BASE64` and `MACOS_CERTIFICATE_PASSWORD` for the Developer ID Application certificate.
- `APPLE_API_KEY_P8_BASE64`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` for App Store Connect notarization.

Create a release only from a reviewed `main` commit:

```sh
git switch main
git pull --ff-only origin main
git tag -s desktop-v0.1.0 -m "DSH Desktop Mint 0.1.0"
git push origin desktop-v0.1.0
```

[`desktop-release.yml`](../../.github/workflows/desktop-release.yml) builds on a native runner for each architecture, requires code signing, submits the application for notarization, validates the stapled ticket, and uploads both DMGs with SHA-256 checksums to a draft GitHub Release. A maintainer tests both artifacts and manually publishes the draft; unsigned output never enters the public release path.

Automatic updates are not implemented. Users install a newer notarized DMG manually, and release notes must state any migration or compatibility requirement.

## Development ownership

[`src/backend.ts`](src/backend.ts) owns readiness parsing and bounded process shutdown. [`src/navigation.ts`](src/navigation.ts) is the pure URL policy. [`src/main.ts`](src/main.ts) owns the Electron lifecycle and sandboxed window. [`../../scripts/prepare-desktop-backend.ts`](../../scripts/prepare-desktop-backend.ts) stages the source-built runtime closure, while [`electron-builder.yml`](electron-builder.yml) owns the macOS bundle layout. Run `pnpm run test:desktop` for the focused process and navigation tests.

The runtime decision and alternatives are recorded in [Electron desktop shell](../../.agents/notes/implemented/feature/2026-08-24-electron-desktop-shell.md). The downstream repository, cross-device, and release decision is recorded in [Mint desktop downstream development](../../.agents/notes/implemented/process/2026-08-24-mint-desktop-downstream-development.md).
