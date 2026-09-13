# 验证：Desktop 版本化组装

[English](verification.md) | 中文

## 候选版本与结果

独立 QA 依据[已接受的标准](brief.zh.md)与[已评审的决策](technical-review.zh.md)验证干净提交 `3077ec381584833bf81321f36780ff61686a2d3b`。有界组装场景通过。整体验收仍受三项默认测试超时阻塞，正在调查。QA 未修改应用代码；本报告是测试完成后添加的证据文件。

应用归档 SHA256 为 `d91e5a66638fa1fc64ddc1762bc27e7a4e6a6e20336fd774a238d76296d33184`；组装回执 SHA256 为 `ef5db71ff7ac3c4bba190b7b052a5c4d5ddecd9265eff89d53ac38e441b94ea2`。本地原始证据保留在 `/private/tmp/dsh-assembly-qa-3077ec3`；下文文件名均相对于此目录。

## 验收证据

| 标准 | 结果 | 证据 |
|---|---|---|
| AC-1 | Pass | 精确的官方 RC.2 CLI 身份、冻结输入及真实组装运行时检查；`after-use.json` 在真实使用后验证暂存和打包后端的全部 25,484 个条目。 |
| AC-2 | Pass | 实际独立组件身份；`packaged-paired-tamper/result.json` 记录同时修改载荷与回执后以退出码 1 返回外壳嵌入身份诊断。 |
| AC-3 | Pass | 有效编译冒烟以零退出；禁止的 CLI 覆盖以 1 退出；真实认证及正常退出通过。`shutdown/result.json` 证明忽略 SIGTERM 的子进程在升级终止信号后退出。默认测试覆盖错误就绪信息、导航与诊断脱敏。 |
| AC-4 | Pass | `assembled-runtime.log`：独立普通 Web 配置排除 Mint；外部打包 Mint Host/Client 加载，认证成功，实际声明的 Client 资源返回 HTTP 200。 |
| AC-5 | Pass | `native-ui-rc2/result.json` 与 `evidence/conversation.png`：真实 arm64 窗口、输入框提交、确定性回复及正常退出。启用渲染器沙箱及上下文隔离，禁用 Node 集成。 |
| AC-6 | Pass | 新建 profile 与现有合成 profile 重开；保留既有历史、profile 清单、补丁及数据标记。中断锁和冲突包拒绝通过。用户安装与旧格式迁移单独标记为尚未验证。 |
| AC-7 | Pass | 组装/耦合负向测试通过；替换后的暂存路径与常规源码/原生资格验证流水线调用 `test:desktop:assembly`；源码 CI 还调用编译后的打包冒烟。 |

## 完整检查

已安装的 Vibe CLI 不支持 `--format json`。QA 对此候选版本仅运行一次受支持的完整 `./bin/vibe verify .`，使用此前沙箱 IPC 失败所确认需要的主机权限。Lint、typecheck、build 通过。测试结果为 22,493 通过、129 跳过、三项失败。没有并发运行原生探针。回执为 `default-verify.json`；完整输出为 `default-verify.log`。

`pnpm run doc-sync` 的 34 项检查全部通过。其 quick 检查包含全部 `test:docs` 项。回执为 `doc-sync.json`。真实 `pnpm run test:desktop:assembly` 也通过。没有额外运行完整验证。另一次有明确依据的诊断仅以外部操作阶段跟踪重跑 `pnpm run test`，期限与 worker 设置保持不变。它重现 CLI 准备超时：22,495 通过、129 跳过、一项失败。`/private/tmp/dsh-operations-aggregate-3077ec3/test-lane-result.json` 记录先前失败的重跑理由、冻结报告摘要与退出码 1；对应跟踪文件保留子进程阶段证据。未重跑已通过的检查。

## 尚未解决的默认测试失败

三项失败均来自[操作测试](../../../scripts/desktop-delivery/tests/operations.spec.ts)。实际 CLI 准备用例在第 213 行报告子进程 `spawnSync` ETIMEDOUT。第 254 行连续 Desktop 修复/上游采用用例与第 450 行 catch-up Desktop 后继用例超过 5,000 ms 测试限制。预期行为是成功完成并保留采用/来源断言。这些失败在没有并发原生探针时重现；定向通过不能证明完整测试可靠性。验收前的根因证据由独立调查者负责。相同代码的定向运行通过外部进程跟踪，15 个用例在 19.38 秒内全部通过；记录了 1,124 次同步 Git 调用，累计耗时 15.1 秒。证据为 `/private/tmp/dsh-operations-diagnostic-3077ec3/findings.md`、`focused.log` 和 `process.jsonl`。此前 30 秒子进程停顿仍无法解释；该定向结果不能替代失败的默认回执。

## 原生观察

编译后的有效冒烟在 2.38 秒后以零退出。禁止的覆盖在 0.127 秒后以 1 退出，诊断为 `Packaged CLI overrides are unavailable`。同时篡改载荷与回执在 2.66 秒后以 1 退出，诊断为 `Assembly receipt differs from native shell identity`。三者均无需强制清理；`negative.py` 记录精确的私有调用。

Electron 43.4.1 将 home、日志、用户数据、会话数据和临时目录解析到合成根目录。应用首次启动在 5.056 秒后呈现可用 UI，重开为 4.613 秒；这是观察值，并非基准测试。两个场景均通过真实输入框提交消息并显示确定性回复。最终用户事件之后的持久化事件包括 `assistant/message`、`step/end` 和 `turn/end`。两个场景均正常退出。后端日志对就绪 token 脱敏；Host/Client 使用和原生退出后，两个完整后端清单保持不变。

临时原生 observer 使用 RC.2 公开 `snapshotEvents()`。`native-ui-rc2/result.json`、`reopen-result.json`、对话截图及保存的事件回执区分首次与现有数据场景。合成会话/数据证据不声称旧格式兼容性。

## 前一候选版本与限制

候选版本 `024eaa1` 有两项打包负向挂起和七项默认测试失败。其回执保留在 `/private/tmp/dsh-assembly-qa-024eaa1`；前一报告保留在 Git 历史中。冒烟处理、交付 fixture 与流水线接入改变了源代码及打包产物，因此需要本次新的完整验证。修正后的负向冒烟及交付/工作流断言通过；操作测试超时仍未解决。首次原生 observer 失败源于过时会话属性；只有修正后的临时 fixture 场景证明正常退出。

不声称已验证签名通知、真实模型、远程发布、已安装用户替换、旧数据降级或任意版本兼容性。source-lock 提案尚未最终确认。不得从本证据报告推断已修改应用或重试默认测试。
