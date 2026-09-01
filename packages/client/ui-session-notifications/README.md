---
description: "Browser and Electron task-completion notifications derived from Session Controller and UI Session state."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-session-notifications

English | [中文](README.zh.md)

## Summary

This dual-face client plugin sends one system notification when a top-level task and every uninterrupted subagent descendant stop running. Its browser half observes the authoritative `ctx.sessions.list` snapshot and `ctx.uiSession.pendingInteractions` source, establishes the first ready snapshot as a baseline, and reacts only to a later active-to-idle transition. A pending approval, question, or plan review on the root or any uninterrupted subagent descendant suppresses the completion signal. Clicking a notification opens the root task through `ctx.sessions.open()` and focuses the existing window.

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

The plugin uses the standard Web Notifications API. An Electron renderer therefore reaches macOS Notification Center without a preload bridge or Agent-aware main-process code, while an ordinary browser uses its own notification implementation and permission policy. The system notification shows the task's display title and localized `Task finished` copy; it does not read transcript content.

The Host half registers `ui-session-notifications.mode` in the shared user-settings document. The General settings row owns the `off`, `background`, and `always` choices and the permission request. Host Config `defaultMode` selects the initial preference when no saved value exists and defaults to `off`; a product Bundle must choose another default explicitly. Browser boot rows carry package identity rather than Host Cordis config, so the Client half starts from the safe `off` fallback until its settings scope adopts the Host section. DSH Desktop Mint registers `background`, so a visible, focused Mint client does not duplicate its own completion chrome. Loopback clients persist the choice through the Host settings provider; remote browsers keep the usual process-local settings behavior.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package is a single-purpose client plugin, not an Agent capability seam. It consumes the existing Session Controller, UI Session, settings, and slot extension points, owns no Agent lifecycle, and adds no Electron IPC. Product enablement and defaults belong to a later Bundle layer: the shared Web Bundle does not mount this plugin, while the [`desktop-mint` Bundle](../../bundle/desktop-mint/README.md) does. The [downstream client product-layer decision](../../../.agents/notes/implemented/architecture/2026-08-25-downstream-client-product-layer.md) records that placement.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Desktop Mint Bundle](../../bundle/desktop-mint/README.md) — product enablement and notification default.
- [UI Session](../ui-session/README.md) — pending interaction projection consumed by this plugin.
- [Session Controller](../../api/session-controller/README.md) — authoritative session list and navigation operations.

-----

<a id="model-experience"></a>
## Model Experience

None, as the plugin observes browser session state and presents system UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Disconnected completions are not reconstructed** — the first ready list after a browser starts or reconnects is a baseline, so a task that both starts and finishes while this client has no live state transition does not create a delayed notification.
- **Delivery follows the browser and operating system** — denied notification permission, Focus modes, and platform notification policy can suppress or defer presentation after DSH requests it.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
