# Agent installation and takeover contract

This document is the Agent-host-facing adoption and maintenance entry point for
Vibe Kit 0.10.1. The machine-readable source of truth is `agent-install.json`. Keep
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

## Activation and current adapter capability

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

The manual new-task path is host-neutral. Any host that can start a new task in
the same project may own the successor task and supply `manual-task-start`,
including a host without a declared adapter, such as any other agent runtime opening a new task.
The `adapter` metadata and the activation fingerprint describe the host that
installed or adopted this version; they never restrict which host owns the
successor task. The receipt requirements above are unchanged, and a host that
cannot recompute the installed identities must take the degraded stop below
rather than supply a receipt.

The kit's standing claims are declared per host in the host registry below.
Same-task reload and automatic successor handoff remain conditional until a
running host supplies positive live conformance receipts. Do not infer them from
any host's current tool surface.

Without a live receipt, stop the source task after upgrade/doctor with
`overall_status=degraded`, `reason_code=manual-new-task-required`, and exactly one
action: create a new task in the same project. Say:

> Vibe Kit 文件已升级到 0.10.1，安装检查通过；当前宿主无法在本任务加载新版规则，因此尚未激活，不能宣告项目已就绪。下一步：在此项目中新建一个任务（Codex、Hermes 或任何能新建任务的宿主均可）。

Use a host-prefilled continuation when available. Otherwise include one copyable
sentence containing the active objective. Do not require a CLI command, Skill name
or repeated upgrade confirmation.

## Host registry, payload selection and conformance labels

The contract declares every supported host in `hosts`. Each entry carries the
host's adapter protocol, the same three capability claims, a conformance label
and the payload paths that belong to that host:

| Host | Protocol | Payload paths | Conformance |
| --- | --- | --- | --- |
| `codex` | 7 | `.codex/agents/vibe-*.toml`, `.agents/skills/vibe-*/agents/**` | verified |
| `hermes` | 1 | none | verified |

A label reads `verified` only where that host has a complete conformance record
for the lifecycle stages (upgrade, takeover, adaptation, default verification,
target re-evaluation); otherwise it reads `supported-unverified`, and the
strictest fail-closed rules stay in force for that host. Labels change only with
recorded evidence, never by assertion.

`init` and `adopt` take a host selection (`--host`, comma-separated, default
`codex`). The installed copy carries only the selected hosts' payload files,
records the selection in `activation.selected_hosts` and the manifest `hosts`
field, and recomputes its activation identity over exactly that content.
`upgrade` preserves the recorded selection; unknown hosts, incoherent selections
and payload that does not match the recorded selection fail closed with
actionable diagnostics. The source repository and the release payload always
carry every declared host's files — a selection never shrinks the release.

### Hermes entry: specialist-role mapping and host differences

`hermes` is a first-class entry: it is registered above with protocol 1, the same
three capability claims and the same manual new-task fallback, so a Hermes-owned
task can install, upgrade, verify and activate an installation exactly as a
Codex-owned task does. The kit's specialist roles map to Hermes delegation and
subagents:

| Kit role | Hermes mapping |
| --- | --- |
| `vibe_pm`, `vibe_ux` | delegated subagents for shaping and design work |
| `vibe_tech_lead` | a delegated subagent for decision evidence and review, or a separate recorded `sequential-perspective` pass when identity-isolated delegation is unavailable |
| `vibe_rd` | one writer — the running task or a single delegated subagent — for the implementation |
| `vibe_qa` | a delegated subagent that executes the pre-written verification harness once against the frozen candidate |
| `vibe_investigator` | a delegated subagent for reproduction and root-cause evidence |

Host differences that change how those roles are exercised are recorded here
rather than assumed:

| Host difference | Hermes behavior |
| --- | --- |
| Approval prompts | A write to a host-protected agent instruction file (for example `AGENTS.md`) raises a host approval prompt; a timeout is not consent, so the affected surface stays partial instead of being claimed |
| Subagent budget | Subagent sessions are bounded; analysis-shaped review packets can exhaust that budget, so reviews may run as recorded `sequential-perspective` passes and verification runs are pre-written run-shaped harnesses |
| Context bounding | Delegation context bounding and live host isolation are host capabilities, not kit guarantees; where they are unavailable the record states so instead of claiming isolation |

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
closeout path, presents the closed v0.10.1 schema-5 Pre-release plan, and keeps the
separate schema-3 closeout bound to the historical v0.10.0 profile.
Offline `publication-plan` and `validate-publication` build and
check canonical intents and receipts; they never gain GitHub credentials or
network authority. The Agent/host performs compare-and-swap main advancement,
exact annotated tag/Release/five-asset reconciliation, public read-back/download
checks and, only for the historical v0.7 profile, a separately authorized
idempotent #1–#5 closeout. The v0.8 profile contains no Issue operation or
closeout authorization. Divergent or extra remote state blocks. Delete, replace,
force and stable/draft transitions require separate authorization.

## Takeover object contract

Every host task that takes over, reloads, or admits an installation reports exactly one takeover object to `bin/vibe validate-takeover` on standard input. The command authenticates the installed contract first, validates the object structurally, and prints a result envelope; it never authenticates host evidence truth, never claims readiness, and never persists the object. Every layer is closed: unknown fields, unknown enum values, and unknown stages are rejected, and an unrecognised or inconsistent state fails closed.

### Layers (closed field sets)

- Top level: `takeover_schema_version`, `takeover_id`, `evidence_origin`, `completion_owner_task_id`, `project_root`, `source`, `versions`, `target_fingerprint`, `overall_status`, `last_completed_stage`, `write_state`, `upgrade_transaction`, `activation`, `goal`, `stages`, `next_action`.
- `source`: `type`, `ref`, `artifact_sha256`, `payload_tree_sha256`.
- `versions`: `from`, `target`; `target_fingerprint`: `kit_version`, `core_protocol`, `agent_install_schema`, `agent_install_protocol`, `adapter_name`, `adapter_protocol`, `manifest_sha256`, `activation_set_sha256`.
- `upgrade_transaction`: `schema_version`, `transaction_id`, `outcome`, `commit_marker`, `installation_state`, `active_state_present`.
- `activation`: `path`, `receipt_kind`, `receipt_id`, `source_task_id`, `active_task_id`, `handoff_idempotency_key`, `observed_manifest_sha256`, `observed_activation_set_sha256`.
- `goal`: `kind`, `custody`, `continuation`, `transfer_id`, `owner_task_id`, `custody_history`.
- `stages`: exactly `source-resolved`, `planned`, `applied`, `upgraded`, `activated`, `adapted`, `verified`, `re-evaluated`, `ready`; each stage is exactly `state`, `outcome`, `reason_code`, `evidence`.
- Each evidence entry is exactly `kind`, `ref`, `sha256`, `task_id`, `sequence`; each custody-history entry is exactly `state`, `task_id`, `sequence`.
- `next_action`: `code`, `detail`.

### Vocabularies

- `activation_paths`: `none`, `same-task-reload`, `automatic-successor-handoff`, `manual-new-task`.
- `adapted_outcomes`: `unchanged-complete`, `refreshed`, `blocked`.
- `evidence_kinds`: `source-attestation`, `plan-receipt`, `apply-receipt`, `doctor-receipt`, `activation-receipt`, `manual-task-start`, `handoff-claim`, `onboarding-state`, `adaptation-review`, `verify-receipt`, `routing-record`.
- `evidence_origins`: `runtime`, `controlled-fixture`.
- `goal_continuation`: `not-applicable`, `paused`, `ready-to-resume`, `resumed`, `blocked`.
- `goal_custody`: `none`, `source-owned`, `automatic-transfer-pending`, `automatic-successor-owned`, `manual-transfer-required`, `manual-transfer-pending`, `manual-successor-owned`.
- `goal_kinds`: `maintenance-only`, `unfinished`.
- `next_action_codes`: `select-trusted-source`, `use-conformant-maintenance-entry`, `choose-supported-target`, `review-conflict-candidates`, `inspect-and-recover-installation`, `approve-required-host-permission`, `rerun-upgrade-plan`, `recover-upgrade`, `inspect-upgrade-transaction`, `use-supported-upgrade-filesystem`, `inspect-existing-handoff`, `create-new-project-task`, `resolve-project-context`, `inspect-adaptation-changes`, `fix-configured-check`, `resolve-target-rule-blocker`, `answer-material-decision`, `report-internal-failure`.
- `overall_statuses`: `in-progress`, `ready`, `degraded`, `blocked`.
- `re_evaluated_outcomes`: `routable`, `blocked-by-target-rules`, `maintenance-only`.
- `reason_codes`: `source-untrusted`, `source-digest-mismatch`, `unsupported-source-channel`, `unsupported-predecessor`, `unknown-contract`, `maintenance-bridge-unsupported`, `plan-blocked`, `managed-conflict`, `apply-failed-no-write`, `conflict-evidence-written`, `unknown-partial`, `apply-failed-rolled-back`, `upgrade-recovery-required`, `upgrade-recovery-blocked`, `upgrade-leaf-atomicity-unsupported`, `upgrade-leaf-race-preserved`, `doctor-broken`, `diagnostic-blocking`, `activation-receipt-unavailable`, `activation-receipt-invalid`, `automatic-handoff-unavailable`, `handoff-ambiguous`, `handoff-failed`, `manual-new-task-required`, `onboarding-invalid`, `onboarding-contradicted`, `adaptation-write-incomplete`, `verification-failed`, `verification-skipped`, `verification-error`, `target-rule-blocker`, `material-user-decision`, `host-permission-required`, `internal-error`.
- `receipt_kinds`: `host-reload`, `host-successor-start`, `manual-task-start`, `existing-install-admission`.
- `source_types`: `github-release`, `plugin-bundled`, `offline-bundle`, `local-payload`.
- `stage_states`: `not-started`, `satisfied`, `blocked`, `not-applicable`.
- `upgrade_commit_markers`: `not-applicable`, `absent`, `valid`, `invalid`.
- `upgrade_installation_states`: `predecessor`, `target`, `recovery-required`, `unknown`.
- `upgrade_transaction_outcomes`: `not-started`, `not-applied`, `committed`, `rolled-back`, `recovery-required`, `unknown-partial`.
- `write_states`: `none`, `project-files-written`, `conflict-evidence-written`, `rolled-back`, `recovery-required`, `unknown-partial`.

Evidence kinds may appear only in their stages:

- `source-attestation`: `source-resolved`.
- `plan-receipt`: `planned`.
- `apply-receipt`: `applied`.
- `doctor-receipt`: `upgraded`, `verified`.
- `activation-receipt`: `activated`.
- `manual-task-start`: `activated`.
- `handoff-claim`: `activated`.
- `onboarding-state`: `adapted`.
- `adaptation-review`: `adapted`.
- `verify-receipt`: `verified`.
- `routing-record`: `re-evaluated`.

### Stage rules

A satisfied stage requires: `source-resolved` -> `source-attestation`; `planned` -> `plan-receipt`; `applied` -> `apply-receipt`; `upgraded` -> `doctor-receipt`; `activated` -> ; `adapted` -> `onboarding-state`, `adaptation-review`; `verified` -> `doctor-receipt`, `verify-receipt`; `re-evaluated` -> `routing-record`; `ready` -> .

Dependencies: `source-resolved` after nothing; `planned` after `source-resolved`; `applied` after `planned`; `upgraded` after `applied`; `activated` after `upgraded`; `adapted` after `activated`; `verified` after `adapted`; `re-evaluated` after `verified`; `ready` after `source-resolved`, `planned`, `applied`, `upgraded`, `activated`, `adapted`, `verified`.

At most one stage is blocked; every later stage is `not-started` and empty; the last completed stage is the last satisfied stage. Sequences are globally unique and strictly increasing across evidence and custody history.

### Activation bindings

| `receipt_kind` | `path` | active task | `handoff_idempotency_key` | required evidence | custody at ready |
| --- | --- | --- | --- | --- | --- |
| `existing-install-admission` | `manual-new-task` | `differs-from-source-task` | `must-be-null` | `manual-task-start` | `manual-successor-owned` |
| `host-reload` | `same-task-reload` | `equals-source-task` | `must-be-null` | `activation-receipt` | `source-owned` |
| `host-successor-start` | `automatic-successor-handoff` | `differs-from-source-task` | `required` | `activation-receipt`, `handoff-claim` | `automatic-successor-owned` |
| `manual-task-start` | `manual-new-task` | `differs-from-source-task` | `must-be-null` | `manual-task-start` | `manual-successor-owned` |

### Admission of an existing installation

An object whose `receipt_kind` is `existing-install-admission` admits an installation that already exists in this project directory instead of one this task installed. It must claim no transaction in this directory — `upgrade_transaction.transaction_id` `null` with `outcome` `not-started` or `not-applied` and `commit_marker` `not-applicable` or `invalid` — write nothing (`write_state` `none`), present the recomputed target identity (`observed_manifest_sha256` and `observed_activation_set_sha256` equal to the values `validate-takeover` recomputes from the installed manifest and activation set), and cite the historical upgrade as its source: at least one `applied` or `upgraded` evidence entry of kind `apply-receipt` or `doctor-receipt` with a non-null `ref` and digest. It never claims a new upgrade and never rewrites historical receipts.

### Goal custody

A `maintenance-only` goal stays `none` with no custody history. An `unfinished` goal starts `source-owned` and moves only along:

- `none` -> terminal.
- `source-owned` -> `automatic-transfer-pending`, `manual-transfer-required`.
- `automatic-transfer-pending` -> `automatic-successor-owned`.
- `automatic-successor-owned` -> terminal.
- `manual-transfer-required` -> `manual-transfer-pending`.
- `manual-transfer-pending` -> `manual-successor-owned`.
- `manual-successor-owned` -> terminal.

### Receipt artifact

Takeover-capable commands (`doctor`, `verify`, `plan`, `upgrade`, `validate-takeover`) accept `--receipt <path>` and write the exact result envelope they print as a byte-stable, root-relative artifact: two runs on the same tree, and fresh installs under different parent directories, produce identical bytes. Hosts cite the artifact path as `ref` and its SHA-256 as the evidence digest. The framework never writes goal text.

### Minimal manual-transfer payload

When custody moves manually, the successor validates the transfer with `validate-takeover --manual-transfer <path>`. The payload is exactly `transfer_schema_version` (1), `transfer_id` (opaque, <=256; equals `goal.transfer_id` when the object carries one), `goal` (host-supplied text, <=4096; never persisted by the framework), `decisions` (<=16 strings <=512), `unfinished` (<=16 strings <=512), and `evidence` (<=32 entries of exactly `ref` and `sha256`; a `./`-prefixed `ref` must resolve under the project root and match its digest).
