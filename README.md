# DSH Desktop Mint

English | [中文](README.zh.md)

<p align="center">
  <img src="apps/desktop-mint/build/icon.png" alt="DSH Desktop Mint logo" width="160" height="160">
</p>

A macOS desktop app for working with DeepSeek Harness, maintained by Mint. Open a project, configure your model, and work with a coding agent in a dedicated desktop window.

[Download previews](https://github.com/mintgao/dsh-desktop/releases) · [Getting started](#getting-started) · [Desktop updates](#desktop-updates) · [Report an issue](https://github.com/mintgao/dsh-desktop/issues)

## About Mint

Mint packages the DSH runtime and Web client as a Mac application, with its own icon, startup experience, native window, and desktop update entry point. You can use DSH to read and edit project files, run commands, and continue conversations; Mint focuses on the desktop experience and delivery of complete application updates.

This is an unofficial distribution based on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). DeepSeek does not endorse, cooperate with, or authorize this distribution.

## Project status

The project is in preview. Check each release's notes for supported hardware, installation requirements, and limitations before updating.

| Item | Current public preview |
| --- | --- |
| Platform | macOS; the latest preview provides an Apple Silicon (`arm64`) DMG only |
| Distribution | Unsigned and not Apple-notarized; intended for personal and small-group testing |
| Updates | Download and replace the application manually; signed automatic updates are not enabled |
| Model access | Bring your own model-provider API key |

Review the [safety notice](SAFETY.md) before use. Preview versions may introduce incompatible changes; consult the release's data-compatibility notes before replacing an existing installation. Native task notifications require a signed application and are unavailable in unsigned previews.

<a id="desktop-updates"></a>

## Desktop updates

**2026-09-13 · [0.1.5-rc.2.unsigned.1](https://github.com/mintgao/dsh-desktop/releases/tag/desktop-v0.1.5-rc.2.unsigned.1)**

- Upgrades to DSH 0.1.5-rc.2 while retaining existing profiles and sessions.
- Checks the bundled runtime and plugins before launch; normal startup does not install packages.
- Continues to provide one Apple Silicon DMG for manual replacement of the complete desktop app.

This section tracks the latest published Desktop highlights. See [all releases](https://github.com/mintgao/dsh-desktop/releases) for the full history, downloads, and version-specific limitations.

<a id="homepage-maintenance"></a>

### Homepage maintenance rule

For every public Desktop release with a key feature, important fix, or change to platform support, installation, or updates, the release owner must update both README languages and their pairing record as part of release completion. Record the release date, exact version link, and 3–5 user-facing highlights (fewer when there are fewer changes); revise project status and usage instructions when affected. Describe only verified public artifacts, label limitations, and link full history to Releases. Prepare the text before publication and publish the homepage update after the release is public; until then, retain the previous public version. A release is not complete until the homepage matches its published state. Internal refactors need no homepage entry unless they change user behavior.

<a id="getting-started"></a>

## Getting started

1. Open [Releases](https://github.com/mintgao/dsh-desktop/releases), select a preview compatible with your Mac, and download its `.dmg` asset. The latest preview supports Apple Silicon only.
2. Open the DMG and drag **DSH Desktop** into Applications. When updating, quit the existing application before replacing it. For an unsigned preview, macOS may require **System Settings → Privacy & Security → Open Anyway**.
3. Open **DSH Desktop**, configure your API key in **Settings → Models**, then add and select a workspace. See [model configuration](docs/user/guide/providers.md) for other providers.
4. Start a task, describe what you want to do, and respond to approval or clarification requests. The [usage guide](docs/user/guide/index.md) covers working with the shared DSH interface.

Settings and sessions use the ordinary DSH data directory (`~/.dsh` by default). See the [desktop reference](apps/desktop-mint/README.md) for local-data behavior, troubleshooting logs, and update controls.

## Feedback and development

Report Mint installation, startup, and update problems in [this repository's Issues](https://github.com/mintgao/dsh-desktop/issues). Include the desktop version, Mac chip, macOS version, and steps to reproduce; remove API keys and private project content from attachments.

For desktop source builds, see the [desktop development instructions](apps/desktop-mint/README.md). Contributors can start with [CONTRIBUTING.md](CONTRIBUTING.md), the [development guide](docs/development.md), and [architecture documentation](docs/architecture.md). Agents follow [AGENTS.md](AGENTS.md).

Before moving Macs or continuing development, read the [project handoff](docs/context/handoff.md) for authoritative source, private data backup and installation acceptance.

<details>
<summary>Harness Web and source development</summary>

The commands below launch the Harness Web interface. The npm command uses the upstream package; the source path uses this Mint repository.

<a id="run"></a>

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

<a id="run-from-source"></a>

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/mintgao/dsh-desktop.git
cd dsh-desktop
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

</details>

## Upstream and license

Mint builds on the open-source work of DeepSeek Harness and [Cordis](https://github.com/cordiverse/cordis). See the [upstream documentation](https://deepseek-harness.github.io/deepseek-harness/) for Harness capabilities and plugin development.

[MIT](LICENSE). Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
