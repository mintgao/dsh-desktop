# Unblock default verification

English | [中文](brief.zh.md)

- ID: `20260828-default-verification-unblock`
- Size: `M`
- Status: complete
- Created: 2026-08-28

## Technical decision readiness

- Outcome: `no-new-durable-decision`
- Trigger evidence: Workflow and timeout corrections remain test-only. The repeated full-suite sandbox failure requires one runtime classification fix, but it restores the existing rule that a caller-killed background process is not a policy denial; it changes no sandbox mode, runner, process lifecycle, wire field, or model-visible format.
- Decision owner: none
- Governing decision: [Mint desktop downstream development and releases](../../../.agents/notes/implemented/process/2026-08-24-mint-desktop-downstream-development.md), [the sandbox decision](../../../.agents/notes/implemented/feature/2026-07-06-sandbox.md), [the PowerShell executor decision](../../../.agents/notes/implemented/feature/2026-08-01-pwsh-tool-and-executor.md), and [defensive subprocess patterns](../../defensive-patterns.md)
- Review mode: `not-required`
- Review result: `not-required`
- Review evidence: none
- Material product decisions: none
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-08-28T22:05:42+08:00
- Confirmation basis: Investigator evidence, the current workflow guards, the implemented Mint and sandbox decisions, `tool-bash` rendering tests and README, and the existing background-process status contract.
- Readiness history: 2026-08-28T22:05:42+08:00 — `not-assessed + blocked` to `no-new-durable-decision + implementation-ready` after the trigger scan found test-only corrections governed by existing behavior. 2026-08-28T22:33:34+08:00 — the scope expanded to restore killed-process denial classification after two full-suite reproductions; the gate remained `no-new-durable-decision + implementation-ready` because the accepted sandbox decision and executor lifecycle already require that result.

## Goal

Restore a passing full default Vibe verification receipt without changing the official-workflow isolation or shell timeout behavior that the current repository already documents and ships.

## Context

The first host-capable default verification passed lint, typecheck, and build but exposed four test failures. Three assertions in `scripts/ci-workflow.spec.ts` predate the intentional official-repository guards added by `8b2e684bcb`. One `tool-bash` integration assertion assumes a trapped timeout always exits zero, while the documented contract reports timeout and final process status independently and the macOS process tree settled as exit 143. After those corrections, two full-suite runs exposed a related sandbox race: a caller-killed background process can also settle with exit 143, but background denial classification consulted only the exit code and could misclassify matching stderr despite the handle's authoritative `killed` status. Once those behavior failures were resolved, the type-aware Oxlint project-discovery contract passed in 2–4 seconds alone but exceeded its 20-second budget twice under the full suite's ten-worker contention, at 22.652 and 26.787 seconds.

## Scope

- In: align static workflow tests with the existing official-repository guards; make the real bash timeout test assert the platform-independent timeout fact; make background sandbox classification honor the existing killed-process status; give the type-aware Oxlint project-discovery contract a bounded full-suite load budget; update governing verification prose and this work item's evidence.
- Out: workflow YAML, process termination mechanics, timeout/rendering formats, sandbox policy or runner behavior, and unrelated cleanup.

## Acceptance criteria

- [x] AC-1: Static workflow tests require the official-repository guard on every official CI, E2E, issue-management, and package-release job while preserving each job's event-specific condition.
- [x] AC-2: The real bash timeout scenario requires the timeout marker without assuming one platform-specific final exit status; pure rendering coverage continues to pin the trapped exit-zero case.
- [x] AC-3: A caller-killed confined background process is never classified as a policy denial, including when its shell reports a numeric 128-plus-signal exit code under process-tree timing.
- [x] AC-4: The focused workflow, bash tool, local executor, sandbox, and Oxlint contract test files pass on the host.
- [x] AC-5: Default `./bin/vibe verify . --format json` passes every configured check with all-configured coverage.
- [x] AC-6: The installed Vibe doctor remains healthy and `pnpm run doc-sync` plus `git diff --check` pass.

## Design and technical notes

- Keep the official workflows disabled in the Mint downstream repository; do not weaken or remove their repository guard.
- Preserve independent timeout, signal, and exit reporting. The real process test must not make a portable guarantee about how a process tree that installs a TERM trap ultimately settles.
- Treat the background handle's existing `killed` status as authoritative for denial and runner-failure classification in both call-for-call sandbox executors; do not change how the subprocess layer terminates or reports the process.
- Limit the timeout calibration to the one Oxlint contract that loads host and client TypeScript project graphs. A 60-second bound gives more than twice the observed loaded-suite duration while still detecting a real hang.
- Keep one implementation writer and use independent QA after the focused checks pass.

## Risks and open decisions

- A broad workflow assertion could accidentally accept an unguarded job; enumerate every governed workflow and inspect every job.
- Weakening the bash assertion too far could stop proving the timeout marker; keep the positive marker assertion and the pure renderer case for exit zero.
- A kill can race natural settlement. Only suppress sandbox failure classification when the executor has already stamped the handle `killed`; ordinary nonzero exits must retain conservative denial and runner-failure matching.
- A broad timeout increase could hide an Oxlint regression. Keep the other contract tests at 20 seconds and retain a finite 60-second bound only for multi-project type-aware discovery.
