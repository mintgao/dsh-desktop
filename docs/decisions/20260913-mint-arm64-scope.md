# Apple Silicon Mint distribution

English | [中文](20260913-mint-arm64-scope.zh.md)

Status: Accepted

## Scope

The [owner-approved architecture scope](../work-items/20260911-desktop-update-path/architecture-scope.json) limits future Mint builds, qualification and release assets to arm64. Intel support is deferred. Generic DSH architecture utilities and exact historical releases, baselines, manifests, receipts and migration policies retain their existing content.

Upon acceptance, this decision supersedes current Mint both-architecture requirements in the [reviewed delivery decision](20260908-desktop-reviewed-delivery.md), [update delivery decision](20260908-desktop-update-delivery.md), and the current-release Intel prerequisite in the [capability decision](20260913-forward-native-capability.md). Historical qualification remains evidence only for its recorded scope. Ordinary arm64 A-to-B update, settings preservation and recovery remain required.

## Implementation

Mint configuration requires exactly arm64. The qualification, source-CI package smoke and shadow workflows use arm64 matrices and matching native, installer and conditional migration-report arguments. The Intel-only capability workflow is retired from ordinary dispatch. Current Mint build instructions and package scripts offer arm64; generic x64 types and tooling remain available to other distributions.

Existing config-driven manifest checks retain exact architecture membership, report counts, uniqueness, byte digests and native evidence requirements. No schema, updater, data format or manual-evidence trust change belongs to this scope. One implementation writer owns configuration, workflow assembly, tests and affected documentation.

## Activation and history

Changing the parsed configuration invalidates existing candidate and activation bindings. Production writers remain blocked until authenticated configuration revalidation; editing recorded hashes to bypass checks is forbidden. Existing full-B migration and acceptance blockers remain separate.

Historical two-architecture manifests fail validation against the arm64-only configuration. Their bytes remain intact; restoration requires separately reviewed historical-policy reconciliation. Preserving history does not establish restoration readiness. Before production cutover, reverting the configuration and workflow changes restores prior policy inputs subject to normal activation checks. After publication, any rollback requires lineage and activation reconciliation without rewriting assets or downgrading user data.

## Verification

Exercise the actual manifest producer and consumer with valid arm64-only evidence and reject missing, duplicated, x64-only or additional x64 evidence. Retain generic two-architecture coverage. Check workflow matrices and assembled filenames against configuration, including changed-format report arguments. Prove stale activation and historical two-architecture manifests remain refused under changed configuration, and preserve historical descriptors byte-for-byte. Independent QA owns the unchanged final candidate verification. No native run or publication is implied by source checks.

## Alternatives

Changing only configuration leaves workflow inputs inconsistent. Removing generic x64 support exceeds Mint scope. Weakening manifest or activation checks would admit mismatched evidence. Historical restore redesign is deferred because it changes a separate trust decision.
