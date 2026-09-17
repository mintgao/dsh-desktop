# Agent Note: Vibe Kit upgrade to 0.9.0

Status: implemented

English | [中文](2026-09-18-vibe-kit-upgrade.zh.md)

## Problem

The repository installed Vibe Kit 0.3.0 while the canonical kit repository publishes 0.9.0, so the workflow rules, skills and agent definitions the project runs predate the current release by six minor versions. The 0.9.0 managed block is larger than the 0.3.0 block: it adds the host takeover lifecycle, technical decision readiness and adaptation rules. Merging it raises root `AGENTS.md` from 2209 to 2870 words against the 2210-word ceiling in [doc-budgets.manifest.json](../../../../scripts/doc-budgets.manifest.json), so the mandatory `verify-doc-budgets` gate fails even though no project-owned instruction changed.

## Decision

Adopt the canonical GitHub release payload for v0.9.0 as an upgrade: verify the transferred archive SHA-256 and the payload-tree digest, then let the target payload's own CLI own `plan upgrade`, `upgrade` and the first doctor. The upgrade preserves project-owned bytes: root `AGENTS.md` keeps its 1953 project words, `.vibe/onboarding.json` is byte-preserved, and no managed conflict is accepted by hand. The root `AGENTS.md` ceiling moves by exactly the managed-block growth, from 2210 to 2871, so the file keeps the margin it had before the framework change; project rules are not condensed to absorb a framework block, and the managed block is never hand-edited because the kit authenticates its byte span. Installation health is proven by the installed CLI's doctor; the takeover stages that follow it stay host-owned and this change claims none of them.

## Alternatives considered

- Condense project-owned instructions so the old ceiling still holds.
- Trim or hand-edit the framework-managed block to fit the budget.
- Leave `verify-doc-budgets` failing after the framework update.
- Keep 0.3.0 and defer the upgrade to a later requirement.

## Consequences

The ceiling now tracks the framework block, so every later kit upgrade repeats the same delta calculation instead of silently re-budgeting project prose. The upgrade adds tracked installation files (`AGENT_INSTALL.md`, `agent-install.json`), the `vibe-release` skill, the `vibe-tech-lead` agent and `.vibe/core/technical-decision-readiness.md`. A healthy installation is not an activated one: readiness still requires a host activation receipt, which this change does not produce.
