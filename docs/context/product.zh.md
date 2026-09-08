# 产品上下文

[English](product.md) | 中文

## 产品用途

本二次开发项目交付 DSH Desktop Mint：基于 DeepSeek Harness 的桌面客户端，以及让桌面用户发现、获取和应用 DSH 更新的方式。[二次开发规范](downstream-policy.zh.md) 约束当前与未来的新增能力、插件职责、外部复用及经过测试的兼容性。

DeepSeek Harness（`dsh`）是一个开源、处于开发者预览阶段的 coding agent（编程智能体）运行时，用于组合和运行 coding agent。它在同一个插件化运行时中整合模型访问、工作区工具、权限、持久会话、人机协作和多种交付界面；产品入口见[根 README](../../README.zh.md) 和 [Web UI 指南](../user/guide/index.zh.md)。

## 主要用户

- 通过 Web UI 在本地工作区中运行 coding agent 的开发者。
- 通过 [Python SDK](../user/guide/python-sdk.zh.md)、TypeScript SDK、JSON-RPC 或 ACP，以自动化方式驱动 Harness 运行时的集成方。
- 通过 Cordis 插件、Bundle、Profile、preset 和用户补丁层组合能力的插件与部署方案作者。

桌面用户是本下游产品的目标用户；其他 DSH 开发者是新增能力的复用用户。继承的 Harness 界面仍然可用，但它们的存在不构成额外的下游产品需求。

## 产品界面

- **Web UI：**`dsh web` 启动本地浏览器应用。用户可以配置模型、选择工作区、创建持久会话、提交任务、查看 agent 活动，并回答审批或澄清请求。
- **CLI 与 Profile：**`dsh` 启动器会启动具名插件组合、管理 Profile 本地插件、输出最终生效的配置，并提供单次 headless 模式。
- **编程接口：**SDK 与 ACP 界面把同一个 agent 运行时提供给其他进程；二者的交互模型都比 Web UI 更窄。
- **DSH Desktop Mint：**当前检出包含由 Mint 维护的非官方 macOS Electron 外壳。它管理 `desktop-mint` Profile 并嵌入同一个 Web 应用；它既不是另一套 agent 实现，也不是 DeepSeek 官方发行版。参见[桌面端参考](../../apps/desktop/README.zh.md)。

## 当前能力

- 支持模型目录中的提供方和自定义模型；凭证与设置分开保存，模型变更从下一次请求起生效。参见[模型配置](../user/guide/providers.zh.md)。
- 标准 coding-agent preset 提供工作区文件编辑、shell 与 terminal 执行、文件与 Web 搜索、skill、计划、目标、后台任务、工作流和进程内 subagent。
- 提供由用户控制的权限 preset 和单次审批，而不是无条件开放宿主访问。
- Web 组合提供仅追加会话日志、默认 JSONL 持久化、附件、由回放推导的 UI 状态和会话导出。
- 支持安装外部插件及按序应用 Profile／Bundle 补丁，因此部署方无需 fork Agent Loop 即可替换提供方或增加消费方。

## 非目标与边界

- 项目处于开发者预览阶段，明确允许破坏兼容性的变更。
- 代码存在于仓库中，不代表默认产品已经启用。任意 URL 抓取、SQLite 会话全文搜索、定时跟进、第三方记忆、E2B 执行，以及外部 Codex 或 Claude Code subagent 提供方，可能属于可选、禁用、实验性或仅供示例的组合。
- Headless 只接受一个已提交任务，没有交互式跟进界面。ACP 是自动化传输方式，不能替代 Web 的导航、展示、历史管理或全部会话生命周期操作。
- 模型驱动的行为需要用户提供相应提供方凭证。缺少相应凭证时，真实 API 测试和演示会自行跳过或无法运行。
- DSH Desktop Mint 是仅支持 macOS 的下游打包方案，有独立的签名和发布限制；不能从桌面端专属策略推断上游 Harness 行为。

## 产品原则

- 一切皆插件：产品行为通过文档化的服务、事件、注册表和 Profile 组合接入。
- 明确保留人的决定权：权限、审批、凭证引用和危险访问模式都是用户可见的选择。
- 模型可见状态必须持久：传给模型的输入必须能从会话日志中重建。
- 交互界面和自动化界面复用同一个 Agent 运行时，不维护两套行为栈。
- 配置错误要在最早可判断的位置失败；系统不会静默忽略不受支持的能力请求。

## 待确认问题

- 各受支持 Mac 架构上的哪些打包桌面与升级场景构成发布验收基线？
- 长期模型策略是 DeepSeek 优先、提供方无关，还是有明确分层的二者结合？
- 根文档允许破坏兼容性的开发者预览声明，与部分包表格把多项 API 标为稳定产品界面之间，应如何统一表述？
- 独立分发的下游插件已经验证兼容哪些确切的 DSH 版本？
- 当前禁用或仅供示例的能力中，哪些是有意保留的产品边界，哪些可能进入默认 Profile？
- 启用会话遥测的部署应采用什么面向用户的遥测与同意策略？
