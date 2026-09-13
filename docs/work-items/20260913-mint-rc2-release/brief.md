# Publish Mint RC.2 and synchronize handoff

English | [中文](brief.zh.md)

- Size: L
- Status: preparing
- Target: `0.1.5-rc.2.unsigned.1`, subject to live unused-version validation

## Authorization and scope

The owner authorizes publication, GitHub homepage and machine-handoff synchronization, replacement of the installed local Desktop after publication verification, and cleanup of obsolete interim application artifacts. Preserve user data, the original dirty development checkout and retained release evidence. Cleanup covers positively identified intermediate builds; it excludes source changes, published releases and unrelated applications.

## Acceptance

- Record the versioned assembly and extension ownership requirements at their existing policy owner; connect project entry instructions and handoff documentation.
- Finalize exact RC.2 source ancestry through the existing bot process, qualify the exact unsigned arm64 release, and verify its public tag, manifest, asset bytes and installation.
- Synchronize both homepage languages only after publication; prepare the copy beforehand. Handoff identifies authoritative source, versioned inputs, build and publication procedures, local data and recovery ownership without credentials or private machine state.
- Stop the installed application, preserve a complete recovery copy, install the authenticated public artifact, then observe ordinary startup and retained user data. Remove only owned obsolete artifacts after success and retain one recovery copy until replacement acceptance.

## Technical readiness

The [accepted assembly decision](../../decisions/20260913-desktop-versioned-assembly.md) and its [independent review](../20260913-desktop-versioned-assembly/technical-review.md) govern the same component identities and native boundaries. The release preparation CLI still groups Mint packages into the official source version check; direct execution reproduced rejection of independent Mint versions. Correct that bounded consumer to honor the accepted component split, retain rejection of mismatched official packages, and add a real-CLI fixture with independent Mint versions. No new runtime architecture is proposed. Gate: implementation-ready for this local consistency fix; workflow orchestrator owns the gate and sole writer, with independent QA retained. Existing host specialist thread-limit prevents resuming the prior RD.

## Workspace version consistency

Actual adoption preparation passes the release-family check but the workspace manifest checker still forces both exact Mint directories to the official root version. Apply the accepted independent-version rule to that checker as well, sharing the existing exact directory inventory. Preserve every other manifest/publication check and the official-package version rejection. Test different Mint versions through the real manifest checker and reject the same package name in another directory. No runtime or release authority changes. Independent Tech Lead approved this bounded applicability. Gate owner: root; implementation-ready. The changed checker invalidates the previous full candidate verification; run final QA after the fix.

## Evidence and recovery

Reuse [accepted local assembly evidence](../20260913-desktop-versioned-assembly/verification.md) only where source and artifact identities remain unchanged. New release metadata and public artifacts require their own checks. Never infer publication from a successful build or infer usable recovery from hashes alone.
