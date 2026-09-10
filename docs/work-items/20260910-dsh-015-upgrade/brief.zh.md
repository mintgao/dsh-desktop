# DSH Desktop 升级到 0.1.5-alpha.2

[English](brief.md) | 中文

## 目标与范围

所有者于 2026-09-10 授权准备升级至 `dsh-v0.1.5-alpha.2`。产出可审核候选和验证证据。保留原始脏检出目录及 PR 64 跟进分支。合并与发布需要所有者分别决定。该工作涉及七个上游版本、持久化数据、原生所有权和受保护交付，因此属于 L。

Phase A 安装可复用的追赶交付验证和证据机制。Phase B 按其单独接受的决策集成上游应用及原生变更。Phase A 不认定实际目标迁移或打包安装的资格。

## 已接受标准

- AC1：固定精确目标祖先与版本来源，覆盖全部七个中间版本。
- AC2：保留可复用插件所有权与 Desktop Mint 组合。
- AC3：评估数据兼容性，并按需提供迁移与恢复证据。
- AC4：记录聚焦检查、独立最终默认验证和桌面资格认定限制。
- AC5：通过已接受的机器人采纳流程生成可审核 PR 与种子，不绕过保护或发布谱系。

<a id="owner-decision--2026-09-10"></a>

## 所有者决定 — 2026-09-10

所有者批准一次追赶源码采纳 PR 和一次 Desktop 发布。保留全部上游祖先，审核完整中间区间和迁移边。不需要中间 Desktop 发布或反复的所有者合并轮次。即使出现更新的上游发布，目标仍是 `dsh-v0.1.5-alpha.2`。工具 PR 在实际追赶 PR 之前安装可信验证器，不发布中间产品版本。合并与公开发布仍需分别批准。

[初始评估](technical-decision.zh.md)记录了本决定之前的顺序问题。[追赶 ADR](../../decisions/20260910-desktop-catch-up-delivery.zh.md)已接受并经独立审核。[原生评估](native-assessment.zh.md)仍是单独的 Phase B 提案。

## Phase A 技术决策就绪状态

- Outcome: decision-accepted
- Trigger evidence: 源码锁与清单 schema、跨系统验证及发布谱系
- Decision owner: upgrade_decision
- Governing decision: [追赶交付](../../decisions/20260910-desktop-catch-up-delivery.zh.md) (Accepted)
- Review mode: independent-agent
- Review result: approved
- Review evidence: upgrade_readiness_review 于 2026-09-10 批准精确 Phase A ADR；基线起点检查仅适用于追赶，迁移拒绝保持有效
- Material product decisions: 所有者批准一次追赶升级 PR 和一次 Desktop 发布；工具安装先于目标升级，不产生中间产品发布
- Open blockers: none
- Gate: implementation-ready
- Gate owner: Workflow orchestrator /root
- Confirmed at: 2026-09-10T03:27:11.771053+00:00
- Confirmation basis: 已接受的 Phase A ADR、独立审核批准、所有者追赶决定、基线主机验证通过 lint/typecheck/test/build（17,351 通过、119 跳过），doctor：0 警告；不含 Phase B
- Readiness history: 整体 Phase B 仍独立受阻；Phase A 设计已接受并经独立批准
