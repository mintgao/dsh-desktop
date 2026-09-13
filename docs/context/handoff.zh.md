# Desktop Mint 换机交接

[English](handoff.md) | 中文

## 权威状态

使用 [mintgao/dsh-desktop](https://github.com/mintgao/dsh-desktop) 受保护的 `main` 分支，不以临时构建目录或未完成的恢复目录作为起点。[主页](../../README.zh.md#desktop-updates)说明最新公开版本；不可变的发布标签、清单和下载摘要标识可安装产物。分支或本地构建成功不等于公开发布。

[产品范围](product.zh.md)、[架构](architecture.zh.md)、[下游要求](downstream-policy.zh.md)和[设计上下文](design-system.zh.md)是项目的持久上下文。[版本化组装决策](../decisions/20260913-desktop-versioned-assembly.zh.md)约束官方运行时、独立打包的 Mint 插件与原生外壳。[本地组装验收](../work-items/20260913-desktop-versioned-assembly/verification.zh.md)记录已验证范围；[RC.2 发布工作项](../work-items/20260913-mint-rc2-release/brief.zh.md)负责交付证据。

## 继续开发

修改前先读根目录 [AGENTS.md](../../AGENTS.md) 与 Vibe 项目上下文。使用仓库记录的 Node 和包管理器版本。[桌面 README](../../apps/desktop-mint/README.zh.md)负责构建与测试命令。版本化运行时输入位于[组装描述符](../../apps/desktop-mint/runtime/assembly-input.json)和相邻 npm 锁文件；原生外壳位于 `apps/desktop-mint`，`apps/desktop` 属于上游。

功能开发使用公开扩展 API 和可独立卸载的插件。更换界面不意味着允许在原生代码中改写 Agent 或 Session 语义。修改组件版本时，同时检查源码采用与打包后的实际加载。保持官方运行时原样；缺失的扩展点需要明确的通用 API 决策。

## 迁移本地使用

为新 Mac 安装支持其架构、且已核验的公开 DMG。公开预览为未签名 arm64 构建，不能使用签名自动更新及依赖签名身份的通知。面向用户的界面仍只有一个 Desktop 版本。

会话、配置档案和模型配置通常位于 `~/.dsh`；可复用的本地技能可能位于 `~/.agents`。原生偏好位于 `~/Library/Application Support/DSH Desktop`，诊断位于 `~/Library/Logs/DSH Desktop`。工作区文件仍在原来的项目目录中。完整私有备份前先停止应用及后端写入。敏感数据通过私有渠道迁移，或重新输入凭据；不得把数据目录、API 密钥或原始日志放入 GitHub 交接文档。

在新机器重新确认项目路径、工作区选择和提供方设置。确认可以重开已有会话，并完成一个新任务。安装检查不能证明提供方凭据或工作区路径有效。验收前保留旧机器和已核验备份；不要让旧运行时打开已被新运行时修改的数据。

## 发布与清理

[追赶式交付](../cookbook/catch-up-desktop-delivery.zh.md)负责经审核的源码最终确认与常规发布验证。[观察式前向交付](../cookbook/observed-forward-delivery.zh.md)只在已提交的兼容性评估选择该模式时适用。保留真实已发布前驱、source-lock 祖先与精确产物证据。发布负责人在公开验证后同步双语主页，并单独记录本机已安装客户端验收。

公开替换版本可用后，仅清理已明确列出的过时构建和一次性测试安装。保留用户的源码改动、活跃工作树、不可变公开版本、发布证据和仍需使用的恢复备份。
