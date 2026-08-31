# Technical decision: Transactional upstream adoption and verified Mint publication

English | [中文](technical-decision.zh.md)

Status: Accepted

- Decision owner: Tech Lead (`release_redesign_author`)
- Decision date: 2026-08-31
- Review mode: independent-agent
- Review result: approved
- Governing proposal: [Transactional upstream adoption and verified desktop publication](../../../.agents/notes/proposed/process/2026-08-31-transactional-upstream-adoption-and-verified-desktop-publication.md)

## Decision

Adopt the governing proposal as the implementation boundary for replacing the current automatic upstream adoption and Mint desktop publication process. Implementation must preserve ordered public upstream Releases, unsigned-preview defaults, immutable desktop tags, existing signed-release and withdrawal requirements, and user-controlled installation.

The accepted boundary consists of a protected state ref with one finalizer identity, one integration PR and at most one blocker Issue per queue-head Release, separate Controller, State Finalizer, and Publisher Apps, single-use immutable validation receipts, secret-free candidate execution, artifact qualification before tag creation, isolated signing from trusted control-plane source, three-ref atomic source finalization, and draft-first publication followed by public artifact and provenance verification. An owner-authenticated activation record and expiring maintainer-signed policy receipt attest administrator-only configuration without granting runtime Apps Administration or Environments permission.

## Trigger coverage

This decision owns the new durable state schema and transition rules, source/publication ownership boundary, retry and recovery semantics, split GitHub App permissions and ruleset bypass, owner-authenticated policy-attestation protocol, validation-receipt protocol, pre-tag artifact identity, immutable tag behavior, signing-secret isolation, manual desktop-tag compatibility, and failure consistency. These are the technical-decision triggers identified in the work item.

No material product choice changes: users still receive Releases in upstream publication order; default artifacts remain unsigned previews until signing activation; publication does not install or downgrade an application; and a maintainer still decides semantic conflicts and withdrawal of an inconsistent public Release.

## Approval conditions

- A different Tech Lead reviews the exact governing proposal and this acceptance record.
- Any requested changes are persisted before approval.
- The workflow orchestrator confirms that no trigger, product decision, or blocker remains unresolved.
- Production workflow implementation starts only after the work-item gate becomes `implementation-ready`.

## Review

Independent Tech Lead `release_redesign_review` approved the exact persisted proposal on 2026-08-31 after requiring and verifying: enforceable Controller, State Finalizer, and Publisher identity separation; active ruleset and bootstrap preflight; a single-writer state ref; single-use immutable validation receipts; dual-architecture artifact qualification before tag creation; isolated secret-bearing signing; protected control-plane approval; complete conflict-PR and manual-tag lifecycles; and separate tag-creation and no-bypass immutability rules.

Implementation reopened this decision before shared code edits on 2026-08-31. GitHub omits `bypass_actors` from ruleset reads unless the caller has ruleset write access, and listing environment secret names requires `Environments: read`. The accepted three-App permission sets intentionally grant neither capability. The preflight identity and drift-detection boundary therefore requires a persisted amendment and a new independent approval before this decision can return to Accepted.

Independent Tech Lead `release_redesign_review` approved the exact persisted security-boundary amendment on 2026-08-31. The review verified least privilege, owner-authenticated bootstrap, deterministic policy drift and expiry, bounded rotation and recovery, fail-closed unconfigured behavior, and separate signed and unsigned secret boundaries.

The same independent reviewer approved the final persisted squash-authorization and receipt-renewal amendment after requiring a merge SHA distinct from the PR head and an exact domain-separated binary framing. The approved protocol now rejects ambiguous merge shapes and receipt rollback without relying on self-referential commit data.

## Preflight security-boundary amendment

The runtime identity count remains three. Neither a fourth Auditor App nor an expanded Finalizer receives Administration write: a credential able to edit a ruleset cannot independently audit its bypass actors. The Accepted architecture instead fixes the repository-owner bootstrap authority and activation protocol. The exact production signer key is introduced later in `.github/release-policy/activation.json` through a restricted PR. Activation binds repository identity, personal owner login and type, activation PR, rotation ordinal, signer public key and fingerprint, and prior activation during rotation; it never names its own commit or a renewable receipt. Until activation verifies, finalization, tag creation, and publication are blocked even though implementation and candidate validation may proceed with release policy `unconfigured`.

Implementation reopened the activation-proof portion on 2026-08-31 after proving that `activation.json` cannot contain the SHA of the commit whose tree includes that file. That hash self-reference has no constructible value. The amended protocol derives commit evidence from GitHub after merge: activation names its PR, while protected state and acceptance evidence record the derived merge SHA and policy-bundle digest.

Activation and receipt authorization use squash merge exclusively. Runtime requires the recorded PR to target `main` from the same repository, be merged by the current personal repository owner, and expose a non-null reachable merge SHA distinct from the PR head SHA whose GitHub verification is `valid`, committer is `web-flow`, parent count is one, tree equals the PR head tree, and parent-to-commit diff equals the complete paginated PR file list. A behind-base tree, merge commit, rebase, fast-forward, fork, external close, truncation, rename, deletion, or indeterminate shape is rejected. The merged-PR record authenticates owner authorization; GitHub commit verification separately authenticates platform commit integrity.

Initial activation changes exactly activation, receipt, and signature. Its receipt has sequence one, no predecessor, and the activation PR as authorization. Later receipt renewal changes exactly receipt and signature, leaves activation byte-identical to its squash commit, increments sequence by one, names its own PR, and links the exact prior receipt ID and derived receipt-bundle digest. Protected state stores activation rotation, PR, derived commit, digest and signer fingerprint separately from current receipt sequence, ID, derived length-framed bundle digest, PR, derived commit and expiry. It rejects skipped or lower sequence, same-sequence replacement, predecessor mismatch, and more than one pending renewal. Current receipt bytes must remain identical to the initial or renewal squash commit that authorized them.

Later unrelated commits are allowed only while both derived authorization commits remain ancestors and current policy bytes match them. Signer rotation increments activation, links prior protected activation and receipt state, preserves the global receipt sequence, and proves the new key. The prior key signs the canonical `rotation-statement` bytes under SSH namespace `dsh-mint-release-policy-rotation-v1`; the owner-authorized squash PR then changes activation, receipt, and receipt signature together. Loss of the prior key remains break-glass work requiring a reviewed amendment. Any ownership transfer, including transfer to an organization, invalidates activation and requires a fresh reviewed bootstrap amendment rather than routine rotation.

The exact bytes of `.github/release-policy/receipt.json` are signed with SSH namespace `dsh-mint-release-policy-v1`. The receipt expires within 30 days and records its ID, global sequence, authorization PR and predecessor, administrator-observed bypass actors and environment secret names, repository identity, ruleset IDs, targets, enforcement, conditions, rules, `updated_at`, App identities, installations and permissions, environment protections, protected workflow digests, and generator version. Its bundle SHA-256 input is the ASCII domain `dsh-mint-release-policy-receipt-bundle`, NUL, unsigned 32-bit big-endian version one, then receipt and signature in that order, each framed by unsigned 32-bit big-endian UTF-8 path length and path plus unsigned 64-bit big-endian raw-content length and unmodified bytes. Runtime preflight verifies both owner-authorized PRs and commits, exact current bytes, receipt chain, signature and digest, expiry, repository and executing App identity, workflow digests, and every runtime-visible ruleset field and `updated_at`. The signed receipt authenticates hidden fields; any graph, byte, sequence, visible-state, API, or expiry mismatch blocks before irreversible mutation as deterministic `policy-drift`. Copying an older receipt is rejected by protected monotonic state.

Signed publication statically limits workflows to the five attested Apple secret references and proves usability by non-empty consumption and existing signing, API, signature, and notarization checks without printing values. Unsigned jobs reference none. Receipt renewal follows the monotonic squash-PR chain after attested configuration changes and before expiry. Production activation additionally requires a zero-mutation verify-only run and records its URL, the activation and receipt PRs and derived commits, receipt sequence, identity and bundle digest, and applicable signing smoke as acceptance evidence.
