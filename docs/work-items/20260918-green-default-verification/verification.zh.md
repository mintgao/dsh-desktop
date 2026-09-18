# 验证：恢复默认验证与依赖布局检查的绿灯

[English](verification.md) | 中文

## 验收证据

| 验收标准 | 证据 | 结果 |
|---|---|---|
| AC-1 | `pnpm run verify-npm-install-layout` 通过，并由 QA 独立复跑确认绿色：`231 DSH package(s) per release and 2060 internal edge(s) verified`；`scripts/verify-npm-install-layout.spec.ts`（9 个测试）保留官方包拒绝作为反例；拉取请求 88 上的 `Dependency layout` CI 作业报告成功 | 通过 |
| AC-2 | `pnpm exec vitest run scripts/desktop-delivery/tests/operations.spec.ts` 在无环境变量覆盖下通过；QA 在默认通道中未发现该文件失败 | 通过 |
| AC-3 | 当前候选上的默认 `./bin/vibe verify . --format json`：`status: passed`，`lint`、`typecheck`、`test`、`build` 全部通过，汇总 4 通过、0 失败、0 跳过、0 未配置（回执 `/tmp/vibe-takeover-55a67951/receipts/verify-final.json`） | 通过 |
| AC-4 | `pnpm run doc-sync` 34 门通过；QA 阅读工作项、Agent Note 三件套与架构上下文，确认它们描述了变更后的检查器规则与测试命令 | 通过 |
| AC-5 | 全语料扫描在 Node 24.21.0 与 Node 22.22.3 下均为 `files=277 ok=272 baselineExempt=5 unexpectedBaselineFailure=0`；`transform-corpus.spec.ts` 在两条线下均 7/7 通过，包括仍会使 `.foo` 扩展名拒绝与非扩展名失败报错的分类用例 | 通过 |

## 自动检查

| 检查 | 结果 | 备注 |
|---|---|---|
| `pnpm run verify-npm-install-layout` | 通过 | 针对工作区注册表索引的真实检查器，31.8 秒 |
| `pnpm exec vitest run scripts/verify-npm-install-layout.spec.ts scripts/desktop-delivery/tests/operations.spec.ts` | 通过 | 24 个测试；operations 测试会两次启动真实交付 CLI |
| `pnpm run doc-sync` | 通过 | 34 门 |
| Node 22.22.3 与 Node 24.21.0 下的 `transform-corpus.spec.ts` | 通过 | 每条线 7 个测试 |
| Node 22.22.3 与 Node 24.21.0 下的语料扫描 | 通过 | 每条线 277 个文件、5 个豁免、0 个意外失败 |
| 默认项目验证（`./bin/vibe verify . --format json`） | 通过 | 4 项检查通过；回执保存在宿主任目录 |

## 独立 QA

第一次 QA 在较早的候选上运行过一次默认通道：`lint`、`typecheck`、`build` 通过，`test` 检查在语料扫描上失败，报 `UNEXPECTED BASELINE FAILURE packages/client/ui-dockkit/lib/index.js`。该失败促成了 AC-5 记录下的语料豁免修正；QA 同时确认此前的工作未越出已接受边界，未发现越界改动。

第二次 QA 在已提交候选 `7e2f9428bc` 上运行过一次默认通道，并且通过：`status: passed`，`lint`、`typecheck`、`test`、`build` 全部通过，汇总 4 通过 0 失败，测试检查的套件总计 22,520 通过、0 失败。该会话在能够复跑两条 Node 线下的聚焦语料测试之前结束，因此 AC-5 的聚焦证据仍是上文的作者运行结果；该次运行在结束前未记录任何越出已接受边界的偏差。

## 局限与后续

- 语料导入扫描仍位于单元通道，因此在带过期构建产物的树上运行 `pnpm run test` 仍可能看到该处的发现；把该扫描迁移到产物通道仍是未完成项。豁免判定本身已不再依赖 Node 线。
- 第一次 QA 通道运行在 Node v22.22.3 下，而工作区记录的是 Node 24；两条线现在给出相同判定，因此该差异不再影响结果。
- 语料扫描的发现阶段仍在单个进程内串行导入所有 bundle，负载高的机器上会较慢；未为此做改动。