# Observed Apple Silicon forward delivery

English | [中文](20260913-observed-forward-delivery.zh.md)

Status: Accepted

## Scope and authority

The [approved A-to-B scope](../work-items/20260911-desktop-update-path/forward-baseline-scope.json) and [Apple Silicon scope](20260913-mint-arm64-scope.md) govern this delivery. A is the authenticated unpublished 0.1.5-alpha.2.unsigned.1 baseline; B is 0.1.5-alpha.2.unsigned.2 with DSH 0.1.5-alpha.2, subject to unused-tag and version-order checks. Actual published predecessor and immutable catch-up assessment remain unchanged. Historical persisted-format changes remain true. This decision supersedes the Intel/hosted-Accessibility prerequisites in the [capability probe](20260913-forward-native-capability.md), not its retained diagnostic evidence or containment obligations.

Unsigned Desktop checks for releases and opens the browser. Acquisition verification, stopping the app, manual replacement and recovery are operator actions; this work adds no automatic installer or client-side download-integrity guarantee. The [reviewed publisher](20260908-desktop-reviewed-delivery.md) retains activation, exact source-lock finalization, immutable tags and explicit release-environment approval.

## Evidence owners

Protected CI owns exact source, component identities, arm64 packaging, native smoke and a complete build inventory. The operator owns a private installation and state roots, authenticated inputs and manual operations. QA records direct ordinary-desktop observations and their limits. A record reviewer does not claim personal observation. The validator checks fixed identities, required scenarios and recovery invariants. The maintainer signs off the exact local record through the existing protected publication plan. Local records are explicitly `maintainer-attested-local-observation`: hashes establish byte integrity and CI establishes build provenance, neither establishes that GUI actions occurred. The single maintainer may approve this limited evidence without a second GitHub maintainer.

## Build and final package

A forward assessment uses schema 2 and an explicit forward-policy descriptor; it cannot also carry legacy migration policy. Historical schema 1 retains its existing behavior. The forward policy pins A source/version/build archive/DMG/runtime identities, arm64, declared settings and the fixed scenario inventory. Unknown versions or conflicting evidence reject through one shared compatibility dispatcher used by producer, local consumer and publication.

The qualification workflow builds once from a clean finalized candidate and emits `build-receipt.json` with purpose `desktop-forward-build`, exact repository/distribution/config/candidate/source-lock/assessment/policy identities, workflow commit/run/attempt, B version/components and complete file descriptors. Its archive contains the DMG, native report, candidate, assessment, policy, notes and predecessor evidence. It contains no GUI qualification and cannot be published directly. Legacy assessments keep their existing migration branch.

After observing those exact bytes, a pure assembler creates schema-3 final manifest and package. It binds the build receipt, artifact inventory and local observation, with `publicDelivery: pending`; it contains no future mutation-run identity. The existing approved plan binds its digest and the actual mutation run. Public acceptance is a separate manifest-digest-bound receipt, never a rewrite of frozen qualification. Rebuilds or changed artifacts invalidate observation reuse.

## Local observation record

One versioned UTF-8 JSON document, at most 32 KiB decoded, records prepublication phase, arm64 host/OS/session and permission facts, observer identity/method and times, build-receipt digest, A/B artifact/runtime identities, declared private roots and same-path installation identity, fixed action/result/source/status entries and recovery/cleanup state. No arbitrary attachments, executable scripts, profile contents, credentials, raw logs or arbitrary screenshots enter the release package. Local-only supporting material is not described as publisher-verified input.

Every required scenario is present exactly once and passed: artifact identity; private-state/process ownership; normal A entry, settings, quit and reopen; quiescent complete pre-B backup; stopped same-path replacement; normal B version/UI/keyless operation/quit/reopen; declared setting retention; acquisition failure and retry; operator rejection of incorrect bytes; replacement permission refusal and recovery; incomplete-backup refusal and full recovery with observed normal A entry; owned process/mount cleanup. No not-applicable exemption is accepted. Exact prior A usability evidence may be referenced to avoid repeating a paid conversation. Failure exercises use separate private copies and do not fabricate notifications or claim product-automatic refusal for an operator decision.

## Publication integration

Forward promotion adds canonical base64 local-observation bytes and their SHA-256 to the existing mutation workflow. Inputs enter through environment variables, never shell interpolation. Decode strictly, enforce the size limit and reject malformed or mismatched inputs. Legacy operations need no observation; withdrawal and restoration reject unrelated new observation inputs.

The read-only plan phase authenticates the complete CI build archive and actual successful run, validates the local record, reassembles the proposed manifest and compares the requested exact digest. Its approval summary explicitly states that approval both accepts the exact local observation as limited manual acceptance and authorizes the named release operation. The existing mutation bundle and approved plan retain those bytes before the existing mint-publication environment approval. The execution phase rechecks the plan, run, environment and files.

Schema-3 publication compares only build-owned files to the CI archive; derived manifest and local observation are bound by the mutation bundle and approved plan. Restoration verifies the retained complete final package and reaffirms its original observation under a new restore approval without refreshing historical dates. Withdrawal retains narrow identity checks so missing observation evidence cannot prevent taking down a release. No specific B publication is authorized by this design; exact observation and outbound package remain subject to owner approval.

## Recovery and limits

Before replacement, stop all owned app/backend writers and verify complete A application and declared private-state backups. An unchanged A must reopen normally after failure. If files or data changed, stop writers, retain B-modified state separately, verify backup completeness, restore A and pre-B state, then observe A's ordinary launch, usable UI, retained settings and ordinary quit. Never launch A on B-modified data. Hash equality alone does not prove usable recovery.

Uncertain process ownership, unfinished LaunchServices submission or interrupted recovery blocks acceptance and preserves roots. Do not retry indefinitely, silently delete uncertain roots or infer stopped processes from an empty inventory while launch completion remains unresolved. After two unsuccessful corrections of one symptom, report evidence and stop that diagnostic path.

## Implementation and verification

Use three bounded modules: forward-evidence for fixed policy/observation validation, compatibility-evidence for version dispatch, and forward-package for build receipt and deterministic final assembly. Extend existing CLI, manifests, publisher and qualify/mutate workflows. No GUI runner, automatic installer or general recovery framework is introduced. Complete source review and substantive source-lock finalization before the single B build.

Tests retain legacy semantics and reject missing/duplicate/failed scenarios, masquerading CI observations, wrong identities or architecture, altered archive bytes, oversized input, missing restored-A observation, uncertain cleanup, inconsistent reassembly and changed approved records. A successful build without manual acceptance refuses publication. An explicitly approved preview may publish with public delivery pending. Retained restore and evidence-independent withdrawal receive dedicated regression coverage. Real prepublication and public A-to-B operations remain separate observed acceptance gates.
