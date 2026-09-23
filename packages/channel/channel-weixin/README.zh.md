---
description: "把一个微信机器人身份连接到通道 seam：扫码登录、令牌锁、游标长轮询，以及经腾讯 iLink Bot API 的分块回复。"
kind: "package-reference"
---

# @deepseek-ai/dsh-channel-weixin

[English](README.md) | 中文

## 概述

`dsh-channel-weixin` 把一个微信机器人身份连接到通道 seam。你只需扫码一次，此后提供方会向平台长轮询私聊消息，把每条经过认证的文本作为规范化入站事件发布，并把 agent 的回复按平台分块大小发回。把它与拥有会话含义的 `dsh-channel-session` 挂载在一起。群聊、媒体与设置页不在本包之内。

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

在通道注册表、凭据服务与提供方读取游标的消费方之后挂载一次；登录本身由客户端设置页（切片 M3）或提供方自身的登录操作驱动。

### 何时选择

当一个微信会话必须到达真实 agent Session 时选择本包。本提供方拥有平台连接、扫码登录、令牌锁、长轮询与出站分块；[`dsh-channel-session`](../channel-session/README.zh.md) 拥有会话绑定、授权、接纳与投递记录。

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
| `lockDirectory` | 必填 | 令牌锁文件所在目录；Mint 打包把它指向桌面数据目录 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-channel-weixin)是每个受支持字段的穷尽式真源。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

提供方只说一种协议：位于 `https://ilinkai.weixin.qq.com` 的腾讯 iLink Bot API，且完全基于 Node 内建能力（`fetch`、`AbortSignal`、`node:crypto`），因为 Mint 包不得声明第三方运行时依赖。`src/transport.ts` 是唯一与平台对话的模块；其余模块都接收传入的传输层，因此测试可以在该 seam 之后脚本化一个替身。

登录序列获取一个二维码、轮询其状态、跟随重定向分片、在有界次数内替换过期二维码，并把确认后的产物——机器人身份、令牌与其分片——经 `ctx.credentials` 写入。一个令牌只服务一个轮询客户端，因此连接会取得一个令牌锁文件，其持有者每个轮询周期心跳一次：第二个实例会带着诊断报告 `unavailable`，而不是分流消息流；崩溃持有者的锁在其心跳早于两倍配置轮询超时后被接管。

轮询从 `ctx.channelSession` 报告的会话绑定中最早的游标恢复，因为一条令牌级消息流喂养所有会话，而 `lastAdmittedMessageId` 会抑制随后的重投。每条发布的消息都携带其批次被请求时的游标，因此接纳之后发生崩溃会从该批次之前恢复，而不是跳过它。会话过期（`errcode -14`）会停止轮询以等待重新扫码；瞬时失败在配置边界内重试；反复失败会打开断路器并报告 `unavailable`。

出站路径在配置的分块长度内拆分回复，在其自身边界内重试被限流或失败的分块，并在平台接受每个分块后以首块的消息 id 完成。dispose 会中止长轮询并释放令牌锁。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件：经校验的 `Config`、提供方注册、生命周期状态、拆卸 |
| [`src/login.ts`](src/login.ts) | 扫码登录序列与凭据写入 |
| [`src/transport.ts`](src/transport.ts) | 基于 Node 内建能力的 iLink HTTP/JSON 调用与错误映射 |
| [`src/poll.ts`](src/poll.ts) | 长轮询：游标、重试边界、退避、断路器 |
| [`src/send.ts`](src/send.ts) | `send_message`：分块、限流策略、收据 |
| [`src/lock.ts`](src/lock.ts) | 令牌锁文件：独占创建、心跳、陈旧规则 |
| [`src/normalize.ts`](src/normalize.ts) | 把平台更新转换为通道的入站事件 |
| [`src/types.ts`](src/types.ts) | 仅类型，无运行时代码 |
| [`tests/index.spec.ts`](tests/index.spec.ts) | 提供方：附着、登录、锁、发送与所有失败上报 |
| [`tests/transport.spec.ts`](tests/transport.spec.ts) | URL 形态、请求头、请求体、解码、错误分类 |
| [`tests/loader-composition.spec.ts`](tests/loader-composition.spec.ts) | 真实 Loader 组合：一条消息进、一条回复出 |
| — | 不发布运行时不变式伴生入口；除它写入的凭据记录与它拥有的令牌锁文件之外，提供方不保存任何自有持久状态。 |

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

本提供方不添加自己的提示词文本、系统提示词文案或工具 schema；它把发送者的文本原样作为携带 `conversationId`、`sender`、`messageId` 与 `text` 字段的入站事件发布，到达模型的是消费方的接纳结果。

#### Token 影响

自身没有。它发布的文本由消费方的接纳保留并在那里贡献 token。

#### KV Cache 影响

没有。提供方不向任何 Session 的请求前缀写入内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明一条连接今天能做什么、不能做什么。它们是当前包约束，不是任务积压。

- **仅私聊与文本**——群聊会被忽略并记一条诊断；丰富的入站媒体不在简报范围之内。
- **设置页尚未实现**——扫码登录操作已存在于提供方注册上，但渲染它们的客户端界面属于切片 M3。
- **会话命令与权限转发尚未实现**——它们属于切片 M4 与消费方。
- **iLink API 没有公开文档**——错误码与限流语义来自参考实现，需要由本人参与的真实往返来对照平台确认。
- **崩溃持有者要付出陈旧阈值的代价**——下一个实例在接管令牌锁之前要等满两倍轮询超时，并把这段等待作为诊断上报而不是隐藏。
- **Mint 打包尚未包含本包**——打包与打包后检查属于切片 M5。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
