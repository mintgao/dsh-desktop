---
description: "面向维护者的通道提供方注册表，用于把即时通讯连接接入 DSH Session。"
kind: "package-reference"
---

# @deepseek-ai/dsh-channel

[English](README.md) | 中文

## 概述

`dsh-channel` 提供 Host 侧的 `ctx.channels`：通道能力接缝中的服务定义一半。诸如 `dsh-channel-weixin` 的提供方拥有一个平台连接；本包只拥有提供方集合、控制器所投影的枚举、消费方所订阅的入站扇出，以及三者共享的品牌化身份。当一个连接需要把即时通讯平台上经过认证的消息带入 DSH、并把回复带回去时，使用它。

## 目录

- [提供方接口](#provider-interface)
- [注册表](#registry)
- [入站来源](#inbound-provenance)
- [组合](#composition)
- [模型体验](#model-experience)
- [已知限制与推迟的工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="provider-interface"></a>
## 提供方接口

`ChannelProvider<K>` 声明一个品牌化的 `id`、一个平台 `kind`（如 `weixin`）、一个人类可读的 `displayName`、一个可观察的 `state`、`attach(control)`，以及 `send(conversation, message, signal)`。

`state` 是一个封闭联合：`idle`、`connecting`、`connected`，或携带设置页所显示诊断的 `unavailable`。因此断开的通道总会说明原因。

`attach(control)` 在提供方注册 effect 内同步运行一次。它接收该注册的 `AbortSignal`、用于经过认证的入站消息的 `publish`，以及用于状态转换的 `changed` 通告。提供方拥有自己的连接、重试策略、限流策略与游标；注册表一样都不拥有。

`send` 在平台接受消息时兑现，而不是在收件人读到它时。分片与平台长度限制属于提供方。

<a id="registry"></a>
## 注册表

`ctx.channels.register(provider)` 返回那个注销提供方并中止其注册信号的 Cordis effect 释放函数。重复的 `id` 与空的 `id` 都会在注册时响亮失败。

`ctx.channels.list` 为控制器枚举已注册的提供方。`ctx.channels.get(id)` 按身份解析一个。

`ctx.channels.onInbound(listener)` 把每一条经过认证的消息交给消费方。注册表会把发布提供方的身份盖到每条消息上，因此提供方无法把消息错记到另一条通道。监听器失败会被记录并contained；它无法为其他监听器否决该消息。

`ctx.channels.onChange(listener)` 通告提供方集合与连接状态的变化，使投影得以刷新。注册表本身从不向客户端推送状态。

<a id="inbound-provenance"></a>
## 入站来源

被接纳的消息携带 `MessageSourceMap` 中可合并扩展的 `channel` 成员，它声明在此处，因为品牌化身份也在此处：

```text
kind: 'channel'
channel, conversationId, sender, messageId
form: 'notice'
summary
```

新增成员是可加数据，不是 Session 日志格式变更：`MessageSourceMap` 可合并扩展，其消费方按 `kind` 分支并对未知类型走一个已记录的默认路径，而 `webhook` 与 `agent-team` 已经以同样方式扩展它。

<a id="composition"></a>
## 组合

在 Host 平面加载注册表。提供方插件注入 `channels`，并通过自己的 effect 交出 `register()` 返回的释放函数。消费方注入 `channels`，并通过 `ctx.effect` 安装其入站监听器。

<a id="model-experience"></a>
## 模型体验

### 通道消息来源

#### 模型看到什么

没有直接看到任何东西。本包不贡献提示词文本、工具 schema 或面向模型的诊断；它只在同一进程的插件之间搬运值。模型只有在消费方把一条通道消息作为普通用户消息接纳之后才会看到它，而那条消息的 `source` 携带上述 `channel` 成员。

#### Token 影响

无。注册表状态不会保留在任何 Session 中。

#### KV Cache 影响

无。本包从不触碰请求前缀。

## 已知限制与推迟的工作

<a id="known-limitations-and-deferred-work"></a>

- **不向客户端推送状态** —— 注册表只暴露枚举与变更通知；把它们投影进设置界面属于控制器消费方。
- **不拥有连接生命周期** —— 重连、退避、熔断与游标持久化都是提供方的事，因此一个从不重连的提供方在这里与一个正常重连的提供方无法区分。
- **没有不变量伴随物** —— 注册表唯一拥有的关系是"映射键等于已注册提供方的 `id`"，注册在一条语句中设置它、释放函数在一条语句中移除它；没有任何独立观察会分叉，因此本包按包不变量规则省略 `./invariant`。
- **没有投递保证** —— 注册表把消息转发给进程内监听器且不记录任何东西；至少一次行为及其对重复的容忍属于消费方。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文 —— 点击展开</summary>

无。

</details>
