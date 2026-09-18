# Technical review: restore a green default verification and dependency-layout check

English | [中文](technical-review.zh.md)

Verdict: approved

## Checked artifacts

- `docs/work-items/20260918-green-default-verification/brief.md` (readiness block, design notes, risks)
- `docs/decisions/20260913-desktop-versioned-assembly.md`
- `docs/work-items/20260913-mint-rc2-release/brief.md` (Workspace version consistency)
- `scripts/verify-npm-install-layout.ts`
- `scripts/desktop-assembly.ts`
- `.vibe/project.yaml`

## Findings

No blocking finding.

The applicability rationale is credible. The accepted decision establishes three independently identified inputs and requires updating producers and validators together without substituting workspace versions for installed versions. RC2's "Workspace version consistency" section already extended the independent-version rule to workspace checkers that forced Mint packages to the official root version, with guardrails this work item repeats: share the exact Mint inventory, retain the official-package version rejection, and test the changed behavior. The failure at `scripts/verify-npm-install-layout.ts:70` is the same bounded defect; carrying Mint packages through the synthesized index unchanged while keeping strict workspace-version admission for official `@deepseek-ai/dsh*` packages reclassifies membership rather than removing the check and preserves the checker's purpose. AC-1's negative control keeps the official rejection tested, and the shared inventory matches `MINT_PACKAGES` (`scripts/desktop-assembly.ts:13`), already used by `verifyMintCoupling`.

Both companion changes are local, reversible, and in scope. Disabling pnpm's registry update check inside the fixture affects only the spawned child, not the out-of-scope product behavior; the brief states the fixture comment already intended to avoid that check. Changing the configured `test` command (`.vibe/project.yaml:12`) to build the library plane before the unit lane is a one-line change that removes the stale-artifact failure without suppressing the sweep.

## Residual risks accepted

- Carried-through Mint entries are unreachable from the synthetic consumer (root dependencies, `verify-npm-install-layout.ts:199-201`), so the layout check does not exercise Mint placement; if one became reachable, line 134 would reject its independent version. Conservative and acceptable.
- The default verify run takes longer; the build is incremental.
- Direct `pnpm run test` on a stale tree can still show the stale-artifact failure; the artifact-lane move remains a follow-up.
- The exemption keys off the exact Mint inventory and does not replicate RC2's duplicate-name guard; acceptable because the registry index is name-keyed.

## Missing evidence

- The checker's unit spec and its negative control are not attached; AC-1 and AC-4 must evidence them.
- The fixture mechanism for the update check (`scripts/desktop-delivery/tests/operations.spec.ts`) is not attached; AC-2 must evidence it.
- The exact new `.vibe/project.yaml` command and whether the library-plane build produces what the corpus sweep reads; AC-3 must evidence it.
