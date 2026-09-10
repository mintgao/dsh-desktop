# Review a catch-up desktop delivery

English | [中文](catch-up-desktop-delivery.zh.md)

## Summary

An explicit catch-up adopts several reviewed upstream releases in one PR and delivers one desktop update. The [accepted decision](../decisions/20260910-desktop-catch-up-delivery.md) governs source history, compatibility and publication authority. Merge and publication remain separate approvals.

## Select and prepare

The `adoption-plan` command requires `--kind catch-up`, `--target-tag`, `--target-commit`, `--assessment` and `--baseline`, in addition to the ordinary configuration, source lock, protected base, desktop version and output arguments. The assessment path is repository-relative. A complete `--fixture` can exercise selection offline; a fixture does not authorize bot finalization. [CLI integration tests](../../scripts/desktop-delivery/tests/operations.spec.ts) execute the complete argument set against a temporary Git repository and read transport.

The target must follow at least two selected releases beyond the source baseline. The source baseline must equal the verified public desktop tip or activated legacy baseline. Planning retains all recorded observations; the adopted interval stops at the explicit target. Scheduled discovery continues to report the immediate successor. Missing identities, changed tags, duplicate observations or an unpublished source advancement block preparation.

`adoption-prepare` retains its isolated checkout on conflicts. The reviewed assessment and all referenced files must exist in that checkout before seed creation; an absent file blocks until the maintainer supplies the reviewed bytes and reruns preparation. Every selected upstream commit must be an ancestor of the target. Candidate checks run without write credentials. The proposed lock remains separate from the seed.

The maintainer reviews and pushes the exact seed. Trusted protected-main tooling runs `adoption-apply`, independently reads complete live observations and exact seed files, and creates the bot's sole-parent, lock-only finalization. A matching retry does not write. Human corrections require a new reviewed seed; changed range or assessment bytes require a new plan.

## Assessment fields

The version-1 assessment has `schemaVersion`, `from`, `to`, `releases`, `edges` and `directUpgrade`. Each release uses the lock's exact `id`, `tag`, `commit` and `publishedAt`. `releases` is the ordered interval after `from` through `to`. `edges` contains one scenario for each consecutive release pair; `directUpgrade` separately covers the installed baseline to the target.

Each scenario has `from`, `to`, `status`, `persistedFormatsChanged`, `unsupportedDowngrades`, `compatibilityFindings` and `evidenceReferences`. Status is `verified`, `blocked` or `unverified`. Findings and downgrade limitations are nonempty prose arrays. Each evidence reference contains a repository-relative `path` and the exact file's `sha256`. References are regular leaf files; self-references, source-lock references, path traversal, symlinks and conflicting digests reject.

Preparation preserves truthful blocked, unverified or format-changing assessments. Production qualification requires every edge and the direct upgrade to be verified and rejects persisted-format changes until a separately reviewed migration qualification is installed. Edge coverage or a clean installation cannot establish direct-upgrade compatibility. Use disposable copies; never assess against the user's real home.

## Qualification and recovery

New source finalizations use schema 3 and always include `catchUp`, either null or the exact range and assessment identity. Historical schemas 1 and 2 remain readable where supported. Same-upstream fixes, replacements and human refinalizations retain existing catch-up provenance. Ordinary advancement emits null and retains immediate-successor semantics.

New production manifests use schema 2 and include the normalized lock's `catchUp`. Their exact file inventory includes the assessment and its leaves as flat `catch-up-<path-sha256>.bin` assets. Validators rehash these assets and compare manifest/lock evidence. Missing, extra or altered range assets block qualification and publication. Historical schema-1 manifests cannot grant catch-up authority.

Promotion planning, tag/draft preparation and publication independently validate the live interval and delivery tip. A later release beyond the pinned target does not expand adoption. Withdrawal can hide an exactly identified damaged release; restore requires its retained exact bytes and ancestry, without creating a new adoption. Automatic downgrade is unsupported.

## Trusted rollout

Install the tooling in a desktop-kind policy PR at the current upstream identity using the old trusted path. After owner merge places compatible tools on protected main, prepare the actual catch-up PR. This tooling prerequisite publishes no intermediate desktop release. Candidate tools and historical bootstrap exceptions cannot finalize a catch-up.
