---
name: vibe-release
description: Plan, authorize, publish, and verify exact Vibe Kit v0.7.0 and v0.8.0 GitHub Pre-releases through offline intents and host-owned remote operations.
---

# Vibe Kit release

Use this Skill only for the Vibe Kit repository release lifecycle. The CLI stays
offline; GitHub authentication, network reads and writes belong to the Agent/host.

## Historical v0.7 profile

1. Confirm the accepted version, release kind and scope. For v0.7.0 the exact
   scope is repository `mintgao/vibe-kit`, annotated tag `v0.7.0`, one non-draft
   Pre-release, the exact five assets, public verification, then issues #1–#5.
2. Require an accepted clean commit, independent QA, all configured checks,
   Python 3.9 evidence, two byte-identical prerelease builds and successful
   `validate-release`. Freeze the release-note bytes and annotated-tag identity.
3. Read remote `main`, tag, Release and the complete asset list. Build the closed
   request and run `bin/vibe publication-plan --phase publish --request <json>
   --candidate <release-dir> --format json`. This command performs no network or
   writes. Present the exact intent digest and bind authorization to repository,
   version, operation set, intent digest and one host operation ID.
4. Under that authorization only, fast-forward `main` with the expected-old OID
   lease; create or confirm the exact annotated tag and Pre-release; then upload
   or confirm exactly `SHA256SUMS`, `release-manifest.json`, the direct ZIP,
   distribution ZIP and Plugin ZIP. Extra, duplicate or divergent state blocks.
   Never force, delete, replace or rewrite.
5. After every write, read back exact identity. A timeout or transport-unknown
   response is followed by read-back before retry. Retry only a positively absent
   natural-key object, at most once. Download and hash all five public assets.
6. Produce the closed sanitized receipt and run `bin/vibe validate-publication
   --intent <json> --receipt <json> --candidate <release-dir> --format json`.
   Structural validity does not authenticate GitHub; retain live public evidence.
7. Only after confirmed-complete publication and passed public verification,
   build the #1–#5 request and run `publication-plan --phase issue-closeout`.
   The request carries the exact five-item remote snapshot, ten ordered
   comment/close operations with their canonical snapshot preconditions, and the
   declarative non-destructive scope. Bind a separate executable closeout
   authorization to the exact intent digest, repository, issue set and two-operation
   allowlist before any write.
8. Before every closeout operation, reread issue state and all exact-marker
   comments. Reuse `open-exact`/`closed-exact`; never close before the exact comment
   is read back. After a definite or uncertain response, read back before retry.
   Retry only a positively absent natural key after attempt one, at most once, and
   read back again after attempt two. Conflict, permission denial or still-unknown
   state gets no retry and stops the current and all later operations. Resume the
   same intent from the first non-terminal operation without duplicating comments
   or closes.

## V0.8 profile

V0.8.0 is the separate closed schema-2 profile
`vibe-kit-v0.8.0-prerelease`; it must never enter the schema-1 Issue-closeout
branch. Require the accepted clean source commit, fresh independent
prepublication QA, canonical configured checks, actual CPython 3.9 evidence,
and two independent clean byte-identical prerelease builds from the same commit
and tree. Keep the complete release-gate evidence outside the source checkout.

Read complete paginated main/tag/Release/assets state and publicly hash every
existing asset. Extra, duplicate, divergent, incomplete or unhashable state
blocks before an intent digest exists. Run:

```text
bin/vibe publication-plan --phase publish --request <json> \
  --candidate <candidate-a> --comparison-candidate <candidate-b> \
  --release-gate-evidence <json> --format json
```

The plan and both candidates run on CPython 3.9 and perform no network or writes.
Obtain a later executable authorization bound to the exact six-operation intent
digest and one host operation ID. Apply expected-old-OID main CAS, annotated tag,
non-draft Pre-release and exactly five assets without force, move, delete,
replace, rewrite, promotion or any Issue operation. Read before every natural-key
write and after every response. A second write is permitted only after the first
read-back proves the kind-specific positive-absence state; permission denial,
divergence, failure, execution error or unknown state gets no retry. Preserve
the main/tag/Release and five child asset attempt ledgers for same-intent resume.

After authenticated read-back, canonical public downloads, nested checksum and
distribution validation, target `validate-release`, and all six exact public
smokes, run:

```text
bin/vibe validate-publication --intent <json> --authorization <json> \
  --receipt <json> --candidate <candidate-a> --format json
```

Only a later independent postpublication receipt with AC-1 through AC-12 all
passed permits “v0.8.0 published and verified.” Record platform immutability as
true, false or unknown. The causally later evidence commit is not part of the
publication operation set and `evidence_pushed=false` unless a separate future
task authorizes its exact CAS push.

Persist only allowlisted public facts and hashes in work-item evidence. Never put
tokens, headers, environment values, raw host output, hidden reasoning, goal text
or conversation content in an intent, receipt, release asset or issue comment.
Do not claim platform immutability, publisher signing, provenance, final product
acceptance or measured token reduction without corresponding evidence.
