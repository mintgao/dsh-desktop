# Release policy attestation

English | [中文](README.zh.md)

This directory owns the owner-authenticated policy files that gate irreversible upstream-adoption actions. Finalization, tag creation, and publication fail closed until these files describe an active and current policy.

## Files

- `activation.json` is the durable bootstrap record. The checked-in default stays `{"schemaVersion":1,"status":"unconfigured"}` until a restricted activation PR introduces the real signer identity.
- `receipt.json` and `receipt.json.sig` are not committed by default. Production activation adds them through the same repository and a squash-merged owner-authorized PR.
- `receipt.example.json` is the schema-shaped example for local tests and operator review. It never carries live IDs, secrets, or signer material.
- `generator.example.json` is the input shape for the live-fact generator. Copy it outside the committed tree, replace every placeholder, and point each `privateKeyPath` at an operator-held App key outside the repository; the config never contains key material.

## Authorization and renewal rules

- Activation and receipt renewal use squash merge only. Runtime rejects merge commits, rebases, fast-forwards, fork PRs, and any merge where `mergeSha == headSha` or the merged tree differs from the PR head tree.
- The receipt bundle digest uses the exact domain-separated framing from the accepted decision: ASCII domain, NUL, u32be version, then receipt and signature entries framed by u32be path length and u64be content length.
- The activation record pins the signer public key and rotation chain. Renewing a receipt may advance only the next sequence for the current activation; same-sequence replacement and protected-state rollback are rejected.
- The signer key is immutable for one activation. Key rotation is a separate activation change whose `previousActivation` record exactly links protected activation and receipt state. The prior key signs the canonical `rotation-statement` bytes under `dsh-mint-release-policy-rotation-v1`; the owner-authorized rotation PR then changes activation, receipt, and receipt signature together.

## Operator checklist

1. Prepare the restricted PR that changes only `activation.json`, `receipt.json`, and `receipt.json.sig` for the first activation, or only `receipt.json` and `receipt.json.sig` for a renewal.
2. With an administrator-scoped `GH_TOKEN` and the three outside-repository App key paths in the config, run `pnpm exec tsx scripts/upstream-adoption/generate-policy-bundle.ts <config> .github/release-policy/activation.json .github/release-policy/receipt.json`. The generator creates only short-lived local App JWTs, verifies each App installation and its access to this repository, and reads the current repository, protected environments, secret names, rulesets including bypass actors, and workflow bytes. It never uploads or persists App key values and never reads GitHub secret values. Delete transient local App-key copies after generation; a later renewal may use newly generated temporary App keys without changing the runtime keys stored in protected environments.
3. Sign the exact receipt bytes with `ssh-keygen -Y sign -f <private-key> -n dsh-mint-release-policy-v1 .github/release-policy/receipt.json`. Keep the private key outside the repository and GitHub environments.
   For a rotation, first generate the approval payload with `pnpm exec tsx scripts/upstream-adoption/cli.ts rotation-statement .github/release-policy/activation.json <output>`, sign those exact bytes with the prior key and namespace `dsh-mint-release-policy-rotation-v1`, then store the armored signature in `previousActivation.approvalSignature` and regenerate the bundle.
4. Merge the restricted PR with GitHub squash merge as the current personal repository owner. For initial activation, create the PR first with placeholders so its number can be bound, then replace and sign the generated files before approval.
5. Run `Verify Mint release policy` to confirm repository identity, App permissions, workflow digests, ruleset observations, signature validity, and monotonic protected policy state without mutating anything.
6. Treat any expiry, digest drift, ruleset change, environment secret-name change, or App permission drift as a `policy-drift` blocker. Refresh the receipt before resuming irreversible automation.

`mint-finalizer` contains only `MINT_FINALIZER_APP_PRIVATE_KEY`, and `mint-publication` contains only `MINT_PUBLISHER_APP_PRIVATE_KEY`. `mint-signing` may be empty in unsigned-preview mode; when signed mode is enabled it may contain only the five Apple credential names enforced by the verifier. Every environment admits protected branches only.

These files document administrative truth that the runtime Apps cannot read directly from GitHub with least-privilege permissions. Keep them exact, small, and reviewable.
