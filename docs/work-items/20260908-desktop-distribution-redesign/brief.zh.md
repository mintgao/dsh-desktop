# 桌面发行版原则与更新重设计

[English](brief.md) | 中文

- ID: `20260908-desktop-distribution-redesign`
- 规模：`L`
- 状态：调查与设计；不包含应用实现
- 创建日期：2026-09-08

## 目标

将所有者的二次开发原则沉淀为长期项目要求，复盘桌面架构，并根据反复失败的证据重设计上游更新交付。两项产品需求是基于 DSH 的桌面客户端，以及让桌面用户发现、获取和应用 DSH 更新的方式。当前与未来的每项新增能力都必须遵循插件组合，明确复用途径和兼容性证据，并对其他 DSH 开发者有价值。

## 范围

本任务修改项目规则、产品上下文和设计记录，只读检查源码与远程历史。不实现替代流水线，不批准或合并采用 PR（Pull Request），不改变仓库控制，不发布产物，也不替换已安装应用。保留现有工作树修改和恢复分支实验。

## 验收标准

- AC-1：根指令和 Vibe 项目规则指向同一份长期二次开发规范，覆盖当前与未来需求、插件职责、复用、兼容性和范围控制。
- AC-2：区分桌面运行时、可复用插件、Mint 默认值、原生适配器和发布设施；指出具体偏差，不假设恢复分支所有改动均已交付。
- AC-3：通过源码与 GitHub 证据，区分已观察到的历史故障、当前更新阻塞和架构推断。
- AC-4：沉淀覆盖上游发现、源码采用、产物创建、发布、客户端更新体验、兼容性、安全、失败恢复、迁移和端到端验收的替代方案；独立审查确切决策。
- AC-5：区分已接受的项目原则、待决定的产品取舍和未实现设计；验证修改的文档，并记录跳过或阻塞的检查。

## 技术决策就绪状态

本节保留设计阶段的评估。所有者随后已确定信任模型；[经审查交付工作项](../20260908-desktop-reviewed-delivery/brief.zh.md) 负责已接受的实现就绪状态及当前验证。

- Outcome: `decision-required`
- Trigger evidence: 重设计跨越源码采用、发布权限、产物来源、版本兼容、安装和恢复
- Decision owner: Tech Lead `distribution_design`
- Governing decision: [审查采用与产物确认发布](../../decisions/20260908-desktop-update-delivery.zh.md)（`Status: Proposed`）
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: 独立 Tech Lead `distribution_review` 于 2026-09-08 验证源码锁定记录与 manifest 排序、最终产物批准身份、唯一写入者切换和有界重试后，批准确切修订 ADR；批准以所有者选择为前提
- Material product decisions: 所有者接受 Agent 辅助维护者确认、GitHub 通知与可选邮件，以及无需组件决策的统一整客户端更新；用 GitHub 平台保护替换签名证明仍待决定；保留按序交付
- Open blockers: 发布信任模型选择及后续所有者澄清的审查待完成；本工作项不授权替代实现
- Gate: `blocked`
- Gate owner: Workflow orchestrator
- Confirmed at: none
- Confirmation basis: none
- Readiness history: 2026-09-08 — 启动调查与设计；独立审查提出四项修正，作者在不增加单独完成台账的前提下补充，审查者有条件批准已沉淀设计。在经过审查的迁移实现前，现有生产决策仍是运行依据

## 证据基线

当前检出是 `507e5beb4f` 恢复分支。与已采用上游提交 `dd6322d604e00eec1ba5e0c8541159906a21094a` 比较，包含桌面、通知、发布和额外开发改动；`packages/core` 没有已提交差异。2026-09-08 的桌面、Mint Bundle 和通知针对性测试通过 14 个文件、56 项测试；不证明打包安装或实际更新交付。GitHub 状态 revision 33 记录 `alpha.3` 已发布，`alpha.4` 等待批准。后续证据由调查部分持有。

## 调查

调查者 `update_investigation` 于 2026-09-08 检查源码、事故记录、当前 GitHub 状态、PR 审查和 Actions。以下历史解释标明证据类型；没有重放历史事件。

| 发现 | 证据 | 解释 |
|---|---|---|
| Alpha.1 在 16 次输入不变的调度尝试中遇到 33 个合并冲突路径；构建和发布从未开始 | [既有事故](../20260831-upstream-mint-release-incident/brief.zh.md)、[失败运行](https://github.com/mintgao/dsh-desktop/actions/runs/33130293188) | 历史源码采用失败，被重试放大；不是签名失败 |
| 成功验证后，Observer 因动态运行名称路由而跳过任务 | [恢复决策](../20260831-upstream-mint-release-incident/technical-decision.zh.md)；当前 Observer 使用稳定工作流路径 | 既有事故记录的历史实现缺陷；当前源码包含修正 |
| 工作流热修在空状态初始化前使第一份签名策略证明失效；第二份证明不能初始化它 | [恢复决策](../20260831-upstream-mint-release-incident/technical-decision.zh.md) 和[策略验证器](../../../scripts/upstream-adoption/policy.ts) | 历史初始化与恢复耦合；当前策略已激活，序号为 3，2026-09-29 到期 |
| Alpha.4 的 npm 布局验证因 desktop-mint 缺少匹配 alpha.4 的 workspace 版本而失败 | [验证运行](https://github.com/mintgao/dsh-desktop/actions/runs/33916918346) | 具体版本对齐缺陷；本次复盘未重新验证当前候选 |
| Alpha.4 当前修改受保护路径的候选没有批准 | [PR 64](https://github.com/mintgao/dsh-desktop/pull/64)、远程状态 revision 33、`reviews=[]` | 当前确定性审批阻塞；head 为 `b02b0bc1ed4492715b7003a0b19b8fe38901cd20`，`approvedHead=null` |
| 最近检查的 Controller 成功，但 alpha.4 仍阻塞 | [Controller 运行](https://github.com/mintgao/dsh-desktop/actions/runs/34195142617) 和[协调脚本](../../../scripts/upstream-adoption/controller-reconcile.sh) | 成功表示相同阻塞已去重，不表示桌面更新已交付 |

证据支持分离源码采用、产物验证和发布。持续策略证明与跨工作流依赖对于两项产品需求带来过高维护成本，是架构判断，不是已测量的可靠性统计。Alpha.1、alpha.2 和 alpha.3 未签名桌面版本均已公开；系统曾交付更新，本复盘不声称它从未成功。

## 范围与复用评估

保留桌面的标准启动器和共享 Web 客户端。[Mint Bundle](../../../packages/bundle/desktop-mint/cordis.patch.yml) 选择独立持有的通知插件。原生更新与进程模块缺少受支持的外部分发包；[GitHub Release 解析](../../../apps/desktop-mint/src/github-releases.ts) 硬编码了发布仓库身份。宣称可复用分发前，须单独验证包发布者元数据、外部打包安装和版本兼容性。恢复分支的 Inspector、沙箱及开发工具改动应分类为上游贡献或独立开发工作，不能自动纳入桌面待办。

## 交付状态

[长期规范](../../context/downstream-policy.zh.md) 通过根指令和 Vibe 指令立即适用。替代 ADR 是提案，不是修改生产的许可。规范文档延伸现有产品分层决策，不取代其插件与原生职责理由。旧更新决策的实现仍在运行，因此继续有效。没有归档或替换 Agent Note。

[验证记录](verification.zh.md) 持有独立审查回执、已执行检查及剩余决策。
