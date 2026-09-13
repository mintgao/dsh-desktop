# 操作手册：观测式桌面前向交付

[English](observed-forward-delivery.md) | 中文

## 摘要

本流程结合受保护的 arm64 构建与维护者声明的有限本地观测。[决策](../decisions/20260913-observed-forward-delivery.zh.md)定义验收要求；CI 构建不等于 GUI 资格验证。操作者负责手动获取、替换与恢复。应用检查发布并打开浏览器，不会自动安装或校验下载字节。

## 目录

- [只构建一次](#build-once)
- [观测确切字节](#observe-the-exact-bytes)
- [组装与批准](#assemble-and-approve)
- [恢复与复用](#recovery-and-reuse)

<a id="build-once"></a>

## 只构建一次

通过现有机器人 source-lock 流程定稿已审源码。保持实际公开前驱和追赶评估不变。[已提交前向策略](../../.github/desktop-delivery/forward-update-policy.json)固定已认证但未发布的 A、B 版本、arm64、必需场景和声明设置。其摘要由 schema-2 数据兼容评估绑定；历史持久化格式变化仍为 true。授权唯一一次受保护资格构建前，检查 B 标签未被使用且版本更新。

资格工作流输出 `build-receipt.json`、原生冒烟证据及完整的 CI 构建文件集合。原样保留下载的归档。不同的构建收据、DMG 或运行时使观测不可复用。本地 GUI 记录不属于 CI 构建归档。

<a id="observe-the-exact-bytes"></a>

## 观测确切字节

使用固定路径的私有测试安装、声明的私有数据根和空工作区。这是带所有权及目录约束检查的普通桌面测试，不宣称内核隔离。按策略认证 A，按构建收据认证 B。不要重建 A。观测 [forward-evidence](../../scripts/desktop-delivery/forward-evidence.ts) 导出的固定场景：普通 A 使用、设置与重启；完整静止备份；停写替换；普通 B 版本、UI、无需密钥的操作与重启；设置保留；获取重试、操作者拒绝错误字节、权限拒绝、不完整备份拒绝、可用 A 恢复与清理。可在动作／结果文本中引用此前对确切 A 的可用性观测；不要重复付费对话，也不要暗示记录复核者亲自见证了操作。

记录一份不超过 32 KiB 的 UTF-8 JSON 文档。必需字段包括 `schemaVersion: 1`、`purpose: maintainer-attested-local-observation`、`phase: prepublication`、`architecture: arm64`、主机／观察者事实与时间、`buildReceiptDigest`、确切 `baseline` 和 `target` 身份、私有根、同路径安装事实、声明设置、场景、恢复及清理。校验器定义确切嵌套字段。每个场景恰好出现一次，明确动作、结果、`source: direct-local-observation` 和 `status: passed`。记录真实事实；不得编造通过、将操作者决定描述成产品自动拒绝，或以哈希相等代替观测可用恢复。

完整备份及支持诊断留在本地。发布记录不包含 profile 内容、凭据、原始日志、脚本、附件或任意截图。Mint 声明确已观测的 Light 主题。不要虚构通知设置，也不要制造更新以测试提醒偏好。

<a id="assemble-and-approve"></a>

## 组装与批准

通过 `FORWARD_OBSERVATION_BASE64` 和 `FORWARD_OBSERVATION_SHA256` 传入文档的规范 base64 与解码字节 SHA256。不得将观测文本插入 shell 命令。`assemble-forward` CLI 操作读取完整构建目录，写入 `local-observation.json` 和确定性的 `manifest.json`；其 `--operation` 为 `promote`。通过现有交付 CLI 运行，传入 `--config`、`--directory` 和外部 `--out` 状态文件。若构建目录已含任一派生文件则拒绝；应使用已认证构建归档的原样副本组装。

审核 manifest 摘要后，将相同字节及摘要传入现有 mutation 工作流的 `local_observation_base64`、`local_observation_sha256` 和 `manifest_digest` 输入。只读计划认证成功的 CI 运行及固定构建归档、重新组装包并保留确切本地记录。`mint-publication` 批准同时接受该记录作为有限人工验收并授权指定操作。它不证明 CI 观测了 GUI。本流程不授权任何具体发布。

schema-3 manifest 保持 `publicDelivery: pending`。发布后，另行记录实际公开获取与 A-to-B 验收，并绑定该 manifest 摘要；不得重写冻结资格记录。撤回不接受新观测，只需有限的保留身份依据。恢复不接受替换观测：它验证完整保留包，并在新的批准下重申原记录，保留原日期。

<a id="recovery-and-reuse"></a>

## 恢复与复用

替换前，停止所有自有写入者并验证完整应用及私有状态备份。若 B 改动文件或状态，停止写入者、单独保留 B 状态、从已验证备份恢复 A 和替换前状态，然后观测 A 的普通可用启动、设置保留及退出。绝不让 A 读取 B 改动后的状态。进程所有权不确定、启动提交未完成或恢复不完整时，阻止验收并保留根目录；同一症状两次修正未成功后，停止并报告证据。

其他 DSH 桌面开发者通过已审且已提交的策略及评估描述符复用同样三个发布模块。发行版特定的版本、源码、产物与主题值留在策略中。支持模式是 arm64 人工观测；本流程不提供 GUI 执行器、自动安装器或通用恢复框架。旧 schema-1/2 manifest 保持历史校验路径。
