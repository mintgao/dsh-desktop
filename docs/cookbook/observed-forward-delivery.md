# Cookbook: observed forward desktop delivery

English | [中文](observed-forward-delivery.zh.md)

## Summary

This procedure combines a protected arm64 build with limited, maintainer-attested local observation. The [decision](../decisions/20260913-observed-forward-delivery.md) defines acceptance; a CI build is not GUI qualification. The operator owns manual acquisition, replacement and recovery. The application checks for releases and opens a browser; it does not install or verify downloaded bytes automatically.

## Table of Contents

- [Build once](#build-once)
- [Observe the exact bytes](#observe-the-exact-bytes)
- [Assemble and approve](#assemble-and-approve)
- [Recovery and reuse](#recovery-and-reuse)

<a id="build-once"></a>

## Build once

Finalize the reviewed source through the existing bot source-lock process. Keep the actual published predecessor and catch-up assessment unchanged. The [committed forward policy](../../.github/desktop-delivery/forward-update-policy.json) pins the authenticated unpublished A, B version, arm64, required scenarios and declared setting. Its digest is bound by schema-2 data compatibility; historical format changes remain true. Check that B's tag is unused and its version is newer before authorizing the single protected qualification build.

The qualification workflow emits `build-receipt.json`, native smoke evidence and the complete build-owned file set. Preserve the downloaded archive unchanged. A different build receipt, DMG or runtime invalidates observation reuse. No local GUI record belongs in the CI build archive.

<a id="observe-the-exact-bytes"></a>

## Observe the exact bytes

Use a private test installation at one fixed path, declared private data roots and an empty workspace. This is ordinary desktop testing with ownership and containment checks, not a kernel isolation claim. Authenticate A against the policy and B against the build receipt. Do not rebuild A. Observe the fixed scenarios exported by [forward-evidence](../../scripts/desktop-delivery/forward-evidence.ts): ordinary A use, settings and reopen; complete quiescent backup; stopped replacement; ordinary B version, UI, keyless operation and reopen; settings retention; acquisition retry, incorrect-byte operator refusal, permission refusal, incomplete-backup refusal, usable A recovery and cleanup. A previous exact A usability observation may be referenced in the action/result text; do not repeat a paid conversation or imply a record reviewer witnessed it.

Record one UTF-8 JSON document of at most 32 KiB. Its required fields are `schemaVersion: 1`, `purpose: maintainer-attested-local-observation`, `phase: prepublication`, `architecture: arm64`, host/observer facts and times, `buildReceiptDigest`, exact `baseline` and `target` identities, private roots, same-path installation facts, declared settings, scenarios, recovery and cleanup. The validator defines the exact nested fields. Every scenario occurs once with an explicit action, result, `source: direct-local-observation` and `status: passed`. Record actual facts; never synthesize passes, claim automatic product refusal for an operator decision, or substitute hash equality for observed usable recovery.

Keep complete backups and supporting diagnostics locally. The release record contains no profile contents, credentials, raw logs, scripts, attachments or arbitrary screenshots. Mint declares the actually observed Light theme. Do not invent a notification setting or manufacture an update to exercise reminder preferences.

<a id="assemble-and-approve"></a>

## Assemble and approve

Pass the document's canonical base64 and decoded SHA256 through `FORWARD_OBSERVATION_BASE64` and `FORWARD_OBSERVATION_SHA256`. Never interpolate observation text into shell commands. The `assemble-forward` CLI operation reads the complete build directory and writes `local-observation.json` and deterministic `manifest.json`; its `--operation` is `promote`. Run through the existing delivery CLI with `--config`, `--directory` and an external `--out` status file. A build directory containing either derived file is rejected; use an untouched copy of the authenticated build archive for assembly.

Review the manifest digest, then supply the same bytes and digest to the existing mutation workflow inputs `local_observation_base64`, `local_observation_sha256` and `manifest_digest`. Its read-only plan authenticates the successful CI run and fixed build-owned archive, reassembles the package and retains the exact local record. Approval through `mint-publication` both accepts that record as limited manual acceptance and authorizes the named operation. It does not attest that CI observed the GUI. No specific release is authorized by this procedure.

The schema-3 manifest remains `publicDelivery: pending`. After publication, record actual public acquisition and A-to-B acceptance separately, bound to that manifest digest; never rewrite the frozen qualification record. Withdrawal accepts no new observation and needs only narrow retained identity evidence. Restore accepts no replacement observation: it verifies the complete retained package and reaffirms the original record under a new approval, including its original dates.

<a id="recovery-and-reuse"></a>

## Recovery and reuse

Before replacement, stop all owned writers and verify complete application and private-state backups. If B changes files or state, stop writers, retain B state separately, restore A and pre-B state from verified backups, then observe A's ordinary usable entry, retained setting and quit. Never start A on B-modified state. Uncertain process ownership, unfinished launch submission or incomplete recovery blocks acceptance and preserves roots; after two unsuccessful corrections of one symptom, stop and report evidence.

Other DSH desktop developers reuse the same three release modules with a reviewed committed policy and assessment descriptor. Distribution-specific versions, sources, artifacts and theme value stay in policy. The supported mode is arm64 manual observation; this procedure provides no GUI runner, automatic installer or generic recovery framework. Legacy schema-1/2 manifests retain their historical validation path.
