# 通过恢复流程验证既有会话查询

Status: Accepted

[English](20260910-seeded-session-query-restoration.md) | 中文

## 权威与范围

技术作者：`preset_compat_decision`。独立审查者：`classification_review`，结果为 `approved`，仅覆盖设计。[审查记录](../work-items/20260910-dsh-015-upgrade/seeded-query-review.json)绑定提案 SHA256 `d19640306b35e02840e01104a6cacce04a568fa2ec12440810e8a2842d220856`。[工作项](../work-items/20260910-dsh-015-upgrade/brief.zh.md)负责独立的实现准入。本决策补充 Accepted [迁移场景登记表](20260910-desktop-mint-migration-registry.zh.md)中的精确历史查询与分叉语义保留要求。

[合成失败摘要](../work-items/20260910-dsh-015-upgrade/seeded-query-evidence.json)记录了一个由已交付基线创建、并完成自身续写的分叉。目标版迁移、恢复和进一步真实执行均成功，但公开 `readSession` 以 `seeded session constructor seed must equal its inherited prefix` 拒绝完整子会话历史。既有历史同时包含继承事件和子会话自身事件；新建会话的不变量仍然正确。

## 查询所有权与验证

仅修复可复用的 `@deepseek-ai/dsh-session-query`。通过 `@deepseek-ai/dsh-util-values` 现有的 `snapshotJsonValue` 为每个已加载事件和头部创建验证副本，必要时按常规声明包依赖。在分离验证前拒绝不能无损表示为 JSON 的值。单独使用 `Session.fromRestore` 会漏掉这项检查，`structuredClone` 也不能证明 JSON 可表示性。

使用精确会话身份、继承数量和 detached 模式，通过 `Session.fromRestore` 验证这些副本。保留头部身份/版本、事件封装/序列、表面转换及继承范围检查。不改变新建分叉不变量、Session 构造器、Agent Loop、原生代码、格式版本或迁移代际。

返回已加载观测中的既有分离快照和原始继承数量。不得返回临时恢复 Session 的事件：恢复可能在内存中添加普通 `session/end-seed`，精确查询则不得增加标记。保持冷读取时对中断回合的补全行为不变。查询不创建实时注册、生命周期事件、写句柄或存储字节变更；验证失败不发布部分结果。

这是对上游所属可复用包的一项明确下游修正，不包含 Mint 专用行为。将其列为上游贡献候选，仅在采用的上游实现通过相同检查后移除。向外提交需要单独授权。恢复继续使用完整且已停止写入的备份。

## 替代方案

放宽新建种子会话规则会削弱有效不变量。截断历史、清除种子元数据或修改继承数量会掩盖损坏。返回恢复额外添加的标记违反精确查询结果。通用 Session 验证 API 会让共享基础设施变更超出此次有界修复。

## 必需验证

- 有种子的子会话在刚创建和完成自身续写后，公开实时与冷查询均成功，包括真正从持久化数据恢复的子会话。
- 返回的头部、继承数量和完整事件与已加载观测相同，不添加标记；修改返回字段不能修改来源。
- 查询不创建挂接的 Session、生命周期事件、写句柄或存储字节变更。
- 保留损坏序列的拒绝行为，并拒绝无效头部身份/版本、越界继承数量、无效表面转换以及不能无损表示为 JSON 的头部/事件值。
- 相关新建分叉拒绝检查保持不变。
- 重建真实软件包，执行已交付版本创建子会话、目标版迁移/恢复/续写、公开查询、完整进程重启与冷查询，随后完整恢复备份并观察基线。绑定实际源代码/运行时哈希；单元测试不能单独建立打包资格。
