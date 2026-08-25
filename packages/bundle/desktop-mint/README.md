# `@deepseek-ai/dsh-desktop-mint`

English | [中文](README.zh.md)

This patch-only Bundle is the DSH feature-selection source for DSH Desktop Mint. The `desktop-mint` Profile applies it after `dsh-base` and `dsh-web-app`, while the Profile's user patch remains later and can override product defaults. The Bundle contains no feature implementation and exposes no runtime service.

[`cordis.patch.yml`](cordis.patch.yml) mounts the reusable `@deepseek-ai/dsh-client-ui-session-notifications` plugin with `defaultMode: background`. The shared `web` Profile neither mounts that row nor inherits the Mint default. Future Mint-selected DSH features join this patch as independent plugins; native application, updater, installer, window, menu, and backend-process lifecycle remain in [`apps/desktop`](../../../apps/desktop/README.md).

The [downstream client product-layer decision](../../../.agents/notes/implemented/architecture/2026-08-25-downstream-client-product-layer.md) owns the placement rationale. Use [dsh-mint-client-feature](../../../.agents/skills/dsh-mint-client-feature/SKILL.md) for changes to this composition.

## Model Experience

None, as this Bundle currently selects only system UI that observes Client state; it contributes nothing to a model request.

#### KV Cache effect

None; the selected notification plugin neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Native behavior is not selected here** — Electron application lifecycle remains in `apps/desktop`; a DSH plugin that needs native privilege requires a typed provider instead of importing Electron.
