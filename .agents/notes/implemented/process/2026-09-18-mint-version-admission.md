# Agent Note: Admit independently versioned Mint packages to the dependency-layout check

Status: implemented

English | [中文](2026-09-18-mint-version-admission.zh.md)

## Problem

`pnpm run verify-npm-install-layout` aborts on this workspace with `@deepseek-ai/dsh-desktop-mint has no workspace version 0.1.5-rc.2`. The checker synthesizes two incompatible DSH releases from the workspace and requires every `@deepseek-ai/dsh*` package to carry the workspace version, while the accepted versioned-assembly decision gives the Mint packages independent versions. The same job failed on the merged RC2-homepage pull request and therefore on `main`. Two smaller findings blocked the same verification lane: the isolated delivery CLI fixture's child process spent its 30-second budget on pnpm's registry update check, and the configured verification test command ran the corpus import sweep before anything built the bundles it reads.

## Decision

The layout checker treats independently versioned Mint packages as outside the synthesized release family: `buildDualDshRegistry` takes the excluded package names and carries their registry entries through unchanged, while official `@deepseek-ai/dsh*` packages keep the strict workspace-version requirement. The names come from `mintPackageNames`, which `scripts/desktop-assembly.ts` derives from the same `MINT_PACKAGES` inventory `verifyMintCoupling` already used, so the two consumers cannot drift. The unit spec keeps the official-package rejection as a negative control.

The delivery CLI fixture writes `update-notifier=false` to its own `.npmrc`; the previous `pnpm-workspace.yaml` key did not stop the check under pnpm 11, so the child's `pnpm install` waited on a registry request until the fixture's deadline. The configured verification `test` command in `.vibe/project.yaml` now runs `pnpm run build:lib` before `pnpm run test`, which is the dependency the corpus import sweep reads. The corpus import sweep's dockkit exemption keys on the refusal kind — `ERR_UNKNOWN_FILE_EXTENSION` naming a `.css` file — rather than one pinned path, because which `.css` in that bundle's import graph Node refuses first depends on the Node line; the classification cases still fail a bundle that stops being importable for any other reason.

## Alternatives considered

- **Raise the fixture's child deadline.** It would leave the network request in the path and slow every run; the fixture's own comment states the intent to avoid the update check.
- **Keep the Mint packages in the family at their independent versions.** The synthetic releases exist to expose cross-release placement errors inside one release family; a package with its own version line is not a member, and cloning it into both synthetic versions would misrepresent the published layout.
- **Remove the corpus sweep from the unit lane.** Correct in principle, because artifact-consuming gates belong in an artifact lane, but it moves tests between lanes and touches CI; recorded as a follow-up instead.

## Consequences

The dependency-layout job can pass on a workspace whose Mint packages carry independent versions, and a real Mint version drift still fails through the official-family check, the coupling check, and the spec's negative control. The fixture no longer depends on the machine's registry reachability. The corpus sweep reports the same verdict under both supported Node lines — 272 importable bundles and five exemptions — so a verification run no longer depends on which Node the operator's shell resolves. A default verification run now builds the library plane before the unit lane and takes longer; moving the corpus sweep to an artifact lane remains open.
