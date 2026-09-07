# Technical decision readiness

This is the normative Vibe Kit contract for deciding whether work may enter
implementation. Product shaping and implementation readiness are different
states: a shaped requirement is not automatically ready for a code edit.

Apply this contract before the first application or shared implementation code
edit in feature, debug-to-fix, and direct implementation workflows. Creating or
updating the work-item readiness record and decision evidence is allowed while
the gate is blocked.

## Trigger scan

The orchestrator scans the work size, scope, acceptance criteria, risks, open
decisions, relevant architecture, and existing Accepted decisions. A technical
decision trigger exists when implementation would introduce or change any of:

- a durable or shared contract;
- a cross-component or cross-system boundary or ownership model;
- schema, protocol, version, API, or compatibility behavior;
- migration or irreversible state;
- authentication, permissions, security, privacy, or a trust boundary;
- rollback, recovery, crash behavior, or failure consistency; or
- a material long-term trade-off among viable approaches.

Local, reversible choices that do not change a shared contract remain RD
planning decisions. They do not require an ADR.

## Size policy

- **S:** A clear, local, low-risk, reversible S task needs no readiness artifact
  or independent review. It may touch multiple tightly coupled implementation,
  test, or documentation files; file count alone never changes its size. If the
  trigger scan finds a durable or high-risk boundary, the size is no longer
  credible; reclassify to M or L before editing code.
- **M:** User-flow, shared contract/API, or unresolved acceptance work is at
  least M. Every M work item receives a trigger scan at planning or handoff. An
  untriggered M records a concise `no-new-durable-decision` rationale and needs
  no ADR or technical review. A durable/shared trigger that is not cross-system
  or high-risk creates a triggered M, blocked until decision-owner evidence and
  approved technical review satisfy this contract.
- **L:** Cross-system work and high-risk authentication, permissions,
  security/privacy/trust, schema/protocol/version/API compatibility, migration,
  irreversible-state, rollback/recovery/crash, or failure-consistency work is L.
  Every L work item has an explicit readiness record and approved
  technical review before implementation. L does not automatically mean a new
  ADR: an applicable Accepted decision or a reviewed no-new-decision rationale
  can satisfy the gate.

Triggered M and L work must create or update an ADR when the work introduces or
changes a durable architecture, contract, migration, recovery, compatibility,
ownership, or security decision. A current Accepted ADR can instead be cited
when it fully governs the work. A no-new-decision rationale must explain why
the remaining choices are local, reversible, and do not change a shared
contract; it cannot hide an unresolved high-risk trade-off.

## Work-item readiness record

New M/L work items start with this project-owned block:

```md
## Technical decision readiness

- Outcome: `not-assessed`
- Trigger evidence: none
- Decision owner: none
- Governing decision: none
- Review mode: `not-required`
- Review result: `not-required`
- Review evidence: none
- Material product decisions: none
- Open blockers: none
- Gate: `blocked`
- Gate owner: Workflow orchestrator
- Confirmed at: none
- Confirmation basis: none
- Readiness history: none
```

Every listed field is required for an applicable record. Use the explicit value
`none` when a field has no applicable value; an empty field is missing evidence.

`Outcome` is exactly one of:

- `not-assessed`
- `decision-required`
- `covered-by-accepted-decision`
- `no-new-durable-decision`
- `decision-accepted`

`Gate` is exactly `blocked` or `implementation-ready`.

`Review mode` is exactly `not-required`, `independent-agent`, or
`sequential-perspective`. `Review result` is exactly `not-required`, `pending`,
`changes-required`, or `approved`.

## State and release rules

1. A new M/L record starts `not-assessed + blocked`.
2. The trigger scan moves it to `decision-required + blocked`,
   `covered-by-accepted-decision + blocked`, or
   `no-new-durable-decision + blocked`.
3. `decision-required` becomes `decision-accepted` only after the new or
   updated governing ADR has `Status: Accepted`.
4. Required review is recorded separately. A successful outcome remains
   blocked while review is pending or requests changes.
5. The gate owner confirms `implementation-ready` only after checking every
   release condition.

`not-assessed` and `decision-required` are always blocked. The other three
outcomes may become `implementation-ready` only when:

- every referenced governing ADR exists and has `Status: Accepted`, or the
  no-new-decision rationale is complete;
- review is `approved` when required by the size policy;
- material product decisions are resolved and referenced;
- `Open blockers: none`; and
- gate-owner identity or perspective, an ISO-8601 confirmation time, and the
  evidence checked are recorded.

The contract fails closed. A missing block, missing field, unknown enum, invalid
outcome/gate pair, absent or non-Accepted decision, missing required review,
unresolved material product decision, open blocker, or missing confirmation
means `Gate: blocked`. While blocked, an Agent must not edit application or
shared implementation code. It repairs the artifact or routes the missing
decision/review instead of choosing a technical default.

## Roles and authority

- **Product shaping owner / PM:** owns what, why, users, scope, non-goals,
  observable behavior, acceptance, and product assumptions. It identifies open
  technical questions but does not choose architecture or implementation.
- **Technical decision owner / Tech Lead:** owns architecture, alternatives,
  trade-offs, technical approach boundaries, migration, recovery,
  compatibility, ownership, and technical risk. It authors decision evidence
  without expanding product scope.
- **Independent technical reviewer:** critically reviews the exact persisted
  decision or rationale, including alternatives, failure modes, recovery,
  security, and compatibility. The implementation writer's self-review cannot
  satisfy a required review.
- **Workflow orchestrator / gate owner:** runs the trigger scan, routes the
  perspectives, persists read-only specialist output, checks evidence and open
  decisions, and confirms or blocks the gate. It cannot invent the technical
  decision or answer a material product choice.
- **Implementation writer / RD:** plans local implementation inside an accepted
  boundary and edits code only after the gate is ready. It cannot waive the
  gate.
- **QA:** independently verifies product acceptance criteria and that the
  implementation stayed inside the accepted decision boundary. QA does not
  replace the pre-implementation decision or review.
- **User / product owner:** decides only choices that change product scope,
  observable behavior, promised risk or cost, irreversible state, or an
  external compatibility boundary. Internal technical choices do not require
  routine user approval.

For L and triggered M work, the implementation writer must not be the only
decision author, reviewer, and gate approver.

## Specialist execution

The orchestrator constructs the artifact-first handoff defined in
`.vibe/core/operating-model.md`. Each handoff names the role/mode, bounded task,
minimum authoritative evidence, expected output, ownership boundary, and known
limitations. Missing evidence fails closed: the receiver requests or reports the
exact missing artifact instead of inventing it. Complete conversation history
and unrelated repository material are excluded by default.

In a host with native subagents, one read-only Tech Lead instance authors the
decision evidence, the orchestrator persists it, a different read-only Tech
Lead instance reviews the exact persisted artifact, and one RD writer starts
only after the orchestrator confirms readiness.

When the host exposes bounded or no-history fork controls, use the smallest
viable history plus the self-contained packet. If transport bounding is absent
or uncertain, preserve the required perspectives and record
`transport context bounding unavailable`; tool presence or static documentation
does not establish prompt isolation.

A host without independent subagents may use separate sequential passes for
technical authoring, critical technical review, gate confirmation, and
implementation. The review pass does not edit code and returns `approved`,
`changes-required`, or `blocked`. A successful fallback records:

- `Review mode: sequential-perspective`;
- `Review result: approved` and concrete review evidence; and
- `Capability limitation: identity-isolated independent reviewer unavailable`.

Sequential review preserves the blocking semantics but must not be described as
identity-isolated or `independent-agent` review.

## Reopening and adoption

If implementation discovers a new schema, protocol, compatibility, ownership,
recovery, migration, security, or other durable/high-risk decision, stop the
affected edit and reopen the record as `decision-required + blocked`. Append
the prior outcome, confirmation, timestamp, and reopen reason to `Readiness
history`; invalidate rather than overwrite the prior current confirmation.
Release again only through the normal decision, review, and confirmation path.

Active M/L work that has not entered implementation adopts this gate at its next
handoff. In-progress work pauses only when it discovers a new unresolved
durable/high-risk boundary. Completed historical work is not retrofitted.

This is a workflow and evidence contract, not a CLI-owned state machine. Core
protocol metadata declares adapter conformance; it does not mechanically prove
that a host or Agent followed the gate.
