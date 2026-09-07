# Vibe operating model

## Principles

- Use the lightest process that provides enough confidence for the task.
- Treat roles as independent perspectives, not ceremonial steps.
- Keep product intent, implementation decisions, and verification evidence traceable.
- Prefer executable checks over assurances in prose.
- Ask the user only when a missing choice would materially change scope, behavior, risk, or cost.

## Work sizes

### S — small and explicit

A clear, local, low-risk, reversible change with settled expected behavior, such
as copy, a small style adjustment, or an obvious defect with a known cause. It
may touch multiple tightly coupled implementation, test, or documentation files;
file count alone is never a size trigger.

- A separate work-item folder is optional.
- One implementation pass and focused verification are normally enough.
- Do not spawn multiple agents unless the task has a specific risk that benefits from independent review.

### M — bounded feature or uncertain change

A change that affects a user flow, shared component contract or API behavior, or
whose acceptance criteria still need shaping. A durable shared decision can make
an M item a triggered M, but cross-system or high-risk work is L.

- Create a work item.
- Establish acceptance criteria before implementation.
- Include UX analysis for user-facing behavior.
- Scan for durable or high-risk technical-decision triggers before implementation.
- Use independent QA verification after implementation.

### L — cross-cutting or high risk

A change involving a cross-system boundary or a high-risk contract such as
schema/protocol/version compatibility, migration, authentication, permissions,
security/privacy/trust, irreversible state, rollback/recovery/crash consistency,
or substantial ambiguity with material long-term consequences.

- Create a work item and explicit plan.
- Record an explicit technical-decision readiness outcome before implementation.
- Record new or changed durable architectural decisions in `docs/decisions/`.
- Include rollback or recovery considerations.
- Use independent specialist reviews and QA evidence.

## Risk-adaptive execution

- **S:** Use one implementation perspective and focused verification by default.
  Delegate only for a concrete risk; reclassify before editing when a readiness
  trigger appears.
- **Untriggered M:** Shape only unresolved product or UX questions, record the
  trigger scan, use one RD writer, and use one independent QA pass. Add another
  specialist only for an identified ownership question.
- **Triggered M:** Preserve distinct Tech Lead author and reviewer evidence,
  orchestrator gate confirmation, one RD writer, and independent QA.
- **L:** Preserve the explicit plan and every applicable specialist, recovery,
  compatibility, security/privacy, review, and QA requirement. Efficiency may
  bound context but never remove required judgment or evidence.

The orchestrator owns classification and delegation. A specialist does not
self-expand the assignment or recursively delegate unless its bounded handoff
identifies a genuinely independent subproblem.

## Artifact-first specialist handoffs

Every specialist handoff names the assigned role or mode, bounded objective,
work-item identifier, exact authoritative artifact references, applicable
acceptance-criterion identifiers, governing constraints and readiness/ADR
evidence, ownership boundary, expected output and evidence, known blockers, and
host capability limitations. Prefer paths plus headings over copied documents.

Do not include complete conversation history, broad repository listings, raw
logs, unrelated files, or other Agent output by default. Before implementation
delegation, accepted scope, material product choices, readiness state, and
governing decisions must exist in project-owned artifacts. If required evidence
is missing, the receiving role reports or requests the exact missing reference;
it does not reconstruct it from memory or guesswork.

Minimum authoritative evidence is role-specific:

- PM/UX: the user request, relevant product/design context, and current brief;
- Tech Lead author: accepted scope/criteria, architecture, readiness contract and
  record, and only plausibly applicable ADRs;
- Tech Lead reviewer: the exact persisted decision, accepted scope, readiness
  record, and referenced governing context;
- RD: accepted brief, decision/review/gate evidence, project rules, relevant
  architecture/code, and owned paths; and
- QA: accepted criteria, governing technical boundary, readiness/review evidence,
  implementation report, current diff or baseline, and configured checks.

When the host supports bounded or no-history forks, use the smallest viable
history with a self-contained packet. When transport bounding is absent or
uncertain, preserve required roles with the available mechanism and record
`transport context bounding unavailable`; do not claim prompt isolation or token
reduction. Unknown capability is unavailable, not inferred.

## Verification ownership

RD runs focused development checks for changed units, affected integration
surfaces, important error paths, and directly related regressions. For one
unchanged normal M/L final candidate, independent QA is the canonical owner of
the complete default `./bin/vibe verify . --format json` run and executes it
exactly once, plus applicable task-specific scenarios.

A later complete default run is allowed only when prior evidence failed, was
blocked, malformed, partial, stale or otherwise invalid; a post-upgrade,
release, or other specialized gate independently requires it; or shared
candidate-defining state changed. Record the rerun reason and candidate state.
Checks against different candidate states or specialized gates are not duplicate
verification. Static contracts and distribution tests prove only their encoded
behavior; without comparable host telemetry they do not prove live isolation or
a token, cost, or percentage reduction.

Apply the size-aware readiness rules in
`.vibe/core/technical-decision-readiness.md`. A shaped requirement is not by
itself implementation-ready.

## Lifecycle

Use the phases that apply; do not manufacture empty artifacts for inapplicable phases.

1. **Shape** — goal, users, scope, non-goals, acceptance criteria, open decisions.
2. **Design** — flow, states, accessibility, responsiveness, and visual constraints when user experience changes.
3. **Technical decision readiness** — before the first code edit, scan size and risk, resolve or cite durable decisions, complete required review, and confirm the gate under `.vibe/core/technical-decision-readiness.md`.
4. **Plan** — affected areas, accepted technical boundaries, risks, migrations, and verification strategy.
5. **Implement** — minimal coherent change with appropriate tests and documentation; reopen readiness if a new durable/high-risk choice appears.
6. **Verify** — map acceptance criteria and accepted technical boundaries to observed evidence and record limitations.
7. **Close** — summarize the result, update durable context only when the project truth changed, list follow-ups, and silently check whether evidence exposed a reusable Vibe Kit gap. Use `vibe-feedback-flow` only when its threshold is met; do not generate ceremonial feedback.

## Role boundaries

- **PM:** owns what, why, users, scope, observable behavior, and acceptance; identifies but does not decide technical questions.
- **UX:** owns user flow and interface behavior; does not silently expand product scope.
- **Tech Lead:** owns durable architecture, alternatives, trade-offs, technical boundaries, migration, recovery, and compatibility; authors or independently reviews decision evidence without editing implementation code.
- **Orchestrator:** owns trigger detection, role handoff, evidence checks, and readiness-gate confirmation; does not invent technical decisions or answer material product choices.
- **RD:** owns local implementation planning and implementation inside accepted technical boundaries; does not waive readiness or self-certify product acceptance.
- **QA:** owns independent verification of acceptance and the accepted decision boundary; does not replace the pre-implementation gate or silently patch failures it is evaluating.
- **Investigator:** owns reproduction and root-cause evidence; separates observation from hypothesis and fix.

The user decides a technical option only when it changes product scope,
observable behavior, risk or cost commitments, irreversible state, or external
compatibility. See `.vibe/core/technical-decision-readiness.md` for detailed
authority, review, and fallback-host rules.

## Evidence contract

Completion reports should state:

- what changed;
- which acceptance criteria were verified and how;
- commands or scenarios run and their results;
- checks not run and why;
- known limitations or follow-ups.

## Upgrade takeover

Vibe Kit version changes use the host-orchestrated lifecycle in the installed, framework-managed `AGENT_INSTALL.md` and `agent-install.json`. The CLI owns offline materialization, diagnostics, configured check execution, installed-contract authentication, and structural `validate-takeover`; it never authenticates host receipts or derives runtime activation/readiness. Preserve one owner for an unfinished goal across same-task reload, automatic successor handoff, or the portable manual new-task fallback. Only a structurally valid result plus positive target-content activation evidence permits onboarding adaptation and target-rule re-evaluation. Current repository Codex metadata claims manual fallback only unless a running host supplies a conforming live receipt.
