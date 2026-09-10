# Mint 目标集成与迁移资格认定

Status: Accepted

[English](20260910-desktop-mint-target-integration.md) | 中文

## 权限与精确范围

技术作者：`upgrade_native_assessment` 和 `upgrade_decision`。独立审核者：`classification_review`，结果为 `approved-design-only`。[审核记录](../work-items/20260910-dsh-015-upgrade/phase-b-design-review.json)通过 SHA256 绑定已审核来源文件。[规范清单](20260910-desktop-mint-migration-registry.zh.md)优先于原提案中的组合、场景或报告占位内容。设计批准不等于运行时资格认定，也不等于实现放行。

[工作项](../work-items/20260910-dsh-015-upgrade/brief.zh.md)授权一次追赶升级 PR 和一次 Desktop 发布。Phase A 工具是前提，不产生中间产品发布。直接升级与恢复基线为已交付 `desktop-v0.1.2-alpha.3.unsigned.1`，下游提交 `67406fc6af451f7f68874cb31c2d0f3242c0c8ad`，上游提交 `dd6322d604e00eec1ba5e0c8541159906a21094a`。目标为 `b2e3b2a0125854567a4a5fcba75782e42fe84901`，标签为 `dsh-v0.1.5-alpha.2`。权限依据是已提交旧版基线摘要和保留的各架构资产摘要，而非裸上游运行时。合并、发布和替换已安装应用仍需分别授权。

## 原生所有权

将 Mint 原生适配器移至 `apps/desktop-mint`；独立保留上游 `apps/desktop` 和 `apps/desktop-host`。保留 `io.github.mintgao.dsh-desktop`、品牌、浏览器状态身份、desktop-mint profile 和手动更新偏好。不共享主进程，也不整体采用 ours/theirs 解决。Mint Bundle 选择通用插件；原生模块负责窗口、后端及更新器生命周期，并通过受支持的 `dsh --profile desktop-mint` 启动。不得导入私有 DesktopHost，也不得复制 Agent/Session 语义。

上游原生应用拥有精确 shell/seed/DSH 版本、保留桌面 profile、帧式管道传输和签名要求。保留其签名检查。Mint 仍为未签名手动预览，不提供稳定更新源资产。只有精确目标引擎、原生依赖和构建启动检查通过后，才保留 Electron-as-Node；需要替换运行时会重新打开就绪审查。在两个架构上证明打包 Mint Bundle 和通知依赖无需别名即可解析。没有签名及公证资产时，依赖身份的通知验收仍未验证。

现有及预期的 Mint 启动路径均使用临时端口。保留现有来源策略，并认定同源浏览器状态。相同存储键不能证明跨源草稿保留；本变更不引入跨源草稿迁移。

## 数据所有权与兼容性

原生代码不执行会话转换。复用上游静态格式目录及冻结的 V0→V1→V2→V3 阶段。读取打开转换保留在内存中；写入打开在来源版本检查后验证并发布不可变后继。验证原始字节、重建请求含义、系统消息、继承截点、引用、压缩、PTC/preset 别名、标题和工作区。头部列表或编解码器接纳并不足够。不得以旧二进制打开已升级主目录作为回退捷径。

规范清单定义完整有限组合、存储所有者和强制设置场景。保留设置 YAML/JSON 与无关键、凭据 v1 记录及合成引用、工作区 v2 状态、匿名身份、上传索引、用户编写 preset、图像对象、浏览器状态和 Mint 偏好。投影缓存由 4 变为 7：兼容旧提示可用于列表，权威折叠状态则重建。查询 SQLite 保持 schema 8 且位于内存；不选择通用 SQLite schema 1。附件文件对象及别名需要重启、冲突和中断发布证据。主目录环境文件可提供代理变量，项目文件不可。这些是场景要求，不声称语法未变就证明消费者行为未变。

固定带版本的兼容性策略，包含精确基线和目标、支持的存储、夹具清单、目录边、恢复步骤及不支持的降级。生成执行报告保留在候选源码之外，避免摘要递归。用户编写技能、指令、外部根、第三方插件及任意覆盖仍由用户拥有，或明确不属于资格认定范围。自定义持久查询数据库在未单独覆盖时属于不支持或未验证场景。

## 采纳与运行时资格认定

目标合并前，源码评估可如实记录 `persistedFormatsChanged: true` 及受阻或未验证场景。schema 3 采纳验证身份、完整性、摘要和祖先关系，不要求合并后的打包报告。Phase A 发布拒绝格式变化。Phase B 评估器进入受保护主分支后，格式变化只有通过规范清单中的完整报告才能获得资格。不得为通过采纳而记录 false。

每个架构的不持凭据任务使用精确已交付基线运行时生成合成数据，并记录运行时、包身份及夹具树摘要。补充已发布的 V0/V1/V2 普通与 zstd 夹具。包含会话、设置、凭据、工作区、图像和浏览器状态。关闭全部句柄和进程，证明静止，并为每个配置根及 Electron userData 备份计算摘要。在副本上运行精确打包目标，执行列表、读取、恢复、写入、flush、关闭、重开及全部规范场景。记录来源保留、有效后继发布和重建状态。通过上游测试接口验证中断发布、来源漂移及损坏的最高代次；另行要求构建后的普通 Node 迁移 worker。

停止目标并单独保留升级后数据。将完整备份恢复到空夹具位置，运行精确已交付基线，并验证原始可观察状态。不得将目标数据混入恢复，也不得删除保留的较新数据。使用确定性无密钥提供者，隔离主目录、agents 主目录、工作目录、临时及 spill 根与 Electron userData。不得使用真实 DSH 主目录或模型凭据。

可信聚合器要求每个架构一份报告，精确候选、运行、原生 DMG 身份，全部固定场景 ID 通过，所有引用资产重新计算摘要，以及恢复成功。将报告与载荷清单绑定到生产清单、资格认定归档和公开字节验证。`releaseManifest` 与 `checkedManifest` 只有通过此路径才能接纳格式变化。缺失、跳过、失败、过期或替换证据均阻塞；布尔值和文本不能代替运行时证明。

## 上游测试复用

复用上游会话持久化测试及代次辅助工具，不复制转换器。相关所有者包括 `packages/session/session-persistence-jsonl/tests/multi-edge-publication.spec.ts`、`packages/session/session-persistence-jsonl/tests/generation.spec.ts`、`packages/session/session-persistence-jsonl/tests/migration-refusal.spec.ts`、`packages/session/session-persistence-jsonl/tests/lease.two-process.e2e.ts`、`packages/session/session-persistence-jsonl/tests/v2-system-migration.spec.ts`、`packages/session/session-persistence-jsonl/tests/v2-ptc-migration.spec.ts`、`packages/session/session-persistence-jsonl/tests/built-migration-worker.e2e.ts` 和 `packages/session/session-persistence-jsonl/src/testing/generation.ts`。投影夹具位于 `packages/session/session-projection-cache/tests/fixtures.spec.ts`。文件存在不等于已执行资格认定；跳过的构建 worker 测试不能认定打包资格。

## 备选方案与后果

用上游外壳替换 Mint 会改变 profile、来源、权限、插件管理和未签名发布行为，超出本次升级。合并两个主进程会模糊所有权。保留独立 Mint 适配器可维持现有行为，同时保持上游原生架构完整。

复制迁移转换器会产生竞争的持久化权威。复用冻结上游边保留其所有权，但仍需组合与打包证明。整体豁免格式变化或全新安装冒烟测试不能证明现有数据安全。

目标合并后，评估器从新审核的受保护主分支运行；候选执行不获得写入凭据，也没有引导例外。用户手动备份或恢复前必须停止所有共享主目录的进程。夹具证明不是通用主目录锁。不引入自动迁移控制器、降级或回退保证。独立 QA 负责最终默认验证；实际 arm64/x64 资格认定及原生、迁移场景仍必需。上游拥有的原生或迁移修复，或运行时替换，会重新打开决策审核。
