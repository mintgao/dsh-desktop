# Agent Note: Validate existing seeded queries without fresh-creation rules

Status: implemented

English | [中文](2026-09-10-seeded-session-query.zh.md)

## Problem

Exact query validation passes a complete existing child history into fresh Session creation. A child with its own events exceeds its inherited prefix and is refused even after successful migration and resume.

## Decision

The implementation follows the [Accepted query decision](../../../../docs/decisions/20260910-seeded-session-query-restoration.md) in the reusable session-query package: lossless JSON validation copies, detached restoration validation and unchanged loaded snapshots as the public result. Keep the valid fresh-fork invariant and storage ownership unchanged.

## Alternatives considered

Weakening the constructor, truncating events or clearing inheritance would hide corruption. Returning restoration-added events changes an exact read. A general validation service is unnecessary for this bounded repair.

## Testing

Tests cover live/cold seeded queries, detached result ownership, no lifecycle or stored-byte changes, strict invalid-input refusal and the actual delivered-child migration/restart/restore chain. The work item owns implementation readiness and qualification limits.

## Consequences

Restoration does not independently establish lossless JSON input and can add an in-memory end-seed marker. Preserve both checks explicitly in the query owner. Track the reusable fix for separately authorized upstream contribution.
