# Initial upgrade readiness assessment

English | [中文](technical-decision.zh.md)

## Status and authority

Historical proposal by Tech Lead `upgrade_decision`, independently reviewed by `upgrade_readiness_review`. Its ordering question is resolved by the [owner decision](brief.md#owner-decision--2026-09-10) and [Accepted catch-up ADR](../../decisions/20260910-desktop-catch-up-delivery.md). This assessment does not override the current Phase A gate or authorize Phase B implementation.

## Evidence and constraints

The reviewed baseline is `132ab869cbb800e1bf236efbaabfd4668fb3c67b`; the target is `b2e3b2a0125854567a4a5fcba75782e42fe84901`, tagged `dsh-v0.1.5-alpha.2`. The [release inventory](target-release-chain.json) records seven intervening identities. Later upstream releases do not change the approved target.

The initial read-only merge preview reported 35 conflicts, including seven translation-pairing records whose merge-driver runtime was unavailable. That count does not represent 35 independently assessed semantic conflicts. Upstream native desktop ownership and V3 session migration require separate review; wholesale ours/theirs resolution is not authorized.

The target preserves historical session meaning through immutable adjacent migration edges. V0 and V1 reach V3 through preceding frozen edges. Validation must use fixtures or disposable copies, never the user's real DSH home. An older application's files do not prove that it can read newer data.

## Alternatives and resolution

The original immediate-successor policy required separate source adoptions and a complete desktop delivery chain. Source preparation and public delivery were distinct requirements; hypothetical local locks could not satisfy protected-main ancestry or publication lineage.

The owner selected explicit catch-up: one reviewed source-adoption PR and one desktop delivery, with complete upstream ancestry, range review and direct-upgrade evidence. The tooling prerequisite remains separate from actual source adoption. The [native assessment](native-assessment.md) records the outstanding Phase B questions.
