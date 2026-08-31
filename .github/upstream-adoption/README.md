# Upstream adoption control plane

English | [中文](README.zh.md)

This directory owns the repository-side manifests that the transactional upstream-adoption workflows verify before they mutate any long-lived GitHub state.

## Files

- `apps.json` pins the three GitHub App roles, their required environment homes, and the exact permission sets that the runtime preflight expects.
- `rulesets.json` declares the required branch and tag ruleset shapes for `main`, the protected state ref, candidate branches, and immutable `desktop-v*` tags.
- `protected-paths.json` lists the control-plane files that force exact-head maintainer approval when a candidate changes them.
- `.github/workflows/upstream-adoption-observer.yml` converts failed validation, finalization, publication, and scheduled Controller runs into one protected failure transition. If that transition cannot be authenticated and committed, it asks the Controller to disable the schedule and project a circuit-breaker Issue instead of allowing repeated failed runs.

## Operational rules

- Edit these manifests together with the owning workflows, `scripts/upstream-adoption/**`, and `scripts/desktop-workflows.spec.ts`. The workflow tests are the local contract that the checked-in Actions definitions still match the manifests.
- The Controller App may write only active candidate branches and ordinary PR or Issue state. It never writes `main`, the protected state ref, or immutable desktop tags.
- The State Finalizer App is the only automation writer for `refs/heads/automation/upstream-adoption-state`, the `main` fast-forward, and `desktop-v*` tag creation.
- The Publisher App may mutate GitHub Releases only. It has no branch or tag bypass and no Apple signing credential.
- The `mint-finalizer`, `mint-publication`, and `mint-signing` environments allow only protected branches. Manual validation and publication workflows must be dispatched from `main`; selecting a desktop tag as the workflow ref cannot enter a secret-bearing job.
- Every policy-verification step supplies the same App ID and private-key secret used by its token-minting step. Runtime facts use an in-memory App JWT for repository-installation identity and permission reads, while repository operations continue to use the installation token.
- A durable failure fingerprint makes unchanged deterministic polls successful no-ops. The Controller edits one blocker Issue only when the phase or fingerprint changes, and closes it only after the public Release and protected cursor are verified.
- Candidate ownership is authenticated by a Controller-App commit status on the exact head, not by Git author text. Any other head, any protected-path change, or any resolved conflict requires a current approval from a collaborator with `maintain` or `admin`; an approval change is an authoritative input that wakes the controller once.
- Publication completion is dispatched by the observer only after the publication workflow has finished successfully. The Finalizer then downloads every public asset, rechecks its digest and public notes, and advances the cursor; an already-public valid Release therefore recovers without rebuilding.
- Conflict recovery requests live on the candidate branch at `.github/upstream-adoption-requests/<sanitized-upstream-tag>.json`. They are evidence on the exact conflicted head, not durable configuration in this directory.

## Before enabling production automation

1. Create the three Apps and protected environments named by these manifests.
2. Seed `automation/upstream-adoption-state` with `pnpm exec tsx scripts/upstream-adoption/cli.ts seed-state <verified-baseline> <output>` on an isolated branch commit. Verify the legacy upstream Release, desktop tag, tag commit, public Release, and evidence digest before pushing that initial commit.
3. Install the exact rulesets described in `rulesets.json`. Both `main` and the state ref require pull-request review; only the Finalizer App bypasses the state rule, and neither Controller nor Publisher has a `main` or tag bypass.
4. Keep `.github/release-policy/activation.json` unconfigured until the restricted activation PR lands with the real signer key and initial signed receipt.
5. Run the `Verify Mint release policy` workflow after activation so the repository can prove the owner-authenticated policy without mutating state. Enable `UPSTREAM_ADOPTION_ENABLED` only after this preflight succeeds.

Changing any file here is a control-plane change. Candidate validation and finalization require a fresh exact-head maintainer approval before the new policy can reach `main`.
