---
description: "把微信账号连接到通道 seam：每个账号扫码登录一次、各自拥有令牌锁、游标长轮询，以及经腾讯 iLink Bot API 的分块回复。"
kind: "package-reference"
---

# @deepseek-ai/dsh-channel-weixin

[English](README.md) | 中文

## 概述

`dsh-channel-weixin` 把微信账号连接到通道 seam，每个账号一个注册。你为每个微信号扫码一次，此后该账号的提供方会向平台长轮询私聊消息，把每条经过认证的文本以自己的通道身份发布，并把 agent 的回复按平台分块大小发回。把它与拥有会话含义的 `dsh-channel-session` 挂载在一起。一个微信号同一时刻只持有一个机器人会话，因此登录会顶替此前占用它的客户端；本包会上报重新扫码所顶替掉的会话。群聊、媒体与设置页不在本包之内。

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

在通道注册表、凭据服务与提供方读取游标的消费方之后挂载一次服务。它会在初始化时恢复凭据库中已有的每个账号，`ctx.channelWeixin` 是启动登录、取消登录与断开账号的接口——也就是切片 M3 客户端设置页所驱动的那组操作。

### 何时选择

当一个微信会话必须到达真实 agent Session 时选择本包。每个账号的提供方拥有该账号的平台连接、扫码登录、令牌锁、长轮询与出站分块；[`dsh-channel-session`](../channel-session/README.zh.md) 拥有会话绑定、授权、接纳与投递记录。

企业微信与公众号不在本功能范围内，一切非官方协议同样不在。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-channel-weixin'
  config:
    pollTimeoutMs: 35000
    pollRetryAttempts: 3
    pollBackoffMs: 1000
    sendRetryAttempts: 3
    sendBackoffMs: 1000
    throttleDelayMs: 5000
    breakerThreshold: 5
    chunkLength: 2048
    lockDirectory: /Users/me/Library/Application Support/dsh-mint
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `pollTimeoutMs` | 必填 | 长轮询超时，单位毫秒；平台可能为下一次请求建议另一个值 |
| `pollRetryAttempts` | 必填 | 一个轮询周期获得的尝试总次数，含第一次 |
| `pollBackoffMs` | 必填 | 两次轮询尝试之间、以及两个失败周期之间的等待，单位毫秒 |
| `sendRetryAttempts` | 必填 | 一个出站分块获得的尝试总次数，含第一次 |
| `sendBackoffMs` | 必填 | 两次出站尝试之间的等待，单位毫秒 |
| `throttleDelayMs` | 必填 | 被频率限制的发送在重试之前观察的等待，单位毫秒 |
| `breakerThreshold` | 必填 | 打开断路器所需的连续失败轮询周期数 |
| `chunkLength` | 必填 | 平台长度限制之内最大的出站分块，单位字符 |
| `lockDirectory` | 必填 | 令牌锁文件所在目录；每个账号一个文件，按账号身份命名。Mint 打包把它指向桌面数据目录 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-channel-weixin)是每个受支持字段的穷尽式真源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

提供方只说一种协议：位于 `https://ilinkai.weixin.qq.com` 的腾讯 iLink Bot API，且完全基于 Node 内建能力（`fetch`、`AbortSignal`、`node:crypto`），因为 Mint 包不得声明第三方运行时依赖。`src/transport.ts` 是唯一与平台对话的模块；其余模块都接收传入的传输层，因此测试可以在该 seam 之后脚本化一个替身。

登录序列获取一个二维码、轮询其状态、跟随重定向分片、在有界次数内替换过期二维码，并把确认后的产物——机器人身份、令牌、其分片，以及扫码的平台身份——经 `ctx.credentials` 写入，记录键由该身份派生。平台对每个微信号同一时刻只保留一个机器人会话：对某账号的登录会顶替此前占用它的客户端，这正是重新扫码一个已连接账号是一次有序交接的原因——旧提供方先停止轮询并释放锁，新提供方才注册；也是被顶替的客户端在轮询与发送上都遇到 `errcode -14` 的原因。每个账号拥有自己的令牌锁文件，其持有者每个轮询周期心跳一次：第二个实例会带着诊断报告 `unavailable`，而不是分流消息流；崩溃持有者的锁在其心跳早于配置边界所允许的最坏轮询周期之后被接管。

轮询从 `ctx.channelSession` 报告的会话绑定中最早的游标恢复，因为一条令牌级消息流喂养所有会话，而 `lastAdmittedMessageId` 会抑制随后的重投。每条发布的消息都携带其批次被请求时的游标，因此接纳之后发生崩溃会从该批次之前恢复，而不是跳过它。会话过期（`errcode -14`）会停止轮询以等待重新扫码，并上报是哪一种读法——连接期间被夺走，还是提供方启动时就已失效；瞬时失败在配置边界内重试；反复失败会打开断路器并报告 `unavailable`。平台建议的轮询超时只会在配置边界之内被采纳。

`src/accounts.ts` 拥有一个账号以何为名：由平台身份派生的 slug、凭据记录键、注册身份 `weixin:<slug>`，以及它的锁文件名。`src/index.ts` 在初始化时恢复每个已存账号——载荷在本构建中不可读的记录会以 `unavailable` 注册，而不是消失——并为每个账号建立各自的提供方。`disconnect(id)` 在该账号轮询停止、锁释放之后注销它，删除其已存登录，且不触碰其它账号；它不释放平台会话，因为只有另一次登录才会顶替它。

出站路径在配置的分块长度内拆分回复，在其自身边界内重试被限流或失败的分块，并在平台接受每个分块后以首块的消息 id 完成。dispose 会中止长轮询并释放令牌锁。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 账号服务 `ctx.channelWeixin`：初始化时恢复、唯一的在线登录序列、有序交接、断开，以及经校验的 `Config` |
| [`src/accounts.ts`](src/accounts.ts) | 一个账号以何为名：slug、凭据键、注册身份、锁文件 |
| [`src/provider.ts`](src/provider.ts) | 单个账号的提供方：附着、锁、轮询、发送与顶下线诊断 |
| [`src/config.ts`](src/config.ts) | 部署边界，以及它们所隐含的陈旧阈值 |
| [`src/login.ts`](src/login.ts) | 扫码登录序列与凭据写入 |
| [`src/transport.ts`](src/transport.ts) | 基于 Node 内建能力的 iLink HTTP/JSON 调用与错误映射 |
| [`src/poll.ts`](src/poll.ts) | 长轮询：游标、重试边界、退避、断路器 |
| [`src/send.ts`](src/send.ts) | `send_message`：分块、限流策略、收据 |
| [`src/lock.ts`](src/lock.ts) | 令牌锁文件：独占创建、心跳、陈旧规则 |
| [`src/normalize.ts`](src/normalize.ts) | 把平台更新转换为通道的入站事件 |
| [`src/types.ts`](src/types.ts) | 仅类型，无运行时代码 |
| [`tests/provider.spec.ts`](tests/provider.spec.ts) | 单个账号的提供方：附着、锁、发送、顶下线与所有失败上报 |
| [`tests/service.spec.ts`](tests/service.spec.ts) | 账号服务：恢复、登录序列、交接、断开与两种拒绝 |
| [`tests/transport.spec.ts`](tests/transport.spec.ts) | URL 形态、请求头、请求体、解码、错误分类 |
| [`tests/loader-composition.spec.ts`](tests/loader-composition.spec.ts) | 真实 Loader 组合：扫码一次、一条消息进、一条回复出 |
| — | 不发布运行时不变式伴生入口；每个提供方除它写入的凭据记录与它拥有的令牌锁文件之外，不保存任何自有持久状态。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。

- [通道子系统](../../../docs/subsystems/channel.zh.md)——本包实现的提供方约定与注册生命周期。
- [通道提供方注册表](../channel/README.zh.md)——本提供方发布进入的扇出。
- [通道 Session 消费方](../channel-session/README.zh.md)——把这些消息变成 Session 并把回复发回的包。
- [远程通道连接决策](../../../docs/decisions/0001-remote-channel-connections.zh.md)——持久契约与延期的命令、转发工作。
- [通道组映射](../README.zh.md)——本包所属的家族。

-----

<a id="model-experience"></a>
## 模型体验

### 无模型可见面

#### 模型看到什么

本包不添加自己的提示词文本、系统提示词文案或工具 schema；每个账号的提供方把发送者的文本原样作为携带 `conversationId`、`sender`、`messageId` 与 `text` 字段的入站事件发布，到达模型的是消费方的接纳结果。

#### Token 影响

自身没有。它发布的文本由消费方的接纳保留并在那里贡献 token。

#### KV Cache 影响

没有。提供方不向任何 Session 的请求前缀写入内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明一条连接今天能做什么、不能做什么。它们是当前包约束，不是任务积压。

- **仅私聊与文本**——群聊会被忽略并记一条诊断；丰富的入站媒体不在简报范围之内。
- **一个微信号同一时刻只持有一个机器人会话**——对某账号的登录会顶替此前占用它的客户端，因此两个客户端无法同时连接同一个账号。被顶替的一方在轮询与发送上都遇到 `errcode -14`，必须自己重新扫码才能恢复；而微信自身不会显示任何“连接的客户端已变更”的信号，这正是本包要自行上报这次顶替的原因。
- **支持多个账号，但目前只有一个经过平台实测**——第二个微信号与双账号往返是仍需本人执行的验收步骤。
- **设置页尚未实现**——扫码登录操作已存在于 `ctx.channelWeixin` 上，但渲染它们的客户端界面属于切片 M3。
- **会话命令与权限转发尚未实现**——它们属于切片 M4 与消费方。
- **iLink API 没有公开文档**——错误码与限流语义来自参考实现，需要由本人参与的真实往返来对照平台确认。
- **崩溃持有者要付出陈旧阈值的代价**——下一个实例在接管令牌锁之前要等满配置边界所允许的最坏轮询周期，并把这段等待作为诊断上报而不是隐藏。
- **Mint 打包尚未包含本包**——打包与打包后检查属于切片 M5。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
