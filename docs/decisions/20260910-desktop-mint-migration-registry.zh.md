# Phase B 规范组合与场景清单

Status: Accepted

[English](20260910-desktop-mint-migration-registry.md) | 中文

## 权限与采纳

作者：`upgrade_decision`。独立审核者：`classification_review`；[审核证据](../work-items/20260910-dsh-015-upgrade/phase-b-design-review.json)仅记录设计批准。本清单约束[集成决策](20260910-desktop-mint-target-integration.zh.md)，优先于原提案中未解决的组合和场景占位内容。这些是强制要求，不是已执行结果。

目标合并前，完整评估区间可如实包含 `persistedFormatsChanged: true` 及受阻或未验证场景。schema 3 可信采纳检查身份、完整性、摘要和祖先关系，不要求合并后的迁移报告。Phase A 发布拒绝格式变化。Phase B 评估器合并至受保护主分支后，格式变化要求下述完整报告。测试如实记录变化及未验证的评估在准备中被接纳、在发布中被拒绝。不得为通过采纳而写成 false。

## 精确产品组合

直接升级与恢复基线为已交付 `desktop-v0.1.2-alpha.3.unsigned.1`，下游 `67406fc6af451f7f68874cb31c2d0f3242c0c8ad`，上游 `dd6322d604e00eec1ba5e0c8541159906a21094a`。权限依据是 `.github/desktop-delivery/legacy-baseline.json` 的摘要及其中保留的各架构资产摘要，而非裸上游运行时。

基线和预期目标均使用 desktop-mint，Bundle 顺序为 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`@deepseek-ai/dsh-desktop-mint`；`patchReload` 为 live，`ui-session-notifications.defaultMode` 为 background。目标共享 base/Web 和标准 preset 来自 `b2e3b2a0125854567a4a5fcba75782e42fe84901`。保留下游 profile 声明及 Mint Bundle。固定并计算 `packages/boot/app-boot/src/profile.ts`、`packages/bundle/base/cordis.patch.yml`、`packages/bundle/web-app/cordis.patch.yml`、`packages/bundle/desktop-mint/cordis.patch.yml`、`packages/preset/agent-presets/presets/standard/agent.cordis.yml` 及每个引用内置行的摘要。要求解析后的 Bundle 顺序正确，且 Mint 通知行恰好出现一次。

Mint 原生适配器移至 `apps/desktop-mint`，保留 `io.github.mintgao.dsh-desktop`、品牌、浏览器身份及手动更新。上游 `apps/desktop` 与 `apps/desktop-host` 保持独立。会话使用 `$DSH_HOME/sessions`；JSON 存储使用 `$DSH_HOME/storages`；查询 SQLite 配置 `:memory:` 和 `openAt: never`，不打开 FTS 索引；不选择通用 SQLite。资格认定专用覆盖只选择确定性无密钥提供者和私有路径，不替换持久化、设置、凭据、工作区、附件、投影或原生实现。第三方插件、自定义后端替换和任意覆盖不属于该有限组合。

下方源码路径指向目标上游版本，保留的下游 Mint Bundle、通知代码，以及明确标识的基线或计划 Mint 原生路径除外。不声称 Mint 专用文件存在于上游目标。相对 `src` 简写已展开至所属包。场景证据必须绑定精确最终解析组合。

## 必需场景

此处及设置清单中的每个 ID 都必须出现在每个架构报告中。验证器检查表固定，不得动态缩减。证据仅可按报告验收章节规定共享。

| 源码所有者 | 必需 ID 与行为 |
| --- | --- |
| 上述组合文件； `apps/desktop-mint/src/backend.ts` | composition-exact：实际组合与无需别名的打包解析；fixture-isolation：私有主目录、agents 主目录、工作目录、临时及 spill 根和 Electron userData，不含真实凭据。 |
| `packages/session/session-persistence-jsonl/src/index.ts`, `packages/session/session-persistence-jsonl/src/generation.ts`; `packages/session/session-format-catalog/src/index.ts` | session-direct-upgrade：已交付基线的完整历史通过打包目标执行列表、读取、恢复、写入、flush、关闭及重开；session-history-semantics：请求、系统消息、继承、引用、压缩、PTC、preset 和标题含义；session-source-preserved：原件不变且存在一个有效后继；session-interruption-retry；session-source-drift；session-invalid-highest；session-exclusive-writer；session-built-worker。 |
| `packages/settings/settings-file/src/index.ts` | settings-document-roundtrip：基线 YAML/JSON、受支持更新及重启、保留无关键；以及下方全部设置 ID。 |
| `packages/credentials/credentials-local/src/index.ts` | credentials-roundtrip：合成 v1 记录、引用、优先级、更新、重启及权限；credentials-invalid-refusal：拒绝非法格式或记录，且不重写。 |
| `packages/boot/app-boot/src/index.ts` | env-layer-precedence：继承、项目及主目录优先级，文件不变；env-bootstrap-refusal：拒绝项目代理与不允许的引导及 TLS 设置，接纳主目录代理。 |
| `packages/workspace/workspace/src/spec.ts`, `packages/workspace/workspace/src/index.ts`, `packages/workspace/workspace/src/paths.ts` | workspace-roundtrip：v2 标题、顺序、归档、会话所有权及规范路径；workspace-interrupted-mutation：待处理创建和删除恢复；workspace-path-refusal：拒绝新的相对路径，不修改现有记录。 |
| `packages/session/session-projection-cache/src/spec.ts`, `packages/session/session-projection-cache/src/index.ts`; `packages/storage/storage-json/src/per-record-unit.ts` | projection-v4-v7-rebuild：允许旧列表提示，但不复用未绑定的折叠状态，并写入当前检查点；projection-invalid-backup：损坏记录逐字节备份，不损害其他会话。 |
| `packages/session-query/session-query-sqlite/src/index.ts`, `packages/session-query/session-query-sqlite/src/schema.ts`; `packages/storage/storage-sqlite/src/schema.ts` | query-rebuild：从权威恢复日志重建精确读取、列表及筛选结果，重启后仍验证；在 `openAt: never` 下，两个全文搜索 API 均以 `SESSION_QUERY_SEARCH_DISABLED` 拒绝，不声称重建 FTS 索引。storage-selection：选择 JSON，不产生持久查询数据库或新增 SQLite 后端。 |
| `packages/attachment/attachment-local/src/store.ts`, `packages/attachment/attachment-local/src/file-store.ts`, `packages/attachment/attachment-local/src/index.ts` | attachments-old-images：保留引用的原始字节；attachments-new-files：对象和别名重启后保留；attachments-conflict-interruption：拒绝冲突，中断暂存不能发布虚假引用。 |
| `packages/llm/llm-deepseek/src/upload-index.ts` | upload-index-preserved：合成 files-v3 记录无需提供者请求即可保留。 |
| `packages/boot/app-boot/src/profile.ts`; `packages/preset/agent-presets/src/discovery.ts`, `packages/preset/agent-presets/src/authoring.ts` | profile-preserved：desktop-mint 包、补丁及依赖；preset-authored-preserved：保留基线用户编写且使用受支持内置能力的 preset 元数据、字节、发现及新会话行为；不得迁往保留 desktop profile。 |
| `packages/identity/anonymous-user-id/src/index.ts` | identity-preserved：夹具匿名身份不变。 |
| `packages/client/store/src/index.ts`; `packages/api/session-controller/src/client/sessions/service.ts`; `packages/client/ui-conversation/src/client/stores.ts`; `packages/client/ui-workspace/src/client/stores.ts`; `packages/client/ui-trajectory/src/client/duration-store.ts` | browser-state-same-origin：dsh.sessions.current、dsh.conversation.<sessionId>、dsh.workspace.view.v5 和 dsh.trajectory.duration 的可观察选择、草稿及视图；browser-origin-policy：现有导航和启动行为。 |
| 基线 `apps/desktop/src/manual-update-preferences.ts` 与 `apps/desktop/src/main.ts`；计划 Mint `apps/desktop-mint/src/manual-update-preferences.ts` 与 `apps/desktop-mint/src/main.ts` | mint-preferences-preserved：manual-update-preferences.json 更新、重启和恢复，应用及 userData 身份相同。 |
| `packages/spill/spill-local/src/index.ts`; `packages/skill/skill-filesystem/src/index.ts`; `packages/context/agent-instructions/src/files.ts` | spill-isolated-cleanup：不清理夹具拥有根之外的数据；user-inputs-unchanged：合成技能、指令及无关文件不变。 |
| Qualification runner 与 committed recovery procedure | backup-quiescent-complete：全部写入者关闭，每个配置根都有摘要；restore-baseline：单独保留升级数据，完整备份恢复至空根，已交付基线观察原状态；restore-integrity-refusal：在替换前拒绝不完整或损坏备份。 |

现有及预期的 Mint 原生启动均使用临时端口 0。浏览器 localStorage 按来源隔离；相同键不能证明跨源草稿保留。保留现有来源策略，并认定同源数据兼容性。不引入也不声称跨源草稿迁移。

## 内置设置清单

每个场景读取基线值，执行受支持的目标更新及重启，保留无关值，并验证实际生效行为。未知第三方区段作为字节或数据保留，但其执行不在范围内。

| 源码所有者 | 必需 ID 与行为 |
| --- | --- |
| locale.preference; `packages/client/locale/src/index.ts`, `packages/client/locale/src/locale-settings.ts` | settings-locale：受支持 zh/en 值不变。 |
| ui-theme.preference/fontSize; `packages/client/ui-theme/src/index.ts`, `packages/client/ui-theme/src/theme-settings.ts` | settings-theme：外观与字号选择。 |
| ui-chat.transcriptView; `packages/client/ui-chat/src/index.ts`, `packages/client/ui-chat/src/chat-settings.ts` | settings-transcript：保留 normal/compact。 |
| ui-conversation.busyEnter; `packages/client/ui-conversation/src/index.ts`, `packages/client/ui-conversation/src/submission-settings.ts` | settings-composer：queue/steer 生效行为。 |
| ui-onboarding.welcomeNoticeVersion; `packages/client/ui-settings-general/src/index.ts` | settings-onboarding：保留已确认状态。 |
| ui-session-notifications.mode; `packages/client/ui-session-notifications/src/index.ts`, `packages/client/ui-session-notifications/src/notification-settings.ts` | settings-notifications：off/background/always，缺省采用 Mint background；依赖原生身份的交付单独验证。 |
| agent-default-model; `packages/core/agent-default-model/src/index.ts` | settings-default-model：新会话所选提供者、模型和推理。 |
| agent-loop.maxParallelToolCalls; `packages/core/agent-loop/src/index.ts` | settings-loop-limit：保留正数限制，拒绝非法值。 |
| agent-presets.default; `packages/preset/agent-presets/src/index.ts` | settings-default-preset：选中 standard 或受支持用户 preset；会话别名迁移不得重写设置区段。 |
| permission; `packages/interaction/permission-presets/src/index.ts` | settings-permission：有效基线策略继续生效，异常值不能削弱策略。 |
| shell; `packages/shell/bash-local/src/index.ts`, `packages/shell/shell/src/index.ts` | settings-shell：无害子进程验证 Bash 设置及限制；macOS 组合不含 PowerShell。 |
| subagent-model-selection.enabled; `packages/subagent/tool-subagent/src/model-selection-settings.ts` | settings-subagent-selection：保留值，更新影响后续组合。 |
| web-search-deepseek; `packages/web/web-search-deepseek/src/index.ts` | settings-web-search：通过注入传输保留配置及凭据引用，不执行真实搜索。 |
| llm-deepseek; `packages/llm/llm-deepseek/src/index.ts`, `packages/llm/llm-deepseek/src/types.ts` | settings-deepseek：基线模型配置可读，接纳可选 systemPromptUpdate in-history，拒绝非法值。 |
| llm-pi-ai; `packages/llm/llm-pi-ai/src/index.ts`, `packages/llm/llm-pi-ai/src/config.ts`, `packages/llm/llm-pi-ai/src/catalog.ts`, `packages/llm/llm-pi-ai/src/discovery.ts` | settings-pi-valid：已配置路由可用；settings-pi-catalog-drift：存储目录错误可修复，不删除路由或破坏有效模型；settings-pi-write-validation：持久化前拒绝非法路由、标量和头部更新；settings-pi-host-discovery：头部及凭据留在主机；settings-pi-compat：无需网络即可保留旧 compat 字段和显式思考预算、优先级及最大输出值。 |

Pi-ai 延迟目录错误与更严格头部检查是具体行为变化。无效存储标量或头部配置会阻止对应验收场景；不得静默清洗、删除或报告为已迁移。

## 报告来源与验收

报告 schema 1、purpose `desktop-data-migration-qualification` 绑定工作流路径 `.github/workflows/desktop-delivery-qualify.yml`、工作流 commit/runId/attempt；architecture；candidateDigest/downstreamCommit/sourceLockDigest/dataCompatibilityDigest；基线 upstream/sourceCommit/desktopTag/evidenceDigest/artifactDigest；目标 upstream/dmgDigest/packagedRuntimeDigest；compositionDigest/fixtureManifestDigest/backupManifestDigest；以及 scenarios id/status/evidenceFiles。每个证据文件都有受包含约束的名称、大小和摘要。生成报告保留在候选源码之外，并在同一次 attempt 中上传。

聚合器要求每个架构恰好一份报告，与原生候选、DMG 和工作流身份匹配，全部规范 ID 唯一且通过，每个引用字节重新计算摘要。共享负面测试证据只有绑定同一候选及运行时，才能出现在两个报告中；打包直接升级和恢复必须在每个架构独立执行。清单将全部报告及载荷绑定在文件清单中。checkedManifest、归档验证和发布者强制验证同一身份。缺失、跳过、虚假、过期或替换报告均失败关闭。设计批准需要本清单；发布还需要实际通过的执行。
