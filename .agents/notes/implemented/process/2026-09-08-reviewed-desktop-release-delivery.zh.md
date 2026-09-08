# Agent Note: 经审查的整客户端桌面交付

Status: implemented

[English](2026-09-08-reviewed-desktop-release-delivery.md) | 中文

## 问题

即使只有内置 DSH 运行时变化，桌面用户也需要一次统一更新。维护者需要审查采用、诊断资格验证失败并恢复交付，而不必在多个自定义 GitHub App 和过期策略证明之间重建权限关系。安装包启动本身不能证明安装内容完整或发布安全。

## 决策

[经审查交付工具](../../../../scripts/desktop-delivery/cli.ts) 分离发现、可审查源码准备、原生资格验证和显式版本变更。Mint 身份保留在[发行配置](../../../../.github/desktop-delivery/mint.json)。运行时行为遵循[下游规范](../../../../docs/context/downstream-policy.zh.md)；交付基础设施不引入 Agent 或 Session 实现。

[操作决策](../../../../docs/decisions/20260908-desktop-reviewed-delivery.zh.md) 定义已接受的管理员信任模型、源码与交付前序关系、不可变清单批准、有界引导例外及恢复义务。GitHub 保护和维护者批准提供权限。文件摘要标识获批字节，不是独立授权签发者。

初始未启用的替代机制保留[试运行工作流](2026-09-08-desktop-delivery-shadow.zh.md)，启用写入者前要求验证迁移。[旧采用记录](2026-08-27-automatic-upstream-desktop-releases.zh.md) 仍与保留的工作流和迁移证据相关，其自动发布策略不约束替代机制。[未签名预览](2026-08-27-pre-certificate-unsigned-desktop-previews.zh.md) 和[签名身份](2026-08-25-signed-public-desktop-releases.zh.md) 决策保留信任限制。这些是部分重叠，并非完全取代。

每次 Release PATCH 都保留获批的不可变标签、显式可见性和预发布状态。完成操作前必须按同一 ID 重新读取并验证预期状态，包括探测正文。身份偏移会停止后续写入并要求维护者恢复；重试不能重新指定冲突版本的标签。

## 考虑过的替代方案

**保留多个自定义 App 和签名策略证明。** 它们分离凭证，却增加当前维护者无法可靠完成的操作依赖。所有者接受 GitHub 管理员作为信任根，保留审查、产物验证和显式发布批准。

**自动发布每个上游版本。** 上游可用不证明桌面兼容或用户数据兼容。经过审查的采用和合格发布仍是维护者分别作出的选择。

**向用户提供独立运行时与桌面更新通道。** 这要求用户管理组件兼容。单一桌面版本承载已验证组合，确切组件身份仍可用于诊断。

## 后果

仅桌面修复保留上游身份；采用新上游保留其顺序。撤回移除发现入口，不远程降级已安装应用。恢复要求保留的确切字节。复制安装不能证明现有用户数据迁移或依赖签名的原生能力。

[验证记录](../../../../docs/work-items/20260908-desktop-reviewed-delivery/verification.zh.md) 拥有已执行证据和剩余限制。[上线前提](../../../../docs/work-items/20260908-desktop-reviewed-delivery/rollout.zh.md) 保留未解决采用并标识在线控制。本地检查不证明远程启用、通知送达或公开版本交付。
