# 验证：微信账号归属与多身份

[English](verification.md) | 中文

## Acceptance evidence

| 验收标准 | 证据 | 结果 |
|---|---|---|
| AC-1 | 双账号 Loader 组合测试：两个账号都注册，每个账号的一条入站消息在各自身份下接纳出一个 Session，每条回复经各自的提供方离开 | 部分——单账号 Loader 组合已证明注册、接纳与回复经该账号自己的提供方离开；双账号组合尚未书写，真实账号一侧仍开放，记在 Manual scenarios 之下 |
| AC-2 | 按账号隔离测试：断开其中一个账号，并断言另一个的记录、锁、游标与绑定均未被动过 | 已证——`tests/service.spec.ts`：「unregisters one account, deletes its record, and leaves the others registered」与「refuses an identity that is not a WeChat account and forgets a slug it never registered」 |
| AC-3 | 恢复测试：已存账号在启动时无需扫码即完成注册；载荷无法解析的记录注册为 `unavailable` | 已证——`tests/service.spec.ts`：「registers a provider per readable record and an unavailable account for a record it cannot read」 |
| AC-4 | 服务的登录测试：一次扫码即按登录产物携带的身份注册该账号 | 已证——`tests/service.spec.ts`：「announces every state of a confirmed scan and stores its grant under the account key」 |
| AC-5 | 顶下线测试：完成一个周期之后的 `-14` 与之前的 `-14` 产生不同诊断；发送期的 `-14` 驱动同一状态 | 已证——`tests/provider.spec.ts`：被夺走、启动时已失效、发送期三条顶下线用例，各自断言其上报的状态 |
| AC-6 | 缺失证据：提供方中不存在重新扫码、重连或第二个轮询方的任何路径，并在其报告的状态上断言 | 已证——`tests/provider.spec.ts`：没有可读登录的账号从不轮询、拒绝发送，并在另一客户端持有令牌时报告 `unavailable` |
| AC-7 | 包 README 对言明该平台规则 | 已证——两侧 README 都写明「一个微信号同一时刻只持有一个机器人会话」、被顶替客户端在轮询与发送上遇到的 `errcode -14`，以及平台本身缺失的信号 |

## Automated checks

| 检查 | 结果 | 备注 |
|---|---|---|
| 针对 `packages/channel/channel-weixin/src` 的聚焦覆盖率 | 逐文件 100% | 11 个文件、135 个测试全绿；519/519 语句、338/338 分支、98/98 函数、445/445 行，逐文件读自 `json-summary` 报告器 |
| 项目验证 | Not run | 实现之后由独立 QA 通道负责；随本切片运行的是上面的包级测试 |
| `pnpm run doc-sync` | 通过 | 34 个门禁、0 失败，含文档标准测试与所有生成的目录 |

## Manual scenarios

- **两个真实微信号，由负责人参与。** 连接两个账号，各发一条私聊消息，观察每条回复经各自的账号返回，然后断开其中一个并观察另一个保持连接。尚未运行：负责人目前没有第二个微信号。这是本记录上的一条验收项——它不是实现阻塞项，而 AC-1 的真实账号一侧所缺的只有这条证据。

## Limitations and follow-ups

- 上述真实账号往返无法在 CI 中产生，需要负责人的第二个微信号。
- AC-1 的双账号 Loader 组合一侧尚未书写：组合测试端到端覆盖单个账号，而它本会重复的每条按账号行为，已在服务与提供方层面各自得到证明。
- 客户端设置分区（父工作项的 M3 切片）消费本切片的接口；此处不验证任何客户端代码。