# 用户编写的预设 persona 兼容性

Status: Accepted

[English](20260910-persona-authored-preset-compatibility.md) | 中文

## 权威与范围

技术作者：`preset_compat_decision`。独立评审者：`classification_review`，结果为 `approved`，仅批准设计，包含 schema/catalog 补充。[评审记录](../work-items/20260910-dsh-015-upgrade/preset-compatibility-review.json) 绑定提案 SHA256 `aa8c9d6f73aae19dfb92de7bd89d46a1ebea82cfb5f03bd43039d2b4d11121e8`。[工作项](../work-items/20260910-dsh-015-upgrade/brief.zh.md) 单独管理实现门禁。本决策补充 [Mint 目标集成](20260910-desktop-mint-target-integration.zh.md)，限定于已交付基线 `67406fc6af451f7f68874cb31c2d0f3242c0c8ad` 和包含目标 `b2e3b2a0125854567a4a5fcba75782e42fe84901` 的候选；不承诺任意历史或第三方兼容性。

[合成复现摘要](../work-items/20260910-dsh-015-upgrade/preset-compatibility-evidence.json) 记录了基线通过公开接口复制预设并完成真实 Agent 轮次，目标发现预设后因缺失 `$.prefix` 挂载失败，以及恢复基线后的续用和轮次。预设 SHA256 `f04fbc6ec6d38aab78f18690c293ddcb76293107f7e6cd157904b7c0e83094bd` 与设置 SHA256 `3b510aa4e6656308e2df44d418777ceb40cc1edfb9de8316fbd92e0f0957d7c2` 均保持不变。这是缺陷和恢复证据，不是目标资格证明。

## 解析器归属与语义

扩展现有可复用的 `@deepseek-ai/dsh-persona` 配置解析器。在内存中将已发布的 `text` 输入规范化为当前解析结果 `prefix`、`suffix`、`complete` 和 `includeRuntimeContext`。导出 `Config` 表示可接受的输入联合类型，导出 `ResolvedConfig` 表示传给 `apply` 的显式规范化输入。Cordis 通过包内 Schemastery transform 在注册前验证。这是对上游所属插件的明确下游补丁，不含 Mint 身份或默认值。将其记录为上游贡献候选；仅在采用的上游实现通过相同证据后移除。向上游提交需要单独授权。

旧式 `text: string` 在不含 `prefix` 和 `suffix` 时，将完整文本作为前缀、空字符串作为后缀。无 `text` 的当前 `prefix: string` 保留现有后缀及默认行为。拒绝同时含 `text` 与 `prefix` 的输入，即使值相等；拒绝同时含 `text` 与 `suffix` 的输入，即使后缀为空。在 persona 注册前拒绝两个必需字段均缺失、类型错误以及 null text/prefix。在规范化或默认值抹去字段存在性之前检查显式冲突；保留无关未知键的现有处理，不引入全局严格性。

空的旧式 text 可接受，并像当前空 prefix/suffix 一样遮蔽两个部署 persona 段。保留空白、模板和完整文本，不启发式拆分。规范化后的空后缀阻止继承部署后缀。`complete` 和 `includeRuntimeContext` 保留现有验证、默认值和含义。严格变量渲染、完整提示抑制及作用域运行时上下文抑制仍是权威行为。挂载失败回收副作用并保留可操作的 persona 行诊断；禁止回退、删除行或替换成当前 standard 预设。

仅在内存中规范化。不得写入预设或设置；保留 `PresetTree.write` 抑制及作用域 `ctx.effect` 清理。Persona 仍通过现有已记录的系统消息组装进入模型。不得新增 loader 服务、拦截框架、权限、网络、原生、表达式、循环或会话格式变更。

## 静态配置目录

在 `z.transform` 内放置静态可见的对象输入内联联合类型。旧式 text 或当前 prefix 必须存在且无默认值；由于普通对象分支接受额外字段，必须显式拒绝被禁止字段的存在。在 `Config` JSDoc 中说明冲突和规范化；由 `ResolvedConfig` 及包文档说明规范化输出。

仅扩展现有 `walkSchemaExpr` 静态目录遍历器，使其识别 `z.transform(inner, ...)` 并递归首个参数。缺失或不支持的输入表达式仍须拒绝。不得添加包例外、未知表达式捷径、隐藏字段或跳过检查。Transform 元数据保留内部 schema；`preserve: true` 阻止改写适配输入。从源码重新生成配置目录。目录描述调用者可接受的输入，包含 text/prefix/suffix 和两个策略标志，而非要求所有调用者提供 prefix。

### 转换后输入类型的选择

对于经过现有包装解开后、具有顶层静态 transform 初始化器的导出 `const Config`，要求使用真实 Schemastery 导入绑定显式标注两个类型参数，例如 `z<Config, ResolvedConfig>`。选择首个简单具名输入类型，并解析到包内声明。复用现有传递类型闭包、成员文档、名称冲突及 schema 键检查。缺失或不支持的标注、不支持的输入类型表达式、未解析或外部输入均必须产生准确诊断；不得回退到 `apply` 输出，也不得猜测同名声明。TypeScript 负责 schema 输出与 `apply` 的一致性；输入键检查不证明转换语义。

其他所有 schema，包括普通对象/联合类型及无 schema 插件，保留基于参数的目录类型选择。聚焦 fixture 证明输入独有字段及引用类型可见、未声明字段被拒绝、每种不支持的选择失败、未变场景保留参数选择，以及实际 persona 暴露 `Config` 而 `apply` 消费 `ResolvedConfig`。独立批准的选择补充由[评审证据](../work-items/20260910-dsh-015-upgrade/preset-compatibility-review.json)绑定。

## 替代方案与恢复

单独的适配器必须拦截不变的 persona 标识符，并增加解析顺序归属。通用 loader transform 为一个已证实的不兼容扩展了共享基础设施。改写用户文件、删除 persona 行或用目标生成的预设替换 fixture 都违反保留要求。现有解析器是最小的可复用归属。

遵照迁移注册表，在完整静止备份恢复到空根目录并由实际已交付基线观察期间，持续保留升级后的根目录。不得让基线打开目标写入的根目录，也不得暗示自动降级。额外旧格式或失败需要重新评估。

## 必需验证

- 解析器及作用域测试覆盖两种形式、全部拒绝、空文本、默认及显式标志、插值、完整模式、后缀遮蔽、独立作用域及清理，以及不变的当前行为。
- 真实无密钥 Agent 请求及其记录的系统消息证明旧式 persona 的渲染内容和语义顺序；仅挂载成功不足以证明。不得承诺跨运行时完整提示字节或全局段顺序相同。
- 实际已交付基线通过公开复制接口创建用户预设。目标中的不变文件支持发现、新会话和重启；元数据、预设和设置哈希绑定实际运行时。完整恢复重现基线可观察结果。
- 兼容的非 Mint 组合无需别名即可解析封装插件。更新包文档、Agent Note 和相关无密钥快照。
- 目录测试暴露转换后联合类型的全部字段，拒绝未声明字段和不支持的转换输入；运行目录新鲜度及相关文档检查。RD 负责聚焦检查；独立 QA 负责最终候选默认验证及所需架构资格。
