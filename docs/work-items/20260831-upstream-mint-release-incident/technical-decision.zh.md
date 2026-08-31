# 技术决策：事务化上游采纳与经验证的 Mint 发布

[English](technical-decision.md) | 中文

Status: Accepted

- Decision owner: Tech Lead (`release_redesign_author`)
- Decision date: 2026-08-31
- Review mode: independent-agent
- Review result: approved
- Governing proposal: [事务化上游采纳与经验证的桌面发布](../../../.agents/notes/proposed/process/2026-08-31-transactional-upstream-adoption-and-verified-desktop-publication.zh.md)

## 决策

采用 governing proposal 作为替换当前上游自动采纳与 Mint Desktop 发布流程的实施边界。实施必须保留按顺序处理公开上游 Release、无签名 preview 默认值、不可变 desktop tag、现有 signed Release 和 withdrawal 要求以及用户控制安装。

accepted boundary 包含由单一 finalizer identity 写入的受保护状态 ref、每个队首 Release 一个 integration PR 和至多一个 blocker Issue、独立 Controller、State Finalizer 与 Publisher App、一次性不可变 validation receipt、无 secret 候选执行、tag 创建前的 artifact qualification、从受信任 control-plane source 隔离签名、三 ref 原子源码 finalization，以及经过公开制品与 provenance 验证的 draft-first 发布。owner-authenticated activation record 与会过期的 maintainer-signed policy receipt 证明仅管理员可见的配置，无需给 runtime App 授予 Administration 或 Environments permission。

## 触发覆盖

本决策归属新的持久状态 schema 与转换规则、源码与发布所有权边界、重试和恢复语义、独立 GitHub App 权限与 ruleset bypass、owner-authenticated policy-attestation protocol、validation-receipt protocol、tag 前 artifact identity、不可变 tag 行为、签名 secret 隔离、手工 desktop tag compatibility 以及失败一致性。这些是工作项识别出的技术决策 trigger。

没有 material product choice 发生变化：用户仍按上游发布时间顺序获得 Release；默认制品在 signing activation 前仍为 unsigned preview；发布不会安装或降级应用；语义冲突以及撤回不一致公开 Release 仍由维护者决定。

## 批准条件

- 由另一位 Tech Lead 评审准确的 governing proposal 与本 acceptance record。
- 批准前持久记录所有 requested change。
- Workflow orchestrator 确认没有 trigger、product decision 或 blocker 尚未解决。
- 只有 work-item gate 变为 `implementation-ready` 后，才能开始 production workflow 实施。

## 评审

独立 Tech Lead `release_redesign_review` 于 2026-08-31 批准准确的持久 proposal；该评审先要求并随后验证：可执行的 Controller、State Finalizer 与 Publisher identity 隔离；active ruleset 与 bootstrap preflight；单 writer state ref；一次性不可变 validation receipt；tag 创建前的双架构 artifact qualification；包含 secret 的隔离签名；受保护 control-plane approval；完整的 conflict-PR 与手工 tag 生命周期；以及独立的 tag creation 与无 bypass immutability ruleset。

实施于 2026-08-31 在共享代码编辑前重新打开本决策。除非调用者拥有 ruleset write access，GitHub 会在 ruleset 读取中省略 `bypass_actors`；列出 environment secret name 又要求 `Environments: read`。已接受的三 App 权限集有意不授予这两项能力。因此，preflight identity 与 drift-detection boundary 必须持久化修订并获得新的独立批准，本决策才能恢复 Accepted。

独立 Tech Lead `release_redesign_review` 于 2026-08-31 批准准确持久化的安全边界修订。评审验证了 least privilege、owner-authenticated bootstrap、确定性 policy drift 与 expiry、有界 rotation 与 recovery、fail-closed unconfigured 行为，以及独立 signed/unsigned secret boundary。

同一独立 reviewer 在要求 merge SHA 不同于 PR head，并固定准确 domain-separated binary framing 后，批准最终持久化的 squash-authorization 与 receipt-renewal 修订。获批 protocol 现在无需依赖 self-referential commit data，即可拒绝含糊 merge shape 与 receipt rollback。

## Preflight 安全边界修订

runtime identity 数量仍为三个。第四个 Auditor App 与扩权 Finalizer 都不会获得 Administration write：能够编辑 ruleset 的 credential 无法独立审计其 bypass actor。Accepted architecture 改为固定 repository-owner bootstrap authority 与 activation protocol。准确 production signer key 之后通过 restricted PR 引入 `.github/release-policy/activation.json`。activation 绑定 repository identity、个人 owner login 与 type、activation PR、rotation ordinal、signer public key 与 fingerprint，以及 rotation 时的 prior activation；它绝不命名自身 commit 或可续期 receipt。activation 通过验证前，finalization、tag creation 与 publication 保持 blocked，但实施和 candidate validation 可在 release policy `unconfigured` 状态推进。

实施于 2026-08-31 在证明 `activation.json` 无法包含其所在 commit tree 的 SHA 后，重新打开 activation-proof 部分。该 hash self-reference 没有可构造的值。修订 protocol 在 merge 后从 GitHub 派生 commit evidence：activation 只命名 PR，protected state 与 acceptance evidence 记录 derived merge SHA 与 policy-bundle digest。

activation 与 receipt authorization 只允许 squash merge。runtime 要求 recorded PR 从同仓库指向 `main`，由当前个人 repository owner 合并，并暴露可到达且不同于 PR head SHA 的非空 merge SHA；其 GitHub verification 必须为 `valid`、committer 为 `web-flow`、parent 数量为一、tree 等于 PR head tree，且 parent-to-commit diff 等于完整分页 PR file list。behind-base tree、merge commit、rebase、fast-forward、fork、external close、truncation、rename、deletion 或 indeterminate shape 一律拒绝。merged-PR record 认证 owner authorization；GitHub commit verification 分别认证 platform commit integrity。

initial activation 准确更改 activation、receipt 与 signature。receipt sequence 为一、没有 predecessor，并以 activation PR 作为 authorization。之后 receipt renewal 准确更改 receipt 与 signature，保持 activation 与其 squash commit byte-identical，sequence 加一，命名自己的 PR，并链接准确 prior receipt ID 与 derived receipt-bundle digest。protected state 分别保存 activation rotation、PR、derived commit、digest 与 signer fingerprint，以及当前 receipt sequence、ID、derived length-framed bundle digest、PR、derived commit 与 expiry。它拒绝跳号或较低 sequence、相同 sequence 替换、predecessor mismatch 与超过一个 pending renewal。当前 receipt bytes 必须保持等于授权它的 initial 或 renewal squash commit。

只有两个 derived authorization commit 仍为 ancestor 且当前 policy bytes 与其匹配时，后续无关 commit 才被允许。signer rotation 递增 activation、链接 prior protected activation 与 receipt state、保留全局 receipt sequence，并证明新 key。旧 key 使用 SSH namespace `dsh-mint-release-policy-rotation-v1` 签署规范 `rotation-statement` bytes；owner-authorized squash PR 再同时更改 activation、receipt 与 receipt signature。旧 key 丢失仍属于 break-glass 工作，需要 reviewed amendment。任何 ownership transfer（包括转入 organization）都会使 activation 失效，并要求新的 reviewed bootstrap amendment，而不是 routine rotation。

`.github/release-policy/receipt.json` 的准确 bytes 使用 SSH namespace `dsh-mint-release-policy-v1` 签名。receipt 最长 30 天过期，记录自身 ID、全局 sequence、authorization PR 与 predecessor、管理员观察到的 bypass actor 与 environment secret name、repository identity、ruleset ID、target、enforcement、condition、rule、`updated_at`、App identity、installation 与 permission、environment protection、protected workflow digest 和 generator version。bundle SHA-256 input 依次是 ASCII domain `dsh-mint-release-policy-receipt-bundle`、NUL、unsigned 32-bit big-endian version one，然后按 receipt、signature 顺序，对每项编码 unsigned 32-bit big-endian UTF-8 path length 与 path，再编码 unsigned 64-bit big-endian raw-content length 与未修改 bytes。runtime preflight 验证两个 owner-authorized PR 与 commit、准确 current bytes、receipt chain、signature 与 digest、expiry、repository 与执行 App identity、workflow digest，以及每个 runtime-visible ruleset field 与 `updated_at`。signed receipt 认证 hidden field；任何 graph、byte、sequence、visible-state、API 或 expiry mismatch 都会在不可逆 mutation 前作为确定性 `policy-drift` 阻塞。复制旧 receipt 会被 protected monotonic state 拒绝。

signed publication 把 workflow 静态限制在准确五个已证明的 Apple secret reference，并通过 non-empty consumption 与现有 signing、API、signature 和 notarization check 证明可用，同时不打印 value。unsigned job 不引用其中任何一个。attested configuration 变化后及过期前，receipt 遵循 monotonic squash-PR chain 续期。production activation 还要求 zero-mutation verify-only run，并把该 run URL、activation 与 receipt PR 及 derived commit、receipt sequence、identity 与 bundle digest，以及适用 signing smoke 记录为 acceptance evidence。
