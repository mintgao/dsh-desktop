# 追平 Mint Desktop 与上游 DSH Release

[English](brief.md) | 中文

- ID：`20260904-upstream-release-catch-up`
- 规模：`L`
- 状态：进行中
- 创建日期：2026-09-04

## 技术决策就绪度

- 结论：`covered-by-accepted-decision`
- 触发证据：恢复跨越上游 Git 仓库、受保护的采用状态、集成拉取请求、不可变 Desktop 标签、双架构产物和公开 GitHub Release
- 决策负责人：Tech Lead（`release_redesign_author`）
- 管辖决策：[事务化上游采用与经验证的 Mint 发布](../20260831-upstream-mint-release-incident/technical-decision.zh.md)（`Status: Accepted`）
- 审查模式：`independent-agent`
- 审查结果：`approved`
- 审查证据：独立 Tech Lead `release_recovery_readiness_review` 确认已接受决策完整管辖有序冲突恢复、精确 head 审批、受保护状态、分离身份、不可变标签、产物鉴定、公开验证和撤回，且未引入新的持久决策
- 实质产品决策：无；保留有序上游采用、当前 unsigned-preview 信任阶段、公开且经验证的发布和用户控制的安装
- 未决阻塞：无
- 闸门：`implementation-ready`
- 闸门负责人：工作流编排者
- 确认时间：2026-09-04T18:35:08+08:00
- 确认依据：精确持久化的恢复范围由已接受决策覆盖，独立审查已批准，所有实质产品选择均保持不变，且没有实施阻塞或新的持久决策
- 就绪历史：2026-09-04 — 工作流编排者将生产恢复定为 L，并确认已接受的事务化采用决策适用；实施因等待独立技术审查而受阻。2026-09-04T18:35:08+08:00 — 独立审查批准精确恢复范围，工作流编排者确认 `covered-by-accepted-decision + implementation-ready`。

## 目标

解决 `dsh-v0.1.2-alpha.4` 采用阻塞，并继续有序自动发布队列，直到 Mint Desktop 已公开发布最终观察时可用的每个上游 DSH Release。

## 当前状态与证据

受保护的采用状态将 `dsh-v0.1.2-alpha.3` 记录为最后发布的上游 Release，并在确定性合并冲突后将 `dsh-v0.1.2-alpha.4` 记录为 `adoption-blocked` 交付。2026-09-05 对[上游公开 Release](https://github.com/deepseek-ai/deepseek-harness/releases) 的最新观察确认 `dsh-v0.1.3-alpha.1`（提交 `d347e703908d0406b7a7ef80e3a0e594d86b2215`）是排在 `dsh-v0.1.2-rc.1` 之后的最新队列 Release。有序恢复目标为 `dsh-v0.1.2-alpha.4` → `dsh-v0.1.2-alpha.5` → `dsh-v0.1.2-rc.1` → `dsh-v0.1.3-alpha.1`；后续 Release 只能在前一个 Release 完成后推进。

## 范围

- 包含：在 Controller 所有的候选分支上检查并解决 `alpha.4` 的精确语义冲突；取得所需的精确 head 审批；运行聚焦检查和配置检查；让已接受的 Finalizer 与 Publisher 路径推进受保护状态、标签、产物和公开 Release；继续处理所有后续上游 Release；将最终公开游标与最新获取的上游 Release 观察结果比对。
- 不包含：改变采用顺序、重试语义、受保护状态 schema、App 权限、签名模式、Release 版本映射或更新器行为，也不手动绕过 Finalizer 和 Publisher 协议。

## 验收标准

- [ ] AC-1：`dsh-v0.1.2-alpha.4` 候选根据所属的上游或 Mint 权威来源解决全部冲突，保留下游受保护发布控制，并通过适用的本地和 GitHub 检查。
- [ ] AC-2：已接受的控制平面按发布时间顺序完成每个排队上游 Release，且不手动修改状态、标签或 Release。
- [ ] AC-3：每次完成采用均具有预期的不可变 Desktop 标签、公开 unsigned-preview Release、arm64 与 x64 DMG、校验和以及上游/源码来源证据。
- [ ] AC-4：受保护状态将结束时观察到的最新公开上游 DSH Release 记录为 `lastPublishedRelease`，且没有更早的排队或活动交付未完成。
- [ ] AC-5：`main` 包含最新上游 Release 的精确提交，同时下游发布控制和品牌保持完整。
- [ ] AC-6：独立 QA 验证未变的最终候选、公开 Release 集、受保护游标和一次完整默认 `./bin/vibe verify . --format json` 结果；如果新上游候选使证据失效，则记录原因并重新运行。

## 恢复约束

- 通过已接受决策要求的集成 PR 解决源码冲突；不得直接推送受保护的 `main`。
- 根据权威来源重新生成派生文档或目录，不得任意选择冲突一侧。
- 保留 Mint 所有的工作流、发布策略、品牌、产品 Bundle 和 unsigned-preview 默认值，除非上游证据表明存在有意且兼容的替代。
- 将最终关闭前新发布的上游 Release 纳入队列；完成要求在最后一次 Desktop 发布后重新观察上游。

## 风险与恢复

- 语义冲突可能在编译通过的同时丢弃上游行为变更或下游发布防护；按归属审查每项冲突，并运行覆盖受影响范围的检查。
- 公开发布可通过现有撤回工作流恢复，但不可重写不可变标签和已记录的来源证据。
- 策略过期、凭证漂移、运行器失败或候选 head 变化必须停止受影响阶段并保留受保护恢复状态，不得触发带外发布。
