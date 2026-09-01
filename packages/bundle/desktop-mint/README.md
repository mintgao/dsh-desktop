---
description: "The patch-only product bundle that selects DSH features and defaults for DSH Desktop Mint."
kind: "package-bundle"
---

# `@deepseek-ai/dsh-desktop-mint`

English | [中文](README.zh.md)

## Summary

This patch-only Bundle is the DSH feature-selection source for DSH Desktop Mint. The `desktop-mint` Profile applies it after `dsh-base` and `dsh-web-app`, while the Profile's user patch remains later and can override product defaults. The Bundle contains no feature implementation and exposes no runtime service.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Run `dsh --profile desktop-mint` through the desktop application. The Profile composes `dsh-base`, `dsh-web-app`, this Bundle, and then the user patch.

[`cordis.patch.yml`](cordis.patch.yml) mounts the reusable `@deepseek-ai/dsh-client-ui-session-notifications` plugin with `defaultMode: background`. The shared `web` Profile neither mounts that row nor inherits the Mint default. Future Mint-selected DSH features join this patch as independent plugins; native application, updater, installer, window, menu, and backend-process lifecycle remain in [`apps/desktop`](../../../apps/desktop/README.md).

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Bundle owns one static patch and no runtime glue. Its package entry and invariant companion exist for ordinary bundle packaging and diagnostics; the patch is the complete product-selection surface.

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Mint-owned feature selection and product defaults |
| [`src/index.ts`](src/index.ts) | Bundle package entry |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion for the static composition |
| [`tests/desktop-mint.spec.ts`](tests/desktop-mint.spec.ts) | Exact patch and package-dependency checks |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Downstream client product layer](../../../.agents/notes/implemented/architecture/2026-08-25-downstream-client-product-layer.md) — placement rationale.
- [Mint client feature workflow](../../../.agents/skills/dsh-mint-client-feature/SKILL.md) — required workflow for composition changes.
- [Desktop application](../../../apps/desktop/README.md) — native lifecycle and packaging owner.

-----

<a id="model-experience"></a>

## Model Experience

None, as this Bundle currently selects only system UI that observes Client state; it contributes nothing to a model request.

#### KV Cache effect

None; the selected notification plugin neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Native behavior is not selected here** — Electron application lifecycle remains in `apps/desktop`; a DSH plugin that needs native privilege requires a typed provider instead of importing Electron.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
