# Architecture context

English | [中文](architecture.zh.md)

## System summary

DeepSeek Harness is a Cordis plugin tree whose model adapters, Agent driver, tools, persistence, UI, and delivery surfaces are replaceable contributions. New behavior normally attaches to a documented service, event, registry, or Profile layer; [the architecture map](../architecture.md) is the canonical overview and subsystem pages own detailed types and semantics.

## Stack

- TypeScript 6 in strict ESM mode, targeting ES2024.
- Node.js `^22.19.0 || >=24.0.0` and pnpm 11 workspaces.
- Cordis for service registration, scoped contexts, events, effects, Loader composition, and hot replacement.
- React 18 and Vite 6 for the browser client; Electron 43 for the downstream macOS shell.
- Vitest for package and application tests, plus separate real-API, snapshot, Web-browser, and platform lanes.

## Composition and startup

- The CLI parses profile, plugin-management, or configuration-dump modes and dynamically loads only the selected path; [its reference](../../apps/cli/README.md) owns the command grammar.
- A Profile lists ordered Bundles. Runtime configuration applies Bundle patches, the Profile patch, the home-level patch, command-line overlays, and launcher-owned switches over an empty root tree. A patch that targets a row replaces that row's complete config.
- `dsh-base` supplies the shared Agent, model, tool, persistence, settings, credential, and policy foundation. `web-app`, `headless`, and `desktop-mint` add delivery-specific plugins without defining another Agent runtime.
- Contributions register through `ctx.effect()` or `ctx.on()` so unload reverses them. Capability families separate Service Definition, Provider, and Consumer roles when those roles evolve independently.

## Request and data flow

1. The Agent inbox admits input and opens a turn; a turn contains zero or more model-request steps.
2. Each step assembles prompt sections and tool schemas, projects model history from the session log, and dispatches through `agent/request` to the selected LLM adapter.
3. Assistant chunks and messages append to the log. Tool calls pass through the guarded `tools/pre-execute`, `tools/execute`, and `tools/post-execute` waterfalls before their results append and may trigger another step.
4. The append-only Session log is the source for model history, replay, UI projection, fork/resume behavior, telemetry, and persistence. Default Profiles persist JSONL under `$DSH_HOME/sessions`; the persistence coordinator batches writes per session and exposes `flush()` as the durability barrier.
5. Settings, credentials, and composition remain separate: Profile patches select plugins, settings store user-editable schema values, and credential providers resolve referenced secrets at operation time.

## Delivery surfaces

- **Web:** the Host serves an API gateway and SPA while browser-side client modules compose UI services and feature slots.
- **Headless:** a one-shot runner creates a fresh persisted session, waits until the Agent is idle, prints the final assistant response, and exits.
- **SDK and ACP:** stdio transports let another process drive selected Agent and session operations without the Web presentation layer.
- **Desktop Mint:** Electron launches and supervises the built CLI on loopback, then loads the canonical Web URL in a sandboxed renderer.

## Repository structure

- `apps/` contains the published CLI, Web build entry, and downstream desktop shell.
- `packages/` contains product capabilities grouped by role; [the package map](../../packages/README.md) and generated [module graph](../module-graph.md) own the current inventory and dependency graph.
- `examples/` contains runnable Cordis compositions used by tutorials, e2e tests, and snapshot replay.
- `python/` contains the Python SDK and bundled-runtime build; `native/` owns native process-confinement code.
- `vendor/` is pinned Cordis source governed by its own sync procedure and is excluded from ordinary edits.
- `docs/`, `.agents/`, and `scripts/` own references and guides, decision records and workflows, and repository gates respectively.

## Commands

- `.vibe/project.yaml` records the standard install, lint, typecheck, unit-test, and build commands.
- `pnpm run test:coverage`, not `pnpm run test`, is the per-file 100% CI coverage gate.
- Product-visible behavior may additionally require `pnpm run test:snapshot`, `pnpm run test:web`, or credentialed `pnpm run test:e2e`; [the testing policy](../testing.md) chooses the tier.
- `pnpm run doc-sync` validates documentation, while `pnpm run hygiene` validates publication and workspace constraints.

## Constraints and risks

- Model-visible input must be represented by a Session event so the exact model context can be reconstructed.
- Waterfall listeners must call `next()` to delegate; returning without it intentionally short-circuits the chain.
- Provider-neutral consumers depend on Service Definitions rather than concrete providers; a new capability considers Definition, Provider, and Consumer together.
- Host and Client TypeScript declarations compile in separate aggregates because they merge Cordis contexts differently. Source checks resolve workspace imports to `src`; checks that consume `lib` must declare and perform the build first.
- Runtime registrations are reversible effects, package-owned invariants must observe authoritative relationships, and user-varying choices belong in validated Cordis configuration rather than hardcoded constants.
- The effective runtime depends on local Profile, home patch, settings, credentials, and platform. Inspect it with `pnpm dsh --profile <name> --dump-config` instead of assuming the shipped template is active.
- This onboarding is source-backed only: it did not call a real model, inspect private credentials, or prove that a credentialed e2e composition is runnable on this machine.
