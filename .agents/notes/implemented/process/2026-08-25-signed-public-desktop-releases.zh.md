# Agent Note: 公开桌面版需要稳定的 macOS 应用身份

Status: implemented

[English](2026-08-25-signed-public-desktop-releases.md) | 中文

## 问题

DSH Desktop 使用的部分 macOS 原生能力，其操作系统身份无法通过浏览器测试或未签名应用 bundle 体现。Electron 43 通过 `UNUserNotificationCenter` 发送通知；即使 renderer 报告 Web Notification 权限已授予，macOS 仍会拒绝未签名或 ad-hoc 签名的应用。因此，预览版可能同时通过插件测试、打包启动冒烟测试和浏览器通知捕获，但安装后的应用既不会出现在 macOS 通知设置中，也不会显示通知横幅。

公开预览产物同样是产品产物：用户会用相同 bundle 标识符安装它们，依赖其 Mint 发布者身份，并用它们验收原生能力。允许未签名预览路径，就会导致发布通道无法证明它所宣称的原生行为。

## 决策

每个公开的 `desktop-v*` 产物都必须使用 Developer ID Application 证书签名并完成公证。预发布后缀只控制更新行为与资产选择，不改变信任级别：预览标签生成经过签名与公证、用于手工替换的 DMG；稳定标签还会生成 `electron-updater` 使用的 ZIP、blockmap 和合并元数据。

[`desktop-release.yml`](../../../../.github/workflows/desktop-release.yml) 对两条通道都要求证书与 App Store Connect API key Secrets。每个原生构建都会强制签名与公证，使用 `codesign` 验证完整 bundle，拒绝缺少 Developer ID Application authority 或只有 ad-hoc 签名的产物，验证 DMG 已装订的公证票据，并且只创建 Release 草稿。维护者从安装后的产物完成测试后再发布。

未签名的本地构建仍可用于源码迭代与打包冒烟测试，但它们绝不是公开发布产物，也不能作为通知、更新、Keychain 行为或其他依赖稳定应用身份的 macOS 能力的验收证据。仓库的 [Mint 功能工作流](../../../skills/dsh-mint-client-feature/SKILL.md)要求从签名并公证的产物执行相关 macOS 交互测试。

本决策只取代 [Mint 桌面下游开发](2026-08-24-mint-desktop-downstream-development.zh.md)与[预览版手工更新提醒](../feature/2026-08-24-desktop-manual-preview-updates.zh.md)中的未签名预览部分。下游仓库模型、预览版手工更新流程、签名稳定版更新器和由维护者控制的 Release 草稿发布均保持不变。

## 考虑过的备选方案

**保留未签名预览版，并说明通知不可用。** 这样可以继续在没有凭据时分发，但预览版将无法验证原本需要测试的原生功能，同时还会展示一项无法产生操作系统效果的可见设置。

**使用完整的 ad-hoc 签名。** ad-hoc 签名可以封装 bundle 资源并通过 `codesign` 结构校验，却无法提供稳定的发布者身份，而且 macOS 仍会拒绝 Electron 43 通知。

**降级到 Electron 41。** 较旧的通知后端可以从未签名应用展示通知，但固定在不受支持的 Electron 世代，会用当前安全性与平台维护能力交换临时的发布捷径。

**通过 AppleScript 或内置通知程序发送通知。** 通知横幅会携带另一个应用的身份，或者要求第二个原生可执行文件与激活协议。这会削弱产品身份，并绕过 Electron 对原生应用生命周期的持有关系。

## 验证

工作流约定测试会要求两条发布路径都具备签名 Secrets、强制签名、公证、Developer ID 身份检查与票据验证，同时证明只有稳定版包含自动更新资产。文档检查会让公开发布与本地构建限制在两种语言中保持同步。

Release 验收会安装工作流生成的 DMG，确认 bundle 身份与公证票据，运行打包冒烟测试，启用相关设置，让应用在后台完成一个真实任务，观察 macOS 通知，再激活通知返回匹配任务。renderer shim 与未签名本地构建仍是较低层级的证据，绝不能替代这项交互。

## 后果

维护者配置 Apple Developer 与 App Store Connect 凭据前，无法创建任何公开预览版，而且两个架构都会增加签名与公证时间。作为回报，预览版与稳定版共享一项持久应用身份，原生功能测试会经过与用户产物相同的操作系统信任模型，Gatekeeper 可以验证发布者，发布说明也不会再宣称产物无法执行的行为。
