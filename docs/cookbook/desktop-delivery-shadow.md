# Inspect desktop updates without publishing

English | [中文](desktop-delivery-shadow.zh.md)

## Summary

The desktop delivery CLI lets a maintainer inspect upstream releases and validate unsigned desktop packages. Its reports identify blockers and the next action. They do not authorize publication or notify users. The [delivery decision](../decisions/20260908-desktop-delivery-shadow.md) owns the evidence requirements.

## Table of Contents

- [Inspect an offline release fixture](#inspect-an-offline-release-fixture)
- [Inspect upstream releases](#inspect-upstream-releases)
- [Interpret package evidence](#interpret-package-evidence)
- [Dev Note](#dev-note)

<a id="inspect-an-offline-release-fixture"></a>

## Inspect an offline release fixture

Start in a development checkout with dependencies installed. This command writes only the two requested temporary files:

```sh
pnpm run desktop:delivery discover --config .github/desktop-delivery/mint.json --lock .github/desktop-delivery/source-lock.json --fixture scripts/desktop-delivery/tests/fixtures/releases.json --out /private/tmp/dsh-shadow-discovery.json --summary /private/tmp/dsh-shadow-discovery.md
```

The fixture reports `State: next` and identifies `dsh-v0.1.2-alpha.4`. This is the next unrecorded release in that fixture, not a statement about the latest public release. Discovery does not merge upstream source. The maintainer reviews adoption separately.

<a id="inspect-upstream-releases"></a>

## Inspect upstream releases

The live command queries public GitHub release pages and resolves tags to commits:

```sh
pnpm run desktop:delivery discover --config .github/desktop-delivery/mint.json --lock .github/desktop-delivery/source-lock.json --out /private/tmp/dsh-shadow-live-discovery.json --summary /private/tmp/dsh-shadow-live-discovery.md
```

`next` identifies the next ordered adoption candidate; `current` means the complete observations contain no later candidate. `blocked` identifies incomplete retrieval or inconsistent release evidence. Correct that cause before explicitly rerunning. A network failure cannot establish that the application is current.

<a id="interpret-package-evidence"></a>

## Interpret package evidence

The [manual shadow workflow](../../.github/workflows/desktop-delivery-shadow.yml) provides discovery-only and unsigned-qualification modes. Qualification binds source versions to the dispatched checkout, builds DMGs on native arm64 and x64 runners, and combines their reports only when both pass. It uses the same CLI as local checks. Remote execution requires the workflow to be present on GitHub; local tests do not prove an Actions run succeeded.

The CLI's `candidate`, `smoke`, `artifact` and `combine` commands produce source, mounted-package and combined evidence. [Executable CLI tests](../../scripts/desktop-delivery/tests/delivery.spec.ts) provide complete fixture invocations. Local modified checkouts produce diagnostics with `qualificationEligible: false`. Every shadow report has `publicationEligible: false`, including a successful clean dual-architecture run.

Packaged backend smoke mounts the DMG read-only and uses temporary application data. It exercises Electron bootstrap, backend startup, authenticated local HTTP and cleanup. It does not replace an installed application. Developer ID signing, notarization, installed-client upgrades and notification delivery require separate acceptance.

<a id="dev-note"></a>

## Dev Note

None.
