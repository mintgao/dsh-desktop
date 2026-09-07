# 技术决策：在项目文档检查中保留托管指令

[English](managed-instruction-doc-gates.md) | 中文

Status: Accepted

- 决策负责人：Tech Lead（`inspector_ack_decision_author`）
- 决策日期：2026-09-04
- 评审模式：independent-agent
- 评审结果：approved
- 评审证据：独立 Tech Lead `inspector_ack_decision_review` 先要求采用与 doctor 兼容的通用换行 hash 语义，并为每项所有权 predicate 增加独立失败覆盖，随后批准了准确的修订决策。
- 适用决策：[文档结构、层级与预算](../../../.agents/notes/implemented/process/2026-07-04-doc-tiers-and-budgets.zh.md)

## Trigger 覆盖

本决策改变共享 Markdown 换行检查器与根文档的强制字数上限。它负责检查范围、托管区识别、异常 marker 行为、遮罩语义、未来 Vibe Kit 安装的兼容性，以及托管块大小改变后的恢复方式。

产品行为不变。本决策逐字节保留已安装的 Vibe Kit 指令，同时继续对项目自有 prose 执行仓库文档规则。

## 决策

### 托管区资格

只有根 `AGENTS.md` 中由精确整行 `<!-- vibe-kit:managed:start -->` 与 `<!-- vibe-kit:managed:end -->` 定界的区域可以取得资格。marker 与两者之间的每一行都属于该区域。任何其他文件中的相同 marker 文本都不获得豁免。

仅当 `.vibe/manifest.json` 建立所有权时，`verify-md-wrap` 才遮罩该区域：`activation.paths` 必须包含 `AGENTS.md#managed-block`；`activation.path_hashes["AGENTS.md#managed-block"]` 与 `agents_block_hash` 必须是小写 SHA-256 值且彼此相等；已安装区域的 digest 必须同时等于这两个 manifest 值。Digest 输入必须与 `bin/vibe` 完全一致：严格解码 UTF-8，应用 Python 通用换行归一化（`CRLF` 与单独 `CR` 都变为 `LF`），截取从 start marker 第一个字符到 end marker 最后一个字符且不含周围行结束符的子串，把归一化子串编码为 UTF-8，再计算 SHA-256。`bin/vibe doctor` 仍是安装级权威，并独立检查完整 activation set。

manifest 声明该区域时，根 `AGENTS.md` 必须按顺序恰好包含一个 start marker 与一个 end marker。marker 缺失、重复、不配对、倒序、不精确或 hash 不匹配时，检查失败并在诊断中指出 `AGENTS.md` 及违反的规则。marker 文本没有匹配的 manifest 所有权时也会失败，不会形成项目可自行创建的豁免。如果所有权与 marker 都不存在，则正常检查完整文件。

不排除其他 Vibe 托管文件或 Markdown 区域。

### 换行遮罩

解析 Markdown 前，`verify-md-wrap` 把合格的归一化 span 映射回已解码原始源，并把该原始区域中的每个非换行字符替换为空格。它保留 `LF`、`CRLF` 或单独 `CR` 行结束符及总行数，因此区域之后的违规仍使用原始 `AGENTS.md` 行号。检查器只读而不改写源文件。

该区域前后的全部 prose 继续受现有单段单物理行规则约束。其他所有被检查 Markdown 文件的范围不变。VitePress 遮罩、symlink 去重与归档 Agent Note 排除行为保持不变。

### 整文件预算

`verify-doc-budgets` 不遮罩或扣除托管区。它继续按既有 `wc -w` 语义统计完整根 `AGENTS.md` 中以空白分隔的 token。

将 `scripts/doc-budgets.manifest.json` 中明确的 `AGENTS.md` 上限设为 `2858`，该值来自未改变的已激活文件当前整文件计数：909 个托管词加 1,949 个项目自有词。根 `AGENTS.md` 仍高于 1,950 词目标，因此 `2858` 是没有 5% 余量的冻结上限。任何新增词都会失败，直到项目自有 prose 被压缩或迁移，或者以后经过认证的 Vibe Kit 升级需要另一个经评审的上限决策。

未来托管块缩小时，按普通 ratchet 评审在适当时降低上限。未来托管块增大时，字数检查失败；实施方先确认升级后的安装健康，再在整文件仍高于目标时把上限冻结到新的整文件计数。检查器绝不动态推导或提高上限。

### 所有权与恢复

Vibe Kit 拥有托管块及其 activation hash。仓库拥有 `verify-md-wrap`、`verify-doc-budgets`、相应测试及明确上限。实施不得编辑 `AGENTS.md`、`.vibe/manifest.json` 或托管块的任何字节。

异常所有权证据会 fail closed。恢复方式是通过受支持的 Vibe Kit 安装路径还原已安装块或 manifest，并用 `./bin/vibe doctor . --format json` 确认；绕过 marker、弱化检查器或在本地更新 activation hash 都不是恢复方式。

此工作只使用本地文件，不访问网络。

## 兼容性分类

安装内部健康：Vibe doctor 验证了精确的 0.8.0 字节与 activation set。文档失败属于 Vibe Kit 集成缺口，因为 0.8.0 托管 payload 违反本仓库既有换行规则，而且升级把根上限改为 2,800，生成的整文件却有 2,858 词。仓库不能修改经过认证的 payload，因此项目自有检查器需要局部集成规则。上游 Vibe Kit 反馈与本次实施分离，也不阻塞 AC-8。

## 备选方案

**重新排版托管块。** 拒绝，因为任何字节变化都会使已激活安装失效。

**排除整个 `AGENTS.md` 或每个带 marker 的区域。** 拒绝，因为两者都会使项目自有 prose 缺陷绕过共享检查器。

**不校验所提取字节，仅信任 marker 或 manifest 元数据。** 拒绝，因为项目 prose 或陈旧所有权元数据可能创建未认证的排除区。

**从预算中扣除托管词。** 拒绝，因为适用决策要求整文件 `wc -w` 语义及单一明确 enforcement frontier。

**为提高后的上限保留 5% 余量。** 拒绝，因为高于目标的文档冻结在当前用量；只有达到目标后才获得余量。

**在本地修补随附 Vibe Kit payload。** 拒绝，因为本仓库不拥有这些字节，且改动会破坏安装完整性。

## 实施边界

实施仅限 `scripts/verify-md-wrap.ts` 中的托管区识别、hash 校验与保留行号的遮罩，聚焦检查器测试，`scripts/doc-budgets.manifest.json` 中的 `AGENTS.md` 上限，以及对例外的当前状态文档。

更新 `docs/AGENTS.md`，说明只有经过认证的根托管区不受物理行换行规则约束，而它仍计入整文件字数预算。更新适用 Agent Note 的中英文文件，记录相同的所有权、冻结上限、失败与恢复事实。不得改变托管根块或其 manifest hash。

## 必需验证

- 聚焦测试证明一个经过认证的根区域会被遮罩，并且区域之后的违规保留原始行号。
- 测试拒绝无效、缺失或非 object 的 manifest JSON，缺失或类型错误的 `activation.paths` 与 `activation.path_hashes`，缺失、大写、非十六进制或不相等的 hash，以及实际托管内容不匹配。
- 测试拒绝缺失、不配对、重复、倒序及不精确的 marker。
- 测试证明 CRLF 与 LF 托管区产生相同认证 digest，被 hash 的 span 不含周围行结束符，并且两种行结束形式的遮罩都保留原始行号。
- 测试证明其他 Markdown 文件中的相同 marker 不会隐藏其硬换行违规。
- 测试证明托管区前后的项目自有 prose 仍被检查。
- 预算测试证明托管区词数仍被统计，且明确的根上限恰为 `2858`。
- `pnpm run verify-md-wrap`、`pnpm run verify-doc-budgets` 与 `pnpm run test:docs` 通过。
- `./bin/vibe doctor . --format json` 保持健康并报告相同的托管块及 activation hash，且没有写入或网络访问。
- 文档同步与 `git diff --check` 通过。

## 批准条件

在另一名 Tech Lead 批准这份精确持久化的决策，而且工作流编排者记录 Accepted 决策、approved 评审、无未解决阻塞及 `Gate: implementation-ready` 前，检查器编辑保持 blocked。
