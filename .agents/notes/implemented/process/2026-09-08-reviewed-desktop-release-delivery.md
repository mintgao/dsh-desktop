# Agent Note: Reviewed whole-client desktop delivery

Status: implemented

English | [中文](2026-09-08-reviewed-desktop-release-delivery.zh.md)

## Problem

Desktop users need a single update even when only the embedded DSH runtime changes. Maintainers need to inspect adoption, diagnose failed qualification and resume delivery without reconstructing authority across several custom GitHub Apps and expiring policy receipts. Package startup alone cannot establish installed-payload integrity or safe publication.

## Decision

The [reviewed delivery tooling](../../../../scripts/desktop-delivery/cli.ts) separates discovery, reviewable source preparation, native qualification and explicit release mutation. Mint identifiers remain [distribution configuration](../../../../.github/desktop-delivery/mint.json). Runtime behavior follows the [downstream policy](../../../../docs/context/downstream-policy.md); delivery infrastructure does not introduce an Agent or Session implementation.

The [operational decision](../../../../docs/decisions/20260908-desktop-reviewed-delivery.md) defines the accepted administrator trust model, source and delivery predecessor relationships, immutable manifest approval, bounded bootstrap exception and recovery obligations. GitHub protections and maintainer approval supply authority. A file digest identifies approved bytes; it is not an independent authorization issuer.

The initially inactive replacement preserves the [shadow workflow](2026-09-08-desktop-delivery-shadow.md) and requires verified migration before activating writers. The [legacy adoption record](2026-08-27-automatic-upstream-desktop-releases.md) remains relevant to retained workflows and migration evidence; its automatic-publication policy does not govern the replacement. The [unsigned-preview](2026-08-27-pre-certificate-unsigned-desktop-previews.md) and [signed identity](2026-08-25-signed-public-desktop-releases.md) decisions retain their trust limitations. These are partial overlaps, not complete supersession.

Every Release PATCH retains the approved immutable tag, explicit visibility and prerelease status. Completion requires a same-ID reread of the intended state, including the probe body. Identity drift stops further writes and requires maintainer recovery; retries cannot retarget a conflicting release.

## Alternatives considered

**Keep separate custom Apps and signed policy receipts.** They separate credentials but add operational dependencies that this maintainer cannot reliably complete. The owner accepts GitHub administrators as the trust root and retains review, artifact verification and explicit release approval.

**Publish each upstream release automatically.** Upstream availability does not prove desktop compatibility or user-data compatibility. Reviewed adoption and qualified publication remain separate maintainer choices.

**Expose separate runtime and desktop update channels to users.** This makes users manage component compatibility. A single desktop version carries the qualified composition while exact component identities remain available for diagnostics.

## Consequences

Desktop-only fixes preserve upstream identity; adopting a new upstream preserves its order. Withdrawal removes discovery without remotely downgrading installed applications. Restore requires retained exact bytes. A copied installation proves neither existing-user data migration nor signed native capabilities.

The [verification record](../../../../docs/work-items/20260908-desktop-reviewed-delivery/verification.md) owns executed evidence and remaining limits. The [rollout prerequisites](../../../../docs/work-items/20260908-desktop-reviewed-delivery/rollout.md) preserve the unresolved adoption and identify live controls. Local checks do not prove remote activation, notification receipt or public release delivery.
