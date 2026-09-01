# 诊断上游采纳阻塞与 Mint 发布告警

[English](brief.md) | 中文

- ID: `20260831-upstream-mint-release-incident`
- Size: `L`
- Status: implementation-ready
- Created: 2026-08-31

## 技术决策就绪度

- Outcome: `decision-accepted`
- Trigger evidence: 修复会改变上游同步与桌面发布 workflow 之间的持久采纳状态、重试和恢复语义、GitHub workflow 所有权、发布完成判据、通知行为，以及 owner-authenticated policy-attestation boundary
- Decision owner: Tech Lead (`release_redesign_author`)
- Governing decision: [事务化上游采纳与经验证的 Mint 发布](technical-decision.zh.md)（`Status: Accepted`，包含 Observer path 与初始 policy bootstrap 修订）
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: 独立 Tech Lead `policy_bootstrap_decision_review` 在验证 stable path routing、pre-credential authorization、可执行 historical verification、一次性 monotonic initialization、field-limited CAS mutation、drift blocking 与 sequence-plus-one recovery 后，批准了准确持久化的修订
- Material product decisions: none；建议保留有序采纳、无签名预览默认值以及用户控制安装
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-01T10:13:30+08:00
- Confirmation basis: 独立评审批准准确持久化的恢复边界，且没有未解决 trigger、product decision 或 implementation blocker
- Readiness history: 2026-08-31 — 已在不编辑生产 workflow 的前提下完成诊断；实施曾因缺少决策和评审而阻塞。2026-08-31 — 第一次独立评审把工作从 M 重分类为 L，并要求六项边界修正。2026-08-31 — 后续评审要求准确分离 state writer、finalizer/publication credential 与 tag creation；持久化的三 App 与双 tag ruleset 设计满足这些修正并获得批准。2026-08-31T15:10:27+08:00 — 实施在共享代码编辑前重新打开 readiness，因为 GitHub 在调用者没有 ruleset write access 时隐藏 `bypass_actors`，并要求 `Environments: read` 才能列出 environment secret name；这两项都不属于已接受的三 App least-privilege 模型。2026-08-31T15:18:25+08:00 — owner-authenticated policy-attestation 修订获得独立批准并恢复 implementation gate；在 live App、ruleset、environment、activation record、signed receipt 与 verify-only evidence 齐备前，生产仍为 activation-blocked。2026-08-31T15:41:26+08:00 — 实施证明 activation file 无法包含其所在 commit 的 SHA 后使 gate 失效；activation code 恢复前必须采用 non-self-referential owner proof。2026-08-31T15:55:48+08:00 — 独立评审批准已持久化的 squash-only authorization 与 monotonic receipt-renewal 修订，恢复 implementation-ready，同时把 production activation 保留为独立 live-evidence gate。2026-09-01 — live validation 成功，但 Observer job 因 control flow 使用动态 run name 而全部跳过；必要 workflow hotfix 之后，sequence-one policy 在 protected state 初始化前发生 drift，monotonic sequence-two renewal 正确拒绝 null predecessor。门禁因 Observer path 与一次性 bootstrap 修订重新打开。2026-09-01T10:13:30+08:00 — 独立评审批准准确持久化的修订，并恢复 implementation-ready。

## 目标

确认 DeepSeek Harness 自动采纳为何没有产出新的 Mint DSH Release，解释重复的定时 workflow 通知，并产出获得批准且 implementation-ready 的重设计。

## 背景

下游仓库按发布时间顺序轮询公开的上游 `dsh-v*` Release。其持久状态仍停留在 `dsh-v0.1.1-rc.2` 和 `desktop-v0.1.0-preview.5`。上游分别在 2026-08-27 和 2026-08-30 发布了 [`dsh-v0.1.2-alpha.1`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.2-alpha.1) 与 `dsh-v0.1.2-alpha.2`，但两者都没有到达下游 Desktop Release。

## 范围

- 范围内：检查定时 Actions、准确失败步骤及日志、上下游 Release 状态、阻塞记录、workflow 行为、恢复文档和通知放大机制；定义并独立评审持久自动化设计。
- 范围外：在本次诊断中改变 GitHub 仓库状态、重跑或禁用 workflow、解决上游合并、推进采纳状态、创建 tag 或 Release，或编辑生产 workflow。

## 验收标准

- [x] AC-1：根据远端证据识别第一个失败 Release、重复失败阶段及受影响的下游发布状态。
- [x] AC-2：把主要原因与凭据、签名、打包、runner 波动以及无关定时 workflow 区分开。
- [x] AC-3：解释同一事故为什么会产生重复的 Actions 失败和 blocker Issue 活动。
- [x] AC-4：提供保留队列与发布 provenance 的有序恢复方案。
- [x] AC-5：定义包含重试去重、可评审的冲突处理、发布验证、告警治理和聚焦测试覆盖的优化方案。
- [x] AC-6：持久化一项 Accepted 技术决策，完整覆盖 state、identity、receipt、artifact、signing、finalization、publication、recovery、migration 与 compatibility 边界，并由独立 Tech Lead 批准。

## 事故证据与根因

最后一次成功的定时轮询是 2026-08-27 15:17:43Z 的 [run 33087024368](https://github.com/mintgao/dsh-desktop/actions/runs/33087024368)，发生在 `alpha.1` 发布之前。从 2026-08-28 00:37:07Z 的 [run 33130293188](https://github.com/mintgao/dsh-desktop/actions/runs/33130293188) 到 2026-08-31 01:38:44Z 的 [run 33348210396](https://github.com/mintgao/dsh-desktop/actions/runs/33348210396)，观察到的 16 次定时失败都从同一下游 head `f97cfe48d55e9f52cf100718088f6f7629369d88` 出发，目标都是同一上游 tag 和 commit：`dsh-v0.1.2-alpha.1` 与 `cd5ef8148158c3a752a658978873241fdf8e2bbc`。

每次失败都在 `Merge upstream release` 停止，并出现相同的 33 个内容冲突路径。冲突覆盖生成文档和翻译、官方 CI workflow、根指令、lockfile、notices 与 catalogs，以及共享 CLI、boot profile、脚本和 TypeScript 配置代码。fetch 与 Release 解析成功，依赖安装、验证、Mint 打包、状态推进、tag push 和发布分发均被跳过。因此当前事故是上下游合并冲突，不是凭据、Apple 签名、打包、网络或 runner 波动。定时 real-API E2E workflow 因官方仓库 guard 而跳过，没有构成另一个失败来源。

首次停止冲突采纳符合当前自动采纳决策。运维缺陷出现在停止之后的重试策略：每半小时执行意图会反复尝试一个未变化的确定性冲突。[Issue 25](https://github.com/mintgao/dsh-desktop/issues/25) 在第一次失败时创建，后续相同失败继续追加内容近似相同的 Action 链接。GitHub 失败 run 通知是已证实的主要告警来源；根据收件人的通知设置，Issue 订阅通知还可能形成第二个来源。

由于有序采纳有意不跳过版本，`alpha.2` 仍排在被阻塞的 `alpha.1` 后面。上游驱动的 `Release DSH Desktop` workflow 从未被分发，因此最新下游制品仍是 `desktop-v0.1.0-preview.5`。

## 即时恢复

从当前 `main` 创建普通恢复分支，合并准确的 `dsh-v0.1.2-alpha.1` commit，并按所有权解决冲突：从权威英文或源输入重新生成 generated 与 i18n 制品，保留 Mint 自有 overlay 和下游 workflow guard，逐项评审真正的共享代码冲突。运行与已解决表面匹配的检查，通过评审把该分支合入 `main`，然后为 `alpha.1` 重跑采纳 workflow。不要手工编辑 `.github/upstream-sync-state.json`、创建 desktop tag 或发布 Release；必须由 workflow 一致地记录有序采纳与 provenance。`alpha.1` 成功发布后，再把 `alpha.2` 作为下一项独立队列条目处理。

恢复尚未就绪期间，应在 workflow 层抑制告警风暴，而不是把个人邮箱规则当作主要修复：已知且未变化的 blocker 应成为成功的定时 no-op。只有在明确记录重新启用负责人和条件时，禁用 schedule 才适合作为临时运维动作。

## 建议的持久优化

Accepted [技术决策](technical-decision.zh.md)及其[治理 proposal](../../../.agents/notes/proposed/process/2026-08-31-transactional-upstream-adoption-and-verified-desktop-publication.zh.md)归属实施边界。以下摘要只提供事故层导览，不能替代这些契约。

使用由上游 tag 与 commit、下游 `main` commit、失败阶段和归一化失败指纹共同组成的持久 attempt identity。第一次定时失败创建或更新一个 blocker Issue；之后相同 identity 的定时轮询成功返回，不再重复合并或追加评论。下游 head、目标或指纹发生变化，显式手工 force 输入，或 blocker 被清除时，才允许重新尝试。

把发生冲突的采纳移动到 bot 管理的 integration branch 与 pull request。干净合并可以在所需检查通过后自动继续，而冲突会成为可见的评审表面，不再只存在于临时 runner 工作区。采纳 pull request 合并后，由 finalizer 推进状态和不可变 desktop tag。

把源码采纳与制品发布记录为显式阶段，例如 detected、adoption-blocked、adopted、release-pending 和 published。发布拥有独立的去重 blocker 与重试政策。完成必须验证预期 tag commit、公开或草稿状态、两个架构的 DMG、checksums、release mode 以及上下游 provenance；仅仅分发 release workflow 或发现 Release 对象并不足够。

只在首次失败、阶段或指纹变化、恢复成功或长时间违反服务级别时通知。增加覆盖首次失败、相同定时重试、head 变化重试、手工 force、成功关闭 blocker、有序处理下一 Release、部分或草稿发布、发布失败和进行中去重的场景测试。把硬编码初始状态的 workflow 测试替换为 schema 与状态转换不变量，并在下游采纳和 CI 路径中实际执行这些测试。

## 风险与开放决策

- 获批重设计要求安装三个仓库 App identity、配置 protected environment、启用 branch/tag ruleset，并在迁移前通过 live preflight；当前仓库尚未激活这些外部控制。
- 必须编码 generated 与双语文件的所有权，使恢复流程重新生成权威输出，而不是保留偶然的合并结果。
- 若要量化 failed-run 邮件与 Issue 订阅邮件的比例，需要邮件头或个人 GitHub 通知设置；该区别不影响仓库层修复。
