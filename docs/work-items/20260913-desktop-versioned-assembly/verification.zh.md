# 验证：Desktop 版本化组装

[English](verification.md) | 中文

## 候选版本与结果

独立 QA 依据[已接受的标准](brief.zh.md)与[已评审的决策](technical-review.zh.md)验证提交 `024eaa1dd70cb741249e70faf15491610d041fbc`。此候选版本不予接受：打包负向冒烟测试挂起，默认测试有七项失败。QA 未修改应用代码。本报告是测试完成后添加的证据文件。

应用归档 SHA256 为 `469881e6f1a185d3a1cad75e2eef7d91b1130c82e66055cd53d058d6b6a31f53`；组装回执 SHA256 为 `52429c42995c1b7e14b11865acb2d7332d98483b78bf9f19dc482489768c8b2d`。本地原始证据保留在 `/private/tmp/dsh-assembly-qa-024eaa1`；下文文件名均相对于此目录。

## 验收证据

| 标准 | 结果 | 证据 |
|---|---|---|
| AC-1 | Pass | 官方 RC.2 CLI 身份与冻结组装；`after-use.json` 在真实使用后验证暂存和打包后端的全部 25,484 个条目。 |
| AC-2 | Fail | 已记录安装组件身份，但 `packaged-paired-tamper/result.json` 显示同时修改载荷与回执后挂起 20 秒，未在限定时间内诊断退出。 |
| AC-3 | Fail | 真实认证原生 UI 与正常退出通过；`packaged-override/result.json` 显示禁止的 CLI 覆盖同样挂起 20 秒。 |
| AC-4 | Pass | `assembled-runtime-node22.log`：普通 Web 排除 Mint；外部打包 Mint Host/Client 加载，认证成功，实际声明的 Client 资源返回 HTTP 200。 |
| AC-5 | Pass | `native-ui-rc2/result.json` 与 `evidence/conversation.png`：真实 arm64 窗口、输入框提交、确定性助手回复及正常退出；启用沙箱，禁用 Node 集成，启用上下文隔离。 |
| AC-6 | Pass | 新建原生 profile、现有清单不变、拒绝中断锁、保留冲突包及合成既有数据标记；未使用真实用户数据。用户安装与旧格式迁移尚未验证。 |
| AC-7 | Fail | 组装耦合测试已执行，但交付回归测试失败，且真实外部兼容性 fixture 没有常规流水线调用方。 |

## 检查与缺陷

已安装的 Vibe CLI 不支持 `--format json`。QA 运行了受支持的完整 `./bin/vibe verify .`；沙箱 IPC 拒绝使 lint/test/build 证据失效。相同命令在主机重试后完成：lint、typecheck、build 通过；测试结果为 22,485 通过、133 跳过、七项失败。回执为 `default-verify.json`、`default-verify-host.json` 及对应日志。此候选版本未再次运行完整矩阵。

- 高严重度：[原生冒烟入口](../../../apps/desktop-mint/src/main.ts)在 promise 拒绝处理器之前同步解析 CLI 并验证组装。使用 `--dsh-package-smoke` 与禁止的 `DSH_DESKTOP_CLI_PATH` 启动打包程序，或启动同时修改 CLI 字节和对应回执的私有副本。两者均在 20 秒后需要强制清理；预期行为是带诊断的非零退出。有效冒烟在 3.60 秒后以零退出。见 `negative.py` 和三个 `packaged-*/result.json` 文件。
- 阻塞回归：[交付测试](../../../scripts/desktop-delivery/tests/delivery.spec.ts)五个用例失败：组合精确文件、拒绝替换、阻止候选身份变化、拒绝源代码/版本不匹配、离线 artifact/combine CLI。四项报 `Missing required versioned assembly inputs`；版本断言收到 Mint 清单缺失错误。
- 阻塞回归：[工作流测试](../../../scripts/desktop-delivery/tests/workflows.spec.ts)在资格验证改用 `desktop:stage` 后仍要求字面量 `build:desktop`。
- 尚未解决的超时：[操作测试](../../../scripts/desktop-delivery/tests/operations.spec.ts)中的 `preserves catch-up provenance when preparing and finalizing a desktop-only successor` 在完整主机运行中超过 5,000 ms。此回执不能确定计时问题的根因。

`pnpm run doc-sync` 完成 33 项检查，仅因验证占位文件缺少双语配对而失败。其 quick 检查包含全部 `test:docs` 项。本双语报告替换该占位文件；配对记录需要定向刷新。回执为 `doc-sync-host.log`。

## 原生范围与限制

Electron 43.4.1 将 home、日志、用户数据、会话数据和临时目录解析到合成根目录。真实打包应用在 6.257 秒后呈现可用 UI；这是一次启动观察，并非基准测试。截图显示提交的问题与回复。Host/Client 使用和原生退出后，两个后端清单保持不变。后端日志对就绪 token 脱敏。

现有原生 observer 在填充时使用已过时的 `session.events` 属性。因此首次 fixture 在 UI 就绪前失败；`native-ui` 保留该证据。采用 RC.2 公开 `snapshotEvents()` 的临时 fixture 在 `native-ui-rc2` 通过。失败 fixture 需要核验 PID 后强制清理；其测试脚本的 `normalQuit` 字段在强制终止后输出，不能证明正常退出。只有修正后的场景证明正常退出。

不声称已验证签名通知、真实模型、远程发布、已安装用户替换、旧数据降级或任意版本兼容性。source-lock 提案尚未最终确认。修正后的应用候选版本需要重新绑定产物并接受独立最终验证。
