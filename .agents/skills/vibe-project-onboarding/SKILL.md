---
name: vibe-project-onboarding
description: Build or refresh durable product, architecture, design, and command context when Vibe Kit is first adopted or the repository has materially changed.
---

# Project onboarding

Create an accurate baseline without refactoring the application. This is an internal readiness workflow: users do not need to name it. Preserve the ordinary development request that triggered onboarding and resume that request after readiness is established.

When onboarding follows a Vibe Kit upgrade, begin only in the task with positive target-version activation evidence under `AGENT_INSTALL.md`. An apply or doctor receipt from the source task is insufficient. The activated task owns adaptation, final verification, target-rule re-evaluation, and resumption; the source task must not duplicate that work.

1. Read `.vibe/project.yaml`, `.vibe/project-rules.md`, the README, dependency manifests, build configuration, tests, and entry points.
2. Inspect the repository broadly enough to distinguish observed facts from
   guesses. For a large repository, use bounded read-only exploration only for a
   named subsystem question. Supply the role, objective, exact evidence paths,
   ownership boundary, and expected findings; exclude full conversation history
   and unrelated files. Missing evidence is reported, not invented.
3. Update only the durable context that can be supported by evidence:
   - `docs/context/product.md` for users, problems, current capabilities, boundaries, and unknowns;
   - `docs/context/architecture.md` for runtime structure, dependencies, data flow, commands, and constraints;
   - `docs/context/design-system.md` when a user interface or established design language exists;
   - `.vibe/project.yaml` for verified project commands and stack facts.
4. Preserve existing documentation and call out contradictions instead of overwriting uncertain information.
5. Report gaps that require product knowledge or credentials. Do not manufacture history or retroactively create work items.
6. Only after the evidence-backed context and verified commands are updated, write `.vibe/onboarding.json` with `schema_version: 1`, `status: "complete"`, an `updated_at` date, and a concise list of evidence paths. Never mark readiness complete while material contradictions or required repository inspection remain unresolved.
7. Run the installed target doctor and default `./bin/vibe verify . --format json`. Treat every configured failed/skipped check and every unknown or blocking diagnostic as a blocker; an all-unconfigured matrix may pass but must be described accurately.
8. Re-evaluate the preserved original request under the active rules, then resume it through the appropriate Vibe workflow. Do not ask the user to repeat it or to invoke another Skill. For maintenance-only work, record re-evaluation as not applicable and do not invent application work.
