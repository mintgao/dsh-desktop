# 实施方案：通道 Session 消费方

[English](implementation-plan.md) | 中文

- 工作项：`20260919-remote-channel-connections`
- 切片：M1 —— `packages/channel/channel-session`
- 闸门：`implementation-ready`（`decision-accepted`，2026-09-19 确认）

持久约定在[决策记录](../../decisions/0001-remote-channel-connections.zh.md)中，验收标准在[工作项说明书](brief.zh.md)中。本文件只补充切片边界、文件级形态、工作顺序，以及每一步应交付的证据。

## 切片边界

范围内——通道接缝的消费方角色：

- 会话绑定：每个 `(channel, conversationId)` 一条持久记录。
- 发送方授权：已授权集合、拒绝路径，以及拒绝所产生的持久待批记录。
- 入站路径：被接受的消息通过 `@deepseek-ai/dsh-session-admission` 变成新 Session，或成为已绑定 Session 的后续轮次。
- 出站路径：已绑定 Session 的轮次结束文本，经由提供方投递，带有界重试与持久投递记录。

范围外，并标明各自由哪个切片负责：

- 会话命令（`/new`、`/status`、`/stop`、`/help`、`/whoami`，以及经 `ctx.commands` 的二级分派）与权限提问中继——切片 M4。`channel-session` 先不带它们落地，并在其 README 的"已知限制"中写明该缺口。
- `packages/api/channel-controller` 与客户端设置区——切片 M3。
- `channel-weixin` 及其它提供方——切片 M2。
- Mint bundle 行、`MINT_PACKAGES` 与打包检查——切片 M5。

该顺序有一处被接受的后果：从 M1 起拒绝就是持久的，但批准或驳回要等 M3 的页面，因此早期拒绝会一直累积到那个页面存在为止。

## 包形态

`packages/channel/channel-session/` 是一个 Host 插件包，注入 `channels`，并全部经 `ctx.effect` 注册。

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 插件本体：校验过的 `Config`、三个 domain、effect 装配与拆卸 |
| `src/binding.ts` | 绑定 domain：schema、读取，以及所有写入方共用的写变换 |
| `src/authorization.ts` | 已授权发送方解析与持久拒绝记录 |
| `src/inbound.ts` | 下面的入站顺序 |
| `src/outbound.ts` | 轮次观察、投递记录与有界重试 |
| `src/types.ts` | 仅类型，无运行时代码 |

建包流程遵循[新增包的 cookbook](../../cookbook/adding-a-package.zh.md)：两个 tsconfig 汇总文件里的登记、`channel/` README 配对中的一行、`PACKAGE_LIBRARIES` 条目（本包是插件，采用 `apply` 形式，因此 kind 为 `package-reference`），以及 README 中关于不发布 `./invariant` 的说明句。

## 持久状态

三个 `ctx.storageDomain` domain，各自带 `schemaVersion`；运行中的构建不认识的版本会以"通道不可用 + 诊断"报告，而不是被重新解释。

| Domain | 键 | 字段 |
|---|---|---|
| 绑定 | `(channel, conversationId)` | `sessionId`、`workspacePath`、`agentPreset`、`permissionPreset`、`title`、`authorizedSenderIds`、出站显示选项、提供方游标、`lastAdmittedMessageId` |
| 待批请求 | `(channel, conversationId, messageId)` | `senderId`、文本、`receivedAt`、`status`（`pending \| approved \| dismissed`） |
| 投递记录 | `(channel, conversationId, deliveryId)` | 状态（`pending \| sent \| failed`）、尝试次数、最后错误、成功时的平台消息 id、时间戳 |

只有 `sessionId` 决定会话续接哪个 Session；解析不到 Session 的 `sessionId` 按未绑定处理，而不是用其它字段重建。所有写入都走 domain 自己的写路径，因此提供方的游标推进、接纳事务的 `onAttached` 写入，以及之后 `/new` 的清空不会互相覆盖。

## 入站顺序

1. 注册表把一条已认证、已由提供方规范化的消息交给消费方的入站监听器。
2. 按 `(channel, conversationId)` 解析绑定。没有绑定意味着尚未搭建：该消息被拒绝并记录一行诊断，且不创建任何记录，因为拒绝是相对记录中的授权集合判定的。
3. 以 `authorizedSenderIds` 解析发送方。未知发送方被拒绝：不建 Session、不产生模型可见事件、记录一行诊断，并写入一条待批请求记录。
4. 抑制与 `lastAdmittedMessageId` 完全重复的消息。
5. 若没有已绑定 Session，则通过 `admitSession` 接纳一个：工作区路径、两个预设，以及带 `channel` 来源成员的跟进文本；`onAttached` 钩子在首条提问被接纳前写入 `sessionId` 并推进游标。
6. 若已有绑定 Session，则以同样的来源成员通过 `ctx.sessionController.prompt(...)` 提交消息，然后推进 `lastAdmittedMessageId` 与游标。

## 出站顺序

1. 在每个已绑定 Session 上观察标志轮次结束的事件。
2. 组装一段正文：该轮次的最终助手文本。工具进度、中间助手文本与长时间运行提示不发送。
3. 先写入状态为 `pending` 的投递记录，再调用提供方的 `send(conversation, message, signal)`。
4. 成功则记为 `sent` 并带上平台消息 id；失败则在配置的尝试次数与退避界限内重试，之后保留为 `failed`，带上最后错误、一行诊断与页面状态。
5. 拆卸即停止投递；处于 `pending` 的记录保持持久，并以"已报告"而非静默丢弃的方式呈现。

## 配置

每个界限都是一个必填且经校验的 `Config` 字段——硬编码常量不构成可配置性。

| 字段 | 含义 |
|---|---|
| `defaultWorkspacePath` | 绑定未携带工作区时，新建 Session 所在的工作区 |
| `agentPreset` | 新建 Session 挂载的 agent 组合 |
| `permissionPreset` | 首条提问前应用的沙箱与审批预设 |
| `deliveryAttempts`、`deliveryBackoffMs` | 出站重试的界限 |
| `displayOptions` | 出站发送哪些部分 |

轮询超时、轮询重试界限、熔断阈值与出站分块属于 `channel-weixin`（切片 M2），不在本包。

## 本切片应交付的证据

- 按行为领域拆分的单元测试，各自覆盖其错误路径：绑定的读写、授权与拒绝、以记录副作用的假服务栈驱动的入站顺序、出站重试与其终态失败。
- **一个真实组合测试**，因为这是产品可见插件：用只存在于测试中的 `cordis.yml` 经 Loader 启动，配一个假提供方，断言被接受的消息产生一条带 `channel` 来源的持久 `user/message` 事件，并且回复到达提供方的 `send`。
- 针对本包源码的逐文件 100% 覆盖率，用聚焦的覆盖率命令运行。
- README 配对、分组 README 行，以及针对文档产物的 `pnpm run doc-sync`。

本切片无法产出的证据，由后续切片补：真实平台往返（M2）、在浏览器中观察到的设置流程（M3）、打包装配与冒烟（M5）。

## 验收对应

| 验收标准 | M1 之后 |
|---|---|
| AC-2（入站消息成为 Session 的用户消息；回复回到该对话） | 消费方这一半以假提供方证明；平台那一半需要 M2 |
| AC-3（未授权发送方被拒绝、无模型可见内容、可诊断） | 达成，持久证据即待批记录 |
| AC-9（断开后停止入站轮询与出站投递，已有 Session 仍可读） | 投递这一半在拆卸时达成；轮询那一半属于提供方（M2） |
| AC-1、AC-4–AC-8、AC-10、AC-11 | 后续切片 |

## 工作顺序

1. 包骨架、各项登记，以及绑定 domain 与其测试。
2. 授权、拒绝记录，以及经 `admitSession` 的入站顺序。
3. 轮次观察、投递记录与有界重试。
4. 真实组合测试，随后是文档产物与 `doc-sync`。

## 已记录的本地假设

- 消费方为新建 Session id 使用前缀 `channel-`。
- 投递记录的键包含消费方自行生成的投递 id，因为 iLink 的发送路径不提供幂等键。
- 出站组装的起点只有该轮次的最终助手文本；显示选项决定之后是否恢复分部投递。

## 本切片的风险

- **待批请求记录在 M3 之前没有消费方。** 拒绝是持久且可诊断的，但目前没有任何东西能批准它；README 把它写为限制，而不暗示页面已存在。
- **提供方游标由两个包写入。** 游标的值归 `channel-weixin`；本包在与接纳同一笔写变换中持久化它，因此两个写入方都必须走 domain 的写路径——这正是 domain 在本包创建、在那边读取的原因。
- **接纳事务与未改动的 webhook runtime 共享。** 因此 `admitSession` 的行为变化会同时影响两者；在迁移工作项落地之前，跨包对等测试正是让这段重复窗口安全的东西。