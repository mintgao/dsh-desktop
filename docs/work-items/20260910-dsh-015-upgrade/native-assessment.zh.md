# 原生集成与迁移评估

[English](native-assessment.md) | 中文

## 当前权威

原生与数据提案已由[已接受 Mint 集成决策](../../decisions/20260910-desktop-mint-target-integration.zh.md)和[规范组合及场景清单](../../decisions/20260910-desktop-mint-migration-registry.zh.md)解决。精确组合、强制场景 ID 和报告字段以规范清单为准。技术作者为 `upgrade_native_assessment` 与 `upgrade_decision`；`classification_review` 独立批准了设计。[审核记录](phase-b-design-review.json)通过摘要绑定原始文件。

直接升级与恢复基线为实际已交付 `desktop-v0.1.2-alpha.3.unsigned.1`，下游 `67406fc6af451f7f68874cb31c2d0f3242c0c8ad`。此前策略检出不能代替该已交付运行时。目标仍为 `b2e3b2a0125854567a4a5fcba75782e42fe84901`。

## 尚需证据

设计接受不等于候选认证。[工作项就绪记录](brief.zh.md)要求编排者在开始应用或共享实现前确认。打包 arm64/x64 直接升级、完整存储与设置场景、备份及恢复、精确运行时身份和独立默认验证仍是尚未执行的资格认定义务。设计落盘期间未启动原生应用或访问用户数据。合并、发布及替换已安装应用需分别授权。
