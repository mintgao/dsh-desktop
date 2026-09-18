# Restore a green default verification and dependency-layout check

English | [中文](brief.zh.md)

- ID: `20260918-green-default-verification`
- Size: `M`
- Status: shaping
- Created: 2026-09-18

## Technical decision readiness

- Outcome: `no-new-durable-decision`
- Trigger evidence: the npm install layout checker changes which package versions it admits into the synthesized DSH release family, and the configured verification test command changes which artifact plane it builds before sweeping
- Decision owner: Tech Lead `assembly_architecture`
- Governing decision: none
- No-new-decision rationale: the change applies the accepted independent-Mint-version rule of the versioned-assembly decision and the RC2 workspace-consistency acceptance to a second consumer; the remaining choices are local and reversible and change no shared contract
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: `docs/work-items/20260918-green-default-verification/technical-review.md`
- Material product decisions: none
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: workflow orchestrator, Hermes successor task `hermes-desktop-task-55a67951`
- Confirmed at: 2026-09-18T16:10:00Z
- Confirmation basis: the accepted versioned-assembly decision and the accepted independent-Mint-version rule of `docs/work-items/20260913-mint-rc2-release/brief.md` govern the checker change; the fixture and verification-command changes are local and reversible; review ran in an isolated subagent context
- Readiness history: recorded `covered-by-accepted-decision` with the same governing decision at independent review time; re-expressed as `no-new-durable-decision` because the readiness grammar's ADR reference pattern cannot cite this repository's date-named decision files (validator rule `readiness.adr-reference`)

## Goal

The default verification lane and the dependency-layout check both pass on this checkout, so a takeover verification run reports no failing configured check and the release workflow's dependency-layout job stops reporting a Mint version error.

## Context

`docs/work-items/20260913-mint-rc2-release/brief.md` accepted independent Mint package versions and applied that rule to the workspace manifest checker. The npm install layout check was not updated, so `pnpm run verify-npm-install-layout` aborts with `@deepseek-ai/dsh-desktop-mint has no workspace version 0.1.5-rc.2`; the same job failed on the merged RC2-homepage pull request and on `main`. Separately, the isolated delivery CLI fixture spawns a real CLI whose `pnpm install` reaches the registry update check and exceeds the fixture's 30-second child deadline on a machine where that check is reachable. The corpus import sweep reads built bundles and reports a stale artifact as an unexpected baseline failure when the configured test command runs before any build.

## Scope

- In: the npm install layout checker and its unit spec, the shared Mint package inventory it needs, the isolated delivery CLI fixture's update-check handling, the configured verification test command in `.vibe/project.yaml`, and the work-item, Agent Note and context documentation for these changes.
- Out: the official DSH release family's version rules, Mint package versions, the delivery CLI's product behavior, and moving the corpus import sweep to an artifact lane.

## Acceptance criteria

- [ ] AC-1: `pnpm run verify-npm-install-layout` verifies the dual-release layout on this workspace without the Mint version error, while an official DSH package missing the workspace version still fails the check.
- [ ] AC-2: `pnpm exec vitest run scripts/desktop-delivery/tests/operations.spec.ts` passes without environment overrides on this machine.
- [ ] AC-3: The default `./bin/vibe verify . --format json` run reports every configured check passed, with the test lane sweeping build output it built itself.
- [ ] AC-4: `pnpm run doc-sync` passes and the work-item, Agent Note and context records describe the changed checker rule and verification command.

## Design and technical notes

The checker keeps its purpose: synthesize two incompatible DSH releases from the workspace and verify npm's physical placement. Independently versioned Mint packages are not members of that release family, so they are carried through the synthesized index unchanged instead of being cloned into both synthetic versions. The inventory is shared with the existing consumer rather than duplicated: `scripts/desktop-assembly.ts` exports the Mint package names derived from `MINT_PACKAGES`, and both `verifyMintCoupling` and the layout checker use it. Official `@deepseek-ai/dsh*` packages keep the strict workspace-version requirement.

The delivery CLI fixture disables pnpm's registry update check in the fixture itself, so the child process no longer spends its budget on a network check that the fixture comment already intended to avoid. The verification test command in `.vibe/project.yaml` builds the library plane before running the unit lane, which is the dependency the corpus import sweep reads.

## Risks and open decisions

- The exclusion could hide a real Mint version drift; the official family check and the Mint coupling check remain unchanged, and the layout spec adds a negative control for an official package.
- The verification test command now builds before testing, so a default verify run takes longer; the build is incremental.
- The corpus sweep still lives in the unit lane, so a developer who runs `pnpm run test` on a stale tree can still see the stale-artifact failure; moving the sweep to an artifact lane is a follow-up, not part of this work item.
