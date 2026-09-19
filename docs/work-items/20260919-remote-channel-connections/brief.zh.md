# 飞书与微信远程连接

[English](brief.md) | 中文

- ID: `20260919-remote-channel-connections`
- Size: `L`
- Status: shaping
- Created: 2026-09-19

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: 新增持久化能力接缝与归属模型（`ctx.channels` 服务定义、各平台提供方、以及绑定 Session 的消费方）；新增可合并扩展的模型可见消息来源及其溯源信息；新增持久化的会话绑定存储；身份验证、发送者授权、远程工具执行的权限边界，以及可从本机之外应答的权限提问应答方；对某个外部平台的跨系统传输；不可逆的平台状态（平台会话及其令牌）及其恢复与断开行为；以及在打包第三方传输代码与基于 Node 内置能力实现协议之间的实质取舍
- Decision owner: Tech Lead `remote_channel_architecture`
- Governing decision: `docs/decisions/0001-remote-channel-connections.md`
- No-new-decision rationale: none
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: `docs/work-items/20260919-remote-channel-connections/technical-review.md`
- Material product decisions: 由产品负责人于 2026-09-19 解决——DSH Desktop Mint 在上游 Harness 之上发行一套经过挑选的功能集，其与上游的关系如同 Linux 发行版与内核，因此新增产品成果在范围之内；微信先交付，其他平台待其验证后再跟进；回传只包含 agent 的最终回复；仅私聊；对话管理由命令驱动；`/new` 立即解除绑定，由下一条普通消息创建 Session；会话命令不出现在桌面输入框；转发的权限提问给出带编号的选项、以编号应答；同一会话可同时有多个提问待处理，回复需指明它回答的是哪一个；由会话创建的 Session 不携带显式标题，命名交给组合的标题能力
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-19T06:20:06Z
- Confirmation basis: 编排方核对了已接受的治理决策 `docs/decisions/0001-remote-channel-connections.md`、`docs/work-items/20260919-remote-channel-connections/technical-review.md` 中记录的历次评审——两轮 `changes-required`（其发现均已解决）、第三轮对照 `packages/webhook/webhook/src/session.ts` 与 `packages/storage/storage-domain/README.md` 批准修订章节、以及最后一轮批准修正后的令牌锁段落——本 brief 中已解决的实质产品决策，以及 `Open blockers: none`
- Readiness history: 2026-09-19 编排方在设计阶段执行触发扫描，发现持久化、跨系统、身份验证、权限与恢复类触发条件；记录以 `decision-required + blocked` 开始且未编辑任何应用代码；随后产品负责人解决了全部实质产品决策并批准该功能作为发行成果；同日技术负责人视角 `remote_channel_architecture` 撰写 `docs/decisions/0001-remote-channel-connections.md`，使结果转为 `decision-accepted`；其后历经三轮评审，最后两轮分别批准了修订章节与修正后的令牌锁段落，编排方于 2026-09-19T06:20:06Z 确认 `implementation-ready`

## Goal

DSH Desktop Mint 用户把微信账号连接到正在运行的桌面应用，随后在手机上使用同一个 agent：一条私聊消息成为一次持久化的 Session 轮次，agent 的最终回复返回到该会话。连接在客户端内完成设置、监控与断开，平台特有的前置条件由产品本身说明，而不是交给外部文档。后续消息平台复用同一接缝。

## Context

[下游策略](../../context/downstream-policy.zh.md) 批准了两项产品需求：桌面客户端，以及 DSH 更新的获取与安装。产品负责人于 2026-09-19 解决了第三项成果：Desktop Mint 像 Linux 发行版在上游内核之上发行自己的选择与默认值那样发行有用的功能，因此在设计与维护成本被接受之后，新增功能属于范围之内。

相关的现有机制：

- `packages/client/ui-session-notifications` 是本项打包方式的先例：一个位于 `packages/` 的可复用客户端插件，作为 Mint 扩展单独打包，仅由 Mint Bundle 启用。
- [Webhook 子系统](../../subsystems/webhook.zh.md) 是把外部输入接入 Session 的先例：一次通过验证的投递成为根 Session，其首条追问带有 `source.kind: 'webhook'` 溯源信息。
- `packages/client/ui-settings-models` 是引导式凭据设置的先例：只写不读的密钥输入、逐字段校验，以及阻塞式首次运行界面。
- [命令子系统](../../subsystems/commands.zh.md) 是不进入模型消息的人工控制的先例：插件注册 `/name` 命令，交互适配器针对确切的 agent 执行它们，每次运行记录为 `command/run` 与 `command/done`，而结果不进入模型历史。`plan-mode`、`command-compact`、`command-goal`、`permission-presets`、`command-feedback` 与 `session-log-export` 已经注册了命令。
- [审批子系统](../../subsystems/approval.zh.md) 是从桌面之外应答权限提问的先例：`approval/request` 是一条应答方瀑布，且 UI 应答方只应答自己拥有的 agent。
- `ctx.storageDomain`（[storage 包组](../../../packages/storage/README.zh.md)）提供经 schema 校验、可发出变更通知的持久化记录。
- `@deepseek-ai/dsh-llm` 的 `MessageSourceMap` 可合并扩展；`webhook` 与 `agent-team` 已经扩展过它，因此新增生产者不需要提升 Session 格式版本。

2026-09-19 核实的传输事实：

- **微信。** 腾讯 iLink Bot API（`https://ilinkai.weixin.qq.com`）是官方个人号机器人通道：HTTP/JSON 协议，登录为扫码，入站为基于游标的长轮询（`get_updates`，超时约 35 秒），出站为 `send_message`，媒体走 CDN 并使用 AES-128-ECB 加密。iLink 机器人身份（例如 `aa1204e585c5@im.bot`）与个人微信号不同，可稳定接收私聊消息，且每个令牌只接受一个轮询客户端。官方 `@tencent-weixin/openclaw-weixin` 包（MIT，2.4.9）是 OpenClaw 的通道插件而非独立库；MIT 许可的 `cc-weixin` 项目包含同一协议的平台无关 TypeScript 实现。
- **飞书**，用于第二次交付。官方 `@larksuiteoapi/node-sdk`（MIT，1.74.0）提供 `WSClient`：一条 WebSocket 长连接，无需公网地址、域名或内网穿透即可接收已订阅事件，连接握手与鉴权由 SDK 负责。飞书文档说明长连接仅支持企业自建应用，单个应用最多建立 50 条连接，且推送为集群模式而非广播，因此一个应用身份实际上只服务一个已连接客户端。权限、事件订阅与应用发布在飞书开发者后台配置。
- **企业微信** 是另一套协议，不在本项范围内。

本仓库中核实的打包约束：`scripts/desktop-assembly.ts` 把每个 Mint 包放入承载冻结官方运行时的暂存目录，而 `verifyMintPackages` 要求 Mint 包声明的每一个 `dependencies` 与 `peerDependencies` 条目都在该暂存目录内解析。官方运行时闭包在上游固定，因此 Mint 插件不能声明第三方运行时依赖。传输代码要么打进插件构建产物，要么基于 Node 内置能力实现。

## Scope

范围之内：

- 通道能力接缝：服务定义、微信提供方，以及双向绑定聊天会话与 Session 的消费方。
- 接缝从设计之初就面向更多平台，因此第二个提供方检验的是设计本身，而不是被迫重写。
- 一个客户端设置分区，引导连接设置、显示连接状态并管理授权。
- 持久化的会话绑定、发送者授权、出站投递状态，以及客户端页面与 Host 之间的 Remote 接口。
- 一个会话命令界面，用于开始新对话、查看当前对话状态，以及停止正在运行的轮次。
- 把权限提问转发到会话，使从手机发起的任务也能在手机上得到应答。
- 通过 Mint Bundle 进行的产品选择，以及让新包进入桌面装配的打包改动。

范围之外：

- 本次交付中的飞书提供方。其设置设计记录在此，待微信验证接缝之后再实现。
- 公网入站 webhook 模式。它需要公网地址，与应用仅监听环回地址的姿态相冲突。
- 企业微信、公众号，以及一切非官方微信协议。
- 第二个长期运行的服务。连接运行在桌面后端进程内，应用退出即停止。
- 群聊与富媒体入站消息。
- 任何对 Agent Loop 的改动，以及任何新增模型工具。

## Acceptance criteria

- [ ] AC-1: 用户无需离开应用、也无需编辑配置文件，在客户端内扫码一次即可连接微信。
- [ ] AC-2: 已连接平台收到的私聊消息以用户消息形式出现在 Session 中，其记录的来源标明通道、会话、发送者与平台消息 id，且 agent 的最终回复到达该会话。
- [ ] AC-3: 未授权的发送者被拒绝：不创建 Session，不产生模型可见消息，且拒绝原因可诊断。
- [ ] AC-4: 客户端显示连接状态、绑定的工作区、agent preset 与权限 preset、已授权发送者，以及每条出站回复的投递状态。
- [ ] AC-5: 密钥不会回到客户端；设置文档与所有客户端载荷只携带凭据引用。
- [ ] AC-6: `/new`、`/status`、`/stop` 与 `/help` 在尚无 Session、Session 空闲、以及轮次正在运行时都可用，且 `/new` 之后原 Session 仍可读。
- [ ] AC-7: 任何插件注册的命令都能在会话中通过共享注册表使用，而非命令的消息永远不会变成命令。
- [ ] AC-8: 用户不在桌面旁时产生的权限提问能到达会话，并可通过指明提问与选项在那里得到应答；同一会话可同时有多个提问待处理；未获应答的提问保持失败关闭。
- [ ] AC-9: 断开连接会停止入站轮询与出站投递、释放平台会话，并保持既有 Session 可读。
- [ ] AC-10: 通用 Web 组合不包含任何 Mint 专属默认值；`desktop-mint` Profile 中每一行被选中的插件恰好出现一次；无密钥浏览器场景能观察到设置流程与已连接状态。
- [ ] AC-11: 打包后的应用在装配暂存目录内解析每一个 Mint 插件依赖，且在新包存在时打包冒烟测试通过。

## Design and technical notes

### 归属

| 关注点 | 归属 |
|---|---|
| 通道能力：定义、提供方、Session 绑定、会话命令 | `packages/channel/` 下的新可复用包 |
| 设置页面的 Remote 接口 | `packages/api/` 下的新控制器 |
| 设置与状态界面 | `packages/client/` 下的新客户端插件 |
| 产品选择与默认值 | `packages/bundle/desktop-mint/cordis.patch.yml` |
| 装配与打包 | `scripts/desktop-assembly.ts` 中的 `MINT_PACKAGES`、`scripts/build-mint-plugins.ts`、打包运行时闭包检查 |

能力本身是通用且可配置的；Mint 启用它并选择产品默认值。共享包不按 Mint 身份分支。

### 能力接缝

`packages/channel/channel` 声明服务定义并注册 `ctx.channels`：

- `register(provider)` 返回释放函数，遵循"注册即 effect"的约定。
- 提供方声明 id、展示身份、可观察的连接状态、入站事件源，以及 `send(conversation, message)`。
- 共享值使用品牌类型：`ChannelId`、`ChannelConversationId`、`ChannelUserId`、`ChannelMessageId`。
- `ChannelEventMap` 按提供方种类合并扩展，与 `WebhookEventMap` 一致，因此提供方新增自有事件类型时无需改动定义包。

提供方：

- `packages/channel/channel-weixin` 实现 iLink HTTP/JSON 协议：扫码登录、`get_qrcode_status` 轮询、带持久化游标的 `get_updates` 长轮询、`send_message`，以及媒体上传与下载路径。分片、平台长度限制与平台的反垃圾限流策略都在这里。
- 第二个提供方为另一平台实现同一接口；飞书提供方是记录在案的第二种情形。

消费方：

- `packages/channel/channel-session` 是唯一创建或续接 Session 的组件。入站方向它解析绑定，不存在时创建 Session，存在时追加一条用户消息并开始一轮；出站方向它观察已绑定的 Session 并投递回复。它还负责发送者授权、会话命令界面、投递重试与权限提问转发。

控制器：

- `packages/api/channel-controller` 在 Host 侧暴露 `ctx.channelController`，在客户端暴露 `ctx.remote.channel`：列出通道、开始与取消连接尝试、读取登录尝试进度、读取与编辑绑定、列出与编辑已授权发送者、列出出站投递记录。

### 会话绑定

一个持久化的 `ctx.storageDomain` 域按 `(channel, conversationId)` 保存一条记录，包含工作区路径、agent preset、权限 preset、Session id、标题、已授权发送者 id、出站显示选项，以及提供方所需的游标。该记录是"某个会话续接哪个 Session"的唯一权威，并且在首条提问被接纳之前写入，使崩溃不会留下孤立的 Session。

### 入站路径

1. 提供方验证投递、归一化，并在通道事件上发布。
2. 消费方按绑定中的已授权集合解析发送者。未知发送者被拒绝：不创建 Session、不产生模型可见消息、写一行诊断日志，并在页面渲染的待处理请求列表中留下一条记录。
3. 符合命令语法的行交由下述会话命令界面处理，绝不进入模型。
4. 其余被接受的消息成为一条 `user/message` 事件，携带新增的可合并扩展来源，声明方式与 `webhook` 一致：

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

5. 创建 Session 沿用 webhook 运行时的事务顺序：校验 preset、解析或创建工作区、创建 Session 工作目录等于工作区路径的 Agent、在发布前挂载 agent preset、持久化挂接 Session，最后接纳追问。

### 会话命令

聊天界面没有侧边栏，因此"开始新对话"必须能用文字表达。DSH 已经拥有这套词汇：`ctx.commands` 保存插件注册的 `/name` 命令，它们针对 agent 运行而不成为模型消息，桌面输入框的 `/` 菜单正是同一注册表的视图。因此会话暴露两档命令。

第一档——由 `channel-session` 拥有、在任何 agent 被解析之前处理的会话命令，因此在尚无 Session、Session 空闲、以及轮次运行中都可用：

| 命令 | 作用 | 回复 |
|---|---|---|
| `/new [标题]` | 解除会话绑定；下一条普通消息创建新 Session，可选标题显式命名它 | 确认信息，并说明原 Session 仍可读 |
| `/status` | 报告该会话的当前状态 | 绑定的 Session 标题、工作区、agent preset、权限 preset、运行中或空闲、最近活动时间 |
| `/stop` | 通过会话控制器的取消操作取消正在运行的轮次 | 已受理的确认，随后是最终结果 |
| `/help` | 列出两档命令，并标注哪些来自会话层、哪些来自该 Session 的插件 | 命令清单 |
| `/whoami` | 报告发送者的平台身份，用于授权与支持 | 平台用户 id |

第二档——共享命令，通过既有注册表针对已绑定 Session 的 agent 派发。任何插件注册的命令（`/compact`、`/plan`、`/goal`、`/export` 以及未来的新增）都无需任何按平台的工作即可在会话中使用，桌面输入框保持同一份清单。

两条规则保证两档命令自洽：

- 只有当一行符合注册表语法时才被当作命令：字节零处的斜杠，随后是由字母、数字、`_` 或 `-` 组成的小写名称，然后是输入结束或空白。语法正确但两档都不认识的命令会得到一句指向 `/help` 的简短提示，绝不成为模型消息，与既有适配器规则一致。
- 仅以斜杠开头但不符合该语法的行——例如中文句子开头的 `/加油`——按普通消息处理。桌面输入框可以拒绝它，因为 `/` 菜单让意图明确；聊天界面不能，吞掉普通文本比误发一次提问更糟。

### 出站路径

- 消费方响应已绑定 Session 的轮次结束，发送该轮次的最终助手文本。产品负责人已决定不发送工具进度、中间助手消息与长时间运行提示；平台的反垃圾行为与桌面通知的先例与此一致。
- 投递为至少一次，带有限重试与可见的最终失败。被丢弃的发送是一种被报告的状态，绝不静默。
- 分片、平台长度限制与格式转换由提供方负责；投递记录及其重试策略由消费方负责。

### 授权与权限

- 完成设置流程的账号是第一个已授权发送者。
- 默认姿态拒绝其他所有发送者。页面可按 id 添加发送者，或批准一条待处理请求。
- 绑定的权限 preset 在设置过程中显式选择，默认使用标准 preset，并在已连接状态中持续可见。远程消息会让 agent 带工具执行，因此这是一个被呈现的选择，而不是静默默认。
- 已绑定 Session 抛出的权限提问会连同工具、提问原因与可选答案转发到会话，并在那里得到应答。应答方只应答该会话拥有的 agent，与审批接缝的归属规则一致；未获应答的提问保持失败关闭，而不是打开闸门。

### 凭据

- iLink 令牌，以及之后的飞书 App Secret，通过 `ctx.credentials` 写入，绝不回到客户端；设置文档只携带引用。
- 一次微信扫码登录会创建属于它自己的 iLink 机器人身份，与其他客户端轮询的另一个身份互不影响。页面说明一个身份同时只服务一个已连接客户端，提供方自行获取令牌锁，使第二个实例显式失败而不是静默分流消息。

### 模型可见影响

来自通道的每一项模型可见输入都是一条带通道溯源信息的 `user/message` 事件，因此 Session 日志无需平台即可重建该对话。命令运行记录为 `command/run` 与 `command/done`，不进入模型历史。出站投递状态不是模型可见的，它保存在投递记录中而非 Session 日志中。

### 打包

- 两个提供方都不声明外部运行时依赖，因为装配暂存目录无法解析它。
- 微信：基于已文档化的 HTTP/JSON 协议、使用 Node 内置能力实现（`node:crypto` 覆盖 AES-128-ECB 媒体路径），以官方包与 `cc-weixin` 作为协议参考。
- 飞书（后续）：推荐把官方 SDK 打进插件产物，因为长连接的帧协议、重连与令牌刷新由 SDK 负责，否则会成为自有代码。替代方案是直接基于 Node 内置 WebSocket 实现连接帧。技术就绪记录负责该选择及其代价。

### 插件规范符合性

每一层都落在既有扩展点上；唯一新增的扩展点就是接缝自身所需的服务定义：

| 需要的能力 | 扩展点 |
|---|---|
| 通道注册表与提供方接口 | 新增的 `ctx.channels` 服务定义——唯一新增的扩展点，也是该接缝的服务定义角色 |
| 把被接受的消息变成一次轮次 | webhook 运行时已在使用的公开 Session 与 Agent 接口 |
| 观察轮次结束 | `ctx.on('session/event', …)`，`session-title`、`token-meter`、`agent-instructions` 与 `agent-team` 已经在消费的公开事件 |
| 会话中的命令 | `ctx.commands`，桌面输入框 `/` 菜单所投影的注册表 |
| 应答权限提问 | `approval/request` 应答方瀑布，其文档化的席位正是"为自己拥有的 agent 应答的 UI 应答方" |
| 会话绑定 | `ctx.storageDomain` |
| 密钥 | `ctx.credentials` |
| 偏好设置与设置页 | `ctx.settingsScope` 与 `settings.section` 账本 |
| 界面组合 | `ctx.slots` 与共享客户端原语 |
| 产品文案 | `ctx.locale.register` |
| 消息溯源 | `MessageSourceMap` 声明合并，与 `webhook` 现有做法一致 |
| 客户端到 Host 的调用 | 既有 Remote 网关及其转发的所有者事件 |

Agent Loop 未改动。Mint Bundle 只承载 patch 行，不含功能实现。共享包不按 Mint 身份分支，且普通 Web 组合必须在不含 Mint 默认值的情况下运行该接缝。每一次注册都经过 `ctx.effect` 并返回释放函数，因此释放提供方会中止其长轮询并归还令牌锁。

随部署变化的选择都是经校验的 `Config` 字段，因为硬编码的可调项不构成可配置性：默认工作区路径、agent preset、权限 preset、轮询超时与重试上限、熔断阈值、出站分片长度，以及是否转发权限提问。

实现之前仍有三项义务：

- **把外部输入变成 Session 的事务还不是扩展点。** 该事务目前位于 webhook 运行时内部。本消费方需要同一个事务，而复制一个"先挂接、后追问"顺序如此微妙的事务，正是提取规则所禁止的。符合规范的路径是定义最小的可复用服务，让 webhook 运行时与本消费方都使用它。由于这会触及上游拥有的包，技术就绪记录需要在两者之间选择：把服务提取到新包并以 webhook 迁移作为后续，或把该迁移纳入本次交付。
- **feature record 仍欠复用说明与支持的 DSH 版本范围**，这是[复用与兼容](../../context/downstream-policy.zh.md)的要求：另一位 DSH 开发者挂载 `channel` 并配上自己的提供方即可使用。
- **该接缝的测试计划属于本设计**：每个包的单元测试、通过 Loader 启动仅测试用 `cordis.yml` 的真实组合测试、设置流程的无密钥浏览器场景，以及打包装配检查。

## Client experience

### 入口

一个名为 远程连接（Remote Connections）的 `settings.section` 贡献，位置在"模型"之后。导航行与分区标题携带聚合 `StateDot`：未配置为中性，连接中或等待人工操作为琥珀色，已连接为绿色，失败为红色。

### 连接列表

每个平台一张卡片，沿用 `ui-settings-plugins` 卡片先例（名称在描述之上，而非 `DisclosureRow`）：

- 未配置：平台名称、一行说明它能做什么、**连接**
- 连接中：当前步骤及其状态、**取消**
- 已连接：账号身份、`StateDot`、工作区与权限 preset 摘要、**管理**、**断开连接**
- 不可用：Host 诊断信息与**重试**

### 微信设置

一个 `Modal` 承载四个步骤，一次只显示一步：

1. **扫码登录** — 由 Host 返回的 URL 渲染为二维码图片（不是终端二维码），扫码链接以可复制文本给出，并显示实时状态：等待扫码 / 已扫码，等待确认 / 登录成功 / 二维码已过期，已刷新。
2. **确认身份** — 登录创建的机器人身份，并明确说明该身份同时只服务一个客户端。
3. **授权与运行位置** — 已授权发送者（默认为扫码账号）；工作区、agent preset 与权限 preset。
4. **完成** — 提示从微信给机器人发一条消息，列出值得知道的几条命令（`/new`、`/status`、`/stop`、`/help`），并显示最近一次入站与出站事件。

### 飞书设置（第二次交付）

同一个 modal 外壳承载五步开发者后台引导，因为飞书需要企业自建应用：

1. **创建应用** — 打开飞书开发者后台的控件，并给出可复制的建议应用名。
2. **凭证** — App ID 与 App Secret 输入框。Host 调用飞书 API 校验并就地报告成功或平台诊断信息。
3. **权限与事件** — 精确的权限点与事件名，每项带复制控件，并给出该应用权限页与事件配置页的深链。
4. **发布应用** — 说明自建应用发布意味着什么，并给出该应用版本页的深链。
5. **连接验证** — Host 建立长连接，页面显示已连接身份，随后进入与微信相同的授权与工作区步骤。

每一步都说明自身要求并报告自身结果；流程不会越过未验证的步骤。

### 对话内呈现

- 入站消息渲染一枚标明通道与发送者的来源标签，复用 `ui-chat` 中现有的可合并扩展来源投影。
- 出站回复携带投递状态——发送中 / 已送达 / 发送失败——因为回复生成时用户并不在桌面旁。
- 命令运行渲染为既有的命令对话节点，因此微信里的 `/new` 与桌面输入框里的 `/compact` 读起来一致。
- 转发到会话的权限提问渲染为一张独立卡片，标明工具与提问原因。
- 由通道创建的 Session 在会话列表中标注来源，使桌面用户能分辨哪些对话来自远程。

### 交互状态

- 加载：页面从 Host 读取通道状态；提供方未挂载的通道不渲染任何行，而不是渲染一个点开无内容的控件。
- 空态：没有任何提供方挂载时该分区不存在。
- 错误：凭据被拒、网络失败、平台会话过期（微信 `errcode -14` 需要重新扫码）、平台限流，以及投递失败，各自带有独立文案与补救方式。
- 禁用：提供方报告不可用的通道，并给出原因。
- 权限：已授权发送者列表与待处理请求列表。

### 视觉规范

- 颜色只取自语义主题角色；[设计系统上下文](../../context/design-system.zh.md) 是权威，本功能不引入字面颜色值。
- 组合使用 `Modal`、`Button`、`Input`、`StateDot`、`Tag`、`Toast`、`Tooltip` 与 `MarkdownText`。平台卡片与步骤列表属于功能本地组件，沿用 `PluginCard` 先例。
- 状态颜色沿用既有映射：绿色表示已确认的连接，琥珀色表示等待人工操作，红色表示失败，中性表示未配置。
- 布局：视口内受限的 modal，内容宽度约 560–640 px，二维码在安静的边框内以固定尺寸呈现，步骤纵向排列并带序号与恰好一个主操作。
- 动效只使用共享的 0.1、0.2、0.3 秒 ease-in-out 时长；等待状态带有 `prefers-reduced-motion` 静态分支。
- 无障碍：对话框具有可访问名称，状态变化通过 live region 播报，二维码图片带文本替代，焦点移动到每一步的第一个控件，仅图标操作带标签。
- 文案通过 `ctx.locale.register(ns, { zh, en })` 注册并经 locale 席位到达界面；`verify-client-ui-i18n` 拒绝硬编码产品文案。

## Risks and open decisions

产品负责人于 2026-09-19 已解决：

1. **产品范围。** 已批准：Desktop Mint 在上游 Harness 之上发行一套经过挑选的功能集，其与上游的关系如同发行版与上游。
2. **首个交付。** 先做微信，因为它只需一次扫码、无需开发者后台操作；其他平台待其验证之后跟进。
3. **回传内容。** 仅 agent 的最终回复。
4. **会话类型。** 仅私聊。
5. **Session 连续性。** 一个对话持续续接同一个 Session，直到用户用命令开始新对话。

产品负责人于 2026-09-19 另外解决：

6. **`/new` 的时机。** 先解除绑定，由下一条消息创建 Session，因此不会产生空 Session。
7. **会话命令是否出现在桌面输入框。** 不出现；桌面保留自己的侧边栏与停止控件。
8. **如何应答转发的权限提问。** 转发消息给出带编号的选项，回复编号即为应答。

仍待技术就绪记录确定：

9. **外部 Session 接纳事务的归属。** 把 webhook 运行时的 Session 创建事务提取为可复用服务并在此采用，webhook 迁移或纳入本次交付、或作为后续跟进。

风险：

- 长轮询与桌面后端共用同一个进程，因此对被限流平台的无界重试循环会拖慢整个应用。提供方负责有限策略与熔断。
- 转发到手机的权限提问由看不到眼前文件与命令的人应答。因此转发卡片会标明工具与提问原因，未获应答的默认结果保持失败关闭。
- 之后打包飞书 SDK 会增大插件产物。装配阶段与打包冒烟测试必须确认解析闭包与产物体积。
- 远程对话的权限 preset 是真实的执行边界。设计让它保持可见，并拒绝静默选择它。

## Phasing

- 阶段一：能力接缝、`channel-session`、微信提供方、会话命令、权限提问转发、控制器，以及带微信流程的设置页面。
- 阶段二：同一接缝上的第二个提供方，从飞书及其开发者后台引导开始。
- 阶段三：群聊、产出文件附件，以及按通道配置的显示选项。
