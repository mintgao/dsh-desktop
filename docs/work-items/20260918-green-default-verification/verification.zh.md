# 验证：恢复默认验证与依赖布局检查的绿灯

[English](verification.md) | 中文

## 验收证据

| 验收标准 | 证据 | 结果 |
|---|---|---|
| AC-1 | `pnpm run verify-npm-install-layout` 通过，并由 QA 独立复跑确认绿色：`231 DSH package(s) per release and 2060 internal edge(s) verified`；`scripts/verify-npm-install-layout.spec.ts`（9 个测试）保留官方包拒绝作为反例 | 通过 |
| AC-2 | `pnpm exec vitest run scripts/desktop-delivery/tests/operations.spec.ts` 在无环境变量覆盖下通过；QA 在默认通道中未发现该文件失败 | 通过 |
| AC-3 | 在冻结候选上运行默认 `./bin/vibe verify . --format json` | **未达成** |
| AC-4 | `pnpm run doc-sync` 34 门通过；QA 阅读工作项、Agent Note 三件套与架构上下文，确认它们描述了变更后的检查器规则与测试命令 | 通过 |

## 自动检查

| 检查 | 结果 | 备注 |
|---|---|---|
| `pnpm run verify-npm-install-layout` | 通过 | 针对工作区注册表索引的真实检查器，31.8 秒 |
| `pnpm exec vitest run scripts/verify-npm-install-layout.spec.ts scripts/desktop-delivery/tests/operations.spec.ts` | 通过 | 24 个测试；operations 测试会两次启动真实交付 CLI |
| `pnpm run doc-sync` | 通过 | 34 门，作者运行 |
| 独立 QA 运行的默认项目验证 | **失败** | `lint`、`typecheck`、`build` 通过，`test` 退出码 1；回执 `/tmp/dsh-mint-qa-verify-receipt.json` |

## 独立 QA

QA 在冻结候选（`HEAD c93700a9d4` 加八个已修改文件与两份新增未跟踪记录）上**恰好运行一次**完整默认 `./bin/vibe verify . --format json` 通道，并复跑了允许的聚焦检查。未发现越界改动。

该通道唯一失败的测试是 `packages/experimental/webworker-runtime/tests/compile/transform-corpus.spec.ts > every built bundle imports under Node`：`UNEXPECTED BASELINE FAILURE packages/client/ui-dockkit/lib/index.js: Unknown file extension ".css" for ./packages/client/ui-primitives/src/StateDot.module.css`。该通道在单元通道之前自行构建了库平面，因此扫描读取的是它刚构建出的产物，却仍报告该发现。套件总计 22,518 通过、1 失败、129 跳过。

## 局限与后续

- 配置的 `test` 命令不再是该语料失败的解释：扫描读取该通道自己构建的产物仍然复现同一发现。本工作项早先的前提由此记录更正。该发现是既有的、与变更文件无关，但 AC-3 按字面未达成，工作项的就绪主张到此为止。
- 该失败只在完整单元通道内复现，而单独运行同一测试文件却通过，因此并发或先行的套件成员是主要假设；该调查属于后续工作。
- QA 通道运行在 Node v22.22.3 下（本代理环境的 shell），而工作区记录的交互式工具链是 Node 24；语料扫描对 Node 版本的敏感性仍未测量，不作结论。
- 语料扫描仍位于单元通道；迁移到产物通道仍是未完成项。