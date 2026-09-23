---
description: "把 DSH Session 与手机之间的即时通讯通道连接起来的包映射。"
kind: "package-group"
---

# channel/ — 从即时通讯连接到 DSH Session

[English](README.md) | 中文

## 概述

Channel 家族把一个 DSH Session 连接到即时通讯平台，让用户可以用手机驱动 agent。服务定义拥有提供方集合与入站扇出；每个提供方拥有一个平台连接及其协议；一个消费方把经过认证的消息变成普通 Session，并把权限提问转发回去。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`channel/`](channel/README.zh.md) | 提供方注册表、品牌化身份、入站来源 | `ctx.channels` |
| [`channel-session/`](channel-session/README.zh.md) | 会话绑定、发送者授权、入站接纳、出站投递 | `ctx.channelSession` |

<a id="related-documentation"></a>
## 相关文档

[远程通道连接决策](../../docs/decisions/0001-remote-channel-connections.zh.md)拥有持久契约：注册表接口、会话绑定的持久性、接纳事务的抽取、出站投递、会话命令、权限提问转发，以及每个包的所有权。

[通道子系统](../../docs/subsystems/channel.zh.md)是注册表的提供方约定、其注册生命周期，以及提供方、消费方与 Remote 控制器共享值的参考资料。

<a id="dev-note"></a>
## 开发备注

无。
