# 验证：全量测试在资源争用下的稳定性

[English](verification.md) | 中文

## 验证结论

- 角色：在上一 QA 会话被中断后接替的独立 `vibe_qa`。
- 决定：`Pass`。第五个候选版本通过了全部八项验收条件、所有已配置默认检查、doctor、完整文档同步和差异检查。该工作项已为下一项需求做好准备。
- 初始失败候选版本：HEAD `089d92d9f6e051472c2522af32aac75ed3e04742`；已跟踪差异 SHA-256 `8431a45c7e84915ac130dccbb05073cb53814f711a3ae7d10a9fed2b2fb45c8f`；未跟踪内容清单 SHA-256 `f414ba7da1a30fe600ab299e5a9da0792e2bccd505b614261f051313c2bf7eb2`。其规范运行因 Inspector fixture 编译错误和六个测试文件失败而使四项已配置检查全部失败。
- 第二个失败候选版本：HEAD 相同；已跟踪差异 SHA-256 `a743482d065d0b1e5513a71f335a9f92cfebb352704b3848e864256d62ba2ff2`；未跟踪内容清单 SHA-256 `fdec1c8e8e624da624dd9f7a468f34e441352e67c73b34b931444c15e9fed6cc`。其获准运行通过了 lint、类型检查和构建，但测试在 `hmr-config.spec.ts` 中失败。
- 第三个失败候选版本：HEAD 相同；已跟踪差异 SHA-256 `dadf24ac42150bcc9f53e7dc2a446cd05234af48304af1b39a5bd4a1ad2f543f`；未跟踪内容清单 SHA-256 `74195627f50da67783f4a1715b41b31c08e1201c10f9c3a7f843d2c735d3759b`。其获准运行通过了 lint、类型检查和构建，但测试在 `integration.host.spec.ts` 中失败。
- 第四个候选版本：HEAD 相同；已跟踪差异 SHA-256 `c3529d5c530212f555e504c25762fdc0afbdfd48b733c672ccb44d3e44026fe7`；未跟踪内容清单 SHA-256 `277ea968b2f256f88506b2553aa79564416f7b2f5e6f0b4a05e96bf06e49daa5`。其获准默认运行通过 4/4，doctor 健康，但 `doc-sync` 在两个块中发现三项导出 JSDoc 要求未满足。
- 最终第五个候选版本：HEAD 相同；已跟踪差异 SHA-256 `3449a7545b4ab27adcb01a47b5084b9310345bca58eeba4f6bde3a072d3fec51`；未跟踪内容清单 SHA-256 `0d70b87912c334d023c885fce7e24ec019d3d11aa72e61c753e863918ad4d5ae`。规范运行前后及有条件候选检查后观测到的三个值完全相同。
- 重跑原因：两个已引用的导出成员 JSDoc 块发生变化，补充了缺少的描述与参数文档，因此第四份收据陈旧。这项定义候选版本的生产源码文档变更授权恰好一次第五次完整运行。
- 治理证据：简报记录了 `decision-accepted + implementation-ready`；两项治理技术决定均为 `Status: Accepted`，具有独立评审批准且无未解决阻碍。QA 未发现缺失的实现前就绪字段，也没有制造事后决策证据。
- 宿主限制：QA 交接使用了有界且不含历史的任务包。本收据不声称实时提示词隔离、经测量的 token 缩减、当前 Codex 重载或交接行为，也不声称实时浏览器 Client 场景。

## 验收证据

| 条件 | 证据 | 结果 |
|---|---|---|
| AC-1 | Oxlint fixture 保留一个最终诊断断言，将单线程资源限制施加于真实子进程，并为两轮子进程用例保留有限且归属明确的预算。规范测试检查通过，且没有任务自有的全局重试或 worker 缩减。 | Pass |
| AC-2 | Bash fixture 通过可观测文件系统状态阻止子进程，检查 `running`，释放该状态后再观测完成，并且没有机器速度阈值。规范测试检查通过。 | Pass |
| AC-3 | Inspector 协议与 fixture 关联 source generation 和 Runtime session，使 enable 保持 pending 直到匹配的 Client observer 确认，拒绝陈旧结果，并在断联与 dispose 时结算且不泄漏 provisional subscription。规范类型检查和测试通过。 | Pass |
| AC-4 | session-snapshot fixture 注入超过自有截止时间的日志收集延迟，并断言子项／最小轮次诊断，同时把通用超时保留为其原因。规范测试检查通过。 | Pass |
| AC-5 | 确定性的持有确认、生命周期和 CDP 事件 waiter 都在触发前注册；后端中立的 HMR 组合用例轮询可观测状态，其他用例保留原生后端。规范测试检查通过，且没有全局串行化、重试或把固定休眠当作成功条件。 | Pass |
| AC-6 | 配对的 Inspector README 与跨 realm Inspector Agent Note 以中英文描述协议版本 1、确认标识、就绪顺序、失败清理和匹配产物恢复。完整翻译与文档门禁通过。 | Pass |
| AC-7 | 第五个候选版本唯一一次获准的 `./bin/vibe verify . --format json` 在未变化候选上通过 4/4 项已配置检查；doctor 健康，`pnpm run doc-sync` 通过 32/32，且 `git diff --check` 通过。 | Pass |
| AC-8 | 候选版本保留精确且经过认证的受管区域屏蔽、独立所有权谓词失败覆盖及冻结的全文件上限 `2858`。默认矩阵与完整文档门禁通过，doctor 验证了匹配的受管哈希与激活集。 | Pass |

## 规范默认验证

| 字段 | 收据 |
|---|---|
| 命令 | `./bin/vibe verify . --format json` |
| 执行 | 第五个候选版本仅运行一次；由于沙箱内 tsx／本地 IPC 是已知的确定性阻碍，运行开始时使用了范围狭窄的宿主升权。没有重试任何已配置检查或完整矩阵。 |
| 选择 | `mode: default`；`coverage: all-configured`；未请求子集。 |
| 候选版本稳定性 | 运行前后以及 doctor、文档同步和证据编辑前差异检查之后，HEAD 和两个内容摘要均匹配。 |
| 结果 | `status: passed`；4 项通过、0 项失败、0 项跳过、0 项未配置。 |
| 已配置检查 | Lint：Pass；类型检查：Pass；测试：Pass；构建：Pass。 |

## 历史缺陷处置

- D-1：带品牌类型的 Inspector session fixture 参数与兼容的 disposer mock 解决了初始编译失败。
- D-2：六项归属明确的测试修正解决了初始失败文件，且未更改全局重试、worker 数或全套超时。
- D-3 与 D-4：HMR 生命周期与 Inspector 集成用例使用可观测状态和真实 CDP 事件 waiter；最终规范测试检查通过。
- D-5：`ClientConsoleObserver.disableSession` 已记录 `sessionId`，`InspectorRealmSessionSet.has` 已具有描述正文并记录 `session`；独立完整 `doc-sync` 运行通过 `export jsdoc` 及其他全部门禁。

## 有条件检查与跳过项

| 检查 | 结果 | 说明 |
|---|---|---|
| 候选版本标识 | Pass | 最终运行前与检查后的 HEAD、已跟踪差异摘要和未跟踪内容摘要完全一致。 |
| Vibe doctor | Pass | `status: healthy`；Vibe Kit `0.8.0`；manifest `10f880e132e1f4bbf4ec221c040698f98b35af37effec0d44d6a58a5353352d5`；受管块 `bb777dad202f775bbc6a86e33c8cc613766f9c68e32c69c76d37ff7f19400fb6`；实际和预期激活集均为 `b247e389c80c0518201bd678dd23223a32d6b422e5ee97e02ffc387c329a6ab9`；没有诊断、写入或网络使用。 |
| 文档同步 | Pass | `pnpm run doc-sync` 在 45.40 秒内完成 32 项通过、0 项失败、0 项跳过；`export jsdoc` 通过。 |
| 范围内翻译配对 | Pass | 证据专用编辑后重新记录并检查了验证与简报配对。 |
| 差异检查 | Pass | `git diff --check` 在证据专用编辑前后均通过。 |
| QA 聚焦重跑 | Not applicable | 第五个候选版本不需要聚焦重试、已配置检查重试或重复完整运行。 |
| 实时宿主场景 | Not applicable | 有界验收条件不要求实时浏览器 Client、实时 Agent 行为、提示词隔离测量、token 缩减测量或当前 Codex 重载／交接证明。 |

## 决定边界合规性与残余风险

- 任务自有变更保持在已接受的 Inspector 就绪协议、所有者本地资源争用 fixture、经过认证的 Markdown 检查器与测试、显式预算 manifest 及双语文档所有者范围内。第五次增量只更改之前引用的两个 JSDoc 块；它没有改变生产行为、vendor 代码、全局重试、worker 数或全套超时策略。
- 工作树还包含较早的 Vibe Kit 升级和默认验证变更，因此这是内容绑定的最终工作树候选版本，而不是任务隔离提交。条件评审排除了不相关文件，但每项已配置默认检查和文档检查都评估了完整候选版本。
- 静态产物与受控 fixture 无法证明实时浏览器 Client 安装、实时 Agent 行为、提示词隔离或 token 缩减。这些限制不阻断已接受条件，且全部指定的自动化就绪路径均为绿色。
- 就绪状态：AC-1 至 AC-8 全部通过，没有已配置跳过项或未解决缺陷；该工作项已为下一项需求做好准备。
