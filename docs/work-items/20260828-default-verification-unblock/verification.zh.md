# 验证：解除默认验证阻塞

[English](verification.md) | 中文

## 验收证据

| 标准 | 证据 | 结果 |
|---|---|---|
| AC-1 | `scripts/ci-workflow.spec.ts` 枚举六个官方工作流中的全部 14 个任务，并要求每个任务具备完整的仓库与事件条件。 | 通过 |
| AC-2 | `packages/shell/tool-bash/tests/tools.spec.ts` 要求超时标记，但不把真实进程固定为零退出；纯渲染用例继续覆盖捕获信号后的零退出和信号结果。 | 通过 |
| AC-3 | 镜像的 Bash 与 PowerShell 沙箱分类器优先检查权威后台状态。纯测试覆盖已终止的数值退出码 143、125、1 和 127，同时继续覆盖已完成进程的拒绝与 runner 失败优先级。 | 通过 |
| AC-4 | Shell 与工作流五文件聚焦测试通过 199 项，因缺少 `pwsh` 跳过 13 项 PowerShell 应用测试。类型感知 Oxlint 项目发现聚焦测试用时 5.642 秒并通过。 | 通过 |
| AC-5 | 已安装的 `./bin/vibe verify . --format json` 以 `all-configured` 覆盖返回 `passed`：lint、typecheck、test 与 build 全部通过。全量测试通过 879 个文件和 14,664 项测试；现有环境条件跳过 9 个文件和 114 项测试。 | 通过 |
| AC-6 | 已安装 Vibe Kit 0.6.0 的 doctor 返回 healthy；`pnpm run doc-sync` 通过全部 28 个门禁；`git diff --check` 通过。 | 通过 |

## 自动化检查

| 检查 | 结果 | 说明 |
|---|---|---|
| 工作流与 Shell 聚焦回归测试 | 通过 | 5 个文件；199 项通过；本机缺少 `pwsh`，因此跳过 13 项。 |
| Oxlint 项目发现聚焦测试 | 通过 | 1 项通过；12 项被过滤；用时 5.642 秒。 |
| 全量测试门禁 | 通过 | 879 个文件通过、9 个跳过；14,664 项测试通过、114 项跳过。 |
| 默认项目验证 | 通过 | 采用默认 `all-configured` 覆盖，四项已配置检查全部通过。 |
| 文档同步 | 通过 | 刷新双语 sidecar 后，28 项门禁全部通过。 |
| Vibe Kit doctor | 通过 | 已安装的 0.6.0 文件、manifest、项目配置与 onboarding 状态健康。 |
| 差异检查 | 通过 | `git diff --check` 未报告空白错误。 |

## 手工场景

- 独立复现 Bash 进程树结算差异：500 次终止中 499 次呈现信号，一次呈现数值退出码 143，确认句柄状态才是稳定的生命周期事实。
- 检查六个受 guard 约束的工作流及其全部 14 个任务，没有采用只匹配子串的宽松覆盖。

## 限制与后续

- 当前 macOS 主机没有 `pwsh`，因此 PowerShell 应用级沙箱测试未运行；新增的 PowerShell 纯分类测试已运行，应用级进程行为继续由 Windows CI 负责。
- 本次修正不改变模型可见或产品用户可见 transcript，因此未新增 keyless snapshot。数值信号结算竞态已在包分类层以确定性方式覆盖。
