---
name: vibe-design-flow
description: Design or revise a user flow, page, interaction, or visual behavior without implicitly committing to application implementation.
---

# Design flow

1. Read the relevant product and design context and inspect the current interface when it exists.
2. Confirm the user goal, entry point, successful outcome, constraints, and applicable acceptance criteria. Use `vibe_pm` only when these are materially unclear.
3. Use `vibe_ux` only for an identified independent design question. Each handoff
   names the role, bounded objective, current brief, relevant product/design
   context, applicable criteria, expected output, blockers, and limitations.
   Exclude full conversation history and unrelated files; missing evidence is
   requested or reported rather than invented. Define flow, information
   hierarchy, component behavior, loading/empty/success/error/disabled/permission
   states, accessibility, responsiveness, and existing-system consistency.
4. Produce the lightest useful artifact: work-item notes for a bounded change, or an updated durable design-system rule when it applies broadly.
5. Identify decisions needing user input and implementation implications, but do not edit application code unless the user also requests implementation.

When a visual prototype or image is requested, use the available design or image tooling and keep the written artifact as the behavioral source of truth.
