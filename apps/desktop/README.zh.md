# DSH Desktop Mint

[English](README.md) | 中文

DSH Desktop Mint 是由 Mint 维护、用于现有 `dsh web` 应用的非官方 Electron 壳。它不会再定义一套 Agent 组合或 Web 客户端：它监管构建后的 `@deepseek-ai/dsh` CLI，等待其规范的 loopback（回环）就绪行，再在 macOS 原生窗口中加载该 URL。

应用名称、Mint 浪花图标、仓库身份和发布元数据共同用于区别官方 DeepSeek 产品。该发行版未获得 DeepSeek 的背书、合作或授权。

![DSH Desktop Mint 应用图标](build/icon.png)

## 从源码运行

安装仓库依赖后运行：

```sh
pnpm run desktop:start
```

该命令会先构建仓库与 Electron 主进程，再打开窗口。Finder 式启动没有调用方项目目录，因此后端从用户主目录启动；请在 Web UI 中选择或添加目标 workspace。DSH 数据、设置、凭据、profile 与会话继续使用普通 DSH 主目录，默认为 `~/.dsh`。

## 构建本地 macOS 应用

从当前源码树构建未签名的 Apple Silicon 应用：

```sh
pnpm run desktop:app:mac
```

使用 `pnpm run desktop:app:mac:x64` 构建 Intel 应用。将任一命令中的 `app` 替换为 `dmg` 即可生成本地 DMG。默认的 Apple Silicon 结果位于 `apps/desktop/dist/mac-arm64/DSH Desktop.app`；Intel 结果可能位于 electron-builder 使用的 `mac/DSH Desktop.app`。

每条命令都会执行官方客户端构建，打包当前本地 DSH 与 vendored 包，向隔离的资源目录安装选定运行时闭包，拒绝逃逸该目录的链接，再调用 electron-builder。因此，尚未发布的本地后端变更会进入应用，而不会被 npm 上的同版本替换。

本地命令会关闭签名身份自动发现，而且绝不会生成受支持的公开版本。Electron 43 无法从未签名或 ad-hoc 签名的应用发送 macOS 通知，因此本地产物不能验证任务通知或其他依赖稳定应用身份的原生能力；这些验收必须使用经过 Developer ID 签名与公证的产物。可以使用以下命令为当前用户安装本地 Apple Silicon 版本：

```sh
ditto "apps/desktop/dist/mac-arm64/DSH Desktop.app" "$HOME/Applications/DSH Desktop.app"
```

## 运行时行为

Electron 主进程以 Node 模式运行自己的可执行文件，带上应用内 CLI 与 `dsh --profile desktop-mint --no-open --port 0`。这个 Profile 会在用户 patch 之前依次组合 `dsh-base`、共享 Web Bundle 和 Mint 产品 Bundle。壳只接受官方的 `dsh web: http://127.0.0.1:<port>` 就绪行。就绪行出现前持续展示启动页；Mint 海洋场景分别驱动鲸鱼、海面、气泡与进度水流，减少动态效果偏好则显示静态鲸鱼与进度状态。启动失败或后端意外退出时显示原生错误对话框。关闭最后一个窗口时，先以 `SIGTERM` 停止后端；若超过限定宽限期，再使用 `SIGKILL`。第二次启动应用会聚焦已有窗口。

后端日志位于 `~/Library/Logs/DSH Desktop/backend.log`。外部 HTTP 与 HTTPS 链接会在系统浏览器中打开。同源应用导航留在 DSH 窗口内；新窗口与其他所有 scheme 均被拒绝。

在经过 Developer ID 签名的公开应用中，顶层任务及其所有 subagent 都结束运行后，Web 客户端会发送 macOS 原生通知。默认的**仅在后台**模式不会重复前台状态；也可以在**设置 > 常规 > 任务完成通知**中选择**关闭**或**始终通知**。点击通知会打开对应任务并聚焦已有窗口。通知权限继续由 macOS 管理；未签名的本地构建无法发送这项通知。

## 更新

经过打包的预览版（例如 `0.2.0-preview.1`）会在启动三十秒后检查 `mintgao/dsh-desktop` 的公开 GitHub Releases，之后每六小时检查一次。它使用匿名条件请求，只选择包含本机架构 DMG 的最高语义化桌面版本，而且绝不下载代码。**DSH Desktop > 检查更新…** 可以随时执行同一检查。

首次在后台发现某一版本时，客户端会发送一次原生通知并显示提醒徽标。点击通知或选择**前往 Release 下载**会打开经过校验的确切 Release 页面，并提示应下载 arm64 还是 x64 DMG。**明天提醒我**会把一次提醒推迟 24 小时，**跳过此版本**只会屏蔽当前版本，不会隐藏后续版本。这些选择与 GitHub ETag 保存在应用 user-data 目录，不会保存 GitHub 凭据。后台错误只写入桌面日志；手工检查失败时会提供公开 Releases 页面。

预发布版本的 DMG 虽然已经过 Developer ID 签名与公证，仍使用手工安装。用户需要先退出 DSH Desktop，再用下载的 DMG 替换应用；设置、凭据、workspace 和会话仍保存在普通 DSH 主目录，不会随应用替换。预览版可以通过这条手工路径发现后续预览版或首个稳定版；手工安装该稳定版后，后续更新会切换到下述自动通道。

经过签名的稳定版会在启动十秒后检查公开的稳定更新源，之后每六小时检查一次。发现新版本后绝不会静默下载。原生对话框提供 **Download Update**、**Later** 与 **View Release Notes**，应用菜单、Dock 和窗口会显示下载状态。通过签名校验的下载完成后，用户可以选择 **Restart and Install**、**Install on Quit** 或 **Later**。立即安装会先停止本地 DSH 后端，任何更新都不会强制应用重启。源码构建与未打包的开发构建仍保留菜单命令，但会说明无法检查公开更新。

每次桌面更新都会替换整个应用，包括经过配套测试的 DSH 运行时。每个已经公开的上游 Harness Release 都会自动进入下游队列。准确的上游标签合并，并且桌面、构建、类型、文档与源码差异检查通过后，工作流会发布相应版本的已签名桌面 Release。公开发布只会让客户端发现版本；预览版替换、稳定版下载或安装仍由用户控制。

## 安全与本地数据

renderer（渲染进程）启用沙箱、上下文隔离与 Web 安全，不启用 Node 集成，也没有 preload bridge。后端绑定随机 loopback 端口，壳不会启用 LAN host。应用标识符是 `io.github.mintgao.dsh-desktop`。

凭据与会话继续使用用户的普通环境和 DSH 主目录；桌面壳不会把它们复制进应用 bundle。私密漏洞报告与受支持发布产物的要求见根目录[安全政策](../../SECURITY.md)。

## GitHub 开发

根目录[贡献指南](../../CONTRIBUTING.zh.md)规定 remote、分支、跨设备同步、依赖、密钥、上游更新与 Pull Request 的处理方式。`main` 始终保持可发布，每台设备都独立安装依赖树，不复制与架构有关的产物。

[`desktop-ci.yml`](../../.github/workflows/desktop-ci.yml) 会在 Pull Request 与 `main` 上运行桌面测试、桌面构建、仓库类型检查和文档检查。手动打包冒烟测试会分别使用 GitHub 原生的 arm64 与 x64 macOS runner，并在接受任一应用 bundle 前通过发布的可执行文件加载打包后的 Electron 主进程。DeepSeek Harness 官方工作流保留仓库保护条件，不会在这个下游仓库分配其组织专用任务。

## 预览版与稳定版发布

自动桌面版本与所引入的 Harness Release 准确对应：`dsh-vX.Y.Z[-suffix]` 映射为 `desktop-vX.Y.Z[-suffix]`。预发布后缀选择手工预览通道，稳定版本还会选择自动更新通道。两条路径都会从带标签的 `main` 提交构建经过 Developer ID 签名与公证的原生 arm64、x64 DMG。上游引入任务会在所有发布检查通过后公开发布；手工推送的 `desktop-v*` 标签仍只用于例外的草稿路径。

每个公开桌面标签都需要以下加密 GitHub Actions Secrets：

- `MACOS_CERTIFICATE_P12_BASE64` 与 `MACOS_CERTIFICATE_PASSWORD`，用于 Developer ID Application 证书。
- `APPLE_API_KEY_P8_BASE64`、`APPLE_API_KEY_ID` 与 `APPLE_API_ISSUER`，用于 App Store Connect 公证。

普通上游 Release 不需要人工创建标签或发布。引入工作流会把它加入队列，更新[状态记录](../../.github/upstream-sync-state.json)，推送映射后的桌面标签，并带上游标签与提交触发发布工作流，以生成 Release 说明。

对于例外的桌面专用预发布版本，可以在配置这些凭据后创建标签：

```sh
git switch main
git pull --ff-only origin main
git tag -s desktop-v0.2.0-preview.1 -m "DSH Desktop Mint 0.2.0 preview 1"
git push origin desktop-v0.2.0-preview.1
```

工作流会强制签名，分别提交两个预览架构进行公证，验证 Developer ID 身份与已装订票据，并生成两份 DMG 与 SHA-256 校验和。自动运行会立即公开 GitHub Pre-release，并记录内置 Harness 标签、上游提交和桌面源码提交。手工标签会生成相同的签名产物，但保留为草稿。公开预览版会被预览客户端发现，但不会进入 `electron-updater` 的稳定更新源。

对于例外的桌面专用稳定版，可以在相同凭据与产物检查通过后创建稳定标签：

```sh
git switch main
git pull --ff-only origin main
git tag -s desktop-v0.1.0 -m "DSH Desktop Mint 0.1.0"
git push origin desktop-v0.1.0
```

对于稳定标签，[`desktop-release.yml`](../../.github/workflows/desktop-release.yml) 会在已经签名的 DMG 与 SHA-256 校验和之外，额外上传分架构 ZIP、blockmap 和一份合并后的 `latest-mac.yml`。自动上游任务会把 Release 公开为 Latest；手工标签任务会保留草稿，已安装客户端无法看到它。

## 撤回与恢复 Release

可以从 GitHub Actions 触发 [`desktop-release-withdraw.yml`](../../.github/workflows/desktop-release-withdraw.yml)，也可以运行：

```sh
gh workflow run desktop-release-withdraw.yml \
  -f release_tag=desktop-vX.Y.Z \
  -f reason='Describe the observed problem'
```

撤回会把公开 Release 转回草稿，不删除不可变标签或产物。如果撤回稳定版，工作流还会把剩余公开稳定版中最新的一个重新标记为 Latest。它会创建或更新 `Desktop release withdrawn: ...` Issue，记录每次撤回的原因和运行、回退版本、恢复命令，以及“已安装应用不会被远程降级”这一明确交接事实。已经安装问题版本时，需要手工重新安装更早的 DMG。要恢复保留的版本，可以运行 `gh release edit desktop-vX.Y.Z --repo mintgao/dsh-desktop --draft=false` 公开其草稿；恢复稳定版时再加上 `--latest`。

## 开发职责

[`src/backend.ts`](src/backend.ts) 持有就绪解析与有界进程关闭。[`src/navigation.ts`](src/navigation.ts) 是纯 URL 策略。[`src/updates.ts`](src/updates.ts) 持有签名更新决策，[`src/electron-updates.ts`](src/electron-updates.ts) 适配签名传输。[`src/manual-updates.ts`](src/manual-updates.ts) 持有预览版提醒，[`src/github-releases.ts`](src/github-releases.ts) 校验公开 Release API，[`src/manual-update-preferences.ts`](src/manual-update-preferences.ts) 以原子方式保存相应选择。[`src/main.ts`](src/main.ts) 根据应用版本选择通道并持有原生展示。[`../../scripts/prepare-desktop-backend.ts`](../../scripts/prepare-desktop-backend.ts) 暂存由源码构建的运行时闭包；[`../../scripts/merge-desktop-update-metadata.ts`](../../scripts/merge-desktop-update-metadata.ts) 校验并合并签名版的分架构元数据；[`electron-builder.yml`](electron-builder.yml) 持有 macOS bundle 布局与公开更新源身份。运行 `pnpm run test:desktop` 可执行聚焦的桌面测试。

运行时决策与备选方案记录在 [Electron 桌面壳](../../.agents/notes/implemented/feature/2026-08-24-electron-desktop-shell.zh.md)。两种更新生命周期分别记录在[预览版手工更新提醒](../../.agents/notes/implemented/feature/2026-08-24-desktop-manual-preview-updates.zh.md)与[由用户控制的桌面版签名更新](../../.agents/notes/implemented/feature/2026-08-24-desktop-signed-auto-update.zh.md)。仓库模型记录在 [Mint 桌面下游开发](../../.agents/notes/implemented/process/2026-08-24-mint-desktop-downstream-development.zh.md)中；[自动引入上游并发布桌面版](../../.agents/notes/implemented/process/2026-08-27-automatic-upstream-desktop-releases.zh.md)持有引入、发布、撤回和跨 Agent 记录。
