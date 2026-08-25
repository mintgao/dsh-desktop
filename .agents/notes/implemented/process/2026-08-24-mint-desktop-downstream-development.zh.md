# Agent Note: Mint 桌面下游开发与发布

Status: implemented

[English](2026-08-24-mint-desktop-downstream-development.md) | 中文

## 问题

DSH Desktop 需要发布个人化应用，而它的后端由当前 DeepSeek Harness 源码树装配。只抽取 Electron 文件会丢失尚未发布的 Harness 变更与源码构建打包证明，但把此检出目录视为官方仓库又会带入不属于个人发行版的组织专用工作流、发布控制与品牌身份。开发还会在多台电脑之间流转，而每台电脑的 Node 安装、CPU 架构、本地凭据和生成依赖树都可能不同。

公开分发 macOS 应用还增加了一项完整性要求：用户必须能区分 Mint 应用与 DeepSeek 官方产品，并且收到的产物必须通过一套可审查流程生成代码签名、公证票据、架构、版本与校验和。

## 决策

Mint 项目在公开的 `mintgao/dsh-desktop` 仓库中保留完整的 DeepSeek Harness Git 历史。本地 `origin` 指向该下游仓库，`upstream` 指向 `deepseek-ai/deepseek-harness`。下游 `main` 始终保持可发布，功能、修复、文档、依赖和上游同步分支都通过 Pull Request 进入。[`upstream-sync.yml`](../../../../.github/workflows/upstream-sync.yml) 每天检查最新的上游 `dsh-v*` 标签，也可以接受手工指定的 ref。它会把缺失版本合并到专用 `chore/sync-upstream-*` 分支，并创建带预填 PR 对比链接的跟踪 Issue；遇到冲突时会停止并等待人工处理，而且绝不创建或合并 PR，也不会发布。仓库级 Actions 权限保持默认只读；该任务只声明分支、Issue 写权限和 Pull Request 读权限。这样，桌面代码与工作流保护的冲突会保持可见。

根目录 [`CONTRIBUTING.md`](../../../../CONTRIBUTING.zh.md) 持有跨设备流程。源码只能通过 Git 流转；活跃检出目录、依赖目录、暂存后端和构建产物都不得通过云文件同步，也不得在 CPU 架构之间复制。[`.node-version`](../../../../.node-version) 选择 Node 24，`package.json#packageManager` 选择准确 pnpm 版本，lockfile 继续作为依赖事实来源。凭据、`~/.dsh`、日志、Apple 签名材料和 App Store Connect 密钥都留在 Git 之外。

官方仓库自动触发的 CI、E2E、Issue 管理和包发布任务带有 `github.repository == 'deepseek-ai/deepseek-harness'` 条件。这样既保留它们的源码与上游行为，也能阻止下游仓库分配组织专用 runner、修改官方 Project 看板、消耗外部 API 凭据或发布官方包。[`desktop-ci.yml`](../../../../.github/workflows/desktop-ci.yml) 提供下游无密钥检查与显式双架构打包冒烟测试。

桌面版本使用独立于 Harness npm 版本的不可变语义化 `desktop-v*` 标签。[`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) 在原生 Apple Silicon runner 上构建 arm64，在原生 Intel runner 上构建 x64。带预发布后缀的标签选择预览路径：关闭签名身份发现，预览环境不含签名凭据，将草稿标记为 Pre-release，只包含两份未签名 DMG 与 SHA-256 校验和。稳定版 `desktop-vX.Y.Z` 标签要求 Developer ID Application 证书与 App Store Connect API key 凭据，仅在签名步骤中提供这些凭据，强制签名，分别提交两种架构进行公证，验证已装订票据，并增加两份更新 ZIP 与 blockmap 以及合并后的更新元数据。维护者测试相应产物后手工发布任一种草稿。发布预览版会启用手工 Release 提醒，发布稳定版会启用签名自动更新源。具体过渡方案记录在[预览版手工更新提醒](../feature/2026-08-24-desktop-manual-preview-updates.zh.md)。

应用使用 `io.github.mintgao.dsh-desktop` 作为 bundle 标识符，使用 `DSH-Desktop-Mint-*` 作为产物前缀。Mint 浪花图标、根仓库声明、应用 README、安全政策、发布说明与仓库描述都会明确它是非官方发行版，同时保留真实的 DeepSeek Harness 归属说明。

## 考虑过的替代方案

**把 Electron 应用抽取成小型独立仓库。** 应用当前会打包此检出目录构建的 DSH 运行时，包括未发布的包变更与 vendored 依赖。独立消费仓库要么安装与开发状态不同的已发布版本，要么增加 submodule 并重复构建与发布协调。在稳定的已发布 Harness 依赖能够替代该要求前，完整历史的下游仓库保留一份源码与一份 lockfile。

**创建 GitHub fork 并启用所有上游工作流。** 公开 fork 能保留网络关系，但也会继承依赖 DeepSeek 组织 runner、应用、Secrets、标签和 Project 配置的 Pull Request 任务。仓库条件既能保留上游工作流文件，也能让下游项目拥有独立的必需检查集合。

**通过云盘同步检出目录或 `node_modules`。** 文件同步可能在没有提交和审查的情况下合并不完整 Git 状态、原生编译模块、符号链接与被忽略的凭据。Git 分支与每台设备独立执行的不可变安装能让传递状态保持明确且可复现。

**把未签名或 ad-hoc 签名的 DMG 当作稳定版发布。** 当 Mint 品牌需要建立明确发布者身份时，此类产物反而削弱身份与 Gatekeeper 预期。明确标记的预发布版本可以通过手工安装和校验和服务知情的早期测试者，但稳定通道与自动安装仍须等待 Developer ID 签名与公证。

## 验证

桌面源码测试、更新元数据测试、Electron 主进程构建、类型检查、文档门禁与原生 arm64、x64 打包冒烟测试覆盖普通变更。每条打包冒烟测试都会用内部 smoke 参数运行发布的可执行文件并加载打包后的主进程模块图，因此 ESM/CommonJS 互操作在 `app.asar` 内接受检查，而不是从 TypeScript 构建结果推断。工作流约定测试固定该产物检查、签名步骤的凭据作用域与预览步骤的无凭据环境。发布任务还会验证原生架构选择、必需 Secrets、代码签名、公证票据装订、DMG 评估、架构更新元数据、校验和与仅生成草稿的发布行为。定时上游任务只能证明可以提出源码合并与 Pull Request；普通 Pull Request 检查在合并前持有兼容性验证。

## 后果

下游仓库仍然大于独立 Electron 客户端，自动提出的上游更新也可能因发布或工作流文件冲突而停止。两个原生 macOS 任务及其产物会增加发布时间和存储。Apple 凭据就绪前可以开始提供预览下载，但它们带有明确的 Gatekeeper 警告并要求知情用户手工替换；签名自动更新仍须等待维护者提供 Apple Developer 证书与 App Store Connect API key。一份 Git 历史仍可以跨设备承载桌面版与 Harness 迭代，上游发布可以被及时感知且不会绕过审查，官方基础设施不会意外运行。
