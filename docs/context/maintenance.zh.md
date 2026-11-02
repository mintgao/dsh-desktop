# 维护交接

[English](maintenance.md) | 中文

## 项目状态

DSH Desktop Mint 自 2026-11-02 起进入维护状态。官方已发布 DeepSeek Harness 桌面客户端，因此开发者暂停本非官方客户端的主动开发、常规上游升级和定期发布。不承诺后续更新或支持响应时间。新增功能前须由负责人明确重启开发。

## 保留资料

仓库默认分支继续作为共享源码的权威版本。最新已发布 Mint 应用为 [0.1.5-rc.2.unsigned.1](https://github.com/mintgao/dsh-desktop/releases/tag/desktop-v0.1.5-rc.2.unsigned.1)，对应下载文件和此前发布历史继续保留。[机器交接](handoff.zh.md)负责源码、数据和安装指引。

独立的[维护归档](https://github.com/mintgao/dsh-desktop/releases/tag/maintenance-archive-20261102)保留仅含源码的本机开发改动和提交恢复材料。这些是历史开发中快照，不是通过验收的发行版，也不代表默认分支已接纳这些改动。每份归档注明源码基线和内容，不应将旧快照整体覆盖到默认分支。

凭据、个人会话、用户工作区、原始本机日志和完整机器恢复归档继续私下保存。公开归档不是应用用户数据备份。尚未验证将 Mint 数据迁移至官方客户端。

## 自动化与未完成工作

上游定时发现已禁用。其他手动维护工作流保留；被禁用的发现工作流本身须重新启用后才能定时或手动运行。本次文档变更不发布新的应用版本。

未关闭的 [PR](https://github.com/mintgao/dsh-desktop/pulls) 和 [Issue](https://github.com/mintgao/dsh-desktop/issues)作为历史提案和问题记录保留，不构成交付承诺。本次交接不合并或关闭它们。是否恢复开发仍由项目负责人决定。

## 恢复工作

恢复依赖前先审查确切的源码版本和归档改动。今后的修复须遵循[开发指南](../development.zh.md)、[测试策略](../testing.zh.md)和[下游策略](downstream-policy.zh.md)。上传归档不代表未完成代码通过验收，维护决策也不证明与未来官方版本兼容。
