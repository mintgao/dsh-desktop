# @deepseek-ai/dsh-client-ui-session-notifications

[English](README.md) | 中文

这个双端客户端插件会在顶层任务及其不间断 subagent 后代全部结束运行后发送一次系统通知。浏览器端观察权威的 `ctx.sessions.list` 快照，把首个 ready 快照作为基线，只响应后续从活跃到空闲的转换。存在待处理的审批、问题或计划审查时不会发出完成提醒。点击通知会通过 `ctx.sessions.open()` 打开根任务并聚焦已有窗口。

插件使用标准 Web Notifications API。因此 Electron renderer 无需 preload bridge 或理解 agent 语义的主进程代码即可接入 macOS 通知中心，普通浏览器则使用自身的通知实现与权限策略。系统通知显示任务的展示标题和本地化的“任务已结束”文案，不读取 transcript 内容。

Host 端在共享用户设置文档中注册 `ui-session-notifications.mode`。常规设置行持有 `off`、`background` 与 `always` 三种选择以及权限请求。Host Config `defaultMode` 选择尚无已保存值时的初始偏好，默认是 `off`；产品 Bundle 如需其他默认值必须明确选择。浏览器启动行只携带包身份，不携带 Host Cordis 配置，因此 Client 端先使用安全的 `off` 后备值，再由设置 scope 接纳 Host 区段。DSH Desktop Mint 注册的值是 `background`，因此客户端可见且获得焦点时不会重复自身的完成状态。loopback 客户端通过 Host 设置提供方持久化选择；远程浏览器沿用普通的进程本地设置行为。

该包是单一用途的客户端插件，不是 agent 能力 seam。它消费现有会话服务、设置与 slot 扩展点，不持有 agent 生命周期，也不增加 Electron IPC。产品启用和默认值属于更后的 Bundle 层：共享 Web Bundle 不挂载这个插件，而 [`desktop-mint` Bundle](../../bundle/desktop-mint/README.zh.md)会挂载它。[下游客户端产品层决策](../../../.agents/notes/implemented/architecture/2026-08-25-downstream-client-product-layer.zh.md)记录了这一归属。

## 模型体验

无，因为该插件观察浏览器会话状态并展示系统 UI；这里没有内容进入模型请求。

#### KV Cache 影响

无；该包既不装配也不发送提供方请求。

## 已知限制与后续工作

- **不会重建断线期间的完成提醒**——浏览器启动或重连后的首个 ready 列表只作为基线，因此任务在该客户端没有实时状态转换期间完成启动与结束时，不会补发延迟通知。
- **送达受浏览器与操作系统控制**——通知权限被拒绝、专注模式与平台通知策略可能在 DSH 请求展示后抑制或延迟通知。
