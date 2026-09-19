# 把 webhook 运行时迁移到 session admission

[English](brief.md) | 中文

- ID: `20260919-session-admission-webhook-migration`
- Size: `M`
- Status: shaping
- Created: 2026-09-19

## Technical decision readiness

- Outcome: `not-assessed`
- Trigger evidence: none
- Decision owner: none
- Governing decision: none
- No-new-decision rationale: none
- Review mode: `not-required`
- Review result: `not-required`
- Review evidence: none
- Material product decisions: none
- Open blockers: none
- Gate: `blocked`
- Gate owner: Workflow orchestrator
- Confirmed at: none
- Confirmation basis: none
- Readiness history: 2026-09-19 创建，用于限定[远程通道连接决策](../../decisions/0001-remote-channel-connections.zh.md)所接受的重复窗口；尚未执行触发扫描，也未编辑任何代码

## Goal

webhook 运行时不再独占"把外部触发变成持久化根 Session"这一事务的唯一实现，改用共享服务，使一套顺序只有一份实现。

## Context

[决策记录](../../decisions/0001-remote-channel-connections.zh.md)在其第 2 节选择了选项 (b)：提取最小的可复用服务、由通道消费方立即采用、webhook 运行时单独迁移。本工作项就是那次迁移，也是限定该记录所接受的重复窗口的东西。

- 服务：`packages/session/session-admission`。
- 重复实现：[`packages/webhook/webhook/src/session.ts`](../../../packages/webhook/webhook/src/session.ts) 中的本地事务。
- 该记录要求的跨包套件：它同时对服务与本运行时执行同一组顺序断言。

## Scope

范围之内：

- 删除 webhook 运行时的本地事务并改为调用共享服务。
- 保持每一处可观察的 webhook 行为不变：session id 的品牌前缀、请求校验错误及其字段名、preset 解析顺序与 standing key 解析、工作区"解析或创建"语义、模型选择继承规则、标题与权限 preset 在接纳之前应用、`source.kind: 'webhook'` 溯源、中止信号贯穿发布阶段被遵守，以及"先解除挂接再释放"的顺序。

范围之外：

- 任何行为变更、任何新增产品界面，以及对 webhook 规则或投递模型的任何改动。
- 通道功能本身；它从首次交付起就使用该服务。

## Acceptance criteria

- [ ] AC-1: webhook 运行时不包含该事务的本地副本，并调用共享服务。
- [ ] AC-2: 一项测试驱动迁移后的运行时，并断言决策记录中不得回退清单的每一项。
- [ ] AC-3: 跨包套件同时对服务与迁移后的运行时执行同一组顺序断言，因此任一方的漂移都会被检出。
- [ ] AC-4: 没有任何用户可见或模型可见的行为变化；覆盖 webhook Session 的录制会话快照保持不变。
- [ ] AC-5: 该改动按[下游策略](../../context/downstream-policy.zh.md)要求的上游贡献或移除路径抵达上游，或记录为何不这样做。

## Design and technical notes

服务约定是[决策记录](../../decisions/0001-remote-channel-connections.zh.md)的第 2 节。迁移把 session id 的品牌前缀、追问来源与错误消息主语作为参数传入，因为该记录要求 webhook 溯源与校验消息保持逐字节一致。

## Risks and open decisions

- webhook 包由上游拥有，因此落地取决于上游评审。在落地之前存在两份实现，而跨包套件是唯一让它们保持一致的东西。
- session id 的品牌前缀与错误主语必须保持为参数而不是变成常量；常量会改变既有 webhook Session 在日志中的标识方式。
