---
name: vibe-feedback-flow
description: Identify evidence-backed Vibe Kit workflow, CLI, agent, documentation, or compatibility gaps during real project work and turn them into local, sanitized, deduplicated feedback that is submitted only after exact-payload approval.
---

# Feedback flow

Use this flow after the primary task is complete when one of these signals exists:

- a Vibe CLI command, managed Skill, Agent rule, or ownership boundary failed or contradicted another rule;
- completing the task required bypassing a missing or incorrect Vibe Kit mechanism;
- the same workflow friction repeated, or QA/Investigator produced evidence of a framework gap;
- the user explicitly asks to improve or report Vibe Kit itself.

Do not create feedback for an ordinary product bug, a one-off environment problem, an unsupported preference, or a hypothesis without a concrete trigger and impact. For M/L Close, perform the classification silently; if there is no qualifying signal, do nothing.

## Create a local candidate

1. Separate observed behavior, expected behavior, impact, hypothesis, confidence, and proposed iteration. Do not call a hypothesis a confirmed defect.
2. Generalize the reproduction. Never copy raw code, logs, prompts, conversations, environment values, repository URLs, customer/company names, secrets, or security-vulnerability details.
3. Run `./bin/vibe feedback draft` with concise fields, or pass an equivalent JSON object through `--input`. The CLI sanitizes common identifiers, blocks obvious secrets, and reuses an existing fingerprint.
4. If the CLI reports a reused or dismissed fingerprint, do not manufacture a second report. A dismissed report resurfaces only when severity or evidence materially changes.

A candidate needs, at minimum: `kind`, `component`, `title`, `summary`, `expected`, `observed`, `impact`, `workflow`, `agent-role`, `severity`, `confidence`, and `trigger`. Add a generalized reproduction, sanitized evidence, hypothesis, and proposal when they are known; leave uncertainty explicit rather than inventing detail.

Local candidates live under `.vibe/local/feedback/`, which is ignored by its own `.gitignore`. Feedback is non-blocking: draft, check, or submit failure never changes the result of the primary task.

## Review and optional GitHub submission

1. Run `./bin/vibe feedback review <report-id> [--repo owner/repository]`. This is local-only and prints the exact title/body plus a review hash when a repository is known.
2. If no repository is configured, show the local preview but do not ask for submission approval. Ask the user to choose a destination only when they want GitHub reporting, then rerun review with that repository to obtain the exact hash.
3. Show the target, privacy status, dedupe marker, complete payload, and review hash to the user. Ask once whether to submit that exact report ID, repository, and hash.
4. Do not treat an installed Plugin, configured token, prior approval, or permission to finish the primary task as submission consent. Permission to run remote `feedback check` authorizes only the read-only duplicate lookup; it never authorizes `submit`. Approve each report ID, repository, and review hash separately.
5. After explicit approval, run `./bin/vibe feedback submit <report-id> --repo owner/repository --confirm <review-hash>`. The CLI checks remote duplicates immediately before create and records the existing or new Issue URL.
6. If remote status is unavailable or uncertain, preserve the local report and stop. Retry with the same reviewed payload; the CLI searches by fingerprint before another create.

Use `feedback dismiss <report-id> --reason <sanitized-reason>` only when the user explicitly rejects or asks to ignore a candidate. “Later”, “not now”, or no response leaves it `review-ready`. Security-sensitive findings must use an approved private disclosure channel; ordinary feedback has no force-submit bypass.
