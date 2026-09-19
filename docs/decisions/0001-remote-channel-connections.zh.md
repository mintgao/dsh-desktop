# 0001：远程通道连接

- Status: Accepted

[English](0001-remote-channel-connections.md) | 中文

## Context

[已接受的工作项 brief](../work-items/20260919-remote-channel-connections/brief.zh.md) 拥有目标、范围、验收标准 AC-1 至 AC-11、设计、就绪记录，以及产品负责人于 2026-09-19 解决的产品决策。本记录决定就绪闸门留下的持久化约定与技术取舍，不新增任何产品范围。

## Authority

本仓库较早的决策记录使用日期前缀的文件名约定（`<yyyymmdd>-<slug>.md`）。已安装的 Vibe Kit 就绪校验器不接受该文件名语法，因此本记录采用校验器的语法：`docs/decisions/0001-remote-channel-connections.md`、唯一的一级标题 `# 0001: Remote Channel Connections`，以及唯一的状态条目 `- Status: Accepted`。把较早的记录迁移到该语法不在本项范围内。brief 仍是范围与验收的权威。

第 2、3、7、10、12 节于 2026-09-19 修订，以解决工作项中记录的独立评审的十条发现。本次修订同时记录负责人在初稿之后解决的两项产品选择：并发权限提问一并转发并以序号区分；由会话创建的 Session 不携带显式标题，命名交给组合的标题能力。工作项的评审证据标明每一次评审覆盖的是哪一版。

## 1. `ctx.channels` 服务定义

选择：单一注册表服务。`packages/channel/channel` 声明 `ctx.channels`；各提供方注册进它；消费方读取它。

替代方案：按平台划分的服务（`ctx.channelWeixin`）靠约定被发现，没有统一的枚举点，会让消费方按平台身份分支，并让第二个提供方拥有第二套约定；拒绝。复用 `ctx.webhook` 并新增通道提供方种类，只适合一次性的"投递即建 Session"触发器，不适合连接生命周期、出站发送与按会话的绑定，而且它是上游拥有的代码；拒绝。

注册表拥有提供方集合与控制器投影的枚举。它不拥有连接、不拥有重试策略、不拥有产品默认值。`ctx.channels.register(provider)` 返回释放函数。

提供方声明带品牌类型的 `id: ChannelId`、展示身份、可观察的连接状态（`idle | connecting | connected | unavailable`，其中 `unavailable` 携带诊断信息）、入站事件界面，以及 `send(conversation, message, signal)`。入站界面是 `ChannelEventMap`，按提供方种类合并扩展，与 `WebhookEventMap` 一致。提供方在发布之前验证并归一化投递；注册表绝不携带平台原始字节，消费方也看不到它们。替代方案：发布原始数据、在消费方验证；拒绝，因为那会把按平台的校验搬进共享消费方，而一个解析缺陷就会变成一次 Session。`send` 在平台接受消息时解决，而不是在收件人读到消息时。

共享值使用品牌类型：`ChannelId`、`ChannelConversationId`、`ChannelUserId`、`ChannelMessageId`。注册表不向客户端推送状态；控制器投影它，页面通过 Remote 接口读取。

取舍：提供方经由控制器而不是自带页面。接受；单一 Remote 接口正是让第二个平台保持廉价的原因。

## 2. 外部 Session 接纳

`packages/webhook/webhook/src/session.ts` 持有"把外部触发变成持久化根 Session"这一事务的唯一实现：校验并快照请求、解析 preset、解析或创建工作区、在发布前挂载 preset 创建 Agent、持久化挂接 Session、应用 preset 与标题、接纳追问，失败时先解除挂接再释放。该包由上游拥有；Mint 不在本次交付中编辑它。

决定：(b)，把最小的可复用服务提取到 `packages/session/session-admission`，它只拥有这一事务；`channel-session` 从一开始就采用它，webhook 迁移是独立的后续工作。(a) 与 (c) 被拒绝：(a) 让功能进度为一项对 webhook 无可见影响的改动而耦合于上游评审；(c) 复制了一段恰恰在最容易出错的环节上十分微妙的顺序。

操作的完整签名：

```text
admitSession(
  ctx: Context,
  request: SessionAdmissionRequest,
  options: {
    /** brand prefix; `webhook-` stays and channel Sessions get their own */
    sessionIdPrefix: string
    /** the message text and its fully built MessageSourceMap member — the service never invents provenance */
    followup: { readonly text: string; readonly source: MessageSource }
    /** subject the validation messages open with (`webhook Session request`); their exact text and field names are pinned */
    errorSubject: string
    signal: AbortSignal
  },
  onAttached: (sessionId: SessionId) => Promise<void>,
): Promise<void>
```

初稿签名遗漏的三项事务所需输入：session id 的品牌前缀；追问消息及其来源，因为 webhook 运行时在事务内部由投递与规则 id 构造出 `source.kind: 'webhook'`；以及错误消息主语，因为校验消息读作 `webhook Session request <field> …`。

顺序，作为该服务的约定：(1) 在任何 await 之前校验并快照——`admitSession` 只要求普遍必需的字段：绝对工作区路径、非空提问内容、`agentPreset` 与 `permissionPreset`，并把 `title` 与 `model` 视为可选；它以指明字段、并以 `errorSubject` 开头的 `TypeError` 拒绝，而 webhook 自身的规则结果校验在调用 `admitSession` 之前运行，仍然要求 `workspacePath`、`title`、`prompt`、`agentPreset` 与 `permissionPreset` 为非空字符串、`workspacePath` 为绝对路径，以及可选的 `model` 其 `provider` 与 `model` 非空且 `maxTokens` 为正安全整数，因此 `webhook Session request title must be a non-empty string` 仍从 webhook 路径抛出、字段名为 `title`；(2) 解析权限 preset、agent preset 及其 standing key，在创建任何东西之前显式失败；(3) 在每个 await 边界遵守中止信号；(4) 解析或创建工作区；(5) 创建 Agent，其 Session 工作目录等于工作区路径，agent preset 在创建的 `setup` 内挂载，创建时的模型选择一直安装到该 Session 的首个持久化请求头存在；(6) 持久化挂接 Session；(7) 调用 `onAttached(sessionId)`，`channel-session` 在此持久化会话绑定，早于首条提问；(8) 应用权限 preset，并且只在调用方提供了标题时才重命名该 Session——webhook 传入它已校验的标题，Session 与今天一样被重命名；而由通道会话创建的 Session 不携带标题，由组合的标题能力按首条消息为它命名；(9) 接纳追问，事务到此结束；Agent 由 `ctx` 按生命周期拥有，并遵循常规 Session 行为。

失败与回滚，按代码的实际行为：`ctx.agents.create` 返回之前的失败——校验、preset 解析、工作区解析、create 调用本身——没有需要回滚的东西。它返回之后的每一次失败都释放 Agent；创建与挂接之间的失败、包括挂接调用内部的失败，`attached` 仍为 false，因此跳过解除挂接、只做释放；挂接成功之后的失败先解除工作区挂接、再释放。两个回滚步骤各自独立尝试，回滚失败会被记录且绝不替换原始错误，原始错误照原样重抛。只在挂接之后才释放的服务，会在挂接前失败时泄漏一个仍存活且已发布的 Agent。

补偿：`admitSession` 至多调用一次 `onAttached`，在持久化挂接之后，并且只在追问被接纳时才 resolve；第 9 步仍可能在其后失败，而每一次拒绝都已经完成了解除挂接与释放。调用方在第 7 步的写入由调用方自己补偿：当操作在 `onAttached` 已运行之后拒绝时，只有当这条绑定记录由本事务创建，`channel-session` 才删除它；当记录是先存在的——`/new` 之后的重接纳，或绑定 Session 消失之后的重接纳——它改为恢复记录的写入前状态，使工作区、preset、标题、已授权发送者、显示选项与游标全部存活，然后再报告失败。作为交换，该操作"没有任何拒绝会留下存活的 Agent"这一保证是尽力而为：回滚失败按设计被记录并吞掉。调用方唯一见过的 session id 仍是 `onAttached(sessionId)` 的参数，它在持久化挂接之后传入。

该套件是这一顺序的可执行规范，并且还从跨包对等测试 `packages/session/session-admission/tests/webhook-parity.spec.ts` 对未改动的上游 `createWebhookSession` 执行同一组断言（测试作用域导入；仅 devDependency）。后续工作项 [20260919-session-admission-webhook-migration](../work-items/20260919-session-admission-webhook-migration/brief.zh.md) 删除 webhook 事务及其回滚，并把触发器改指该服务；它的落地取决于上游评审，因此重复窗口在它落地之前保持开放，而对等测试正是让该窗口安全的东西。

webhook 运行时不得回退的部分，以及迁移测试所断言的内容：session id 的品牌前缀（服务把它作为参数接收）；请求校验错误与字段名；preset 解析顺序与 standing key 解析；工作区"解析或创建"语义；模型选择继承规则；标题与权限 preset 在接纳之前应用；`source.kind: 'webhook'` 溯源；中止信号贯穿发布阶段被遵守；"先解除挂接再释放"的顺序；以及挂接前失败（创建与挂接之间的中止检查）时的 Agent 释放——彼时什么都没挂接，只执行释放。

## 3. 会话绑定的持久化

一个 `ctx.storageDomain` 域按 `(channel, conversationId)` 保存一条记录：`sessionId`、`workspacePath`、`agentPreset`、`permissionPreset`、`title`、`authorizedSenderIds`、出站显示选项、提供方游标、`lastAdmittedMessageId` 与 `schemaVersion`。

`sessionId` 是权威：只有它决定该会话续接哪个 Session。工作区与 preset 字段是仅在创建 Session 时应用的设置值。读取时，消费方通过 `ctx.sessions` 解析 `sessionId`，并把缺失的 Session 视为未绑定，而不是用其他字段重建一个。

每个写入者都通过存储域自身的写入路径修改绑定，其变换在域的单一写入链上按自己的槽位针对最新已提交状态执行。`onAttached` 的写入、`/new` 的清除、游标与 `lastAdmittedMessageId` 的推进，以及审批对 `authorizedSenderIds` 的追加，都是这样的变换，因此没有任何读改写会输给并发的接纳写入，`channel-session` 也不持有按会话的锁。审批的第二次写入——待处理记录在它自己域中的状态——在绑定更新之后进行；两者之间发生崩溃会让请求保持待处理，而重复审批是幂等的，因为两次写入都是把值写入最新状态。

绑定记录在会话设置时创建，早于任何 Session 或消息：设置写入工作区路径、preset、标题、显示选项与 `authorizedSenderIds`，而 `sessionId` 与 `lastAdmittedMessageId` 为空。`onAttached` 的写入与 `/new` 更新该记录；两者都不创建记录。拒绝是依据该记录的 `authorizedSenderIds` 判定的，因此待处理请求只存在于已有绑定的地方。如果审批时找不到记录，它不会创建记录：更新以 `missing-key` 失败，审批被拒绝，请求保持待处理直到该会话完成设置。

该记录在接纳事务的 `onAttached` 钩子内写入 `sessionId`，位于持久化挂接之后、首条提问被接纳之前。`/new` 在应答之前只清除会话关联：`sessionId` 与 `lastAdmittedMessageId` 被清空，其余字段全部保留，因此工作区、preset、标题、已授权发送者、显示选项与游标都存活；下一条普通消息用这些值创建 Session，AC-4 的字段也保持可展示。

提供方游标只在一条消息被接纳之后推进，因此写入绑定之后的崩溃会导致平台重投，而持久化绑定使重投继续同一个 Session 而不是创建第二个；`lastAdmittedMessageId` 抑制完全重复的一条。在持久化挂接（第 6 步）与写入绑定（第 7 步）之间发生崩溃时还没有绑定：重投会创建第二个 Session，而第一个仍挂接在工作区上——桌面可读，但被孤立，没有任何会话能到达它。本记录接受该窗口而不是消除它：它需要一次发生在两个相邻持久化写入之间的崩溃，且据目前所知没有任何原语能把工作区注册表与存储域纳入同一个事务——这是接受该窗口的理由，而不是关于代码的既成事实。

来自被拒发送者的待处理请求是持久化记录，不是内存队列。`channel-session` 为每条被拒消息写入一条记录到第二个 `ctx.storageDomain` 域，按 `(channel, conversationId, messageId)` 索引，字段为 `senderId`、消息文本、`receivedAt`、`status`（`pending | approved | dismissed`）与 `schemaVersion`；被拒消息仍然不创建 Session，也不产生模型可见事件。页面通过控制器的 Remote 接口渲染这些待处理记录；批准一条会把它的 `senderId` 加入会话绑定的 `authorizedSenderIds` 并标记为 approved，驳回则标记为 dismissed。保留期：记录一直存在，直到页面批准或驳回它；其他任何东西都不会让它过期，因此重启绝不会丢弃用户尚未看到的请求。释放：这些记录是持久化的，比 `channel-session` 的释放活得更久——释放只是停止投影，重连的页面会再次读到每一条待处理记录。

记录携带 `schemaVersion`；运行中的构建不认识的版本会显式失败，通道报告不可用并给出诊断，而不是被重新解释。

## 4. 入站溯源

该成员为：

```text
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    channel: {
      readonly kind: 'channel'
      readonly channel: ChannelId
      readonly conversationId: ChannelConversationId
      readonly sender: ChannelUserId
      readonly messageId: ChannelMessageId
      readonly form: 'notice'
      readonly summary: string
    }
  }
}
```

这不会改变 Session 日志格式版本。`MessageSourceMap` 可合并扩展；其消费方按 `kind` 分支并对未知种类走有文档的默认路径；`webhook` 与 `agent-team` 已经以同样方式扩展过它。日志把来源作为数据存储，因此新增成员是附加数据，不是格式变更。替代方案：复用 `webhook` 成员并塞入通道形状的载荷；拒绝，因为那会错误陈述 `deliveryId` 与 `ruleId`，或为所有消费方放宽它们，而桌面的来源投影恰好需要这些字段来渲染标签。

## 5. 出站投递

"至多一次"（尝试一次然后报告）被拒绝：回复是该产品对手机用户的唯一输出，一次瞬时失败会静默丢失它。"恰好一次"不可得：iLink 的 `send_message` 路径没有本设计可以依赖的幂等键，因此超时含义不明时重试可能重复。选择：至少一次。重复的回复优于丢失的回复。

重试由经校验的 Config 字段（尝试上限、退避）限定，而非硬编码常量。投递记录位于一个 `ctx.storageDomain` 域，按通道、会话与投递 id 索引：状态（`pending | sent | failed`）、尝试次数、最后错误、成功时的平台消息 id，以及时间戳。控制器列出这些记录；页面按每条回复渲染 发送中 / 已送达 / 发送失败。

该记录不是模型可见的：它是传输状态而非对话内容，模型可见的投递状态会让转写依赖平台，并让每次重试都新增一条日志。最终失败留下该记录及其最后错误、页面状态与一行诊断日志。上限耗尽后不再重试，Session 内容保持可读且完整。

## 6. 会话命令

两档。第一档是 `channel-session` 内的通道本地命令表，在任何 agent 被解析之前匹配，因此在尚无 Session、Session 空闲、以及轮次运行中都可用：`/new`、`/status`、`/stop`、`/help`、`/whoami`。`/stop` 调用会话控制器的取消操作；`/new` 立即解除绑定，由下一条普通消息创建 Session；`/help` 列出两档并把会话层与 Session 的插件区分标注。第一档不注册进 `ctx.commands`：注册表派发需要一个确切的 Agent，而第一档必须在没有 Agent 时可用；而全局注册会让它出现在桌面输入框的 `/` 菜单里，那是产品负责人排除的。

第二档通过 `ctx.commands` 针对已绑定 Session 的 agent 派发，因此每个插件注册的命令（`/compact`、`/plan`、`/goal`、`/export` 以及后续新增）都无需任何按平台的工作即可在会话中使用；每次运行记录 `command/run` 与 `command/done`，绝不进入模型历史。两档都匹配注册表已文档化的语法：字节零处的斜杠，随后是由 `[a-z0-9_-]` 组成的小写名称，然后是输入结束或空白。一项测试把两个匹配器钉在同一套语法上。语法正确但两档都不认识的命令会得到一句指向 `/help` 的提示，绝不成为模型消息。

与桌面适配器的分歧，已接受：仅以斜杠开头但不符合命令语法的行，在聊天界面上按普通消息处理。桌面适配器拒绝它，因为其 `/` 菜单让意图明确；聊天界面没有这种提示，而吞掉普通文本比误发一次提问更糟。`/help` 会说明这条规则。

## 7. 权限提问转发

归属：`channel-session` 通过 `ctx.effect` 在 `approval/request` 瀑布上注册一个应答方。该接缝的谓词：`ApprovalService.request` 通过 `scopeTarget(req.agent, req.agent)` 派发瀑布，其调用点在 `packages/interaction/user-approval/src/index.ts`，而其接纳语义——未打标签的监听器、作用域键与祖先——位于 `@deepseek-ai/dsh-scope`；当提问 agent 自身的 Cordis 过滤器接纳其上下文，且监听器要么未打标签——注册在未限定作用域的上下文上，对每个 agent 都被接纳——要么带有该提问 agent 的作用域键或该键的某个祖先时，才接纳该监听器。作用域属于其他 agent、或位于提问 agent 之下的监听器，永远收不到该请求；该接缝执行的是路由与 agent 的服务过滤器，不是归属。

`channel-session` 从它自己的插件上下文注册应答方，该上下文不限定于任何 agent，因此瀑布对每个请求都接纳它；它在应答方主体内满足归属规则：仅当 `req.agent.session` 的 id 属于其已绑定集合时才应答，并对其他每个请求调用 `next()`，因此桌面应答方保留其席位，未获应答的链条仍以失败关闭的兜底结束。第 2 节第 9 步的"由 `ctx` 按生命周期拥有"与此并不矛盾：生命周期归属决定谁释放 Agent，该接缝的谓词从不查询释放状态，而这里的应答资格是注册作用域加上绑定索引。

并发：一个会话同时可以持有多个待处理提问。每个被转发的提问携带一个按会话分配的序号，并标明工具、提问原因，以及以编号列表给出的可选答案，因此一条消息能识别所有未决提问，而一条回复能同时指明是哪个提问与哪个答案。不排队：产品负责人否决了让第二个提问等待的做法，因为无人应答的提问会落定为 `unavailable` 并被拒绝，从而让用户从未见过的任务失败。序号只在其提问落定之后才被复用。

失败关闭的默认：无回复、超时、通道断开，或既未指明待处理提问、也未指明其所指提问的任何选项的回复，都让该提问保持未应答，调用方的封闭集合处理把它落定为 `unavailable` 并拒绝。转发绝不把沉默转换为 `allowed-once`。在调用方已落定其提问之后才到达的回复被忽略。

编号映射：答案的编号映射到封闭的 `ApprovalOutcome` 集合：允许项映射为 `allowed-once`（该集合中唯一允许形状的结果），拒绝项映射为 `rejected`，取消项映射为 `cancelled`。既不是"提问序号加选项编号"、未指明任何待处理提问、或超出范围的回复，让所有待处理提问保持未应答，而不是猜测。

## 8. 微信传输

`channel-weixin` 使用 Node 内置能力实现已文档化的 iLink HTTP/JSON API：`fetch` 或 `node:https` 负责扫码登录、`get_qrcode_status`、`get_updates` 与 `send_message`；`node:crypto` 负责 AES-128-ECB 媒体路径；轮询游标存放在绑定记录中。它不声明任何第三方运行时依赖，因为 `verifyMintPackages` 会针对冻结的官方闭包解析每个声明的依赖，从而让装配失败。官方 `@tencent-weixin/openclaw-weixin` 包与 MIT 许可的 `cc-weixin` 项目是协议参考，不是依赖。分片、平台长度限制与限流策略属于提供方。

飞书边界，未承诺：阶段二的提供方实现同一接口。它究竟把官方 SDK 打进插件构建产物，还是基于 Node 内置 WebSocket 实现连接帧，由阶段二的就绪记录决定。本记录只记录约束：不得有第三方运行时依赖；若不打包 SDK，则握手、重连与令牌刷新属于自有代码。

## 9. 打包与装配

每个新包进入 `scripts/desktop-assembly.ts` 中的 `MINT_PACKAGES`、`scripts/build-mint-plugins.ts` 中的构建与打包流水线，并由 `packages/bundle/desktop-mint/cordis.patch.yml` 启用，后者只承载 patch 行。打包产物必须验证：每个 Mint 包声明的每个依赖与 peer 依赖都在暂存的冻结运行时闭包内解析；`desktop-mint` Profile 中每一行被选中的插件恰好出现一次；通用 Web 组合排除所有 Mint 专属默认值且仍能启动该接缝；无密钥浏览器场景观察到设置流程与已连接状态；以及在新包存在时打包冒烟测试通过。共享包不按 Mint 身份分支。

## 10. 恢复与断开

令牌锁：平台每个令牌只接受一个轮询客户端，而第二个轮询者会静默分流消息，因此提供方在轮询之前获取一个锁，并在另一实例持有它时报告 `unavailable` 并给出诊断。介质：一个以独占创建标志在桌面数据目录中创建的 OS 级锁文件，按平台身份命名；持有者把实例 id 与每个轮询周期刷新的心跳写入该文件，而文件存在时创建失败。范围：对同一台机器上的每个实例是跨进程的（真实文件可跨进程读取），但不是跨机器的——这正是页面说明"一个身份同时只服务一个已连接客户端"的原因。陈旧锁规则：只有当心跳早于所配置轮询边界的两倍时，锁才算陈旧；这一余量使第二个实例不会覆盖一个轮询超时（卡住）的存活持有者。持有者若在锁文件中发现不同的持有者 id，就停止轮询并报告被取代状态；崩溃的持有者心跳停止，锁在同一阈值下变陈旧，下一个提供方在写下一行诊断日志后覆盖它并写入自己的持有者 id。

平台会话过期：微信 `errcode -14` 意味着平台会话已失效；提供方停止轮询并报告需要重新扫码的状态，页面提供该操作。没有任何重试策略尝试复活已过期的会话。

重试与熔断：轮询与发送的重试使用经校验的 Config 边界并带退避，熔断在平台反复失败后打开，使连接报告 `unavailable` 及其诊断，而不是用针对被限流平台的无界循环拖慢桌面后端进程。

关闭：释放会中止长轮询、归还令牌锁、停止投递，并注销应答方与命令界面；每一次注册都是 `ctx.effect` 的释放函数，因此无论是卸载还是应用退出都成立。

没有任何用户状态变得不可恢复：绑定、待处理请求、投递记录与 Session 内容在被观察之前已经持久化，平台凭据存放在 `ctx.credentials`。重启后提供方复用已存令牌并从持久化游标继续，因此只有平台会话过期才需要重新扫码，中断的投递仍是一种被报告的状态而不是丢失的回复。断开之后既有 Session 保持可读。

## 11. 兼容与复用

支持的 DSH 范围：桌面装配为该插件所在发行版钉定的上游 Harness 版本。Mint 发行版声明它被装配并冒烟测试所针对的那个钉定版本，不声称其他版本；装配检查与打包冒烟测试是证据。

复用：另一位 DSH 开发者挂载 `packages/channel/channel` 并注册一个实现上述接口的提供方；挂载 `packages/channel/channel-session` 以获得绑定、授权、命令、投递与权限转发；并可选挂载 `packages/api/channel-controller` 与客户端插件以获得设置界面。提供方发布经过验证、已归一化的入站事件；消费方不需要其他东西。复用说明位于各包的 README。

## 12. 各包的归属与释放

| 包 | 拥有 | 释放 |
|---|---|---|
| `channel/channel` | 注册表、提供方接口、品牌类型 id、`ChannelEventMap` | 挂载它的插件；释放注册即释放提供方 |
| `channel/channel-weixin` | 平台连接、令牌锁文件、轮询游标、分片与限流 | 其注册释放函数；中止轮询、归还锁；崩溃会留下陈旧锁，由下一个实例按陈旧锁规则覆盖 |
| `channel/channel-session` | 绑定、发送者授权、待处理请求记录、第一档命令、投递记录与重试、转发的待处理提问序号、应答方席位 | 其各注册；停止投递、注销应答方、丢弃待处理转发使其提问按失败关闭落定；绑定与待处理请求记录保持持久化 |
| `api/channel-controller` | Remote 接口、待处理请求列表投影，及其转发的所有者事件 | 其注册；该分区从客户端消失 |
| 客户端设置插件 | 设置分区、modal、其 slot 与文案 | 其 slot 与 locale 注册 |
| `session/session-admission` | 接纳事务 | 调用方；它不持有持久化状态，也从不拥有 Agent，Agent 由 `ctx` 按生命周期拥有 |

持久化记录比释放活得更久：释放一个包只是停止访问，而不是停止持久化，因此重连的提供方读到同样的绑定，页面渲染同样的待处理请求。在持久化挂接与写入绑定之间发生崩溃（第 3 节）会留下一个仍挂接且被孤立的 Session：它由 `ctx` 拥有，保持可读，且没有任何东西删除它。

## Consequences

- 该接缝是通用的；Mint 启用它并选择产品默认值，通用 Web 组合能在不含这些默认值的情况下启动它。
- 在 webhook 迁移落地之前，接纳事务存在两份实现，由跨包对等套件保持一致，而不是由共享实现保持一致。
- 飞书路径保持开放且未承诺。
- 装配新增若干包；运行时闭包检查与打包冒烟测试是闸门。
- 远程对话的权限 preset 是真实的执行边界：它在设置时被显式选择并持续可见。
- 一个会话中可以有多个权限提问同时待处理，因此转发消息用序号标识每一个，回复需指明它回答的是哪一个。
- 由会话创建的 Session 不携带显式标题；组合的标题能力按首条消息为它命名，与本产品中其他每个 Session 一致。
- 在两个相邻持久化写入之间发生崩溃时，可能有一个 Session 被孤立；它保持可读，且永远不会被删除。
