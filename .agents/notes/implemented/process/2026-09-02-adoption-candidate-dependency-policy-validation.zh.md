# Agent Note: 采纳候选的依赖策略验证

Status: implemented

[English](2026-09-02-adoption-candidate-dependency-policy-validation.md) | 中文

## 问题

当上游 Release 改变仓库依赖策略时，下游专属包仍可能正常完成合并。桌面测试、构建、类型检查和文档检查不能证明每个保留的 package manifest 都符合当前发布布局，因此已通过资格验证的桌面候选可能成功发布，而下一个普通 PR 才在 `Release (dsh)` 中失败并产生无关的失败通知。

## 决策

事务化上游采纳的 candidate job 在 frozen dependency install 之后、桌面测试、构建或原生打包之前运行 `verify-package-dependencies`。因此，保留包中的陈旧 manifest 会在 State Finalizer 创建 desktop tag 或推进发布阶段之前阻止候选通过资格验证。

下游自有 Client 包遵循[已发布依赖门面](2026-08-26-published-dependency-faces.zh.md)：Cordis 仍同时属于 peer dependency 和 development dependency，而 Client import、类型关系、injection metadata 与 invariant companion 仅属于 development dependency。聚焦的 workflow 测试要求 candidate validation 包含依赖策略命令，`Release (dsh)` 继续保留同一检查，作为普通仓库变更的第二道防线。

## 验证

`verify-package-dependencies` 无需 built artifact 即可验证保留的 manifest。桌面 workflow spec 固定 candidate 命令，其聚焦测试无需调用发布即可验证 workflow 定义。

## 考虑过的替代方案

**依赖 `Release (dsh)`。** 该 workflow 会在后续 PR 或 `main` push 中发现 manifest 缺陷，但此时 adoption candidate 可能已经生成公开的桌面 Release。

**在采纳期间运行完整 npm release workflow。** 候选资格验证只需要确定性的 dependency-section 检查，不需要无关的打包、发布 job 及其仓库 guard。

**豁免下游专属 Client 包。** 这些包随同一仓库和发布图一起交付；豁免会使已安装依赖布局取决于包的来源，而不是当前 artifact contract。

## 后果

候选验证增加一次仅检查源码的命令。影响保留 Mint 包的上游策略迁移必须在 adoption PR 中显式适配 manifest，失败会出现在该评审表面，而不是后续无关 PR 中。
