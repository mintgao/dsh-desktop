# Agent Note: 基于已就绪 Web 应用的 Electron 桌面壳

Status: implemented

[English](2026-08-24-electron-desktop-shell.md) | 中文

## 问题

`dsh web` 已经提供完整的本地图形应用，但使用时仍要从终端启动，再把页面交给浏览器。macOS 应用需要 Finder 与 Spotlight 启动、原生窗口与图标、明确的后端生命周期所有者，以及可迁移的 bundle。为这层壳重新实现 Agent 或客户端组合会产生第二条产品路径，而把 workspace 链接直接复制进应用，会得到一个只有放在源码 checkout 旁边才能工作的 bundle。

## 决策

`apps/desktop` 是由私有根 workspace 持有的 Electron 主进程，而不是另一个可发布的 npm workspace。它跨本地进程边界复用官方 Web 组合。本决策只替换 [GUI 分层与 RPC 协议](../architecture/2026-07-19-gui-layering-and-rpc-protocol.zh.md)中假想的首个 IPC 载体选型；该说明里的客户端、Host、API Proxy 与插件分层仍是当前权威设计。

### 进程与窗口生命周期

主进程以 Node 模式启动应用内 Electron 可执行文件，传入 `--expose-internals`、应用内 `@deepseek-ai/dsh` 入口，以及 `web --no-open --port 0`。它继承普通环境与 DSH 主目录，不注入凭据，也不创建第二个持久化根。Finder 启动时没有权威的终端 workspace，因此后端从用户主目录启动；项目选择继续由现有 Web workspace 选择器持有。

监管器只接受完整的官方就绪行，且其中 URL 必须是 `127.0.0.1` 上带已分配端口的 HTTP 地址。任意 stdout、`localhost`、LAN 地址与其他协议都不能选择 renderer URL。启动有固定上限，并保留有界 stdout/stderr 诊断。关闭最后一个窗口或退出应用时先发送 `SIGTERM`，等待限定宽限期，再使用 `SIGKILL`。后端在就绪后退出会显示原生失败对话框。应用持有单实例锁，后续启动会聚焦已有窗口。

BrowserWindow 启用上下文隔离、renderer 沙箱与 Web 安全，不启用 Node 集成，也没有 preload bridge。导航只能留在就绪 URL 的精确同源范围。外部 HTTP 与 HTTPS 地址交给系统浏览器；popup、其他 scheme 与跨源窗口内导航均被拒绝。

### 由源码构建的应用内运行时

macOS 暂存流程先运行官方客户端构建，再从当前 checkout 打包两个发布族，读取打包后的 manifest，并选择从 `@deepseek-ai/dsh` 可达的本地 dependency、optional dependency 与 peer 闭包。npm 把这些 tarball 与外部依赖安装到 `apps/desktop/backend`。版本冒烟测试会运行已安装 CLI，递归链接检查则拒绝任何解析目标离开暂存根的符号链接。electron-builder 把这棵隔离目录复制为应用外部资源，而不是装入 asar；Electron 主 bundle 与静态启动页仍位于 asar 内。

本地目标是名为 DSH Desktop、带 Mint 浪花图标与 `io.github.mintgao.dsh-desktop` bundle 标识符的未签名 macOS arm64 和 x64 应用。它们适合源码构建与用户级安装。[Mint 桌面下游开发](../process/2026-08-24-mint-desktop-downstream-development.zh.md)持有 Developer ID 签名、hardened runtime、公证、原生架构 DMG 与公开产物发布。当前没有通用二进制与自动更新。

## 考虑过的替代方案

**保留浏览器启动，只增加 shell alias 或 PWA。** 这能缩短启动路径，但不会为 Web 后端提供唯一进程所有者、可靠关闭语义或自包含的本地应用。

**把 Agent 运行时直接嵌入 Electron，或先实现规划中的 IPC fetch 载体。** 这将来可以移除 loopback server，但会在产品尚无桌面生命周期时先创建新的 Host 组合与特权 Electron bridge。loopback 壳复用已有守卫和测试的 Web 载体，并把 IPC 子类留作同一套客户端 API 背后的后续替换项。

**使用 SwiftUI 或 Tauri，再带一个 Node sidecar。** 两者仍需要兼容 Node 的 DSH 运行时与 sidecar 生命周期，同时会增加一套工具链与桥接层。Electron 已经提供所需 Node 版本，也能在不重写 UI 的情况下渲染现有客户端。

**使用 pnpm legacy deploy 部署后端。** 它生成的相对 workspace 链接会解析到暂存目录以外的 `packages/` 与 `vendor/`。打包并安装当前发布族产物速度更慢，但能证明应用确实包含其声称交付的源码构建运行时。

**打包时安装已发布的 `@deepseek-ai/dsh` 版本。** 这样实现更小，却会静默丢失 checkout 中尚未发布的变更。本地 tarball 保留开发迭代，同时仍只从 npm 获取外部包。

## 验证

聚焦测试使用真实子进程覆盖分片就绪输出、早期失败诊断、干净停止与意外退出，纯测试覆盖精确同源导航与外部 URL 过滤。官方源码构建、桌面 TypeScript bundle 与运行时暂存均完成。应用内 CLI 报告仓库版本，每条暂存链接都解析在后端根内，生成的 arm64 `.app` 包含预期 CLI 资源。真实应用包启动会到达随机 loopback 就绪 URL，从该地址返回构建后的 DSH HTML，并在应用退出时关闭监听端口。

## 后果

该壳不会增加任何模型可见输入、会话事件、插件行为或 Agent loop 分支。现有 `~/.dsh` 数据与 Web workspace 行为继续和 CLI 启动共享。Electron 与安装后的 DSH 闭包会让本地应用明显大于浏览器快捷方式，从源码打包也需要花时间处理发布族。loopback Web 载体仍存在于一对仅供桌面使用的进程中；改为 IPC 会改变传输与特权原生集成，不会改变客户端能力分层。未签名的本地产物可能需要由操作者控制首次启动，而且它不是公开发布产物。
