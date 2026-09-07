# Technical decision: Preserve managed instructions in project documentation checks

English | [中文](managed-instruction-doc-gates.zh.md)

Status: Accepted

- Decision owner: Tech Lead (`inspector_ack_decision_author`)
- Decision date: 2026-09-04
- Review mode: independent-agent
- Review result: approved
- Review evidence: Independent Tech Lead `inspector_ack_decision_review` required doctor-compatible universal-newline hashing and independent failure coverage for every ownership predicate, then approved the exact amended decision.
- Governing decision: [Documentation structure, tiers, and budgets](../../../.agents/notes/implemented/process/2026-07-04-doc-tiers-and-budgets.md)

## Trigger coverage

This decision changes the shared Markdown-wrap checker and the enforced root-document ceiling. It owns checker scope, managed-region identification, malformed-marker behavior, masking semantics, compatibility with future Vibe Kit installations, and recovery after a managed-block size change.

No product behavior changes. The decision preserves the installed Vibe Kit instructions byte-for-byte while retaining the repository documentation rules for project-owned prose.

## Decision

### Managed-region qualification

Only the region in root `AGENTS.md` delimited by the exact full lines `<!-- vibe-kit:managed:start -->` and `<!-- vibe-kit:managed:end -->` can qualify. The markers and every line between them belong to the region. Identical marker text in any other file receives no exemption.

`verify-md-wrap` masks that region only when `.vibe/manifest.json` establishes ownership: `activation.paths` must contain `AGENTS.md#managed-block`; `activation.path_hashes["AGENTS.md#managed-block"]` and `agents_block_hash` must be lowercase SHA-256 values and equal each other; and the digest of the installed region must equal both manifest values. Digest input matches `bin/vibe` exactly: strictly decode UTF-8, apply Python universal-newline normalization (`CRLF` and lone `CR` become `LF`), take the substring from the start marker's first character through the end marker's last character without surrounding line terminators, encode that normalized substring as UTF-8, and compute SHA-256. `bin/vibe doctor` remains the installation-level authority and independently checks the complete activation set.

When the manifest claims the region, root `AGENTS.md` must contain exactly one start marker and one end marker in that order. A missing, duplicate, unmatched, reversed, non-exact, or hash-mismatched marker fails with a diagnostic naming `AGENTS.md` and the violated rule. Marker text without matching manifest ownership also fails instead of creating a project-controlled exclusion. If neither ownership nor markers exist, the complete file is checked normally.

No other Vibe-managed file or Markdown region is excluded.

### Wrap masking

Before Markdown parsing, `verify-md-wrap` maps the qualified normalized span back to the original decoded source and replaces every non-newline character in that original region with spaces. It preserves `LF`, `CRLF`, or lone `CR` terminators and the total line count, so violations after the region retain their original `AGENTS.md` line numbers. The checker reads but never rewrites the source.

All prose before and after the region remains subject to the existing one-physical-line rule. Every other checked Markdown file remains unchanged in scope. VitePress masking, symlink deduplication, and archived-note exclusion retain their current behavior.

### Whole-file budget

`verify-doc-budgets` does not mask or subtract the managed region. It continues to count whitespace-delimited tokens across the complete root `AGENTS.md`, matching its existing `wc -w` semantics.

Set the explicit `AGENTS.md` ceiling in `scripts/doc-budgets.manifest.json` to `2858`, derived from the unchanged activated file's current whole-file count: 909 managed words plus 1,949 project-owned words. Root `AGENTS.md` remains above its 1,950-word target, so `2858` is a frozen ceiling with no 5% headroom. Any added word fails until project-owned prose is condensed or relocated, or a later authenticated Vibe Kit upgrade requires another reviewed ceiling decision.

A future managed-block reduction receives the ordinary ratchet review and lowers the ceiling when appropriate. A future managed-block increase fails the budget check; implementation first confirms a healthy upgraded installation and then freezes the ceiling at the new whole-file count if the document remains above target. The checker never derives or raises the ceiling dynamically.

### Ownership and recovery

Vibe Kit owns the managed block and its activation hashes. The repository owns `verify-md-wrap`, `verify-doc-budgets`, their tests, and the explicit ceiling. Implementation must not edit `AGENTS.md`, `.vibe/manifest.json`, or any managed-block byte.

Malformed ownership evidence fails closed. Recovery restores the installed block or manifest through the supported Vibe Kit installation path and confirms it with `./bin/vibe doctor . --format json`; bypassing markers, weakening the checker, or locally updating activation hashes is not recovery.

This work uses local files only and performs no network access.

## Compatibility classification

The installation is internally healthy: Vibe doctor verifies the exact 0.8.0 bytes and activation set. The documentation failure is a Vibe Kit integration gap because the 0.8.0 managed payload violates this repository's established wrapping policy and its upgrade changed the root ceiling to 2,800 although the resulting whole file has 2,858 words. The project-owned checker needs a local integration rule because the repository cannot modify the authenticated payload. Upstream Vibe Kit feedback remains separate from this implementation and does not block AC-8.

## Alternatives considered

**Reformat the managed block.** Rejected because any byte change invalidates the activated installation.

**Exclude all of `AGENTS.md` or every marked region.** Rejected because either option permits project-owned prose defects to bypass the shared checker.

**Trust markers or manifest metadata without hashing the extracted bytes.** Rejected because project prose or stale ownership metadata could create an unauthenticated exclusion.

**Subtract managed words from the budget.** Rejected because the governing decision requires whole-file `wc -w` semantics and one explicit enforcement frontier.

**Give the raised ceiling 5% headroom.** Rejected because above-target documents freeze at current usage; headroom applies only after reaching the target.

**Patch the bundled Vibe Kit payload locally.** Rejected because this repository does not own those bytes and the change would break installation integrity.

## Implementation boundaries

Implementation is limited to managed-region recognition, hash verification, and line-preserving masking in `scripts/verify-md-wrap.ts`; focused checker tests; the `AGENTS.md` ceiling in `scripts/doc-budgets.manifest.json`; and current-state documentation of the exception.

Update `docs/AGENTS.md` to state that the exact authenticated root managed region is exempt only from physical-line wrapping while remaining inside the whole-file word budget. Update the English and Chinese governing Agent Note with the same ownership, frozen-ceiling, failure, and recovery facts. Do not alter the managed root block or its manifest hashes.

## Required verification

- Focused tests prove that one authenticated root region is masked and violations after it retain original line numbers.
- Tests reject invalid, missing, or non-object manifest JSON; missing or wrong-type `activation.paths` and `activation.path_hashes`; absent, uppercase, nonhex, or unequal hashes; and actual managed-content mismatches.
- Tests reject missing, unmatched, duplicate, reversed, and non-exact markers.
- Tests prove CRLF and LF managed regions authenticate to the same digest, that the hashed span excludes surrounding line terminators, and that masking preserves original line numbers for both line-ending forms.
- Tests prove that identical markers in another Markdown file do not suppress its hard-wrap violation.
- Tests prove that project-owned prose before and after the managed region remains checked.
- Budget tests prove that managed-region words remain counted and that the explicit root ceiling is exactly `2858`.
- `pnpm run verify-md-wrap`, `pnpm run verify-doc-budgets`, and `pnpm run test:docs` pass.
- `./bin/vibe doctor . --format json` remains healthy with the same managed-block and activation hashes and reports no writes or network use.
- Documentation synchronization and `git diff --check` pass.

## Approval condition

Checker edits remain blocked until a different Tech Lead approves this exact persisted decision and the workflow orchestrator records the accepted decision, approved review, no open blockers, and `Gate: implementation-ready`.
