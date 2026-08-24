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

本地命令会关闭签名身份自动发现，而且绝不会生成受支持的公开版本。可以使用以下命令为当前用户安装本地 Apple Silicon 版本：

```sh
ditto "apps/desktop/dist/mac-arm64/DSH Desktop.app" "$HOME/Applications/DSH Desktop.app"
```

## 运行时行为

Electron 主进程以 Node 模式运行自己的可执行文件，带上应用内 CLI 与 `dsh web --no-open --port 0`。它只接受官方的 `dsh web: http://127.0.0.1:<port>` 就绪行。就绪行出现前持续展示启动页；启动失败或后端意外退出时显示原生错误对话框。关闭最后一个窗口时，先以 `SIGTERM` 停止后端；若超过限定宽限期，再使用 `SIGKILL`。第二次启动应用会聚焦已有窗口。

后端日志位于 `~/Library/Logs/DSH Desktop/backend.log`。外部 HTTP 与 HTTPS 链接会在系统浏览器中打开。同源应用导航留在 DSH 窗口内；新窗口与其他所有 scheme 均被拒绝。

## 更新

经过签名和打包的 macOS 版本会在启动十秒后检查公开的稳定更新源，之后每六小时检查一次。**DSH Desktop > Check for Updates…** 可以随时执行同一检查。源码构建与未打包的开发构建仍保留该命令，但会说明它们没有签名更新源。

发现新版本后绝不会静默下载。原生对话框提供 **Download Update**、**Later** 与 **View Release Notes**，应用菜单、Dock 和窗口会显示下载状态。通过签名校验的下载完成后，用户可以选择 **Restart and Install**、**Install on Quit** 或 **Later**。立即安装会先停止本地 DSH 后端，任何更新都不会强制应用重启。后台网络错误只写入后端日志，手工检查或用户已选择的下载若失败，则会显示原生错误并提供 GitHub Releases 链接。

每次桌面更新都会替换整个应用，包括经过配套测试的 DSH 运行时。上游 Harness 发布不会直接修改已安装应用：定时上游工作流会先推送审查分支，并创建带预填 PR 链接的跟踪 Issue；维护者审查该 PR 后，才会创建并发布单独编号的桌面版本。

## 安全与本地数据

renderer（渲染进程）启用沙箱、上下文隔离与 Web 安全，不启用 Node 集成，也没有 preload bridge。后端绑定随机 loopback 端口，壳不会启用 LAN host。应用标识符是 `io.github.mintgao.dsh-desktop`。

凭据与会话继续使用用户的普通环境和 DSH 主目录；桌面壳不会把它们复制进应用 bundle。私密漏洞报告与受支持发布产物的要求见根目录[安全政策](../../SECURITY.md)。

## GitHub 开发

根目录[贡献指南](../../CONTRIBUTING.zh.md)规定 remote、分支、跨设备同步、依赖、密钥、上游更新与 Pull Request 的处理方式。`main` 始终保持可发布，每台设备都独立安装依赖树，不复制与架构有关的产物。

[`desktop-ci.yml`](../../.github/workflows/desktop-ci.yml) 会在 Pull Request 与 `main` 上运行桌面测试、桌面构建、仓库类型检查和文档检查。手动打包冒烟测试会分别使用 GitHub 原生的 arm64 与 x64 macOS runner。DeepSeek Harness 官方工作流保留仓库保护条件，不会在这个下游仓库分配其组织专用任务。

## 签名发布

桌面版本使用 `desktop-vX.Y.Z` 形式的语义化标签。标签版本会独立于根 Harness 包版本，成为应用发布版本。

首次发布前，仓库必须配置以下加密 GitHub Actions Secrets：

- `MACOS_CERTIFICATE_P12_BASE64` 与 `MACOS_CERTIFICATE_PASSWORD`，用于 Developer ID Application 证书。
- `APPLE_API_KEY_P8_BASE64`、`APPLE_API_KEY_ID` 与 `APPLE_API_ISSUER`，用于 App Store Connect 公证。

只能从经过审查的 `main` 提交创建版本：

```sh
git switch main
git pull --ff-only origin main
git tag -s desktop-v0.1.0 -m "DSH Desktop Mint 0.1.0"
git push origin desktop-v0.1.0
```

[`desktop-release.yml`](../../.github/workflows/desktop-release.yml) 会在每种架构的原生 runner 上构建，强制执行代码签名，提交应用公证，验证已装订的公证票据，再把两份 DMG、分架构 ZIP 与 blockmap、一份合并后的 `latest-mac.yml` 和 SHA-256 校验和上传至 GitHub Release 草稿。已安装客户端看不到草稿。维护者测试两种架构后手工发布草稿；发布动作会让稳定版本对自动检查可见。未签名输出不会进入公开发布路径，发布说明必须列出内置 Harness 版本以及迁移或兼容性要求。

## 开发职责

[`src/backend.ts`](src/backend.ts) 持有就绪解析与有界进程关闭。[`src/navigation.ts`](src/navigation.ts) 是纯 URL 策略。[`src/updates.ts`](src/updates.ts) 在不导入 Electron 的情况下持有更新调度与决策，[`src/electron-updates.ts`](src/electron-updates.ts) 适配签名传输。[`src/main.ts`](src/main.ts) 持有 Electron 生命周期、沙箱窗口与原生更新展示。[`../../scripts/prepare-desktop-backend.ts`](../../scripts/prepare-desktop-backend.ts) 暂存由源码构建的运行时闭包；[`../../scripts/merge-desktop-update-metadata.ts`](../../scripts/merge-desktop-update-metadata.ts) 校验并合并分架构发布元数据；[`electron-builder.yml`](electron-builder.yml) 持有 macOS bundle 布局与公开更新源身份。运行 `pnpm run test:desktop` 可执行聚焦的桌面测试。

运行时决策与备选方案记录在 [Electron 桌面壳](../../.agents/notes/implemented/feature/2026-08-24-electron-desktop-shell.zh.md)。更新生命周期记录在[由用户控制的桌面版签名更新](../../.agents/notes/implemented/feature/2026-08-24-desktop-signed-auto-update.zh.md)。下游仓库、跨设备与发布决策记录在 [Mint 桌面下游开发](../../.agents/notes/implemented/process/2026-08-24-mint-desktop-downstream-development.zh.md)。
