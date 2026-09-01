---
description: "为 DSH Desktop Mint 选择 DSH 功能与默认值的纯 patch 产品 bundle。"
kind: "package-bundle"
---

# `@deepseek-ai/dsh-desktop-mint`

[English](README.md) | 中文

## 概述

这个仅携带 patch 的 Bundle 是 DSH Desktop Mint 的 DSH 功能选择来源。`desktop-mint` Profile 会在 `dsh-base` 和 `dsh-web-app` 之后应用它，而 Profile 的用户 patch 仍位于更后，因此可以覆盖产品默认值。该 Bundle 不包含功能实现，也不公开运行时服务。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

通过桌面应用运行 `dsh --profile desktop-mint`。该 Profile 依次组合 `dsh-base`、`dsh-web-app`、本 Bundle，最后应用用户 patch。

[`cordis.patch.yml`](cordis.patch.yml) 挂载可复用的 `@deepseek-ai/dsh-client-ui-session-notifications` 插件，并设置 `defaultMode: background`。共享 `web` Profile 既不挂载该条目，也不继承 Mint 的默认值。未来由 Mint 选择的 DSH 功能会以独立插件形式加入这个 patch；原生应用、更新器、安装器、窗口、菜单和后端进程生命周期仍由 [`apps/desktop`](../../../apps/desktop/README.zh.md) 管理。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

该 Bundle 只持有一个静态 patch，不包含运行时粘合代码。包入口与不变式伴生插件用于普通 bundle 打包和诊断；patch 是完整的产品选择表层。

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Mint 持有的功能选择与产品默认值 |
| [`src/index.ts`](src/index.ts) | Bundle 包入口 |
| [`src/invariant.ts`](src/invariant.ts) | 静态组合的不变式伴生插件 |
| [`tests/desktop-mint.spec.ts`](tests/desktop-mint.spec.ts) | 精确 patch 与包依赖检查 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [下游客户端产品层](../../../.agents/notes/implemented/architecture/2026-08-25-downstream-client-product-layer.zh.md)——放置依据。
- [Mint 客户端功能工作流](../../../.agents/skills/dsh-mint-client-feature/SKILL.md)——修改组合时必须遵循的工作流。
- [桌面应用](../../../apps/desktop/README.zh.md)——原生生命周期与打包责任方。

-----

<a id="model-experience"></a>

## 模型体验

无，因为这个 Bundle 当前只选择观察 Client 状态的系统 UI；它不会向模型请求贡献任何内容。

#### KV Cache 影响

无；被选择的通知插件既不组装也不发送 provider 请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **这里不选择原生行为**——Electron 应用生命周期仍在 `apps/desktop`；需要原生权限的 DSH 插件必须使用类型化 provider，而不能导入 Electron。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
