# Agent Note: 插件式 harness 之上的下游客户端产品层

Status: implemented

[English](2026-08-25-downstream-client-product-layer.md) | 中文

## 问题

DSH Desktop Mint 把 DeepSeek Harness 变成面向用户的 macOS 产品。产品迭代很容易在 Electron 中累积会话策略、在共享壳中加入一次性 UI 代码，或者为展示需求增加 Agent Loop 分支。这些归属会形成一套仍依赖 DSH、却不再遵循插件组合模型的第二架构。现有的 [Electron 桌面壳](../feature/2026-08-24-electron-desktop-shell.zh.md)持有进程与窗口生命周期，[Mint 桌面下游开发](../process/2026-08-24-mint-desktop-downstream-development.zh.md)持有仓库与发布策略；它们都没有决定产品功能应该放在哪一层。

## 决策

DSH 是插件式 harness 与可复用平台。DSH Desktop Mint 是下游产品发行版：由经过审查的 DSH 插件组合、产品默认值、品牌、macOS 原生宿主与发布策略组成。该产品不会 fork agent 运行时，也不会定义一套平行客户端框架。产品差异来自它选择了哪些插件以及如何配置这些插件。

功能应该归入持有其事实与副作用的最窄平面：

- Agent preset 组合单个 agent 的模型可见工具、提示词段、策略与提供方。所有模型可见内容仍必须能够从会话日志重建。
- Host 插件持有特权 I/O、持久数据、传输端点与进程级服务。它通过类型化服务、事件、Remote 端点或其他已有文档的扩展点对外提供能力，而不是把实现泄漏给客户端。
- 客户端插件持有浏览器状态、用户交互、展示策略、设置行与 slot 贡献。每项独立产品功能都是可独立 dispose 的包，并注册自己的设置界面。
- 原生壳适配操作系统能力，持有应用、窗口、菜单、更新与进程生命周期。它不推断 agent 或会话语义。需要原生权限的能力通过窄桥接或提供方进入，再由插件消费。

`desktop-mint` Profile 会在自己的用户 patch 之前依次组合 `dsh-base`、共享 Web Bundle 和 `@deepseek-ai/dsh-desktop-mint`。Mint Bundle 是 DSH 功能选择与产品默认值的唯一来源；它只包含 patch 行，不包含功能实现。后续产品版本通过修改该 Bundle 增减功能，不需要改变 Profile 元组；用户仍可增加更后的 Profile patch 或额外 Bundle。

任务完成通知是这条规则的第一个显式应用。`@deepseek-ai/dsh-client-ui-session-notifications` 观察公开的会话列表快照，注册自己的常规设置行，并使用 renderer 的 Web Notifications API。Electron 把该标准 API 映射到 macOS 通知中心，因此主进程不增加任务生命周期分支或 renderer bridge。公开应用提供 Electron 43 执行这项映射所需的 Developer ID 签名身份；该发布义务由[公开桌面版签名](../process/2026-08-25-signed-public-desktop-releases.zh.md)持有。插件保持可复用，在组合没有给出产品选择时默认关闭；只有 Mint Bundle 会挂载它并设置 `defaultMode: background`。Host 设置持有这个产品默认值，因为浏览器启动行不会投影 Host Cordis 配置；Client 配置缺省时先安全地关闭通知，再由设置 scope 接纳 Host 区段。通用 `web` Profile 不继承该选择。

每项待开发产品功能都先建立一份简短功能记录，写明用户结果、所属平面、真源、现有扩展点、新包或提供方、设置与持久性、模型可见影响、权限或隐私影响、dispose 行为以及装配后的验收路径。如果没有扩展点能够支持该功能，平台变更会先引入最小的可复用扩展，再把产品功能实现为其消费方。只有 agent 生命周期责任才可以成为修改 Agent Loop 的理由，方便观察不能。仓库中的 [dsh-mint-client-feature](../../../skills/dsh-mint-client-feature/SKILL.md) 工作流会把这些规则带入后续 Agent 会话。

功能交付明确保留三个审查单元：可复用插件或提供方、启用它的产品组合变更，以及产品层验收证据。非平凡决策需要 Agent Note；用户可见行为需要通过真实组合提供无密钥快照；原生集成还需要聚焦的平台测试。发布说明描述产品结果，但不会把 Electron 壳写成业务功能的持有者。

## 考虑过的替代方案

**把产品行为直接放入 Electron 主进程。** 这种归属适合窗口与应用生命周期，但会迫使壳重复会话祖先关系、完成、重连与交互语义，也会让其他 DSH 客户端无法使用同一功能。

**维护一个整体式 Mint 客户端 fork。** 独立 renderer 能提供完整的本地控制，但会放弃 slot 组合、重复共享客户端运行时，并让每次上游同步都变成手工 UI 合并。

**在 Agent Loop 中增加产品分支。** 展示与操作系统副作用不会改变 agent 执行。把它们放入 loop 会让模型行为耦合到单个发行版，并绕开已经为观察方设计的客户端状态。

**把每项 Mint 功能都放入共享 Web 组合包。** 通用功能可以进入该层，但产品专用默认值、品牌、集成与实验会扩大上游产品表面。Mint overlay 可以在复用同一批包与运行时的同时保持选择独立。

## 验证

包测试覆盖通知转换策略、subagent 聚合、待处理交互抑制、权限状态、点击导航、设置持久化与 dispose。配置 dump 覆盖证明通用 `web` Profile 排除通知行，`desktop-mint` Profile 则恰好包含一次该行及 Mint 默认值。无密钥浏览器测试在随附 Web 树之上应用 Mint Bundle，并在真实 agent 状态转换后捕获系统通知载荷。Release 验收会安装签名并公证的 DMG，并针对 macOS 通知中心验证后台发送与通知激活。文档与配置门禁校验包 manifest、客户端名册、双语参考与 invariant 配套插件。

未来功能在设计审查中使用功能记录，并通过组合层测试证明所选平面。审查会拒绝导入或重建 agent 生命周期语义的 Electron 代码、没有独立插件持有者的客户端功能、缺少会话事件的模型可见输入，以及在 Mint 组合之外被隐式启用的产品专用包。

## 后果

DSH Desktop Mint 可以保持清晰的产品身份，同时在结构上继续接近上游 DSH。相比局部条件，小功能需要更明确的包、组合、测试与文档工作，但它们可以被独立移除、替换、测试与 upstream。通用包可以复用或 upstream，而无需让其默认值进入共享 Web 产品；Mint 的选择留在下游 Bundle。原生能力可能需要额外提供方或桥接，但 Electron 壳会继续作为操作系统宿主，而不是第二套 harness。
