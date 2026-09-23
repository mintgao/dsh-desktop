---
description: "所有外部触发共享的那一个外部 Session 接纳事务：校验请求、解析预设与 Workspace、创建并附挂 Agent，然后接纳首条跟进消息。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-admission

[English](README.md) | 中文

## 概述

`dsh-session-admission` 让外部触发在不必重述那套保证安全顺序的前提下创建持久的根 Session。调用 `admitSession()` 会在任何 await 之前校验请求、解析预设与 Workspace、在创建 Agent 时挂载其预设、持久附挂 Session、把新 id 交给你的绑定钩子，并接纳首条提问。id 前缀、被接纳的文本及其来源、错误主语与取消信号都由调用方拥有。本事务不持有任何持久状态，并在接纳完成时不再拥有该 Agent。

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

### 何时使用

当外部入口需要把一次外部请求变成普通的根 Session 时——已校验的 webhook 投递、聊天通道消息，或你自己写的触发——调用 `admitSession()`。它不是 Cordis 插件，也没有 profile 挂载行；本事务读取的服务由消费方注入。它不发布运行时不变式伴生入口，因为本事务无状态、每一步只调用一次相应服务的所有权接口，不存在可由第二次观测推翻的关系。

### 入口

```text
import { admitSession } from '@deepseek-ai/dsh-session-admission'

await admitSession(ctx, {
  workspacePath: '/Users/me/project',
  prompt: 'review the pull request',
  agentPreset: 'standard',
  permissionPreset: 'read-only',
}, {
  sessionIdPrefix: 'webhook-',
  followup: { text: 'review the pull request', source: { kind: 'webhook', … } },
  errorSubject: 'webhook Session request',
  signal,
}, async (sessionId) => { await bindings.set(conversationId, sessionId) })
```

Promise 在跟进消息被接纳后 resolve；此后 Agent 由 `ctx` 按生命周期拥有，并遵循常规 Session 行为。必填值缺失、为空或格式错误时，会在任何 await 之前以 `TypeError` 拒绝，消息以 `errorSubject` 开头并指出字段名，因此尚未创建任何东西。之后任一环节失败，都会先摘除 Session 并释放 Agent，再重新抛出原始失败——这正是被拒绝的接纳不会留下存活 Agent 的原因；回滚自身的失败只被记录并吞掉，不会替换原始错误。`options.signal` 在每个 await 边界都生效。

有四个值属于调用方，因为本事务无法推断它们：`sessionIdPrefix` 用创建它的触发来标记新 Session id；`followup` 携带被接纳的文本及其完整构造的来源成员；`errorSubject` 让每条校验消息都指明触发；`onAttached` 在持久附挂之后、首条提问之前带新 id 运行一次——会话绑定的写入属于这里，而当操作随后被拒绝时，补偿该写入也是调用方的责任。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

顺序本身即约定，入口的 JSDoc 逐步陈述了它。一次事务依次执行：在任何 await 之前校验并快照请求；解析权限预设、agent 预设及其 standing key，在创建任何东西之前就明确失败；解析或创建 Workspace；创建 Agent，使 Session 工作目录等于 Workspace 路径，在创建时的 `setup` 内挂载 agent 预设，并安装创建时的模型选择直到首个持久请求头存在；持久附挂 Session；调用 `onAttached`；应用权限预设；仅当调用方提供了标题时才重命名 Session；最后接纳跟进消息，事务到此结束。回滚只针对 `agents.create` 返回之后的失败运行，并且仅当附挂调用本身成功 resolve 时才摘除。

上游 webhook 事务 [`packages/webhook/webhook/src/session.ts`](../../webhook/webhook/src/session.ts) 目前仍持有这套顺序的另一份拷贝。在[迁移工作项](../../../docs/work-items/20260919-session-admission-webhook-migration/brief.zh.md)落地之前，对等测试套件会用同一组场景驱动两边并比对副作用日志。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 事务本体、请求校验、创建时的模型选择监听器与回滚 |
| [`src/types.ts`](src/types.ts) | 请求与调用方拥有的选项类型 |
| [`tests/admission.spec.ts`](tests/admission.spec.ts) | 行为测试：校验表、显式路由、监听器与 id 标记 |
| [`tests/webhook-parity.spec.ts`](tests/webhook-parity.spec.ts) | 顺序与回滚的跨包对等测试 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [远程通道连接决策](../../../docs/decisions/0001-remote-channel-connections.zh.md)——本事务服务的触发接缝，以及它为何被抽出。
- [Webhook 迁移工作项](../../../docs/work-items/20260919-session-admission-webhook-migration/brief.zh.md)——删除重复顺序的后续工作。
- [通道提供方注册表](../../channel/channel/README.zh.md)——通道消费方入站一侧所依赖的基础。
- [Webhook 入口](../../webhook/webhook/README.zh.md)——当前持有这套顺序的触发。
- [Session 包映射](../README.zh.md)——相邻的持久化、投影、标题与遥测包。

-----

<a id="model-experience"></a>
## 模型体验

### 首条提问的接纳

#### 模型看到什么

本包自身不贡献任何内容：不产生提示词文本、系统提示词散文或工具 schema。它接纳一条由调用方拥有的 `user/message` 事件，其内容与 `source` 成员来自 `options.followup`；随后 Agent 按所挂载 agent 预设的常规请求上下文运行。

#### Token 影响

不直接产生 token。被接纳的跟进消息携带调用方文本，与在输入框发送一条消息无异。

#### KV Cache 影响

自身没有影响：新建 Session 从全新的请求前缀开始，且接纳先于首个请求。创建时的模型选择监听器只改写首个请求的路由与推理档位，并在 Session 的首个持久请求头存在后停止生效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **只接纳一条消息，不做续接**——本事务创建一个 Session 并接纳恰好一条跟进消息；续接已有 Session 是 `ctx.sessionController.prompt(...)`，不属于本服务的操作。
- **不持有任何持久状态**——绑定、游标、授权与投递记录都归调用方；`onAttached` 在持久附挂后运行，其写入由调用方自行补偿。
- **回滚失败不会让操作失败**——摘除与释放的失败只被记录并吞掉，以便原始失败存活，因此被拒绝的接纳并不保证没有留下存活 Agent。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
