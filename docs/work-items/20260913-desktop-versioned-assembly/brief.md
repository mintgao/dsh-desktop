# Desktop versioned assembly

English | [中文](brief.zh.md)

- ID: `20260913-desktop-versioned-assembly`
- Size: `L`
- Status: locally-verified
- Created: 2026-09-13

## Goal

Adopt DSH RC.2 through an unmodified upstream runtime, separately packed Mint plugins and the native shell. Make Desktop integration interfaces explicit and automatically checked so routine adoption does not require repeated manual compatibility investigation. Keep one Desktop update for users.

## Authority and scope

The owner explicitly requests both improvements in this adoption and standing development rules enforcing them. PM `assembly_scope` reviewed the scope read-only and found no unresolved product choice. The protected main baseline is `8e1df6fd25166943e6105859832b42a4da258755`; the delivered Desktop is `desktop-v0.1.5-alpha.2.unsigned.2`, built from `2c00aa9602335c927a89d3b6208aa6a8d812c32d` with upstream `b2e3b2a0125854567a4a5fcba75782e42fe84901`. The target is `dsh-v0.1.5-rc.2`, commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`. The official runtime closure and assembled local application are verified in the [independent report](verification.md); publication and user installation remain excluded.

Follow the [downstream policy](../../context/downstream-policy.md) and [native ownership decision](../../decisions/20260910-desktop-mint-target-integration.md). Mint lives in `apps/desktop-mint`; `apps/desktop` is upstream-owned. Original user changes remain in the original recovery checkout and are excluded. Preserve user home, custom profile patches, unsigned arm64 behavior, navigation and authentication protections. No new product features, Intel support, generic plugin platform, arbitrary-version compatibility, signing activation, remote publication or installed-app replacement are included.

## Acceptance criteria

- AC-1: The assembled RC.2 runtime has exact official provenance and integrity. Mint requires no changes to upstream CLI dependencies, built-in profiles or runtime source. Source ancestry alone is insufficient.
- AC-2: Upstream, Mint packages and native shell have distinct exact identities. Record actual installed components and integrity; missing, mismatched or tampered inputs fail without workspace or registry fallback.
- AC-3: Explicit launch, readiness/authentication, shutdown and native integration obligations have success and failure tests, including a real RC.2 artifact. Mock readiness output alone is insufficient.
- AC-4: Packed Mint plugins load through supported DSH profile/plugin extension APIs without source aliases; an independent plain Web composition excludes Mint defaults.
- AC-5: A packaged arm64 application starts in an isolated synthetic environment, presents usable UI, performs a representative keyless conversation and exits. Diagnostics redact tokens; unsigned identity-dependent notifications remain unverified.
- AC-6: Users receive one Desktop version; maintenance evidence names actual components. Fresh install, existing profile/data compatibility and user installation are reported separately. Tests never access real user homes or credentials.
- AC-7: Standing rules and an executed check reject representative Mint-to-core coupling or tampered assembly inputs. Replace the coupled packaging path; do not merely add a parallel demonstration.

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: cross-process launch, artifact provenance, version compatibility and persisted custom-profile initialization
- Decision owner: Tech Lead `assembly_architecture`
- Governing decision: [Official runtime artifacts and Mint-owned assembly](../../decisions/20260913-desktop-versioned-assembly.md)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: [Independent technical review](technical-review.md)
- Material product decisions: owner requests both outcomes in this RC.2 adoption; existing single-update unsigned arm64 scope retained
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-13T11:27:18.201619+00:00
- Confirmation basis: orchestrator checked accepted ADR, independent approval with proposal digest, AC-1 through AC-7, preserved unsigned arm64/single-update scope and no unresolved product decisions
- Readiness history: 2026-09-13 PM scoped AC-1 through AC-7; native Technical Lead author and different reviewer required before implementation

The running task applies the user-supplied readiness rules from its original checkout; the isolated baseline has an older Vibe installation. No framework upgrade or activation claim is made.

## Verification ownership

RD owns focused checks. Independent QA owns exactly one complete default verification for the final unchanged candidate, plus assembled/native criteria. Bind evidence to actual inputs and record invalidation reasons. Real model calls and signed notification checks require separate available credentials and must not be inferred from mocks.
