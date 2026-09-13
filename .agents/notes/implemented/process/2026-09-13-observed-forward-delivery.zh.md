# Agent Note: 观测式桌面前向交付

Status: implemented

[English](2026-09-13-observed-forward-delivery.md) | 中文

## 问题

受保护构建证明源码及封装字节，但不能证明操作者替换了应用、保留了设置或恢复了可用安装。把这些声明放进同一 CI 资格记录会掩盖各自责任人，并让不可用的托管 GUI 权限成为发布工具依赖。

## 决策

[Accepted 决策](../../../../docs/decisions/20260913-observed-forward-delivery.zh.md)将 CI 构建收据与明确由维护者声明的本地观测分开。[Forward evidence](../../../../scripts/desktop-delivery/forward-evidence.ts) 校验固定场景协议和有界人工记录；[compatibility evidence](../../../../scripts/desktop-delivery/compatibility-evidence.ts) 一致分派历史及前向评估；[forward package](../../../../scripts/desktop-delivery/forward-package.ts) 组装不可变的 schema-3 元数据，不包含未来 mutation 运行身份。发行版特定的基线与目标身份留在由源码评估绑定的已提交策略中。

构建归档具有固定的 CI 文件集合。manifest 和本地观测仅在该构建后派生，由现有 mutation 包保留并由批准计划绑定。受保护环境批准明确接受确切的有限本地观测并授权指定操作。哈希证明字节，不证明亲自观测。恢复重申原记录；缺少观测载荷时仍可撤回。冻结资格中的公开交付保持 pending，并具有独立的 manifest 绑定验收。

## 考虑过的替代方案

把原生冒烟当作 GUI 验收会认证未经观测的操作。要求托管 GUI 执行器增加了不可用的执行前提，却不能改善本地见证归属。加入安装器或通用恢复服务会改变本发布流程之外的产品行为与所有权。为不同的 A-to-B 基线复用历史迁移报告，会混淆源码历史与已观测的安装恢复。

## 后果

源码校验器能拒绝缺少场景、身份冲突和声明恢复不完整，但不能证明操作者陈述。维护者明确接受这种有限证据。本地备份、profile 内容、凭据和原始诊断不进入发布包。不同构建需要新的观测。历史格式变化、评估原字节和旧 manifest 行为保持不变。

聚焦测试覆盖真实源码定稿后的 manifest 生产者、确定性组装、严格输入解码、CI 归档比较、保留记录恢复及不依赖观测证据的撤回。它们使用合成记录，证明解析／发布行为，不证明实际 GUI 验收。普通私有桌面观测与后续公开获取仍是分别必需的验收；[操作者流程](../../../../docs/cookbook/observed-forward-delivery.zh.md)负责这些步骤。
