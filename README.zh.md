# DSH Desktop Mint

[English](README.md) | 中文

<p align="center">
  <img src="apps/desktop-mint/build/icon.png" alt="DSH Desktop Mint 标志" width="160" height="160">
</p>

由 Mint 维护的 DeepSeek Harness macOS 桌面应用。打开项目、配置模型，即可在独立的桌面窗口中与 coding agent（编程智能体）协作。

[下载预览版](https://github.com/mintgao/dsh-desktop/releases) · [开始使用](#getting-started) · [Desktop 最新动态](#desktop-updates) · [反馈问题](https://github.com/mintgao/dsh-desktop/issues)

## 关于 Mint

Mint 将 DSH 运行时和 Web 客户端打包为 Mac 应用，提供独立图标、启动体验、原生窗口和桌面更新入口。你可以使用 DSH 读写项目文件、执行命令、继续会话；Mint 专注于桌面使用体验和完整应用的更新交付。

本项目是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的非官方发行版，未获得 DeepSeek 的背书、合作或授权。

## 项目状态

项目处于预览阶段。更新前，请查看对应版本说明中的硬件支持、安装要求和使用限制。

| 项目 | 当前公开预览版 |
| --- | --- |
| 平台 | macOS；最新预览版仅提供 Apple Silicon（`arm64`）DMG |
| 发行状态 | 未签名、未经 Apple 公证，供个人和小范围测试使用 |
| 更新方式 | 手动下载并替换应用；未启用签名自动更新 |
| 模型接入 | 需要自行提供模型服务商的 API 密钥 |

使用前请阅读[安全说明](SAFETY.zh.md)。预览版本可能引入不兼容变更；替换已有安装前，请查看版本的数据兼容性说明。原生任务通知需要已签名应用，未签名预览版无法使用。

<a id="desktop-updates"></a>

## Desktop 最新动态

**2026-09-13 · [0.1.5-alpha.2.unsigned.2](https://github.com/mintgao/dsh-desktop/releases/tag/desktop-v0.1.5-alpha.2.unsigned.2)**

- 修复本地后端返回带认证的就绪地址时桌面端无法启动的问题。
- 从启动诊断中移除认证查询值。
- 提供一个 Apple Silicon DMG，用于手动安装完整桌面应用。

本区域记录最新已发布 Desktop 版本的要点。完整历史、下载文件和各版本限制见[全部发布记录](https://github.com/mintgao/dsh-desktop/releases)。

<a id="homepage-maintenance"></a>

### 首页维护规则

每次公开发布 Desktop 版本，只要包含关键功能、重要修复，或平台支持、安装、更新方式的变化，发布负责人就必须将中英文 README 及其配对记录的同步更新纳入发布收尾。记录发布日期、准确版本链接和 3–5 条面向用户的要点（变化较少时可少写）；涉及项目状态或使用方法时同步修订对应内容。只描述已核实的公开产物，注明限制，完整历史链接到 Releases。发布前准备文案，版本公开后发布首页更新；此前保留上一公开版本。首页与已发布状态一致后，才算完成发布。内部重构若不改变用户行为，无需列入首页。

<a id="getting-started"></a>

## 开始使用

1. 打开 [Releases](https://github.com/mintgao/dsh-desktop/releases)，选择适合自己 Mac 的预览版本，下载其中的 `.dmg` 文件。最新预览版仅支持 Apple Silicon。
2. 打开 DMG，将 **DSH Desktop** 拖入“应用程序”。更新时先退出已有应用，再替换。对于未签名预览版，macOS 可能要求在**系统设置 → 隐私与安全性 → 仍要打开**中确认。
3. 打开 **DSH Desktop**，在**设置 → 模型**中配置 API 密钥，然后添加并选中工作区。其他提供方的接入方式见[模型配置](docs/user/guide/providers.zh.md)。
4. 新建任务，描述希望完成的工作，并按提示回应审批或澄清请求。[使用指南](docs/user/guide/index.zh.md)介绍共用 DSH 界面的操作方法。

设置和会话使用普通 DSH 数据目录（默认为 `~/.dsh`）。本地数据、排障日志和更新选项见[桌面端参考](apps/desktop-mint/README.zh.md)。

## 反馈与开发

Mint 的安装、启动和更新问题请提交到[本仓库 Issues](https://github.com/mintgao/dsh-desktop/issues)。请附桌面版本、Mac 芯片、macOS 版本和复现步骤，并从附件中移除 API 密钥和私人项目内容。

从源码运行桌面端，请参阅[桌面开发说明](apps/desktop-mint/README.zh.md)。贡献者可从[贡献指南](CONTRIBUTING.zh.md)、[开发指南](docs/development.zh.md)和[架构文档](docs/architecture.zh.md)开始。面向 agent：遵循 [AGENTS.md](AGENTS.md)。

<details>
<summary>Harness Web 与源码开发</summary>

以下命令启动 Harness Web 界面。npm 命令使用上游包；源码路径使用本 Mint 仓库。

<a id="run"></a>

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/mintgao/dsh-desktop.git
cd dsh-desktop
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

</details>

## 上游与许可证

Mint 基于 DeepSeek Harness 和 [Cordis](https://github.com/cordiverse/cordis) 的开源工作构建。Harness 能力和插件开发详见[上游文档](https://deepseek-harness.github.io/deepseek-harness/)。

[MIT](LICENSE)。第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
