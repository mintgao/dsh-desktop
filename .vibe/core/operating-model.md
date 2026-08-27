# Vibe operating model

## Principles

- Use the lightest process that provides enough confidence for the task.
- Treat roles as independent perspectives, not ceremonial steps.
- Keep product intent, implementation decisions, and verification evidence traceable.
- Prefer executable checks over assurances in prose.
- Ask the user only when a missing choice would materially change scope, behavior, risk, or cost.

## Work sizes

### S — small and explicit

A local, low-risk change with clear expected behavior, such as copy, a small style adjustment, or an obvious defect with a known cause.

- A separate work-item folder is optional.
- One implementation pass and focused verification are normally enough.
- Do not spawn multiple agents unless the task has a specific risk that benefits from independent review.

### M — bounded feature or uncertain change

A change that affects a user flow, component contract, API behavior, or more than one closely related file, or whose acceptance criteria need shaping.

- Create a work item.
- Establish acceptance criteria before implementation.
- Include UX analysis for user-facing behavior.
- Use independent QA verification after implementation.

### L — cross-cutting or high risk

A change involving multiple subsystems, migrations, authentication, permissions, payments, sensitive data, irreversible state, or substantial ambiguity.

- Create a work item and explicit plan.
- Record important architectural decisions in `docs/decisions/`.
- Include rollback or recovery considerations.
- Use independent specialist reviews and QA evidence.

## Lifecycle

Use the phases that apply; do not manufacture empty artifacts for inapplicable phases.

1. **Shape** — goal, users, scope, non-goals, acceptance criteria, open decisions.
2. **Design** — flow, states, accessibility, responsiveness, and visual constraints when user experience changes.
3. **Plan** — affected areas, approach, risks, migrations, and verification strategy.
4. **Implement** — minimal coherent change with appropriate tests and documentation.
5. **Verify** — map acceptance criteria to observed evidence and record limitations.
6. **Close** — summarize the result, update durable context only when the project truth changed, list follow-ups, and silently check whether evidence exposed a reusable Vibe Kit gap. Use `vibe-feedback-flow` only when its threshold is met; do not generate ceremonial feedback.

## Role boundaries

- **PM:** owns problem framing and acceptance criteria; does not prescribe implementation.
- **UX:** owns user flow and interface behavior; does not silently expand product scope.
- **RD:** owns technical decisions and implementation; does not self-certify product acceptance.
- **QA:** owns independent verification; does not silently patch failures it is evaluating.
- **Investigator:** owns reproduction and root-cause evidence; separates observation from hypothesis and fix.

## Evidence contract

Completion reports should state:

- what changed;
- which acceptance criteria were verified and how;
- commands or scenarios run and their results;
- checks not run and why;
- known limitations or follow-ups.
