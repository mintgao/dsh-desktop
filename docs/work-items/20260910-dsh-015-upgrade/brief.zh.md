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

[初始评估](technical-decision.zh.md)记录了本决定之前的顺序问题。[追赶 ADR](../../decisions/20260910-desktop-catch-up-delivery.zh.md)已接受并经独立审核。[原生评估](native-assessment.zh.md)指向已接受的 Phase B 决策和强制场景清单。

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

## Phase B 技术决策就绪状态

- Outcome: decision-accepted
- Trigger evidence: 原生所有权、持久格式迁移、打包运行时兼容性和发布证据 schema
- Decision owner: upgrade_native_assessment and upgrade_decision
- Governing decision: [Mint 目标集成](../../decisions/20260910-desktop-mint-target-integration.zh.md)与[规范迁移清单](../../decisions/20260910-desktop-mint-migration-registry.zh.md) (Accepted)；组合、场景及报告字段以规范清单为准
- Review mode: independent-agent
- Review result: approved
- Review evidence: [classification_review 仅设计批准](phase-b-design-review.json)，绑定原提案与规范清单摘要；设计批准不能证明运行时资格
- Material product decisions: 一次追赶升级 PR 和一次 Desktop 发布；保留精确目标；合并、发布和替换已安装应用仍需分别授权
- Open blockers: none
- Gate: implementation-ready
- Gate owner: Workflow orchestrator /root
- Confirmed at: 2026-09-10T04:40:43Z
- Confirmation basis: 所有者批准精确目标及追赶；Phase A 已合并至 6ee47a62b853cde7a91b4e43aca6da29754c40fd；ADR 与清单已接受；classification_review 批准已落盘双语忠实性及全部 56 个 ID；Workflow orchestrator /root 确认无未决产品或技术选择。
- Readiness history: 已批准外部设计已持久化为中英文权威文件；尚未编辑 Phase B 应用或共享实现代码

## Persona 兼容性技术决策就绪状态

- Outcome: decision-accepted
- Trigger evidence: 上游所属可复用解析器中的用户预设配置兼容性
- Decision owner: preset_compat_decision
- Governing decision: [用户预设兼容性](../../decisions/20260910-persona-authored-preset-compatibility.zh.md)（Accepted）
- Review mode: independent-agent
- Review result: approved
- Review evidence: [classification_review 设计批准](preset-compatibility-review.json)，包含 schema/catalog 补充
- Material product decisions: none；保留已接受的用户预设要求
- Open blockers: none
- Gate: implementation-ready
- Gate owner: Workflow orchestrator /root
- Confirmed at: 2026-09-10T07:52:39Z
- Confirmation basis: /root 在任何 persona/catalog 代码编辑前确认 Accepted 双语 ADR、独立作者及评审批准、准确的已跟踪合成证据，以及无未决产品选择
- Readiness history: Phase B 未受影响工作仍为 implementation-ready；实际不变用户预设挂载失败仅重开此解析器/目录修复

目录输入类型选择确认：工作流编排者 `/root` 在核对 Accepted 双语补充及[评审记录](preset-compatibility-review.json)绑定的独立批准后，于 `2026-09-10T08:00:25Z` 确认 `implementation-ready`。确认先于类型选择编辑；其他 Phase B 要求仍然有效。

## 种子会话查询技术决策准入

- Outcome: decision-accepted
- Trigger evidence: 既有历史验证、继承事件语义与分离查询所有权
- Decision owner: preset_compat_decision
- Governing decision: [种子会话查询恢复](../../decisions/20260910-seeded-session-query-restoration.zh.md) (Accepted)
- Review mode: independent-agent
- Review result: approved
- Review evidence: [classification_review 设计批准](seeded-query-review.json)，绑定提案 SHA256 d19640306b35e02840e01104a6cacce04a568fa2ec12440810e8a2842d220856
- Material product decisions: none；保留精确查询与历史要求
- Open blockers: none
- Gate: implementation-ready
- Gate owner: Workflow orchestrator /root
- Confirmed at: 2026-09-10T09:02:31Z
- Confirmation basis: /root 确认了 Accepted 双语 ADR、独立批准的提案、四份文档/证据的精确 blob，以及确认前查询代码没有受影响的修改
- Readiness history: 真实已交付子会话查询拒绝记录于[合成证据](seeded-query-evidence.json)；不受影响的 Phase B 实现继续获得授权

## Shell 资格验证夹具

`pwd` 探针请求足够的标准输出字节数，以容纳完整的 UTF-8 工作目录和换行符。配置的 64/80 字节默认值仍单独断言，并用于溢出探针。源码收集器回归覆盖较长的 ASCII 和多字节路径；仍须执行受保护的封装产物资格验证。

原生夹具诊断在清理前保留当前阶段、已取得的启动观测及最后 32 条协议操作状态变化。不记录参数、表达式或回复；取消文本仅限夹具自有原因。诊断写入尽力完成，既不延长截止时间，也不代表通过资格验证。
