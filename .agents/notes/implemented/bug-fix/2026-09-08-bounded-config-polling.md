# Agent Note: Bounded configuration sampling

Status: implemented

English | [中文](2026-09-08-bounded-config-polling.zh.md)

## Problem

Native subscription startup can miss configuration creation after registration. Chokidar polling also leaves its initial asynchronous stat baseline implicit: under thread-pool contention, a post-registration creation can become that baseline and remain unseen.

## Decision

Exact configuration sampling owns and awaits the initial target stat, then compares bigint fingerprints through one non-overlapping timer. It performs no recurring directory scans or subscriptions. Explicit native mode and module watching retain their implementations. The [readiness decision](../../../../docs/decisions/20260908-config-watch-readiness.md) owns the evidence, supported options and persistent-ancestor condition.

Raw filesystem work, cleanup and sampling-error notification have separate completion ownership. Cleanup awaits raw I/O and admitted refreshes, while error listeners may await cleanup without a self-wait. Consecutive equivalent sampling errors deduplicate without replacing the last successful observation.

## Alternatives considered

**Chokidar polling readiness.** Its implicit initial baseline can absorb persistent changes after its ready event.

**Native startup reconciliation.** One scan cannot cover an operating-system subscription gap extending beyond that scan.

**Production sentinel writes.** A sentinel introduces unrelated filesystem writes and permission requirements.

## Consequences

Sampling observes persistent state rather than every intermediate edit. One target stat per cycle bounds recurring work independently of siblings; initial canonical resolution still traverses ancestors. Callback failures do not automatically retry refreshes. Vendor synchronization must preserve these baseline and disposal regressions until upstream provides equivalent behavior.
