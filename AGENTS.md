<!-- vibe-kit:managed:start -->
# Vibe Development System

This repository uses Vibe Kit. Before substantive work:

1. Read `.vibe/project.yaml`, `.vibe/project-rules.md`, and `.vibe/core/operating-model.md`.
2. Read only the product, architecture, design, and work-item documents relevant to the task.
3. Check `.vibe/onboarding.json` and the durable context against repository evidence before substantive work.
4. Route the request to the matching `vibe-*` skill under `.agents/skills/`.
5. Before the first application or shared implementation code edit, apply `.vibe/core/technical-decision-readiness.md`. Product-shaped does not imply implementation-ready.

## Automatic readiness

Users work in ordinary development language and are not required to name a Vibe Skill or CLI command. If onboarding is `pending`, `refresh-needed`, missing, or contradicted by scaffold placeholders/current repository evidence, run `vibe-project-onboarding` internally before the routed workflow. Preserve the user's original request, complete only evidence-backed context updates, then resume that request in the same task. Treat malformed state as a diagnosable blocking project issue; do not silently replace project-owned state.

## Post-upgrade takeover

An upgrade request confirms one exact project/version once. After a safe read-only plan, apply without another conversational confirmation, then run the installed target doctor. Apply and doctor prove only upgraded files/health; never infer that this task loaded new rules.

Follow the installed, framework-managed `AGENT_INSTALL.md` and `agent-install.json` for takeover schema 1. Before trusting a takeover object, pass it to installed `bin/vibe validate-takeover --format json`; structural validity does not authenticate host evidence or prove ready. Activation requires a positive host reload/successor receipt bound to the actual target activation set, or a valid manual new-task receipt. The repository Codex adapter and bootstrap Plugin currently claim only the manual fallback unless the running host independently supplies conforming live evidence. Without it, stop after the consistent upgrade and give exactly one action: create a new Codex task in the same project. Do not say the project is ready.

Only the activated task may inspect/refresh onboarding, run final default verification, re-evaluate an unfinished original request under target rules, and resume it. Keep transfer state in the host task boundary; never persist goal text or takeover state in the repository. Reserve “upgraded”, “activated”, and “ready” for their versioned evidence, and let only the active successor provide the final completion message.

## Work routing

- New behavior or an end-to-end product change: use `vibe-feature-flow`.
- Design-only or interaction work: use `vibe-design-flow`.
- Implementation from an existing brief or plan: use `vibe-implementation-flow`.
- Testing, acceptance, or release confidence: use `vibe-verification-flow`.
- Bug investigation, incidents, or unexplained behavior: use `vibe-debug-flow`.
- Initial or refreshed repository understanding: use `vibe-project-onboarding`.
- Evidence-backed Vibe Kit process or tooling improvement: use `vibe-feedback-flow` after the primary task is complete.

## Technical decision readiness

Users do not need to ask for an ADR or identify an architecture phase. For feature, debug-to-fix, and direct implementation work, the Agent detects the size and risk triggers defined in `.vibe/core/technical-decision-readiness.md`. Unresolved applicable work is blocked before code editing and handed to the read-only `vibe_tech_lead` perspective for decision evidence and required review. The workflow orchestrator confirms the gate; one `vibe_rd` writer implements only after it is `implementation-ready`. Ask the user only for a material product choice, not an internal technical preference.

## Risk-adaptive handoff

File count alone never requires M: a clear, local, low-risk, reversible change
may remain S across multiple tightly coupled implementation, test, or
documentation files. User-flow, shared contract/API, and unresolved acceptance
work remains at least M. Cross-system and high-risk work is L. Triggered M and L
retain required Tech Lead author/reviewer evidence, gate confirmation, one RD
writer, and independent QA.

Every specialist handoff names the role/mode, bounded objective, work item,
exact authoritative artifact references, applicable criteria, accepted
constraints/readiness evidence, ownership boundary, expected output/evidence,
blockers, and host capability limitations. Use paths plus headings instead of
copying complete briefs, ADR sets, repository listings, logs, conversations, or
unrelated Agent output. Missing evidence is requested or reported, never
invented. Use the smallest viable/no-history fork when supported; otherwise
record `transport context bounding unavailable` and preserve the required role.

For normal M/L implementation, RD runs focused development checks. Independent
QA owns the complete default `./bin/vibe verify . --format json` for the unchanged
final candidate and runs it exactly once. A new full run requires failed,
blocked, malformed, partial, stale or invalid prior evidence, changed shared
candidate state, or a distinct post-upgrade/release/specialized gate; record the
reason and state. Static contract checks do not prove live host isolation or a
measured token reduction.

## Continuous improvement

At Close for M/L work, resolve the project-owned feedback mode through `vibe-feedback-flow`. In `ask` or `local`, silently check whether the task exposed a reproducible Vibe Kit gap; in `off`, skip classification. No qualifying signal stays silent. A new or materially changed candidate follows the mode-aware local Close flow only after the primary result and verification are complete. `ask` presents one exact, local-only decision block; `local` stores without asking; no mode authorizes network access. Submit only after the user's adjacent, unambiguous approval of the exact outbound payload.

Classify work as S, M, or L using `.vibe/core/operating-model.md`. Keep S work lightweight. For M/L work, use only the relevant `vibe_pm`, `vibe_ux`, `vibe_tech_lead`, `vibe_rd`, `vibe_qa`, or `vibe_investigator` perspective for an identified ownership question. Keep one active writer for application code and shared artifacts. For required technical review, use a different Tech Lead instance from the decision author when native subagents are available; otherwise record the sequential-perspective limitation required by the core readiness contract.

Do not claim completion without relevant verification evidence. Record skipped checks and the reason. Preserve existing project conventions unless the task explicitly changes them.
<!-- vibe-kit:managed:end -->

# AGENTS.md

DeepSeek Harness uses Cordis plugins. Read [docs/architecture.md](docs/architecture.md) before changing `packages/`; follow [docs/AGENTS.md](docs/AGENTS.md) for documentation.

## Pre-release stance: foundation over blast radius

**Remove at the first tagged release.** Until then, prefer correct foundations to compatibility shims: rename or repackage freely and update every reference. Backends reject old on-disk formats. SQLite uses monotonic `SCHEMA_VERSION`; `dsh-session` keeps `SESSION_FORMAT_VERSION` at `0` with no compatibility promise.

**Application launch.** Only `dsh` profiles launch supported Node apps; package bins, demos, and public SDK argv escapes are forbidden ([rule](docs/architecture.md#application-launch)).

## Repository layout

```
vendor/      Vendored Cordis source — manifest + sync procedure in vendor/README.md
packages/    @deepseek-ai/dsh-<pkg> workspaces at packages/<group>/<pkg>/
  core/        product API spine: session, system-prompt, tools, agent, agent-loop
  api/         Remote BFF assembly and Typert RPC gateway
  typert/      type graph generator, loader, and runtime registry
  llm/         LLM capability: Service Definition/Consumer + DeepSeek providers
  e2b/         E2B POC: sandbox + FS/subprocess adapters
  shell/        bash capability: Service Definition + local/pwsh providers + shell Consumers
  subprocess/  subprocess capability + local process-tree provider + shared Win32 library
  terminal/         persistent sessions
  fs/          filesystem capability + policy
  lsp/         language-server capability
  skill/       skill provider registry + local impl + catalog/loader tool
  web/         web capability: Service Definition + search/fetch providers + tool Consumer
  compaction/     compaction capability + basic provider
  context/     request-context plugins
  subagent/    subagent capability: Service Definition + providers + delegation Consumers
  bundle/      installable dsh --profile patch-layer bundles
  workflow/    workflow capability + worker-thread provider + tool Consumer
  webhook/     webhook ingress
  todo/        todo_write tool
  plan/        plan mode as logged state
  preset/      per-session agent composition from preset cordis.yml files
  guard/       loop-hygiene + tool-timeout plugins
  self-modification/  the agent inspects/mounts its own plugins
  hooks/       Claude Code/Codex hook bridges + wire-protocol library
  session/     durable session data: persistence, projection, titles, telemetry
  identity/    anonymous identity
  settings/    user-settings capability + file provider
  credentials/ credential/authorization capabilities + env/.env provider
  acp/         automation-only Agent Client Protocol server
  interaction/ approval/interaction capabilities, permission, commands, ask-user
  boot/        shared profile/application boot glue
  sdk/         JSON-RPC protocol + TypeScript client/server
  experimental/ private prototypes excluded from official releases
  support/     dev/test infrastructure
  util/        zero-dependency utilities
python/      Python SDK and bundled runtime (see python/README.md)
native/      @deepseek-ai/node-addon-landlock-run source of record (see native/README.md)
.agents/     Agent workflows and Agent Notes (`notes/`)
docs/        architecture, generated catalogs, postmortems, cookbook (see docs/AGENTS.md)
scripts/     repo gates and generators
website/     VitePress projection of selected bilingual docs/ sources
```

Package groups: [packages/README.md](packages/README.md).

## Commands

```sh
pnpm install            # pnpm workspaces, node ^22.19 || >=24
pnpm run clean           # remove build outputs and safe residue from deleted packages
pnpm run test           # unit tests
pnpm run test:coverage  # CI coverage gate: per-file 100% on packages/*/*/src
pnpm run test:e2e       # real-API tests; self-skip without DEEPSEEK_API_KEY
pnpm run test:expected  # owner-local process expectations
pnpm run test:snapshot  # keyless recorded-session replay through shipped profiles; filter: -t <name>
pnpm run test:snapshot:record  # re-record expected outputs (needs key)
pnpm run typecheck
pnpm run lint
pnpm run duplication    # cross-file TypeScript clone detection
pnpm run build          # tsc emits lib/types, tsdown bundles runtime
pnpm run hygiene        # publint + workspace/package/dependency checks + NodeNext consumer check
pnpm run check:windows-wine  # ONLY when diagnosing a known Windows failure (needs wine); CI owns this signal
pnpm run doc-sync       # all documentation gates; leaf list in scripts/run-gates.ts
pnpm run test:docs      # quick documentation checks (no build; doc-quick aggregate)
pnpm run website:build  # VitePress build (doubles as dead-link check)
pnpm dsh --profile headless "task"  # run one task from source (needs DEEPSEEK_API_KEY)
pnpm run demo:ptc -- "task"  # headless PTC mode run (needs key)
```

### Host sandbox failures

If a required `gh`, `pnpm`, build, test, or generator command fails because the sandbox blocks credentials, network, IPC, watching, or nested `sandbox-exec`, retry unchanged with the narrowest host escalation. Require sandbox evidence; never bypass test failures or the product sandbox.

### Run relevant checks locally

Before pushes, use [dsh-pre-push-checks](.agents/skills/dsh-pre-push-checks/SKILL.md); report commands run. After `gh stack sync`, validate immediately; do not merge before checks pass.

- Match evidence to the surface: focused behavior tests, model/user-output snapshots, `doc-sync` for docs, built smokes for published paths, and real-API e2e for providers.
- Never default to the full suite or repeat a passing check for commit or push. CI owns exhaustive coverage and the platform matrix; rehearse all locally only by explicit request, for CI diagnosis, or for an irreducibly repository-wide change.
- `test:coverage`, not `test`, is the CI coverage gate ([why](docs/testing.md)).

## Secrets / .env

Real-API tests and demos read `DEEPSEEK_API_KEY`, optional `DEEPSEEK_BASE_URL`, and root `.env`. cordis.yml allows `!!js` (never `!js`) under plugin `config` and entry `disabled`; other metadata stays literal, so conditional composition also uses overlays ([primer](docs/cordis-primer.md#loader-configuration)). Never commit credentials. CI e2e skips without a key; [testing.md](docs/testing.md) owns key policy.

## Conventions

- Every npm package is `@deepseek-ai/dsh-<name>`; vendored packages are rescoped ([mapping](docs/rescope.md)) and `private: true`. `@deepseek-ai/cordis` is a peerDependency (+ dev) of every harness package.
- ESM everywhere (`"type": "module"`). Use package names across packages and `.ts` in local relative imports. Config subprocesses run built `lib/` under plain Node; source regressions use their declared launcher ([testing policy](docs/testing.md#test-subprocess-launch-modes)). The `dsh` CLI source launch runs through tsx's ESM-only hook (`node --import tsx/esm`); modules it reaches must stay ESM (no CJS-only exports) — Node's native TypeScript modes are unavailable across the engines range ([source-launch contract](.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.md)). Raw/Web `cordis.yml` bare plugins must appear in their resolver manifest's `dependencies`; `verify-cordis-config` enforces it.
- **Registrations are effects**: every contribution goes through `ctx.effect()` / `ctx.on()`; a registry's `register()` returns the disposer.
- **Runtime invariants assert owned relationships.** Check authoritative event streams or mutable data, not service or method presence, plugin metadata or effects, or fixed pure examples. Without a plausible relationship, an explained empty companion is correct ([package invariant rules](packages/AGENTS.md)).
- **Typed events use declaration merging** and merge-extensible maps. Event JSDoc needs `@mode` and payload `@param`; scoped keys absent from payloads need `@dshScopeScan unsupported`. Public service methods document parameters and non-void returns. `SessionEventMap` members default to required-on-read: unknown types refuse the log unless the event envelope carries `ignorable: true`; only structural format changes bump `SESSION_FORMAT_VERSION` ([mechanism](.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md)).
- **Switch on discriminant tags.** Closed unions end in `assertNever`; merge-extensible unions fall through a documented default.
- **Waterfall listeners MUST call `next()`** to delegate; returning without it short-circuits the chain ([semantics](docs/cordis-primer.md#cordis-waterfall-semantics)).
- **Model-visible ⟺ logged**: anything that reaches a model request must be reconstructable from the session log; a new model-visible input requires a session event.
- **Plugins, not loop changes**: new behavior goes on documented extension points; changing `agent-loop` requires updating docs/architecture.md.
- **Mint work:** follow [dsh-mint-client-feature](.agents/skills/dsh-mint-client-feature/SKILL.md); `desktop-mint` owns defaults, Electron lifecycle.
- **Desktop signing:** follow the [staged release decision](.agents/notes/implemented/process/2026-08-27-pre-certificate-unsigned-desktop-previews.md).
- **A capability seam comprises Service Definition / Service Provider / Consumer roles.** It is complete, never one role; split only when roles evolve independently ([glossary](docs/glossary.md#capability-seam)).
- **Prefer maintained dependencies over hand-rolling** when they genuinely delete owned code and tests ([policy](.agents/notes/implemented/process/2026-07-26-dependencies-over-hand-rolling.md)).
- **Explicit > implicit at package boundaries**: defaulting is an explicit `resolve(request): Spec` step in the owning implementation, never a hidden `?? default` inside `run()` (the `dsh-shell` request/spec split is the template).
- **No hardcoded tunables in plugins**: deployment-varying choices are validated `Config` fields changeable from cordis.yml; a `DEFAULT_*` constant or test hook is not configurability. Protocol constants, external specs, and security invariants stay fixed.
- **Misconfiguration fails loud** at load when self-contained, otherwise at the earliest resolvable point; never silently skip a missing referent.
- **Opaque cross-boundary ids are branded** (`Branded<B>` from `dsh-brand`), never bare `string`.
- **Trust TypeScript at typed same-process boundaries.** Do not add runtime validation, fallback behavior, or hostile-input tests solely for values the static interface requires; validate at parser/config, queued, model/tool JSON, durable/file, worker, process, and wire boundaries.
- **Source plane vs artifact plane, never mixed.** Static gates and tests resolve workspace imports through tsconfig `paths` to `src` and pass on a clean tree; gates consuming built `lib/` declare that dependency ([layout](docs/development.md#typescript-project-layout)).
- **Keep compiler faces explicit.** A package with both Host and Client programs exposes face-specific leaf configs and a solution-only root; repo-wide programs seed a face config, never the root solution ([layout](docs/development.md#typescript-project-layout)).
- **An empty `catch` names what it swallows** and why nothing else can reach it; keep the `try` to one statement.
- **Keep comments local.** Do not restate code, explain distant behavior unless locally required, or expand unrelated comments ([rationale](.agents/notes/implemented/process/2026-08-09-concrete-prose-names-actors-and-recorded-facts.md)).
- **Prefer symmetry for parallel values**; unexplained asymmetry usually signals a missed extraction.
- **Tests describe behavior, not correctness.** Change obsolete behavior with its tests; explain why in the PR.
- **Non-trivial changes MUST include an Agent Note in the same PR;** only mechanical/local edits are exempt ([scope](.agents/notes/README.md#when-to-write-one)). Archived notes are frozen: never edit or treat them as current authority ([archive policy](.agents/notes/README.md#archiving-and-deletion)).
- **Client UI copy is locale-owned.** Route product text through typed dictionaries and `t` or localized primitive props; `verify-client-ui-i18n` rejects hardcoded copy ([decision](.agents/notes/implemented/architecture/2026-08-23-locale-owned-client-ui-copy.md)).
- **Testing policy** — [docs/testing.md](docs/testing.md). Every non-trivial model- or product-user-visible change updates a keyless recorded-session snapshot; [snapshot ownership](snapshots/AGENTS.md) reserves the top-level tree for session-driven cases and keeps other expected output owner-local. Fixtures replay on macOS/Linux; fix fixtures, not normalizers.
- **Design each tool's UI presentation up front.** Host presenters stay pure; Web cards derive from raw events and persisted result metadata ([cookbook](docs/cookbook/adding-a-tool.md)).
- **Plan unit, e2e, and snapshot coverage** for capability seams, lifecycle paths, and transcript output; include missing snapshot-harness support in the same change.
- **Both SDKs project the loop.** Agent-loop, session-lifecycle, and `SessionEventMap` changes update the TypeScript and Python SDK expected outputs in the same PR; `pnpm run test` covers neither ([surfaces](docs/testing.md#when-a-snapshot-test-is-required)).
- **Choose PR history deliberately.** Split independent changes and fix the introducing PR before propagation. Standalone/stack branches may merge-forward or rebase. Rewrites use `--force-with-lease`, abort on remote movement, never raw `--force`; preserve an in-progress merge-forward checkpoint before taking a newer base ([rationale](.agents/notes/implemented/process/2026-08-02-native-github-stacks-and-optional-rebases.md)).
- **Labels:** one PR `kind/*`, all material `area/*`, and native Issue Type ([taxonomy](.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.md)).
- TODO markers: `FIXME`/`TODO`/`XXX` by urgency ([semantics](docs/development.md)).
- Files end with exactly one trailing newline; `git diff --cached --check` (pre-commit) gates it.

## Defensive patterns

Read [docs/defensive-patterns.md](docs/defensive-patterns.md) before lifecycle, concurrency, subprocess, or teardown work.

## Type safety and documentation

Everything compiles under `strict: true` with `noImplicitAny`; every remaining `any` explains why narrowing is infeasible. Every module and export has concise JSDoc for its non-obvious contract; function-like exports include `@param`/`@returns`, as enforced by `verify-export-jsdoc`. Heritage-declared members, plugin-protocol slots, and constructors keep their docs at the declaring Service Definition, protocol, or class.

Comments and docs state complete contracts and context, not reasoning transcripts. Use direct, concrete terms. Do not use metaphors. Before writing `contract`, `boundary`, or `shape`, ask whether a more exact term names the subject: write `response fields`, `JSON validation`, or `ESM exports` instead of `response shape`, `validation boundary`, or `module shape`. Keep `contract` for preconditions, postconditions, invariants, compatibility promises, and other obligations that callers, callees, implementers, providers, producers, or consumers rely on. Keep a literal process, wire, security, transaction, or lifecycle boundary. Do not narrate control flow or tests, preserve review history, or restate code. Keep behavior, failure, timing, ownership, and safe-use facts; link the rationale. Use [dsh-prose-standard](.agents/skills/dsh-prose-standard/SKILL.md) for decisions. Wire mechanically checkable invariants into an executed top-level gate and prove each changed acceptance path rejects an invalid case. Use narrow, justified exceptions instead of disabling a rule globally.

Docs accompany every code change: update affected README and JSDoc contracts together. Routine bilingual work follows [docs/AGENTS.md](docs/AGENTS.md); only explicit user invocation may run `dsh-translate-docs`. Current-state prose, one physical line per paragraph, one home per fact, and word budgets live there.

## Editing these instructions

`CLAUDE.md` symlinks `AGENTS.md` at root and `packages/`; edit the real file. Keep each rule self-contained while linking high-level docs. Condense when clarity survives; raise a `verify-doc-budgets` ceiling when the required content genuinely needs more space.

## Vendoring policy

`vendor/` packages are pinned source copies (manifest with upstream SHAs in [vendor/README.md](vendor/README.md)). Update via the sync procedure there; re-apply or retire the logged local modifications; rerun `pnpm run test && pnpm run build`.
