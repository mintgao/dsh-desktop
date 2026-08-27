---
name: vibe-implementation-flow
description: Implement an already specified requirement, design, or technical plan with focused tests and traceable evidence.
---

# Implementation flow

1. Read the governing brief, acceptance criteria, design notes, project rules, and relevant architecture.
2. Resolve contradictions before editing. Make reasonable local assumptions when they do not alter product scope, and record them.
3. Use one writer for shared application code. Delegate to `vibe_rd` when a bounded implementation worker is useful; exploration or specialist reviews may run independently.
4. Implement the smallest coherent change, including error paths, compatibility, and documentation affected by the behavior.
5. Run focused checks during development, then the relevant configured project checks with `./bin/vibe verify` when available.
6. Hand the completed change to `vibe_qa` for an independent pass on M/L work or elevated risk.

Report files changed, important decisions, verification evidence, checks not run, and remaining risks. Do not broaden the feature to satisfy unrelated cleanup preferences.
