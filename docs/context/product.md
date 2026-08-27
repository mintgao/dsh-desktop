# Product context

English | [中文](product.zh.md)

## Product purpose

DeepSeek Harness (`dsh`) is an open-source, developer-preview runtime for composing and operating coding agents. It combines model access, workspace tools, permissions, durable sessions, human collaboration, and multiple delivery surfaces on one plugin-based runtime; the [root README](../../README.md) and [Web UI guide](../user/guide/index.md) are the product entry points.

## Primary users

- Developers running a coding agent against a local workspace through the Web UI.
- Integrators driving a Harness runtime from automation through the [Python SDK](../user/guide/python-sdk.md), TypeScript SDK, JSON-RPC, or ACP.
- Plugin and deployment authors composing capabilities through Cordis plugins, Bundles, Profiles, presets, and user patch layers.

The repository does not rank these audiences or name one primary product scenario. Treat Web as the documented first-run surface, not as evidence that automation and extension use cases are secondary.

## Product surfaces

- **Web UI:** `dsh web` starts the local browser application. A user configures a model, selects a workspace, creates durable sessions, submits tasks, reviews agent activity, and answers approval or clarification requests.
- **CLI and Profiles:** the `dsh` launcher boots named plugin compositions, manages Profile-local plugins, dumps effective configuration, and supplies a one-shot headless mode.
- **Programmatic APIs:** the SDK and ACP surfaces expose the same agent runtime to another process; each has a narrower interaction model than the Web UI.
- **DSH Desktop Mint:** this checkout includes an unofficial macOS Electron shell maintained by Mint. It supervises the `desktop-mint` Profile and embeds the same Web application; it is not a separate Agent implementation or an official DeepSeek distribution. See [the desktop reference](../../apps/desktop/README.md).

## Current capabilities

- Catalog and custom model providers, with credentials stored separately from settings and model changes applied on the next request; see [model configuration](../user/guide/providers.md).
- Workspace file editing, shell and terminal execution, file and Web search, Skills, plans, goals, background jobs, workflows, and in-process subagents in the standard coding-agent preset.
- User-controlled permission presets and one-shot approvals rather than unconditional host access.
- Append-only session logs, default JSONL persistence, attachments, replay-derived UI state, and session export in the Web composition.
- External plugin installation and ordered Profile/Bundle patches, allowing deployments to replace providers or add consumers without forking the Agent Loop.

## Non-goals and boundaries

- The project is in developer preview and explicitly permits compatibility-breaking changes.
- Repository presence does not imply default product availability. Arbitrary URL fetch, SQLite full-text session search, scheduled follow-ups, third-party memory, E2B execution, and external Codex or Claude Code subagent providers are optional, disabled, experimental, or example-only compositions.
- Headless accepts one submitted task and has no interactive follow-up surface. ACP is an automation transport rather than a replacement for Web navigation, presentation, history management, or every session lifecycle operation.
- Model-backed behavior requires user-supplied provider credentials. Real-API tests and demos self-skip or cannot run when the corresponding credential is absent.
- DSH Desktop Mint is macOS-specific downstream packaging with its own signing and release constraints; upstream Harness behavior must not be inferred from desktop-only policy.

## Product principles

- Everything is a plugin: product behavior enters through documented services, events, registries, and Profile composition.
- Human authority is explicit: permissions, approvals, credential references, and dangerous access modes remain visible choices.
- Model-visible state is durable: inputs that reach a model must be reconstructable from the session log.
- Interactive and automation surfaces reuse the same Agent runtime instead of maintaining separate behavior stacks.
- Misconfiguration fails at the earliest resolvable point; unsupported capability requests are not silently ignored.

## Open questions

- Which audience and journey define product success for the developer-preview stage?
- Is the long-term model strategy DeepSeek-first, provider-neutral, or a documented layering of both?
- How should the repository reconcile the root developer-preview compatibility warning with package tables that label many APIs as stable product surfaces?
- What is the intended long-term relationship between upstream Harness and the unofficial Desktop Mint distribution?
- Which currently disabled or example-only capabilities are deliberate product boundaries, and which are candidates for a default Profile?
- What user-facing telemetry and consent policy should accompany any deployment that enables session telemetry?
