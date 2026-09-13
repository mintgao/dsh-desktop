# Agent Note: Observed forward desktop delivery

Status: implemented

English | [中文](2026-09-13-observed-forward-delivery.zh.md)

## Problem

A protected build proves source and packaged bytes but cannot prove that an operator replaced an application, retained settings or recovered a usable installation. Combining those claims under one CI qualification record conceals their different owners and makes unavailable hosted GUI permissions a release-tooling dependency.

## Decision

The [Accepted decision](../../../../docs/decisions/20260913-observed-forward-delivery.md) separates a CI build receipt from explicitly maintainer-attested local observation. [Forward evidence](../../../../scripts/desktop-delivery/forward-evidence.ts) validates the fixed scenario protocol and bounded manual record; [compatibility evidence](../../../../scripts/desktop-delivery/compatibility-evidence.ts) dispatches historical and forward assessments consistently; [forward package](../../../../scripts/desktop-delivery/forward-package.ts) assembles immutable schema-3 metadata without a future mutation-run identity. Distribution-specific baseline and target identities remain in a committed policy bound by the source assessment.

The build archive has a fixed CI-owned file set. The manifest and local observation are derived only after that build, retained by the existing mutation bundle and bound by the approved plan. Protected-environment approval explicitly accepts the exact limited local observation and authorizes the named operation. Hashes establish bytes, not personal observation. Restoration reaffirms the original record; withdrawal remains possible without observation payloads. Public delivery stays pending in frozen qualification and has separate manifest-bound acceptance.

A public schema-3 final manifest can be the predecessor of a later catch-up. The baseline reader accepts numeric final-manifest schemas 1/2/3 while retaining public-tip, exact downloaded metadata and tag identity checks. A build receipt or shadow report cannot establish a delivered predecessor.

## Alternatives considered

Treating native smoke as GUI acceptance would certify unobserved actions. Requiring a hosted GUI runner adds an unavailable execution prerequisite without improving local witness attribution. Adding an installer or generic recovery service changes product behavior and ownership beyond this release procedure. Reusing historical migration reports for a different A-to-B baseline confuses source history with observed installation recovery.

## Consequences

The source validator can reject missing scenarios, conflicting identities and incomplete declared recovery but cannot prove an operator's statements. The maintainer accepts that limited evidence explicitly. Local backups, profile contents, credentials and raw diagnostics remain outside the release package. A different build requires a new observation. Historical format changes, assessment bytes and legacy manifest behavior remain intact.

Focused tests exercise the real source-finalized manifest producer, deterministic assembly, strict input decoding, CI archive comparison, retained restoration and evidence-independent withdrawal. They use synthetic records and establish parser/publication behavior, not actual GUI acceptance. Ordinary private-desktop observation and subsequent public acquisition remain required separate gates; [the operator procedure](../../../../docs/cookbook/observed-forward-delivery.md) owns those steps.
