# Agent Note: 申请证书前的未签名桌面预览版

Status: implemented

[English](2026-08-27-pre-certificate-unsigned-desktop-previews.md) | 中文

## 问题

DSH Desktop 在维护者尚无 Apple Developer 证书期间是个人与小范围产品。如果因为缺少签名凭据而阻断上游引入，就违背了产品最主要的发布策略：每个已经公开的上游 DSH Release 都必须自动进入桌面发行版。把未签名应用按稳定版本发布也会产生另一项问题，因为客户端会选择签名自动更新通道，Release 还可能显得在承诺并不存在的 macOS 信任身份。

因此，发布阶段必须成为持久的项目状态，而不是由某段对话或某台机器记住的假设。后续 Agent 需要一个默认值、一项显式切换，以及能够直接体现当前信任级别的产物行为。

## 决策

仓库变量 `DESKTOP_RELEASE_SIGNING_MODE` 持有发布信任阶段。变量不存在和取值 `unsigned-preview` 都选择申请证书前的默认阶段。只有维护者明确确认 Apple Developer 资格、Developer ID Application 证书和 App Store Connect 公证凭据已经就绪，才能把它设为 `signed`；仅添加 Secret 不会改变阶段。

在 `unsigned-preview` 阶段，自动上游引入不要求 Apple Secret。稳定上游版本映射为 `desktop-vX.Y.Z-unsigned.1`，已有上游预发布后缀则追加 `.unsigned.1`。即使上游版本稳定，这项后缀也会让打包应用使用手工预览发现。发布工作流关闭签名身份自动发现，构建 arm64、x64 DMG，拒绝意外出现的 Developer ID 身份，写入校验和，并以 **Unsigned Preview** 标题发布 GitHub Pre-release。它不会发布 ZIP、blockmap、`latest-mac.yml`、Latest 标记，也不会宣称通知等依赖应用身份的原生行为可用。

在 `signed` 阶段，已有的签名发布规则生效。上游版本与桌面版本准确对应；签名预发布版仍为手工预览版，签名稳定版可以发布自动更新产物并成为 Latest。此时工作流会要求全部五项 Apple Secret，强制签名与公证，并验证 Developer ID 身份和已装订票据。阶段切换只影响后续标签；不可变的未签名标签及其来源记录保持不变。

根目录 [`AGENTS.md`](../../../../AGENTS.md) 持有常驻规则，[桌面应用参考](../../../../apps/desktop/README.zh.md)持有操作者流程与限制，[自动引入上游并发布桌面版](2026-08-27-automatic-upstream-desktop-releases.zh.md)持有排队、引入、发布、撤回与交接记录。[公开桌面版签名](2026-08-25-signed-public-desktop-releases.zh.md)仍然持有签名模式的身份与验收要求；本决策是它在申请证书前的显式例外。

## 考虑过的备选方案

**阻塞引入，直到完成 Apple 资格申请。** 这样可以保留只有签名版的公开历史，却会因为一项期限不确定的行政前提而放弃自动跟随上游，并把凭据变成源码引入依赖。

**按准确的稳定版本发布未签名产物。** 稳定语义化版本会选择签名更新生命周期、允许 Latest 发布，并掩盖缺失的信任身份。显式预发布后缀让发行与客户端行为保持一致。

**所有 Secret 恰好存在时自动启用签名模式。** Secret 是否存在不能记录维护者的产品决策，还可能在凭据试验或不完整交接后切换公开通道。具名仓库变量让启用操作明确且可审查。

**永久移除签名与公证。** 小范围预览并不足以放弃签名稳定版路径。阶段策略在保持当前交付的同时，保留了切换到 Gatekeeper 可验证身份、原生验收与签名自动更新的明确路径。

## 验证

工作流测试要求 `unsigned-preview` 为默认值，要求确定性的未签名版本后缀、关闭签名身份发现、不包含稳定更新产物，并要求 Apple Secret 校验只在条件满足时执行。测试还会保留显式变量控制下的签名预览版与签名稳定版断言。Release 说明会用中英文标明未签名产物，解释手工处理 Gatekeeper 的方式，并排除依赖应用身份的原生能力声明。文档检查会让根目录常驻规则、贡献者流程、桌面参考与活跃 Agent Note 保持同步。

下一次真实上游 Release 是生产验收路径：引入任务会在没有 Apple Secret 的情况下推进，桌面标签包含 `unsigned.1`，两个原生任务发布 DMG 与校验和，GitHub 把 Release 标记为 Pre-release 而不是 Latest。签名模式验收仍然使用 Mint 功能工作流要求的已签名、公证 macOS 交互。

## 后果

完成 Apple 资格申请前，项目仍会跟随上游并公开小范围预览版，每台机器或每个 Agent 都能从仓库状态判断当前信任阶段。用户必须明确绕过 Gatekeeper，不能依赖通知、稳定自动更新或经过验证的发布者身份。原生发布任务仍会占用两种 macOS 架构。切换到签名模式需要维护者明确确认、修改仓库变量、配置全部五项 Apple Secret，并提供签名验收证据；它不会追溯改造过去的未签名版本。
