# Exact configuration watcher readiness

English | [中文](20260908-config-watch-readiness.zh.md)

Status: Accepted

## Scope and evidence

This supporting correction serves desktop live profile-patch startup and [delivery verification](../work-items/20260908-desktop-reviewed-delivery/brief.md). Controlled finite thread-pool contention established a Chokidar polling readiness gap: a file created after registration was absorbed by the initial polling baseline, remaining unseen ten seconds after contention ended. Default Chokidar polling cannot establish the promised configuration readiness. The failed candidate is not release evidence.

## Own the polling baseline

For exact-config polling mode, replace Chokidar with one registration-owned target sampler. Do not run both implementations for one registration. Explicit native mode and module watching retain their implementations. Resolve aliases and duplicate identity through existing canonical-path logic, and register ownership before asynchronous setup.

Await an initial stat of the canonical target before resolving registration. Successful observations are absence or a fingerprint containing file identity, type, size, modification time and change time; use bigint timestamp fields. ENOENT and ENOTDIR while sampling the target mean absence, including missing components. Preserve initial ancestor-validation failures. Other initial I/O failures reject registration and clean up.

Record the initial observation and arm the scheduler before resolving. An initially present target admits the existing initial refresh once. Later differing observations admit refresh through the existing serialized/coalescing refreshConfig path; equal observations do not refresh. Persistent creation after registration is compared with an already-recorded absence. No native acknowledgment, sentinel, second startup scan or startup delay supplies readiness.

## Scheduling and configuration

Own one timer and at most one outstanding target sample per registration. Schedule the next sample only after the preceding sample settles. Slow I/O cannot accumulate reads; the interval controls cadence, not a wall-clock delivery deadline.

Resolve effective backend selection explicitly from the supported environment override, configured usePolling, then the corrected exact-config default. Validate effective options before setup. Use validated interval, including its supported environment override, with the existing 100 ms default. Exact-target sampling uses one uniform interval; binaryInterval remains a Chokidar option for paths still using that implementation. Module defaults remain unchanged.

Each recurring cycle performs one target-path stat, with no directory subscriptions or enumeration. Default scheduling permits at most ten recurring samples per second, subject to scheduling and I/O delay; initial setup is additional. Canonical path resolution incurs filesystem traversal. No negligible-CPU claim is made. Remove polling-only ancestor/filter machinery; retain native-path filtering and existing aliases. Initial-anchor removal remains outside verified recovery claims.

## Errors and disposal

Unexpected later sampling errors do not become absence or replace the last successful fingerprint. Report through existing configuration-failure semantics while preserving the last good application. Deduplicate consecutive equivalent sampling errors; later samples can observe recovery. Callback failures do not trigger automatic refresh retries.

Closing marks registration stopped before cancelling its timer. Await any initial or recurring in-flight sample, prevent late completion from admitting refresh, then drain already-admitted refresh work. Global HMR disposal uses the same close operation. Setup rejection, disposal during setup and ordinary disposal leave no timers or reads capable of late callbacks.

## Acceptance

Retain immediate single-creation regressions under both existing and missing parents, omitting backend selection. Hold the initial sample and prove registration remains unresolved; release absence, create once after registration, and observe refresh without fs.watch or fs.watchFile. Hold a recurring sample and prove reads cannot overlap. Dispose during initial and recurring samples and reject late admission. Cover initial existing files, add/change/unlink, replacement, aliases, missing components, errors and recovery.

Equivalent roots with zero and 100 unrelated siblings must have identical target-sampling counts, no directory polling and no owned work after disposal. Reverting baseline ownership must fail the controlled regression. Repeat focused concurrent host checks, then independent complete verification for the corrected candidate.

Replace the serialization fixture's fixed 250 ms assumption with observed second-refresh admission. Keep callback one blocked, prove the second refresh entered the queue, start disposal and prove it remains pending, then release callback one and retain the exact `['one', 'two']` observation assertion. This repairs fixture synchronization without weakening production disposal semantics.

## Ownership and removal

The reusable vendored HMR plugin owns the correction, with focused boot tests and consumer documentation. Keep a separate supporting commit and update [vendor modifications](../../vendor/README.md#local-modifications), preserving the upstream pin. Remove the local patch on a future synchronization only when upstream passes equivalent explicit-baseline, resource and lifecycle regressions. No upstream submission, module-watching redesign or public release is authorized by this decision.

## Separate I/O, cleanup and notification

Track raw filesystem operations separately from setup promises and error notification. Raw path resolution and sampling settle without cleanup, listener waits or disposal waits. Clear in-flight ownership before processing a result, then check stopped state before inserting a registration, admitting refresh, reporting errors or scheduling samples.

Initial failure rejects registration after idempotent cleanup. Cleanup may await raw I/O, never the setup promise invoking cleanup. Concurrent disposal shares one close operation. Disposal during canonical resolution marks setup stopped and awaits raw resolution; completion rejects setup without starting initial stat or inserting registration. Once canonical identity is known, reserve registration ownership before sampling.

Sampling-error notification starts only after the raw sample settles and is released. A listener may initiate and await HMR disposal. Close awaits raw I/O and admitted refreshes, but excludes sampling-error notification dispatch; service shutdown must preserve that exclusion. Track notification promises until settlement, contain rejections and remove settled reports. Already-started listeners may finish after closure, but cannot schedule sampling, admit refreshes or mutate registration state. This does not alter refresh-callback serialization.

Test initial stat rejection concurrent with disposal, an error listener awaiting disposal, closure during held canonical resolution, notification rejection containment after closure, and shared completion for concurrent close calls. Registration rejection and disposal must settle without self-await, later initial samples, registrations, timers or refresh admission.
