# 验证：Desktop 版本化组装

[English](verification.md) | 中文

## 候选版本与结果

独立 QA 依据[已接受的标准](brief.zh.md)与[已评审的决策](technical-review.zh.md)验证干净提交 `02340c796b8cb9a97ef0233a86cdae56bc1dc5bc`。AC-1 至 AC-7 和完整默认验证均通过。此候选版本在有界本地组装范围内通过验收；不包括发布和用户安装。QA 未修改应用代码；本报告是测试完成后添加的证据文件。

应用归档 SHA256 为 `d91e5a66638fa1fc64ddc1762bc27e7a4e6a6e20336fd774a238d76296d33184`；组装回执 SHA256 为 `ef5db71ff7ac3c4bba190b7b052a5c4d5ddecd9265eff89d53ac38e441b94ea2`。原生/场景证据保留在 `/private/tmp/dsh-assembly-qa-3077ec3`；下文场景文件名相对于此目录。最终默认验证证据位于 `/private/tmp/dsh-assembly-qa-02340c7`。QA 确认应用/运行时源代码与输入相对 `3077ec3` 未变，两个产物摘要仍一致；仅修改 fixture 无需重建原生产物或重复原生场景。

## 验收证据

| 标准 | 结果 | 证据 |
|---|---|---|
| AC-1 | Pass | 精确的官方 RC.2 CLI 身份、冻结输入及真实组装运行时检查；`after-use.json` 在真实使用后验证暂存和打包后端的全部 25,484 个条目。 |
| AC-2 | Pass | 实际独立组件身份；`packaged-paired-tamper/result.json` 记录同时修改载荷与回执后以退出码 1 返回外壳嵌入身份诊断。 |
| AC-3 | Pass | 有效编译冒烟以零退出；禁止的 CLI 覆盖以 1 退出；真实认证及正常退出通过。`shutdown/result.json` 证明忽略 SIGTERM 的子进程在升级终止信号后退出。默认测试覆盖错误就绪信息、导航与诊断脱敏。 |
| AC-4 | Pass | `assembled-runtime.log`：独立普通 Web 配置排除 Mint；外部打包 Mint Host/Client 加载，认证成功，实际声明的 Client 资源返回 HTTP 200。 |
| AC-5 | Pass | `native-ui-rc2/result.json` 与 `native-ui-rc2/evidence/conversation.png`：真实 arm64 窗口、输入框提交、确定性回复及正常退出。启用渲染器沙箱及上下文隔离，禁用 Node 集成。 |
| AC-6 | Pass | 新建 profile 与现有合成 profile 重开；保留既有历史、profile 清单、补丁及数据标记。中断锁和冲突包拒绝通过。用户安装与旧格式迁移单独标记为尚未验证。 |
| AC-7 | Pass | 组装/耦合负向测试通过；替换后的暂存路径与常规源码/原生资格验证流水线调用 `test:desktop:assembly`；源码 CI 还调用编译后的打包冒烟。 |

## 完整检查

已安装的 Vibe CLI 不支持 `--format json`。QA 对最终候选版本仅运行一次受支持的完整 `./bin/vibe verify .`，使用此前沙箱 IPC 失败所确认需要的主机权限。未经跟踪注入的运行在 169.99 秒内通过 lint、typecheck、test 和 build：22,496 个测试通过、129 跳过；1,282 个测试文件通过、12 跳过。没有并发运行原生探针或其他 QA 测试。回执为 `/private/tmp/dsh-assembly-qa-02340c7/default-verify.json`；完整输出为该目录中的 `default-verify.log`。

`pnpm run doc-sync` 在 `3077ec3` 上的 34 项检查全部通过；之后的实现报告、验证报告及 brief 修改仅涉及证据。其 quick 检查包含全部 `test:docs` 项。回执为 `/private/tmp/dsh-assembly-qa-3077ec3/doc-sync.json`。真实 `pnpm run test:desktop:assembly` 通过。最终报告/brief 更新仅涉及证据；配对与空白检查通过，无需重跑完整验证。

## 验证历史

`3077ec3` 默认运行有三项操作测试超时。另一次有依据的测试单通道诊断采用外部阶段跟踪，重现一项 CLI 超时，22,495 个测试通过、129 跳过。跟踪定位停顿发生于 `pnpm install`。私有 loopback 对比证明：冻结本地链接安装在 pnpm 更新元数据响应被保持时仍保持进程存活；fixture 本地设置 `updateNotifier: false` 后以零注册表请求完成。证据为 `/private/tmp/dsh-operations-aggregate-3077ec3/phase-findings.md`、`test-lane-result.json` 和 `pnpm-notifier-0i28rev6/result.json`。原始失败的精确外部网络条件未知。

最终修正仅改变合成安装 fixture，保留真实 CLI 执行、版本拒绝、凭据隔离及全部期限。测试候选版本变化与先前失败回执构成新一轮规范默认验证的依据。此前两个 5 秒用例也在最终聚合运行中通过；其早期计时波动并未通过修改超时独立消除。通过结果不会替代或隐藏历史失败。

## 原生观察

编译后的有效冒烟在 2.38 秒后以零退出。禁止的覆盖在 0.127 秒后以 1 退出，诊断为 `Packaged CLI overrides are unavailable`。同时篡改载荷与回执在 2.66 秒后以 1 退出，诊断为 `Assembly receipt differs from native shell identity`。三者均无需强制清理；`negative.py` 记录精确的私有调用。

Electron 43.4.1 将 home、日志、用户数据、会话数据和临时目录解析到合成根目录。应用首次启动在 5.056 秒后呈现可用 UI，重开为 4.613 秒；这是观察值，并非基准测试。两个场景均通过真实输入框提交消息并显示确定性回复。最终用户事件之后的持久化事件包括 `assistant/message`、`step/end` 和 `turn/end`。两个场景均正常退出。后端日志对就绪 token 脱敏；Host/Client 使用和原生退出后，两个完整后端清单保持不变。

临时原生 observer 使用 RC.2 公开 `snapshotEvents()`。`native-ui-rc2/result.json`、`native-ui-rc2/reopen-result.json`、对话截图及保存的事件回执区分首次与现有数据场景。合成会话/数据证据不声称旧格式兼容性。

## 前一候选版本与限制

候选版本 `024eaa1` 有两项打包负向挂起和七项默认测试失败。其回执保留在 `/private/tmp/dsh-assembly-qa-024eaa1`；前一报告保留在 Git 历史中。冒烟处理、交付 fixture 与流水线接入改变了源代码及打包产物，因此需要本次新的完整验证。修正后的负向冒烟、交付/工作流断言及最终操作测试聚合均通过。首次原生 observer 失败源于过时会话属性；只有修正后的临时 fixture 场景证明正常退出。

不声称已验证签名通知、真实模型、远程发布、已安装用户替换、旧数据降级或任意版本兼容性。source-lock 提案尚未最终确认。最终报告及本地已验证的工作项状态不授权发布或替换已安装应用。
