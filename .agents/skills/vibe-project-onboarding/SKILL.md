---
name: vibe-project-onboarding
description: Build or refresh durable product, architecture, design, and command context when Vibe Kit is first adopted or the repository has materially changed.
---

# Project onboarding

Create an accurate baseline without refactoring the application.

1. Read `.vibe/project.yaml`, `.vibe/project-rules.md`, the README, dependency manifests, build configuration, tests, and entry points.
2. Inspect the repository broadly enough to distinguish observed facts from guesses. For a large repository, delegate bounded read-only exploration by subsystem and synthesize the results.
3. Update only the durable context that can be supported by evidence:
   - `docs/context/product.md` for users, problems, current capabilities, boundaries, and unknowns;
   - `docs/context/architecture.md` for runtime structure, dependencies, data flow, commands, and constraints;
   - `docs/context/design-system.md` when a user interface or established design language exists;
   - `.vibe/project.yaml` for verified project commands and stack facts.
4. Preserve existing documentation and call out contradictions instead of overwriting uncertain information.
5. Report gaps that require product knowledge or credentials. Do not manufacture history or retroactively create work items.
