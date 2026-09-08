# 实现经审查的桌面发布交付

[English](brief.md) | 中文

- ID: `20260908-desktop-reviewed-delivery`
- Size: `L`
- Status: local implementation verified; remote activation pending

## 授权与产品结果

所有者在[交付决策](../../decisions/20260908-desktop-update-delivery.zh.md#owner-confirmation) 中确认 GitHub 保护与逐次发布确认的信任模型。继续实现普通上游采用审查及统一客户端发布交付。[二次开发规范](../../context/downstream-policy.zh.md) 约束可复用工具与 Mint 配置。无论组件如何变化，终端用户只接收一次桌面更新。

[试运行实现](../20260908-desktop-delivery-shadow/verification.zh.md) 已通过本地验收和默认检查，在此基础上继续。保留无关工作树修改。在本地实现并测试完整的下一步操作路径，包括迁移预检与恢复；远程启用必须具备确切保护、凭证、唯一写入者及产物证据。本任务不隐含授权发布未指定版本或替换用户已安装应用。

## 验收标准

- RD-1：有序发现为每个上游版本准备一个可审查的采用变更，包含源码身份、冲突与版本检查及源码锁定；不隐含合并或发布。
- RD-2：验证将确切干净下游提交与源码锁定绑定到完整原生产物、记录证据和最终清单；产物变化或缺失及未经验证的签名模式均拒绝。
- RD-3：显式发布提升验证已批准清单、运行身份、确切源码与直接前序；草稿、上传与发布核对及公开验证可幂等恢复，冲突阻塞而不覆盖。
- RD-4：唯一变更负责人串行执行发布、撤回与恢复；迁移检查所有旧入口，防止延迟回调与替代流程竞争。缺少在线控制则阻止启用。
- RD-5：维护者收到可审查的操作与错误摘要；不变阻塞不会重复变更或通知。本地测试通过共享工具运行第二份发行版，产品默认值保持在配置中。
- RD-6：针对性行为和失败恢复测试、工作流检查及独立默认验证覆盖最终实现；原生、签名、安装、GitHub 通知和迁移限制明确记录。

## 所有权

只读 Tech Lead 作者和独立审查者在唯一 RD 写入者修改脚本与工作流前解决确切可执行架构。协调者负责文档和就绪确认。独立 QA 负责最终验收与配置默认验证。允许扩展现有试运行脚本，但不得把试运行证据作为发布批准。

## 技术决策就绪状态

- Outcome: `decision-accepted`
- Trigger evidence: 发布权限、不可变产物身份、受保护环境、有序采用、远程变更与迁移恢复
- Decision owner: Tech Lead `distribution_design`
- Governing decision: [Accepted operational decision](../../decisions/20260908-desktop-reviewed-delivery.zh.md)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: Tech Lead `distribution_review` approved operational implementation, repeatable seed finalization and scheduled bot-identity notification on 2026-09-08
- Material product decisions: 所有者确认以 GitHub 保护及逐次确认替换自定义 App 策略证明
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-08T12:14:46Z
- Confirmation basis: independent review approved the exact operational decision, seed recovery and scheduled notification identity amendments; owner trust choice resolved; live activation conditional
- Readiness history: 2026-09-08T12:05:53Z operational implementation approved; reopened before scheduled notification edits

## Lineage implementation readiness

Tech Lead `distribution_design` 编写[桌面交付顺序修订](../../decisions/20260908-desktop-reviewed-delivery.zh.md#desktop-delivery-order)；`distribution_review` 批准已落盘的确切文本。协调者于 `2026-09-08T12:31:23Z` 重新开放受影响的前序关系实现关卡。仅桌面及替代版本保留上游身份，记录各自交付前序；相关实现为 `implementation-ready`。

## Bootstrap implementation readiness

独立审查者批准已落盘的首次工作流引导例外。协调者于 `2026-09-08T12:34:26Z` 开放本地引导实现；在线执行仍要求经过独立审查的确切快照、不可变引导标签和受保护环境批准。此关卡不授权远程变更。

独立审查批准引导基线锁定缺失修订。协调者开放这一限定实现；必须证明确切 Git 树中缺失，并绑定固定的现有采用证据。常规采用不能使用此例外。

独立审查批准管理员预检与运行时分离。协调者开放固定仅管理员白名单及摘要绑定证明的实现；通用读取失败仍为阻塞。

独立审查批准首次启用顺序及确切非公开草稿权限探测。协调者开放实现；首次合并包含已验证启用，探测成功要求恢复正文并移除探测资产。此记录不授权远程执行。

## 引导可见性就绪状态

Tech Lead `distribution_design` 编写引导规则集可见性修订，独立审查者 `distribution_review` 批准已沉淀文本。编排者于 `2026-09-08T13:55:05.947606+00:00` 确认该限定修复及拒绝测试为 `implementation-ready`。远程 Actions PR 权限仍是独立授权阻塞。

## 实际时间戳修正就绪状态

运行 `34238478819` 拒绝了等价的管理员和公开 `updated_at` 表示。只读比较确认唯一差异是时区表示。Tech Lead `distribution_design` 编写规则集时间戳修订，独立审查者 `distribution_review` 已批准。编排者于 `2026-09-08T14:35:09.137075+00:00` 确认共享引导及迁移时间戳规范化与测试为 `implementation-ready`，原始证据保持不变。

## 支持性 fixture 修正

采样器候选通过 HMR 验收，但主分支的压缩耗时断言和未处理的表格滚动回调导致 RD-6 失败。受控实验复现了两种失败机制。协调者将修正定为 S 级：由测试控制时钟推进，并完成明确由测试触发的滚动防抖回调，保留产品行为和原有断言。不改变共享约定或持久决策。唯一 RD 写入者仅可修改两个所属测试文件；独立 QA 必须验证变更后的合并候选。失败检查记录予以保留，不对未修改候选进行重试。

## Release PATCH 修正就绪

实际探测在修改说明时改变了草稿标签。Tech Lead `distribution_design` 基于已接受的禁止重新指定标签决策，提出显式 Release PATCH 身份补充。Outcome: `covered-by-accepted-decision`；review mode: `independent-agent`；review result: `approved`；gate: `implementation-ready`。独立批准前，协调者禁止修改受影响源码。所有者恢复已还原精确标签和说明，并删除已验证探测附件；旧权限保持不变。

独立 Tech Lead `distribution_review` 批准已记录的 Release PATCH 身份补充。协调者在 `2026-09-08T16:25:57.440733+00:00` 确认此限定范围的实现就绪状态，没有未解决的决策阻碍。唯一 RD 写入者负责探测与发布协议修正及拒绝测试；独立 QA 负责验证，之后重新执行实际非公开探测。
