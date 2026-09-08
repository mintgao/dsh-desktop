# Implement reviewed desktop release delivery

English | [中文](brief.zh.md)

- ID: `20260908-desktop-reviewed-delivery`
- Size: `L`
- Status: local implementation verified; remote activation pending

## Authorization and product outcome

The owner confirmed the GitHub-protection and per-release-confirmation trust model in the [delivery decision](../../decisions/20260908-desktop-update-delivery.md#owner-confirmation). Continue implementation of ordinary reviewed upstream adoption and whole-client release delivery. The [downstream policy](../../context/downstream-policy.md) governs reusable tooling and Mint configuration. End users receive one desktop update, regardless of component changes.

The [shadow implementation](../20260908-desktop-delivery-shadow/verification.md) passed local acceptance and default checks. Build on it. Preserve unrelated working-tree changes. Implement and test the complete next operational path locally, including migration preflight and recovery; remote activation must be backed by exact protection, credential, sole-writer and artifact evidence. This task does not implicitly authorize publishing an unspecified release or replacing the user's installed application.

## Acceptance criteria

- RD-1: ordered discovery prepares one reviewable adoption change per upstream release, with source identity, conflict/version checks and a source lock; it cannot merge or publish implicitly.
- RD-2: qualification binds an exact clean downstream commit and source lock to complete native artifacts, recorded evidence and a final manifest; altered or missing artifacts and unqualified signing modes fail closed.
- RD-3: explicit promotion verifies the approved manifest, run identity, exact source and immediate predecessor; draft/upload/publish reconciliation and public verification are idempotent, and conflicts block without overwrite.
- RD-4: a single mutation owner serializes publication, withdrawal and recovery; migration checks every legacy entry point and prevents delayed callbacks from competing with the replacement. Missing live controls prevent activation.
- RD-5: maintainers receive reviewable action/error summaries; unchanged blockers do not cause repeated mutation or notification. Local tests exercise a second distribution through shared tooling. Product defaults stay in configuration.
- RD-6: focused behavior and failure-recovery tests, workflow checks and independent default verification cover the final implementation; live native, signing, installation, GitHub notification and migration limits are explicit.

## Ownership

Read-only Tech Lead author and separate reviewer resolve the exact executable architecture before one RD writer edits scripts/workflows. The orchestrator owns documents and gate confirmation. Independent QA owns final acceptance and configured default verification. Existing shadow scripts may be extended without presenting shadow evidence as publication approval.

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: release authority, immutable artifact identity, protected environments, ordered adoption, remote mutation and migration recovery
- Decision owner: Tech Lead `distribution_design`
- Governing decision: [Accepted operational decision](../../decisions/20260908-desktop-reviewed-delivery.md)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: Tech Lead `distribution_review` approved operational implementation, repeatable seed finalization and scheduled bot-identity notification on 2026-09-08
- Material product decisions: owner confirmed GitHub protection and per-release confirmation replacing custom App policy attestation
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-08T12:14:46Z
- Confirmation basis: independent review approved the exact operational decision, seed recovery and scheduled notification identity amendments; owner trust choice resolved; live activation conditional
- Readiness history: 2026-09-08T12:05:53Z operational implementation approved; reopened before scheduled notification edits

## Lineage implementation readiness

Tech Lead `distribution_design` authored the [desktop delivery order amendment](../../decisions/20260908-desktop-reviewed-delivery.md#desktop-delivery-order); `distribution_review` approved its exact persisted text. The orchestrator reopened the affected lineage gate at `2026-09-08T12:31:23Z`. Desktop-only and replacement releases preserve upstream identity while recording their own delivery predecessor; dependent implementation is `implementation-ready`.

## Bootstrap implementation readiness

The independent reviewer approved the persisted initial workflow bootstrap exception. The orchestrator releases local bootstrap implementation at `2026-09-08T12:34:26Z`; live execution still requires an independently reviewed exact snapshot, immutable bootstrap tag and protected environment approval. This gate does not authorize remote changes.

Independent review approved the absent-base-lock bootstrap amendment. The orchestrator releases this narrowly scoped implementation; exact Git-tree absence and pinned existing adoption evidence are mandatory. Routine adoption cannot use this exception.

Independent review approved the administrator-preflight/runtime split. The orchestrator releases implementation of the fixed administrator-only allowlist and digest-bound attestations; generic read failures remain blockers.

Independent review approved initial activation ordering and the exact nonpublic draft-access probe. The orchestrator releases their implementation; first merge includes verified activation, and probe success requires restored body and removed probe asset. No remote execution is authorized by this receipt.

## Bootstrap visibility readiness

Tech Lead `distribution_design` authored the bootstrap ruleset visibility amendment; independent reviewer `distribution_review` approved its persisted text. The orchestrator confirms `implementation-ready` at `2026-09-08T13:55:05.947606+00:00` for that scoped fix and its rejection tests. Remote Actions PR permissions remain a separate authorization blocker.
