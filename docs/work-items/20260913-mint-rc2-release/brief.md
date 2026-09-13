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

## Platform-selected optional dependencies

Release CI on Linux x64 and macOS arm64 with npm 11.19.0 rejects absent `@emnapi/runtime`; it is reachable only through platform-excluded optional WASM parents. Local npm 10 retains that orphan. Independent author evidence and review approve the platform-selection clarification in the governing decision. Earlier readiness and full verification do not authorize or verify this changed assembly checker.

The fix must use the frozen official dependency graph and the installation selection to distinguish valid platform-pruned optional descendants from missing required or selected packages. Preserve strict frozen identities and byte comparison of every installed official package. Cover nested resolution, shared required reachability, cycles, platform selectors including Linux libc, missing selected payloads and altered optional payloads. Do not accept every missing optional package or weaken startup receipt checks. No runtime package mutation, user-data migration or release protection change is authorized by this repair. One RD owns implementation; root owns the gate; independent Tech Lead author/reviewer and QA own their evidence. Re-finalize the corrected seed through the existing bot, then qualify the exact artifact.

<a id="technical-decision-readiness"></a>

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: npm 11 platform pruning changes assembly admission and optional-dependency integrity checks
- Decision owner: Tech Lead `assembly_architecture`
- Governing decision: [Versioned assembly](../../decisions/20260913-desktop-versioned-assembly.md), Frozen platform selection
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: independent reviewer `assembly_review` approved author `assembly_architecture`; proposal SHA256 `f5c17094da5afb13f6421f50097c546da053b39dcf9189612943648ba1018e19`, source `37e92ae15712b1826b764ba49c92bd2977dd4930`
- Material product decisions: none; keep the authorized unsigned arm64 release and one Desktop update
- Open blockers: none for implementation; real npm 10/11 installation, negative cases, independent final QA and exact CI artifact qualification remain release checks
- Gate: `implementation-ready`
- Gate owner: root workflow orchestrator
- Confirmed at: 2026-09-13T14:16:30Z, following independent review
- Confirmation basis: accepted platform clarification and independent approval; no unresolved material choice
- Readiness history: original assembly accepted; version-reader fixes approved; platform admission reopened after both CI platforms rejected a legitimately pruned transitive optional package

The isolated worktree has the older Vibe installation without the newer readiness document. This task applies the supplied readiness instructions and the existing assembly work-item record; it makes no framework activation claim.

## Evidence and recovery

Reuse [accepted local assembly evidence](../20260913-desktop-versioned-assembly/verification.md) only where source and artifact identities remain unchanged. New release metadata and public artifacts require their own checks. Never infer publication from a successful build or infer usable recovery from hashes alone.
