# Desktop Mint machine handoff

English | [中文](handoff.zh.md)

## Authoritative state

Use the protected `main` branch of [mintgao/dsh-desktop](https://github.com/mintgao/dsh-desktop), not a temporary build directory or an unfinished recovery checkout. The [homepage](../../README.md#desktop-updates) names the latest published version; the immutable release tag, manifest and download digests identify the installable artifact. A branch or successful local build is not a published release.

[Product scope](product.md), [architecture](architecture.md), [downstream requirements](downstream-policy.md) and [design context](design-system.md) are the durable project context. The [versioned assembly decision](../decisions/20260913-desktop-versioned-assembly.md) governs the official runtime, independently packed Mint plugins and native shell. [Local assembly acceptance](../work-items/20260913-desktop-versioned-assembly/verification.md) records its verified scope; the [RC.2 release work item](../work-items/20260913-mint-rc2-release/brief.md) owns delivery evidence.

## Continue development

Read root [AGENTS.md](../../AGENTS.md) and the Vibe project context before changes. Follow the Node and package-manager versions committed in the repository. The [desktop README](../../apps/desktop-mint/README.md) owns build and test commands. Versioned runtime inputs live in [the assembly descriptor](../../apps/desktop-mint/runtime/assembly-input.json) and its adjacent npm lock; the native shell lives in `apps/desktop-mint`, while `apps/desktop` belongs to upstream.

Feature work follows public extension APIs and independently disposable plugins. A different interface does not authorize changing Agent or Session semantics in native code. Check source adoption as well as packaged loading when changing component versions. Keep the official runtime unchanged; a missing extension point needs an explicit reusable API decision.

## Transfer local usage

Install the verified public DMG for the new Mac's supported architecture. Published previews are unsigned arm64 builds; signed automatic updates and identity-dependent notifications are unavailable. The user-facing interface still receives one Desktop version.

Sessions, profiles and model configuration ordinarily live under `~/.dsh`; reusable local skills may live under `~/.agents`. Native preferences live under `~/Library/Application Support/DSH Desktop`, and diagnostics under `~/Library/Logs/DSH Desktop`. Workspace files remain in their original project directories. Stop application and backend writers before taking a complete private backup. Transfer sensitive data through a private channel or re-enter credentials; never put data directories, API keys or raw logs into GitHub handoff documents.

Recheck project paths, workspace selection and provider settings on the new machine. Confirm an existing session can reopen and a new task can complete. An installation check does not prove provider credentials or workspace paths are valid. Keep the old machine and verified backup available until acceptance; do not launch an older runtime on data already changed by a newer one.

## Publish and clean up

[Catch-up delivery](../cookbook/catch-up-desktop-delivery.md) owns reviewed source finalization and ordinary qualification. [Observed forward delivery](../cookbook/observed-forward-delivery.md) applies only when the committed compatibility assessment selects that mode. Preserve the actual published predecessor, source-lock ancestry and exact artifact evidence. The release owner synchronizes both homepage languages after public verification and records local installed-client acceptance separately.

Clean only positively inventoried obsolete builds and disposable test installations after the published replacement is usable. Preserve user-owned source changes, active worktrees, immutable public releases, release evidence and any still-needed recovery backup.
