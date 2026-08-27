# 架构上下文

[English](architecture.md) | 中文

## 系统概述

DeepSeek Harness 是一棵 Cordis 插件树，模型适配器、Agent 驱动器、工具、持久化、UI 和交付界面都由可替换的贡献项提供。新行为通常接入已有文档的服务、事件、注册表或 Profile 层；[架构图](../architecture.zh.md)是权威总览，各子系统页面负责具体类型与语义。

## 技术栈

- TypeScript 6，采用严格 ESM 模式并以 ES2024 为目标。
- Node.js `^22.19.0 || >=24.0.0` 和 pnpm 11 workspace。
- Cordis 负责服务注册、作用域上下文、事件、effect、Loader 组合与热替换。
- 浏览器客户端使用 React 18 和 Vite 6；下游 macOS 外壳使用 Electron 43。
- 包和应用测试使用 Vitest，另设真实 API、快照、Web 浏览器和平台测试通道。

## 组合与启动

- CLI 解析 Profile、插件管理或配置输出模式，并只动态加载所选路径；命令语法由 [CLI 参考](../../apps/cli/README.zh.md)维护。
- 一个 Profile 列出有序 Bundle。运行时从空根树开始，依次应用 Bundle 补丁、Profile 补丁、home 级补丁、命令行 overlay 和启动器开关。指向某行的补丁会替换该行的完整配置。
- `dsh-base` 提供共享的 Agent、模型、工具、持久化、设置、凭证和策略基础。`web-app`、`headless` 和 `desktop-mint` 增加交付方式专属插件，但不定义另一套 Agent 运行时。
- 贡献项通过 `ctx.effect()` 或 `ctx.on()` 注册，因此卸载时可撤销。能力家族会在 Service Definition、Service Provider 与 Consumer 需要独立演进时拆分这些角色。

## 请求与数据流

1. Agent inbox 接收输入并开启轮次；一个轮次包含零个或多个模型请求步骤。
2. 每个步骤组装提示词区段和工具 schema，从会话日志投影模型历史，并通过 `agent/request` 分派给所选 LLM 适配器。
3. 助手分片和消息追加到日志。工具调用依次经过受防护的 `tools/pre-execute`、`tools/execute` 和 `tools/post-execute` waterfall，再追加执行结果，并可能触发下一步骤。
4. 仅追加 Session 日志是模型历史、回放、UI 投影、fork／resume 行为、遥测和持久化的真源。默认 Profile 把 JSONL 持久化到 `$DSH_HOME/sessions`；持久化协调器按会话批量写入，并把 `flush()` 作为持久性屏障。
5. 设置、凭证和组合相互分离：Profile 补丁选择插件，设置存储用户可编辑的 schema 值，凭证提供方在操作时解析被引用的密钥。

## 交付界面

- **Web：**Host 提供 API 网关和 SPA，浏览器侧 client 模块组合 UI 服务与功能 slot。
- **Headless：**单次运行器创建新的持久会话，等待 Agent 完全停稳，输出最后一条助手响应并退出。
- **SDK 与 ACP：**stdio 传输让其他进程在没有 Web 展示层的情况下驱动部分 Agent 和会话操作。
- **Desktop Mint：**Electron 在 loopback 地址上启动并管理构建后的 CLI，然后在沙箱化 renderer 中载入规范 Web URL。

## 仓库结构

- `apps/` 包含发布的 CLI、Web 构建入口和下游桌面外壳。
- `packages/` 按角色包含产品能力；当前清单与依赖图由[包目录](../../packages/README.zh.md)和生成的[模块图](../module-graph.zh.md)维护。
- `examples/` 包含供教程、e2e 测试和快照回放使用的可运行 Cordis 组合。
- `python/` 包含 Python SDK 和 bundled-runtime 构建；`native/` 管理原生进程隔离代码。
- `vendor/` 是固定版本的 Cordis 源码，受自身同步流程约束，不属于普通编辑范围。
- `docs/`、`.agents/` 和 `scripts/` 分别管理参考文档与指南、决策记录与工作流，以及仓库门禁。

## 命令

- `.vibe/project.yaml` 记录标准安装、lint、类型检查、单元测试和构建命令。
- `pnpm run test:coverage` 而不是 `pnpm run test`，才是要求逐文件达到 100% 的 CI 覆盖率门禁。
- 面向产品用户的行为还可能需要 `pnpm run test:snapshot`、`pnpm run test:web` 或需要凭证的 `pnpm run test:e2e`；测试层级由[测试策略](../testing.zh.md)确定。
- `pnpm run doc-sync` 校验文档，`pnpm run hygiene` 校验发布与 workspace 约束。

## 限制与风险

- 模型可见输入必须表示为 Session 事件，确保能重建传给模型的确切上下文。
- Waterfall listener 必须调用 `next()` 才会继续委托；不调用就返回会有意短路整条链。
- 提供方无关的消费方依赖 Service Definition，而不是具体提供方；新增能力时要同时考虑 Definition、Provider 和 Consumer。
- Host 与 Client 的 TypeScript 声明会以不同 aggregate 编译，因为二者以不同方式合并 Cordis 上下文。源码检查把 workspace import 解析到 `src`；消费 `lib` 的检查必须明确声明并先执行构建。
- 运行时注册必须是可撤销的 effect，包拥有的 invariant 必须观察权威关系，随用户变化的选项必须进入经过校验的 Cordis 配置，而不是硬编码常量。
- 最终生效的运行时取决于本地 Profile、home 补丁、设置、凭证和平台。应使用 `pnpm dsh --profile <name> --dump-config` 检查，而不是假设仓库模板正在生效。
- 本次 onboarding 仅依据源码：没有调用真实模型、检查私有凭证，也没有证明当前机器能运行需要凭证的 e2e 组合。
