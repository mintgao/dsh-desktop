# Agent Note: Vibe Kit upgrade to 0.10.1

Status: implemented

English | [中文](2026-09-23-vibe-kit-upgrade-0.10.1.zh.md)

## Problem

The repository installed Vibe Kit 0.9.0 while the canonical kit repository publishes 0.10.1, so the workflow rules, skills, agent definitions and takeover contract the project runs trail the current release. The 0.10.1 managed block is 37 words larger than the 0.9.0 block (917 to 954 words), so merging it raises root `AGENTS.md` from 2870 to 2907 words against the 2871-word ceiling in [doc-budgets.manifest.json](../../../../scripts/doc-budgets.manifest.json), and the mandatory `verify-doc-budgets` gate fails even though no project-owned instruction changed. That block also now describes the manual activation path as host-neutral instead of Codex-scoped, so the installed wording no longer matches the kit's own contract.

## Decision

Adopt the canonical GitHub release payload for v0.10.1 as an upgrade, following [the 0.9.0 upgrade](2026-09-18-vibe-kit-upgrade.md): verify the transferred archive SHA-256 and the payload-tree digest, then let the target payload's own CLI own `plan upgrade`, `upgrade` and the first doctor, whose recorded digests live in `.vibe/manifest.json`. The upgrade commits as one transaction over ten managed files with no conflict and no compatibility migration, and it preserves project-owned bytes: root `AGENTS.md` keeps its 1953 project words, `.vibe/onboarding.json` is byte-preserved, and no managed conflict is accepted by hand. The root `AGENTS.md` ceiling moves by exactly the managed-block growth, from 2871 to 2908, so the file keeps the margin it had before the framework change; project rules are not condensed to absorb a framework block, and the managed block is never hand-edited because the kit authenticates its byte span. Installation health is proven by the installed CLI's doctor: `status: healthy`, version 0.10.1, matching expected and actual activation-set digests, no diagnostic. The takeover stages after doctor stay host-owned, and the installed contract claims only the manual new-task path, so a new task in this project owns adaptation, final verification and the resumed goal.

## Alternatives considered

- Condense project-owned instructions so the 2871-word ceiling still holds.
- Trim or hand-edit the framework-managed block to fit the budget.
- Leave `verify-doc-budgets` failing after the framework update.
- Keep 0.9.0 and defer the upgrade to a later requirement.

## Consequences

The ceiling keeps tracking the framework block, so every later kit upgrade repeats the same delta calculation instead of silently re-budgeting project prose. The release changes no product surface beyond the version identity and the host label: the kit's host registry now records the Hermes entry as `verified`, and the managed block's manual activation path is host-neutral, so a new Hermes task in this project may own the successor task instead of a Codex task. The upgrade moves the Agent-install contract to schema and protocol 4, core protocol 7 and Codex adapter protocol 7. A healthy installation is not an activated one: the installed contract claims only the manual new-task path, so activation still requires a receipt from a task that starts after the upgrade.
