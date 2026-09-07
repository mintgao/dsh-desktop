# Agent installation and takeover contract

This document is the Codex-facing adoption and maintenance entry point for Vibe
Kit 0.8.0. The machine-readable source of truth is `agent-install.json`. Keep
CLI commands, JSON receipts, hashes and archive details internal during a healthy
flow; report them only when they establish evidence or explain a blocker.

Both this guide and `agent-install.json` are framework-managed installed files,
not release-only discovery documents. Install/adopt preflight protects existing
different files, upgrade gives them the same three-way conflict protection as
other managed files, the manifest records their raw hashes, and doctor treats a
missing, modified or malformed copy as broken. Both are activation-critical.

## Trust and exact-version consent

- Recognize `https://github.com/mintgao/vibe-kit` as the only canonical
  repository by default. A fork, redirect or another repository requires an
  explicit source decision.
- An exact canonical tag or Release URL selects a specific published version,
  including a pre-release. It does not by itself prove that the tag or Release is
  platform-immutable. Trust transferred bytes only after SHA-256 and nested
  release validation pass. A bare repository URL selects only the latest stable Release. If
  none exists, present one eligible pre-release and wait for one decision.
- Never follow `main`, execute `curl | sh`, silently select a pre-release or use an
  archive whose published digest was not verified.
- Resolve and download in the Agent/host permission boundary. The CLI is an
  offline materializer and never gains implicit network authority.
- One user request confirming the exact project and target version authorizes a
  safe plan and apply. After a safe read-only plan, do not ask for a redundant
  upgrade confirmation. Host permission, credential, source-scope and irreversible
  recovery prompts remain authoritative.

## Source identity and maintenance bridge

Before project writes, compute the versioned payload-tree SHA-256, validate the
channel evidence in `agent-install.json`, and read its maintenance bridge schema
2. The target payload's `bin/vibe`, not an older installed CLI, owns
`plan upgrade`, `upgrade`, `recover-upgrade` and the first target-version doctor.
Bridge schema 2 supports manifest schema 1 installations from 0.2.x through
0.7.x and the already defined predecessor Agent protocols 0 through 3. It treats
a missing old `agent-install.json` as installed Agent protocol 0.

If the acquisition Agent cannot interpret Agent-install schema 3/protocol 3, the
bridge is unknown, the predecessor is outside the declared range, or source
identity fails, stop before apply. Never coerce protocol 3 to an older protocol.

The bridge contains one closed compatibility migration for the exact official,
healthy v0.5.0 source-checkout state where `AGENT_INSTALL.md` and
`agent-install.json` exist with their published bytes but are absent from the old
managed manifest. Target `bin/vibe` authenticates the complete two-file set, the
normalized v0.5.0 installation identity, every predecessor managed file and the
managed `AGENTS.md` block through component-wise, symlink-free path checks. Only
that complete set receives paired `update` plan entries and additive
`compatibility_migrations` evidence. A missing, mixed, modified, wrong-type,
symlinked, raced or otherwise unhealthy predecessor remains a paired conflict;
never delete, force-adopt or independently replace one member.

Only the audited v0.2 fixture and exact official v0.3/v0.4 identities may receive
a create-only canonical `.vibe/onboarding.json` with persisted `pending`. Existing
valid onboarding is byte-preserved. Missing v0.5/v0.6/v0.7 onboarding or malformed,
wrong-type, unreadable, symlinked or raced state blocks before transaction,
control or project writes; the bridge never fabricates `complete`.

The compiled target registry is authoritative. The exact registry digest and
mode are mirrored in this machine contract, core protocol and release manifest;
editable predecessor `source` metadata is ignored for eligibility and can never
act as a credential. Target-channel source and payload identity remain
independently mandatory. Planning stays read-only, apply reauthenticates before
mutation and before each member, and a race after migration writes begin keeps the
the transaction recovery boundary.

## Host-owned takeover lifecycle

The offline CLI may prove source, plan, filesystem apply, installed health,
structured diagnostics and configured project-check execution. It must never
claim runtime activation, goal custody, project adaptation, target-rule routing or
overall readiness. Those facts belong to a host-side takeover result with
`takeover_schema_version: 2`; validate its exact enums and dependencies from
`agent-install.json` and fail closed on missing, unknown or inconsistent state.

The active task passes exactly one takeover JSON object on stdin to installed
`bin/vibe validate-takeover --format json`. The command first authenticates the
installed raw contract hash, core protocol, normalized activation identity and
compiled contract-registry digest; it then validates the closed nested shape,
stage dependencies, outcomes, reason/action pair, receipt bindings, custody
history and ready invariants. `status=valid` proves structural consistency only:
`host_evidence_authenticated=false` and `ready_claim=false` remain explicit.
Never persist the input or echo candidate values in validator errors.

The mandatory order is:

1. `source-resolved` — exact trusted source and payload tree are verified.
2. `planned` — JSON plan is safe and read-only.
3. `applied` — target CLI reports a complete `project-files-written` result bound
   to the same project, source, version and payload tree.
4. `upgraded` — the installed target CLI's JSON doctor proves exact version and
   manifest integrity, complete diagnostic classification and no blocking
   diagnostic.
5. `activated` — a positive host or manual new-task receipt proves the target
   activation set governs the active task.
6. `adapted` — onboarding/context is valid and unchanged, or was refreshed only
   from repository evidence.
7. `verified` — final target doctor and default `verify --format json` receipt pass
   every configured check; partial `--only` receipts never satisfy takeover.
8. `re-evaluated` — an unfinished goal is classified and routed under target
   rules, or is explicitly not applicable for maintenance-only work.
9. `ready` — every applicable predecessor is satisfied and no blocker remains.

Apply or doctor alone can prove neither activation nor readiness. A consistent
installation remains upgraded when activation, adaptation, verification or goal
routing later blocks; do not misreport those later failures as an automatic
rollback.

## Activation and current Codex capability

Bind activation to actual installed content. Recompute the manifest SHA-256 and
activation-set SHA-256 from the declared paths, target fingerprint and managed
`AGENTS.md` block. Record all mismatches and stale runtime-discoverable paths. A
version string, manifest claim, static prompt, tool presence, native subagent or
Agent self-report is not an activation receipt.

Activation algorithm v2 hashes normal files as raw bytes, hashes the extracted
managed `AGENTS.md` block, and hashes canonical `agent-install.json` only after
replacing `/activation/activation_set_sha256` with 64 ASCII zeroes. No other
contract field is ignored. The expected and independently recomputed actual
digests must match.

The contract defines three paths:

- `same-task-reload` requires a conforming `host-reload` receipt bound to the same
  task, canonical project, post-apply event and actual target identities.
- `automatic-successor-handoff` requires one idempotent successor creation, a
  distinct task, `host-successor-start` receipt and acknowledged single-owner
  claim. Inspect an ambiguous idempotency result before retrying; never create a
  second possible successor.
- `manual-new-task` requires one new task in the same project and a
  `manual-task-start` receipt that recomputes the installed identities and validates
  any transfer identifier.

This repository and the bootstrap-only Plugin currently claim only the manual
fallback. Same-task reload and automatic successor handoff remain conditional
until a running host supplies positive live conformance receipts. Do not infer
them from the current Codex tool surface.

Without a live receipt, stop the source task after upgrade/doctor with
`overall_status=degraded`, `reason_code=manual-new-task-required`, and exactly one
action: create a new Codex task in the same project. Say:

> Vibe Kit 文件已升级到 0.8.0，安装检查通过；当前宿主无法在本任务加载新版规则，因此尚未激活，不能宣告项目已就绪。下一步：在此项目中新建一个 Codex 任务。

Use a host-prefilled continuation when available. Otherwise include one copyable
sentence containing the active objective. Do not require a CLI command, Skill name
or repeated upgrade confirmation.

## Goal custody and privacy

Keep the takeover object and transfer in host task state only. Never persist them
to the repository, manifest, onboarding, conflict, Plugin, release or feedback
state. A transfer contains only opaque identifiers, canonical project identity,
the exact target fingerprint, the safe active objective, accepted material
decisions, minimal unfinished status and durable evidence references. It never
contains hidden reasoning, unrelated conversation, raw tool output, environment
values, credentials, tokens or duplicated repository content.

The source task stops project work after a successor claim or after manual transfer
becomes required. The activated task is the sole owner of adaptation, final
verification, re-evaluation, resumed work and the final completion response.

## Adaptation, verification and completion

Only an activated task may adapt project-owned context. Preserve
`.vibe/project.yaml`, `.vibe/project-rules.md`, `.vibe/onboarding.json` and `docs/`
during upgrade. When onboarding is pending, missing, stale or contradicted, run
evidence-backed onboarding internally. Update only facts supported by repository
evidence; malformed state, unresolved contradictions or incomplete writes block.

After adaptation, run the installed target-version doctor and default configured
verification. Treat any unknown diagnostic, mismatched readiness effect, failed or
skipped required check, malformed receipt, or partial `--only` coverage as
blocking. An all-unconfigured verification result may pass, but say that no project
checks are configured rather than claiming tests ran.

Only after verification may the active task re-evaluate an unfinished original
goal under the target rules. Resume it automatically when routable. If target
rules expose a material user decision or valid readiness blocker, keep framework
health separate from application-task readiness and stop before shared code edits.

Reserve these claims for their evidence:

- “已升级” requires consistent apply plus non-broken target doctor.
- “已激活” requires positive activation evidence.
- “已就绪 / 可以继续开发” requires upgraded, activated, adapted,
  verified and valid re-evaluation, with no blocker.

For a maintenance-only ready result, report previous/target versions and source,
activation path/evidence, adaptation outcome, executed/unconfigured/skipped checks,
and that development may continue. For an unfinished goal, report the same facts
and continue that exact goal. The source and successor must never both announce
completion.

## Failure and recovery

Source, bridge and safe-plan failures have no project writes. Managed conflicts
write only incoming review candidates and preserve managed/application state.
One managed upgrade is a recoverable transaction over changed framework-managed
files, the complete merged `AGENTS.md`, manifest/version, and only an eligible
create-only onboarding bridge. Its private state is integrity-checked but
untrusted; same-OS-principal malicious tamper is outside the threat model.
Final installation entries are published only with the capability-probed
fd-relative lossless protocol: hard-link no-clobber for an absent leaf, atomic
exchange for an existing leaf, or one adjacent prepared no-replace directory
unit at a first missing managed parent. There is no ordinary-rename fallback;
unsupported platform/filesystem primitives block before an installation write.
`rolled-back` proves the predecessor snapshot was restored. `recovery-required`
requires explicit offline `recover-upgrade`. `unknown-partial` requires inspection
and forbids automatic overwrite. Ordinary upgrade, plan and doctor fail closed
while active state exists; never activate, hand off, adapt, verify or blindly
retry until recovery proves predecessor or target state.

Every blocked/degraded response states the incomplete layer, write state and last
proven stage, one concrete reason, and exactly one safe next action or material
decision. CLI result schema 2 keeps invocation write state distinct from observed
installation state.

## Publication boundary

The repository release Skill preserves the exact v0.7.0 schema-1 publication and
closeout path and presents the closed v0.8.0 schema-2 no-Issue Pre-release plan.
Offline `publication-plan` and `validate-publication` build and
check canonical intents and receipts; they never gain GitHub credentials or
network authority. The Agent/host performs compare-and-swap main advancement,
exact annotated tag/Release/five-asset reconciliation, public read-back/download
checks and, only for the historical v0.7 profile, a separately authorized
idempotent #1–#5 closeout. The v0.8 profile contains no Issue operation or
closeout authorization. Divergent or extra remote state blocks. Delete, replace,
force and stable/draft transitions require separate authorization.
