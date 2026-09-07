# 技术决策：关联 Client Console 就绪状态

[English](technical-decision.md) | 中文

Status: Accepted

- 决策负责人：Tech Lead（`inspector_ack_decision_author`）
- 决策日期：2026-09-04
- 评审模式：independent-agent
- 评审结果：approved
- 评审证据：独立 Tech Lead `inspector_ack_decision_review` 在核验 enable epoch 串行化、迟到 continuation 围栏、realm 线性化与失败隔离、完整 identity 关联、匹配产物恢复及确定性生命周期竞态覆盖后，批准了准确的修订技术内容。
- 适用决策：[跨 realm CDP Inspector](../../../.agents/notes/implemented/architecture/2026-08-23-cross-realm-cdp-inspector.zh.md)与[Inspector 执行 realm 及协议平面](../../../.agents/notes/implemented/architecture/2026-08-26-inspector-execution-realms-and-protocol-planes.zh.md)

## Trigger 覆盖

本决策改变带版本的 Client-to-Worker 协议、Console subscription 所有权、`Runtime.enable` 就绪状态，以及超时、断联、dispose 和陈旧 frame 行为。这些是工作项记录的协议、跨 realm 所有权、兼容性与失败一致性 trigger。

没有未决的重大产品选择。`Runtime.enable` 继续暴露相同的 Host 与 Client context，并保持每个 DevTools session 的对象隔离；它会在返回前满足现有就绪约定。

## 已接受决策的适用性

跨 realm Inspector 决策继续归属 Worker 持有的 CDP 状态、浏览器持有的 Console interception、带类型且有关联字段的 frame family、source generation 及每个 session 的 Client 对象 handle。协议平面决策继续把 wire 类型放在 `shared/bridge/`、浏览器安装放在 `client/`、关联状态放在 `worker/bridge/`，并把 CDP enable 状态放在 `worker/cdp/`。

两项 Accepted 决策都没有定义 Console 安装确认或 pending Console subscription 的生命周期。本决策扩展它们，但不改变其所有权或依赖规则。

## 决策

### 协议

将 `INSPECTOR_PROTOCOL_VERSION` 从 `0` 增加到 `1`。版本 1 新增带品牌类型的 `ClientConsoleSubscriptionId`，由 Worker 为每次 Console enable 尝试分配。

版本 1 Console envelope 的准确字段如下：

- `client-console/enable`：`v`、`t`、`sourceId`、`generation`、`sessionId`、`subscriptionId`。
- `client-console/enable-result`：相同 identity 字段加 `outcome`，其值为 `{ ok: true }` 或 `{ ok: false, error: { code, message } }`。code 为 `installation-failed` 或 `session-conflict`，message 上限为 2,048 个字符。
- `client-console/disable`：`v`、`t`、`sourceId`、`generation`、`sessionId`、`subscriptionId`。
- `client-console/event`：相同的四个 identity 字段加 `event`。

每个 decoder 都保持 exact，并拒绝缺失字段或未知字段。source registry 首先认证 active `sourceId` 与 `generation`；Runtime router 随后要求 `sessionId` 与 `subscriptionId` 匹配 pending 或 active subscription。

### 就绪与顺序

`ConsoleBackend.subscribe()` 返回一个同步取得所有权的 handle，其中包含 `ready: Promise<void>` 与幂等 `dispose()` 操作。Host Console 注册返回已经 ready 的 handle；Client 注册返回 provisional handle，其 promise 由 `client-console/enable-result` 结算。

Worker 在发送 `client-console/enable` 前依次分配 subscription id、安装本地 event listener、保存 provisional subscription 与 pending 关联，并启动 `clientRuntimeTimeoutMs` timer。不新增配置字段。

Client 记录 `(sessionId, subscriptionId)` pair，并在发送成功结果前完成同步 Console 与全局错误 hook 安装。安装失败会回滚部分 hook，并返回失败结果。

只有 Worker 接受成功且准确关联的结果后，Client Console subscription 才变为 active。`Runtime.enable` 等待 Runtime backend enable 以及每个当前 Console subscription 的 `ready` promise，随后公布 Client execution context 并返回成功。在 Runtime 已启用后连接的 Client realm，也只有在其 Runtime 与 Console 就绪后才公布。

每个 DevTools Runtime session 最多持有一个进行中的初始 enable epoch。并发 `Runtime.enable` 调用会加入同一 epoch；对已启用 domain 的调用直接返回成功，不创建另一个 subscription。初始 epoch 在开始 backend 与 Console 就绪操作前对 realm membership 取 snapshot。它 pending 期间打开的 realm 会进入 response barrier 之外的队列；成功的 epoch 提交 enabled 状态，再通过 dynamic-realm 路径处理队列中的 realm；失败或已失效 epoch 会丢弃该队列，且不公布任何队列内 context。后续重试会取得新 snapshot，其中包含每个仍打开的 realm。

`Runtime.disable` 与 DevTools session 关闭会先使当前 epoch 失效，再 dispose 任何 active 或 provisional resource。Disable 等待自身清理后返回成功；每个加入该 epoch 的 enable request 都会拒绝。每个 `await` 之后的 continuation 都会比较捕获的 epoch 与当前 epoch 及 closed 状态。陈旧 continuation 只能完成回滚；不得订阅、公布 context、恢复 enabled 状态，或替换更新 epoch 拥有的资源。

enabled 状态提交后新打开的 realm 会获得自身的 provisional Console subscription。就绪成功只公布该 realm；就绪失败会 dispose 其 provisional state、隐藏 execution context，并关闭该 connection-local realm session，不改变 sibling realm 或 Runtime domain 的 enabled 状态。只有新的 source generation 或新的 DevTools connection 才会使该 source 再次具备资格；当前 source generation 不会隐式重试。

### 失败、恢复与清理

失败结果、超时、发送失败、source 断联或 generation 替换都会拒绝 pending readiness promise，并移除 timer、listener 与 provisional record。Runtime domain disable、DevTools session 关闭、realm 移除以及 Worker 或 router dispose 都调用同一幂等 dispose 路径。只有 source generation 仍 active 时，dispose 才发送匹配的 disable frame。

初始多 realm `Runtime.enable` 期间发生任何失败时，会 dispose 该次尝试创建的所有 active 与 provisional subscription、disable 已启用的 Runtime backend、清除尚未提交的 context 与对象，并返回 CDP error。Client 重连或故障消除后，调用方可以重试。

Client 将携带同一完整 tuple 的重复 enable 视为幂等操作。已经 active 且成功的 tuple 不重复安装 hook，并再次发送成功结果。安装失败会回滚所有部分 hook，只在匹配 disable 或 generation reset 前保留该 tuple 的有界失败结果，并再次发送相同失败；重试需要新的 Worker 分配 subscription id。一个 Runtime session 使用不同的 live subscription id 时返回 `session-conflict`。匹配的 disable 会移除该 subscription 或失败 tombstone，并释放其 `console` object group；未知或不匹配的 disable 不执行操作。

对于未知或已经结算的 subscription id，Worker 忽略重复或迟到结果。结果若使用已知 pending subscription id，但已认证 source id、source generation 或 Runtime session 任一不匹配，则以关联错误使该 pending subscription 失败，并执行常规清理。只有准确匹配 active source generation、Runtime session 与 subscription id 的 event 才会交付；provisional、已 dispose、已断联或陈旧 event 都会被忽略。

超时与 dispose 会尽力发送 disable。WebSocket 顺序保证延迟处理 enable 的 Client 随后还会处理更晚的 disable；socket 关闭或 generation reset 也会独立移除所有 Client Console session 与 hook。无需持久状态或迁移。

### 兼容性与安全性

版本 1 不提供版本 0 协商、shim 或混合 peer 支持。该包是私有、实验性且不参与发布的包，其 Host、Worker 与 Client face 一同构建。现有严格版本拒绝继续作为恢复机制。恢复需要 Host、Worker 与浏览器 Client 使用匹配产物，包括 reload 或 restart 已运行的 Client 页面；只重启 Inspector 无法更新该页面已经加载的 Client bundle。

公开包 API、session 格式、source identity、CDP context identity 与多 session 对象隔离均不改变。acknowledgement 使用现有已认证 Client WebSocket，只新增不透明关联 id 与有界诊断，因此不会形成新的信任或隐私边界。Client 最多只能在现有有限 Client Runtime deadline 内拒绝提供就绪状态。

## 备选方案

**保留单向 enable 并扩大测试超时。** 拒绝，因为它会保留 `Runtime.enable` 在观察存在前成功并永久丢失 event 的时间窗。

**只按 source generation 与 Runtime session 确认。** 拒绝，因为 disable 后重新 enable 会使迟到 acknowledgement 无法与当前尝试区分。

**缓存全部 Client Console 流量用于重放。** 拒绝，因为 Console argument 持有每个 DevTools session 的 handle；全局重放会改变保留、顺序和隔离，而不是建立就绪状态。

**复用 Client Runtime request frame。** 拒绝，因为 Console 生命周期已是独立 frame family，把 observer 安装当作 evaluation 会模糊已接受的协议所有权。

## 实施边界

实施仅限 Inspector 协议、版本与 id，Client dispatcher、transport 与 Console observer，Worker source dispatch 与 Runtime router，共享 Console backend subscription 语义，Runtime domain enable 顺序，以及聚焦 fixture 与测试。必须保持 source-generation 校验与每个 session 的 object group。

更新 Inspector README 及其中文对侧，以及跨 realm Inspector Agent Note 的中英文文件，记录已发布的 acknowledgement、所有权、超时和清理行为。协议平面 Agent Note 无需改变决策，因为新 frame 遵守其现有放置规则。

其余三项争用修复仍是局部测试同步或有限测试预算变更，不属于本协议决策。

## 必需验证

- Exact codec 测试接受每个版本 1 Console frame，并拒绝版本 0、缺失 identity、未知字段、无效 outcome 与超限诊断。
- 一项确定性的受控 transport 测试观察并暂停 `client-console/enable-result`，证明 enable frame 及 microtask drain 后 `Runtime.enable` 仍未结算；释放结果后，在 log 前注册 event waiter 并证明 Console 交付。
- 聚焦测试覆盖安装失败、fake timer 驱动的超时、断联与 generation 替换、Runtime disable、DevTools 关闭、router dispose、重复结果、关联不匹配、重复 enable，以及陈旧 disable 或 event frame。
- Worker 测试覆盖 Console enable transport 在 dispatch 前返回 `false` 与抛出异常。
- Held-ack 测试分别调用 Runtime disable、DevTools close 与 router dispose，随后证明 prompt 结算、timer 与 listener 移除，并且不会迟到地重新激活 subscription 或 context。
- 多 realm 测试让一个 acknowledgement 成功，另一个失败或超时，证明该 epoch 拥有的每个 subscription 与已启用 backend 都会回滚，并证明后续重试成功。
- Realm 生命周期测试在初始 enable 期间打开一个 realm，证明只有初始 epoch 提交后才处理它，并证明 dynamic-realm 就绪失败只隐藏并关闭该 realm session。
- 关联测试分别改变 source id、generation、Runtime session 与 subscription id。Client 测试证明 failed-install 回滚，以及 active-success 与 failed tuple 两种状态下的重复行为。
- 现有双 DevTools session 测试继续证明不同 object id、object-group 清理及 sibling-session 隔离。
- 测试使用协议 barrier、deferred promise、在触发前注册的 event waiter 与 fake timer；固定 sleep、重试、全局串行化和减少 worker 数都不是成功条件。
- 在独立 QA 执行 AC-7 要求的单次默认验证前，文档同步、Inspector 聚焦测试、typecheck 与 `git diff --check` 必须通过。

## 批准条件

在另一名 Tech Lead 批准这份准确持久化的决策，并由工作流编排者记录 `decision-accepted`、`Review result: approved`、无未解决阻塞及 `Gate: implementation-ready` 前，实施保持 blocked。
