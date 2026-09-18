# 恢复默认验证与依赖布局检查的绿灯

[English](brief.md) | 中文

- ID: `20260918-green-default-verification`
- 规模：`M`
- 状态：成形中
- 创建：2026-09-18

## 技术决策就绪

- 结果：`no-new-durable-decision`
- 触发证据：npm 安装布局检查器改变了它纳入合成 DSH 发布族的包版本准入规则，且配置的验证测试命令改变了它在扫描前构建的产物平面
- 决策负责人：Tech Lead `assembly_architecture`
- 管理决策：none
- 无新决策理由：该变更把版本化组装决策与 RC2 工作区一致性验收中已接受的独立 Mint 版本规则应用到第二个消费者；其余选择是局部且可回退的，不改变任何共享契约
- 审核模式：`independent-agent`
- 审核结果：`approved`
- 审核证据：`docs/work-items/20260918-green-default-verification/technical-review.md`
- 实质产品决策：无
- 开放阻点：无
- 门禁：`implementation-ready`
- 门禁负责人：工作流编排者，Hermes 后续任务 `hermes-desktop-task-55a67951`
- 确认时间：2026-09-18T16:10:00Z
- 确认依据：已接受的版本化组装决策与 `docs/work-items/20260913-mint-rc2-release/brief.md` 中已接受的独立 Mint 版本规则管理该检查器变更；夹具与验证命令的变更是局部且可回退的；审核在隔离的子代理上下文中运行
- 就绪历史：独立审核时记录为 `covered-by-accepted-decision` 并引用同一管理决策；因就绪语法中的 ADR 引用模式无法引用本仓库以日期命名的决策文件（校验规则 `readiness.adr-reference`），改记为 `no-new-durable-decision`

## 目标

默认验证通道与依赖布局检查在本检出上都通过，使接管验证运行不再报告失败的配置检查，发布工作流的依赖布局作业不再报 Mint 版本错误。

## 背景

`docs/work-items/20260913-mint-rc2-release/brief.md` 接受了 Mint 包的独立版本，并把该规则应用到工作区 manifest 检查器。npm 安装布局检查未同步更新，因此 `pnpm run verify-npm-install-layout` 以 `@deepseek-ai/dsh-desktop-mint has no workspace version 0.1.5-rc.2` 中止；同一作业在已合并的 RC2 主页 PR 与 `main` 上也失败。另外，隔离的交付 CLI 夹具会启动真实 CLI，其 `pnpm install` 会触达注册表更新检查，在更新检查可达的机器上超出夹具 30 秒的子进程期限。语料导入扫描读取已构建产物，当配置的测试命令先于任何构建运行时，会把过期产物报告为意外的基线失败。

## 范围

- 包含：npm 安装布局检查器及其单元测试、它所需的共享 Mint 包清单、隔离交付 CLI 夹具的更新检查处理、`.vibe/project.yaml` 中配置的验证测试命令，以及这些变更的工作项、Agent Note 与上下文文档。
- 不包含：官方 DSH 发布族的版本规则、Mint 包版本、交付 CLI 的产品行为，以及把语料导入扫描迁移到产物通道。

## 验收标准

- [ ] AC-1：`pnpm run verify-npm-install-layout` 在本工作区验证双发布布局且不再报 Mint 版本错误，同时缺少工作区版本的官方 DSH 包仍然使检查失败。
- [ ] AC-2：`pnpm exec vitest run scripts/desktop-delivery/tests/operations.spec.ts` 在本机无需环境变量覆盖即通过。
- [ ] AC-3：默认 `./bin/vibe verify . --format json` 运行报告所有配置检查通过，测试通道扫描的是它自己构建的产物。
- [ ] AC-4：`pnpm run doc-sync` 通过，且工作项、Agent Note 与上下文记录描述了变更后的检查器规则与验证命令。

## 设计与技术说明

检查器保持其目的：从工作区合成两个互不兼容的 DSH 发布并验证 npm 的物理放置。独立版本的 Mint 包不是该发布族的成员，因此它们按原版本原样通过合成索引，而不被克隆成两个合成版本。清单与既有消费者共享而非复制：`scripts/desktop-assembly.ts` 导出由 `MINT_PACKAGES` 派生的 Mint 包名，`verifyMintCoupling` 与布局检查器都使用它。官方 `@deepseek-ai/dsh*` 包保留严格的工作区版本要求。

交付 CLI 夹具在夹具自身内部禁用 pnpm 的注册表更新检查，使子进程不再把预算花在夹具注释本就打算避免的网络检查上。`.vibe/project.yaml` 中的验证测试命令在运行单元通道前构建库平面，这正是语料导入扫描读取的依赖。

## 风险与未决决策

- 该排除可能掩盖真实的 Mint 版本漂移；官方族检查与 Mint 耦合检查保持不变，且布局测试新增了针对官方包的反例。
- 验证测试命令现在先构建后测试，默认验证运行耗时增加；该构建是增量的。
- 语料扫描仍位于单元通道，因此在过期树上运行 `pnpm run test` 的开发者仍可能看到过期产物失败；把该扫描迁移到产物通道是后续工作，不属于本工作项。
