# Agent Note: Mint 桌面下游开发与发布

Status: implemented

[English](2026-08-24-mint-desktop-downstream-development.md) | 中文

## 问题

DSH Desktop 需要发布个人化应用，而它的后端由当前 DeepSeek Harness 源码树装配。只抽取 Electron 文件会丢失尚未发布的 Harness 变更与源码构建打包证明，但把此检出目录视为官方仓库又会带入不属于个人发行版的组织专用工作流、发布控制与品牌身份。开发还会在多台电脑之间流转，而每台电脑的 Node 安装、CPU 架构、本地凭据和生成依赖树都可能不同。

公开分发 macOS 应用还增加了一项完整性要求：用户必须能区分 Mint 应用与 DeepSeek 官方产品，并且收到的产物必须通过一套可审查流程生成代码签名、公证票据、架构、版本与校验和。

## 决策

Mint 项目在公开的 `mintgao/dsh-desktop` 仓库中保留完整的 DeepSeek Harness Git 历史。本地 `origin` 指向该下游仓库，`upstream` 指向 `deepseek-ai/deepseek-harness`。下游 `main` 始终保持可发布，人工功能、修复、文档与依赖分支都通过 Pull Request 进入。[自动引入上游并发布桌面版](2026-08-27-automatic-upstream-desktop-releases.zh.md)流程是有文档记录的例外：只有必需检查通过后，它才会把队首的已公开上游标签直接合入，然后记录并发布这次引入。冲突和检查失败会在推送前停止，并通过阻塞 Issue 保持可见。

根目录 [`CONTRIBUTING.md`](../../../../CONTRIBUTING.zh.md) 持有跨设备流程。源码只能通过 Git 流转；活跃检出目录、依赖目录、暂存后端和构建产物都不得通过云文件同步，也不得在 CPU 架构之间复制。[`.node-version`](../../../../.node-version) 选择 Node 24，`package.json#packageManager` 选择准确 pnpm 版本，lockfile 继续作为依赖事实来源。凭据、`~/.dsh`、日志、Apple 签名材料和 App Store Connect 密钥都留在 Git 之外。

官方仓库自动触发的 CI、E2E、Issue 管理和包发布任务带有 `github.repository == 'deepseek-ai/deepseek-harness'` 条件。这样既保留它们的源码与上游行为，也能阻止下游仓库分配组织专用 runner、修改官方 Project 看板、消耗外部 API 凭据或发布官方包。[`desktop-ci.yml`](../../../../.github/workflows/desktop-ci.yml) 提供下游无密钥检查与显式双架构打包冒烟测试。

桌面版本使用不可变的语义化 `desktop-v*` 标签。自动上游引入会把准确的 Harness Release 版本映射为桌面标签；仍可为例外的桌面专用版本创建标签。[`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) 在原生 Apple Silicon runner 上构建 arm64，在原生 Intel runner 上构建 x64。每个标签都要求 Developer ID Application 证书与 App Store Connect API key 凭据，强制签名，分别提交两种架构进行公证，并验证应用身份与已装订票据。自动上游触发会在所有检查通过后公开发布，手工推送的标签则创建草稿。预发布版包含两份 DMG 与 SHA-256 校验和；稳定版 `desktop-vX.Y.Z` Release 还会增加两份更新 ZIP、blockmap 与合并后的更新元数据。[公开桌面版签名](2026-08-25-signed-public-desktop-releases.zh.md)持有应用身份要求，[预览版手工更新提醒](../feature/2026-08-24-desktop-manual-preview-updates.zh.md)持有通道过渡。

应用使用 `io.github.mintgao.dsh-desktop` 作为 bundle 标识符，使用 `DSH-Desktop-Mint-*` 作为产物前缀。Mint 浪花图标、根仓库声明、应用 README、安全政策、发布说明与仓库描述都会明确它是非官方发行版，同时保留真实的 DeepSeek Harness 归属说明。

## 考虑过的替代方案

**把 Electron 应用抽取成小型独立仓库。** 应用当前会打包此检出目录构建的 DSH 运行时，包括未发布的包变更与 vendored 依赖。独立消费仓库要么安装与开发状态不同的已发布版本，要么增加 submodule 并重复构建与发布协调。在稳定的已发布 Harness 依赖能够替代该要求前，完整历史的下游仓库保留一份源码与一份 lockfile。

**创建 GitHub fork 并启用所有上游工作流。** 公开 fork 能保留网络关系，但也会继承依赖 DeepSeek 组织 runner、应用、Secrets、标签和 Project 配置的 Pull Request 任务。仓库条件既能保留上游工作流文件，也能让下游项目拥有独立的必需检查集合。

**通过云盘同步检出目录或 `node_modules`。** 文件同步可能在没有提交和审查的情况下合并不完整 Git 状态、原生编译模块、符号链接与被忽略的凭据。Git 分支与每台设备独立执行的不可变安装能让传递状态保持明确且可复现。

**把未签名或 ad-hoc 签名的 DMG 作为公开预览版。** 当 Mint 品牌需要建立明确发布者身份时，此类产物反而削弱身份与 Gatekeeper 预期，而且 Electron 会拒绝通知这类依赖应用身份的原生能力。本地开发可以使用此类产物，但每条公开通道都要求 Developer ID 签名与公证。

## 验证

桌面源码测试、更新元数据测试、Electron 主进程构建、类型检查、文档门禁与原生 arm64、x64 打包冒烟测试覆盖普通变更。每条打包冒烟测试都会用内部 smoke 参数运行发布的可执行文件并加载打包后的主进程模块图，因此 ESM/CommonJS 互操作在 `app.asar` 内接受检查，而不是从 TypeScript 构建结果推断。工作流测试固定该产物检查、两条通道的签名凭据、仅稳定版包含的更新资产、自动与手工发布区别、有序上游状态、必需的推送前检查和可恢复撤回。发布任务还会在公开发布前验证原生架构选择、必需 Secrets、Developer ID 签名、公证票据装订、DMG 评估、架构更新元数据与校验和。

## 后果

下游仓库仍然大于独立 Electron 客户端，自动上游引入也可能因发布或工作流文件冲突而停止。两个原生 macOS 任务及签名、公证会增加发布时间和存储。Apple 凭据就绪前不能发布任何公开桌面通道；预览版仍要求知情用户手工替换，自动安装则仅属于稳定版。一份 Git 历史加上明确的状态、Release、工作流与 Issue 记录可以跨设备和 Agent 承载桌面版与 Harness 迭代，官方基础设施不会意外运行。
