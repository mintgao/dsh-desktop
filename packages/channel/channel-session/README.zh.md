---
description: "把一个即时通讯会话连接到 DSH Session：持久会话绑定、发送者授权、入站接纳与经通道 seam 的回复投递。"
kind: "package-reference"
---

# @deepseek-ai/dsh-channel-session

[English](README.md) | 中文

## 概述

`dsh-channel-session` 把一个即时通讯会话连接到一个持久 DSH Session：会话只需设置一次，此后每条经过授权的消息都会继续同一个 Session，而它完成的回复会回到聊天里。绑定、被拒绝的消息与投递记录在重启后依然存活，因此平台重投会继续同一个 Session 而不会新建第二个，回复也会被重试而不是丢失。把它与拥有平台连接的提供方包挂载在一起；本包拥有会话的含义。会话命令与权限提问转发不在本包之内。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在通道注册表与其注入的服务之后挂载一次消费方；随后由客户端为每个会话设置工作区、预设与授权发送者，此后提供方的消息与 Session 完成的回合就会在无需进一步调用的情况下流转。

### 何时选择

当即时通讯平台上的一个会话必须到达真实 agent Session 时选择本包。提供方拥有连接、认证、消息规范化与平台状态；本消费方拥有会话绑定、发送者授权、接纳与回复路径。当外部事件只需要创建一个没有会话可继续的全新 Session 时不要选择它——[`dsh-webhook`](../../webhook/webhook/README.zh.md) 覆盖该路径。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-channel-session'
  config:
    defaultWorkspacePath: /Users/me/projects
    agentPreset: standard
    permissionPreset: read-only
    deliveryAttempts: 3
    deliveryBackoffMs: 1000
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `defaultWorkspacePath` | 必填 | 为会话创建的 Session 运行所在的工作区；会话设置可以覆盖 |
| `agentPreset` | 必填 | 本消费方创建的 Session 挂载的 agent 组合；会话设置可以覆盖 |
| `permissionPreset` | 必填 | 在首条提示词之前应用的沙箱与审批预设；会话设置可以覆盖 |
| `deliveryAttempts` | 必填 | 一条回复获得的出站尝试总次数，含第一次 |
| `deliveryBackoffMs` | 必填 | 两次出站尝试之间的等待，单位毫秒 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-channel-session)是每个受支持字段的穷尽式真源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

消费方在 `ctx.storageDomain` 下维护三个持久域：每个会话一条指明其继续的 Session 的绑定、每条被拒绝消息一条待处理请求，以及每条完成回复一条投递记录。只有绑定决定一条消息是继续既有 Session 还是接纳新 Session，因此写入顺序就是契约：设置在其它一切存在之前写入未绑定记录，而被接纳的消息在持久挂载之后、首条提示词之前写入 Session 关联——这两点之间发生崩溃时，重投会进入同一个 Session，而不是创建第二个。

入站消息经 `ctx.channels.onInbound` 到达，并按顺序通过四道检查：从未设置过的会话被拒绝并记一条诊断；未授权发送者变成一条持久待处理请求；精确的平台重投由最近接纳的消息 id 抑制；经过授权的消息要么继续绑定的 Session，要么通过共享的 `admitSession` 事务接纳新 Session。每条被接纳的消息都携带 `source.kind: "channel"` 来源——通道、会话、发送者、消息 id 与 notice 形式的摘要——以便桌面端呈现它来自哪里。

出站路径观察 `session/event`：回合结束时，消费方解析绑定到该 Session 的会话，折叠出该回合最后一条非空 assistant 文本，并把回复交给带界重试——每次尝试都记录在介质上。投递是至少一次的：平台不提供幂等键，因此歧义超时后的重试可能重复一条回复，而重复优于丢失。投递记录是传输状态，绝不是会话内容；这条路径上没有任何东西是模型可见的，也不会进入 Session 日志。dispose 时先中止生命周期信号，使在途的发送在域关闭之前停止。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 消费方服务：域、设置、入站授权与接纳、出站观察 |
| [`src/binding.ts`](src/binding.ts) | 持久键、绑定读取与所有写入方共享的记录变换 |
| [`src/outbound.ts`](src/outbound.ts) | 回复折叠、投递身份与带界重试 |
| [`src/spec.ts`](src/spec.ts) | 三个持久记录 schema 及其域声明 |
| [`src/brand.ts`](src/brand.ts) | 不透明键品牌 |
| [`tests/binding.spec.ts`](tests/binding.spec.ts) | 键、记录变换、schema 与表读取 |
| [`tests/inbound.spec.ts`](tests/inbound.spec.ts) | 授权、接纳、重投抑制、拒绝记录、投递 |
| [`tests/outbound.spec.ts`](tests/outbound.spec.ts) | 回复折叠、重试边界、终止失败、dispose |
| [`tests/loader-composition.spec.ts`](tests/loader-composition.spec.ts) | 真实 Loader 组合：一条消息进、一条回复出 |
| — | 不发布运行时不变式伴生入口；每条持久记录都经由各自的单一写入路径写出、且只由本消费方读回，绑定指向的 Session 不再存在是一种被接受的状态，入站路径会通过接纳新 Session 修复它。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。它们从本消费方订阅的 seam 出发，走向它依赖的契约。

- [通道子系统](../../../docs/subsystems/channel.zh.md)——提供方约定、注册生命周期，以及本消费方与提供方共享的值。
- [通道提供方注册表](../channel/README.zh.md)——本消费方观察的扇出与提供方集合。
- [Session 接纳](../../session/session-admission/README.zh.md)——每个新建会话 Session 都要经过的共享顺序。
- [远程通道连接决策](../../../docs/decisions/0001-remote-channel-connections.zh.md)——持久契约与延期的命令、转发工作。
- [通道组映射](../README.zh.md)——本包所属的家族。

-----

<a id="model-experience"></a>
## 模型体验

### 被接纳的会话消息

#### 模型看到什么

每条经过授权的消息都以普通 user 角色消息被接纳，其文本就是发送者键入的内容；它的 `source` 携带 `kind: "channel"` 以及通道、会话、发送者、消息 id 与 notice 形式的摘要。消费方不添加自己的提示词文本、系统提示词文案或工具 schema。

#### Token 影响

被接纳的文本作为 Session 历史保留并贡献 token，直到普通压缩替换它为止。除此之外不添加任何内容。

#### KV Cache 影响

第一条消息建立新建 Session 的请求前缀；后续追问追加在请求末尾，因此更早的前缀块保持其缓存身份。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明一个会话今天能做什么、不能做什么。它们是当前包约束，不是任务积压。

- **会话命令尚未实现**——`/new`、`/status`、`/stop`、`/help`、`/whoami` 以及经 `ctx.commands` 的第二级派发都不存在，因此会话还无法从聊天里开启全新 Session 或停止运行中的回合。
- **权限提问转发尚未实现**——agent 的权限提问还不会转发到会话；目前只有桌面端会显示它。
- **被拒绝的消息等待决策界面**——拒绝会形成一条持久待处理请求，但还没有任何界面能批准或驳回它；记录以 `pending` 状态累积。
- **平台轮询归提供方所有**——本消费方持久化并推进提供方游标，但从不连接平台；连接、重试与分块由提供方包拥有。
- **投递是至少一次的**——歧义超时后的重试可能重复一条回复；平台不提供幂等键，而重复优于丢失。
- **被中断的投递保持 pending**——dispose 会停止重试并让记录停留在 `pending`；下次启动时不会有任何东西自动重试它。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
