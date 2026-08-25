# @deepseek-ai/dsh-client-ui-session-notifications

English | [中文](README.zh.md)

This dual-face client plugin sends one system notification when a top-level task and every uninterrupted subagent descendant stop running. Its browser half observes the authoritative `ctx.sessions.list` snapshot, establishes the first ready snapshot as a baseline, and reacts only to a later active-to-idle transition. A pending approval, question, or plan review suppresses the completion signal. Clicking a notification opens the root task through `ctx.sessions.open()` and focuses the existing window.

The plugin uses the standard Web Notifications API. An Electron renderer therefore reaches macOS Notification Center without a preload bridge or Agent-aware main-process code, while an ordinary browser uses its own notification implementation and permission policy. The system notification shows the task's display title and localized `Task finished` copy; it does not read transcript content.

The Host half registers `ui-session-notifications.mode` in the shared user-settings document. The General settings row owns the `off`, `background`, and `always` choices and the permission request. Config `defaultMode` selects the initial preference when no saved value exists and defaults to `off`; a product Bundle must choose another default explicitly. DSH Desktop Mint sets `background`, so a visible, focused Mint client does not duplicate its own completion chrome. Loopback clients persist the choice through the Host settings provider; remote browsers keep the usual process-local settings behavior.

The package is a single-purpose client plugin, not an Agent capability seam. It consumes the existing session service and settings and slot extension points, owns no Agent lifecycle, and adds no Electron IPC. Product enablement and defaults belong to a later Bundle layer: the shared Web Bundle does not mount this plugin, while the [`desktop-mint` Bundle](../../bundle/desktop-mint/README.md) does. The [downstream client product-layer decision](../../../.agents/notes/implemented/architecture/2026-08-25-downstream-client-product-layer.md) records that placement.

## Model Experience

None, as the plugin observes browser session state and presents system UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Disconnected completions are not reconstructed** — the first ready list after a browser starts or reconnects is a baseline, so a task that both starts and finishes while this client has no live state transition does not create a delayed notification.
- **Delivery follows the browser and operating system** — denied notification permission, Focus modes, and platform notification policy can suppress or defer presentation after DSH requests it.
