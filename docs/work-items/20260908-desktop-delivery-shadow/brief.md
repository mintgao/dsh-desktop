# Implement desktop delivery qualification in shadow mode

English | [中文](brief.zh.md)

- ID: `20260908-desktop-delivery-shadow`
- Size: `L`
- Status: locally verified; remote qualification pending

## Authorization and scope

The owner confirmed the aligned project and requested implementation. This work implements migration stage two of the [desktop delivery design](../../decisions/20260908-desktop-update-delivery.md): executable discovery, source/version checks, preview artifact qualification, and maintainer-oriented summaries in shadow mode. It provides the local and CI evidence needed before enabling replacement remote writers. This is implementation authorization, not authorization to merge, publish, send notifications, change GitHub protections or credentials, or replace an installed client.

The [downstream policy](../../context/downstream-policy.md) governs all additions. End users retain a single whole-client update. Maintainers accept Agent-assisted decisions and GitHub notifications with optional email; this stage generates and verifies notification content without sending it. Replacing the production trust model remains a separate decision; this additive no-write stage neither needs nor grants that permission.

## Acceptance criteria

- SH-1: an executable discovery path accepts explicit distribution configuration, queries public upstream release identities read-only or uses a supplied offline fixture, and produces deterministic next-release or blocking output; duplicate, changed and missing identities are tested.
- SH-2: source locks and candidate metadata bind exact upstream/downstream revisions and component versions; inconsistent workspace versions reject before expensive packaging. No candidate claims adoption or publication merely because discovery succeeded.
- SH-3: an explicit qualification path verifies unsigned preview artifact completeness, architecture, size/digests and qualification evidence for the exact candidate; one failed or absent architecture prevents combined success. It rejects altered or substituted files.
- SH-4: an opt-in shadow workflow runs the actual scripts and existing desktop build/package paths without legacy state, App or Apple credentials and without repository mutation commands; normal operation does not create PRs, Issues, branches, tags or Releases. Output remains workflow summaries and qualification artifacts, never production publication receipts.
- SH-5: summaries explain next action, ready or blocked state, evidence and candidate identity to a maintainer; another distribution configuration passes the same tooling tests. Existing desktop update behavior and plugin composition remain intact.
- SH-6: focused development tests, executable fixture runs, appropriate local package evidence, documentation and independent QA establish the implemented scope; unexecuted dual-platform/native or production scenarios are reported accurately.
- SH-7: the real packaged backend's authenticated readiness URL reaches the desktop without losing its token; invalid remote origins are rejected and routine backend diagnostics redact the token. Native parser ownership is limited to the reviewed amendment prompted by the real DMG smoke failure.

## Ownership and plan

The Tech Lead authors an additive decision and a different reviewer approves it. One RD writer owns new delivery scripts, their tests, the new shadow workflow and required integration wiring after readiness. The orchestrator owns decision/work-item documentation and bilingual counterparts. QA owns final independent acceptance and the complete configured default verification once for the unchanged candidate. Existing unrelated working-tree edits remain untouched.

Implement the smallest integrated path using existing source-built desktop staging. Do not refactor the native shell or create a general release framework to deliver this phase. Only the new workflow may be added; production adoption, publication, withdrawal, policy receipts and controls remain untouched. Resolve new durable choices through the technical author/reviewer before editing affected implementation.

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: artifact identity, version compatibility and CI execution across upstream discovery and desktop packaging
- Decision owner: Tech Lead `distribution_design`
- Governing decision: [Shadow discovery and qualification](../../decisions/20260908-desktop-delivery-shadow.md) (`Status: Accepted`)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: independent Tech Lead `distribution_review` approved the shadow decision and separately approved its authenticated-readiness amendment on 2026-09-08
- Material product decisions: owner authorizes implementation of aligned whole-client delivery; live replacement release trust model remains outside this no-write phase
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-08T11:16:28Z
- Confirmation basis: Tech Lead authored the native amendment; independent reviewer approved its exact persisted text, including authentication preservation, strict loopback parsing, diagnostic redaction and required tests
- Readiness history: 2026-09-08T11:00:56Z — shadow implementation accepted and independently approved. Subsequent real ARM64 DMG smoke reached a token-bearing backend URL but the desktop parser timed out; readiness reopened before editing the native parser

## Baseline

Checkout `507e5beb4f76b7e7dd9f4986ab7d88ff1b2eb936` contains the preceding uncommitted design documents and unrelated onboarding, HMR test and spill test changes. The existing desktop profile and updater already deliver whole applications. Remote changes and a production cutover require separate exact evidence after shadow acceptance; this work must not claim the full release migration complete.

Local implementation and independent acceptance are recorded in [verification](verification.md). Production cutover remains outside this phase.
