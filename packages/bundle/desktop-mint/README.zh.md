# `@deepseek-ai/dsh-desktop-mint`

[English](README.md) | 中文

这个仅携带 patch 的 Bundle 是 DSH Desktop Mint 的 DSH 功能选择来源。`desktop-mint` Profile 会在 `dsh-base` 和 `dsh-web-app` 之后应用它，而 Profile 的用户 patch 仍位于更后，因此可以覆盖产品默认值。该 Bundle 不包含功能实现，也不公开运行时服务。

[`cordis.patch.yml`](cordis.patch.yml) 挂载可复用的 `@deepseek-ai/dsh-client-ui-session-notifications` 插件，并设置 `defaultMode: background`。共享 `web` Profile 既不挂载该条目，也不继承 Mint 的默认值。未来由 Mint 选择的 DSH 功能会以独立插件形式加入这个 patch；原生应用、更新器、安装器、窗口、菜单和后端进程生命周期仍由 [`apps/desktop`](../../../apps/desktop/README.zh.md) 管理。

[下游客户端产品层决策](../../../.agents/notes/implemented/architecture/2026-08-25-downstream-client-product-layer.zh.md)记录了放置依据。修改这个组合时使用 [dsh-mint-client-feature](../../../.agents/skills/dsh-mint-client-feature/SKILL.md)。

## 模型体验

无，因为这个 Bundle 当前只选择观察 Client 状态的系统 UI；它不会向模型请求贡献任何内容。

#### KV Cache 影响

无；被选择的通知插件既不组装也不发送 provider 请求。

## 已知限制与待办工作

- **这里不选择原生行为**——Electron 应用生命周期仍在 `apps/desktop`；需要原生权限的 DSH 插件必须使用类型化 provider，而不能导入 Electron。
