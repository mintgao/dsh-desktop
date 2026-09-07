# 稳定争用环境下的全量验证

[English](brief.md) | 中文

- ID：`20260904-full-suite-contention-reliability`
- 规模：`L`
- 状态：complete
- 创建日期：2026-09-04

## 技术决策准备度

- 结果：`decision-accepted`
- 触发证据：已接受的 Inspector 就绪决策仍约束其实施。最终文档检查还发现，Vibe Kit 精确托管的根指令块含有硬换行段落，并使整文件字数超过升级后的上限。调整仓库检查器会改变共享文档约定，因此需要在此 L 级工作项中增加一项经过评审的 triggered-M 决策。
- 决策负责人：Tech Lead（`inspector_ack_decision_author`）
- 适用决策：[关联 Client Console 就绪状态](technical-decision.zh.md)（`Status: Accepted`）；[在项目文档检查中保留托管指令](managed-instruction-doc-gates.zh.md)（`Status: Accepted`）
- 评审模式：`independent-agent`
- 评审结果：`approved`
- 评审证据：独立 Tech Lead `inspector_ack_decision_review` 批准了两项准确决策。对于托管指令决策，评审先要求采用与 `bin/vibe` 兼容的通用换行 hash 语义，并为每项所有权 predicate 增加独立反例覆盖，随后批准了已持久化修订。
- 重大产品决策：无
- 未解决阻塞：无
- 门禁：`implementation-ready`
- 门禁负责人：工作流编排者
- 确认时间：2026-09-04T14:42:44+08:00
- 确认依据：两项准确的适用决策均为 Accepted；独立 reviewer 在检查 hash、失败覆盖、遮罩、预算、恢复与兼容性后批准了托管指令修订；没有重大产品决策或未解决阻塞。
- 准备度历史：2026-09-04T12:41:15+08:00 — 根据最初的仅测试假设，从 `not-assessed + blocked` 变为 `no-new-durable-decision + implementation-ready`。2026-09-04 — 并发复现证明 `Runtime.enable` 可能在 Client Console 安装前完成并永久丢失 log event；在任何共享实现编辑前，记录重新打开为 `decision-required + blocked`，工作规模从 M 重新分类为 L。2026-09-04 — Tech Lead 决策作者定义了协议版本、关联、就绪、失败、清理、兼容性与确定性验证。2026-09-04 — 独立评审要求补充明确的 Runtime 生命周期串行化与额外失败覆盖；准确修订已经持久化。2026-09-04T13:02:04+08:00 — 独立 reviewer 批准修订决策，工作流编排者确认 `decision-accepted + implementation-ready`，没有剩余阻塞。2026-09-04T14:30:26+08:00 — 聚焦文档检查暴露出新的共享检查器决策：已安装的 Vibe Kit 托管块不能在不破坏激活状态的情况下重新排版，但它违反项目自有的换行与字数检查。该记录在任何检查器编辑前重新打开为 `decision-required + blocked`。2026-09-04 — 独立评审要求采用与 doctor 兼容的通用换行 hash 语义，并为每项所有权 predicate 提供独立失败覆盖。2026-09-04T14:42:44+08:00 — reviewer 批准准确修订，工作流编排者确认 `decision-accepted + implementation-ready`，没有剩余阻塞。

## 目标

关闭 Inspector Console 就绪竞态，并让另外三项负载敏感测试不再依赖空闲主机时序且继续表达现有行为约定，从而恢复通过的默认 Vibe 验证回执。

## 背景

清除已删除包遗留的 ignored 构建输出后，Host 库构建恢复。随后完整测试运行通过 17,249 项并失败四项：一次包含两轮 Oxlint 子进程的测试超过 Vitest 默认五秒预算；一项 Inspector 测试丢失 Console event；一项 Bash 执行器测试把 150 ms 返回阈值当作正确性；一项 session-snapshot 超时测试暴露了 Vitest 的通用外层超时，而不是自身诊断。Inspector 并发复现表明，`Runtime.enable` 会在浏览器 Client 应用 `client-console/enable` 前返回；此间的 log 会永久丢失。另外三项失败可复现为对主机争用敏感的测试缺陷。

## 范围

- 范围内：定义并实现关联的 Client Console enable acknowledgement 与失败语义；以可观察状态替代墙钟正确性断言；在触发 event 前注册异步观察；保留归属模块的超时诊断；为子进程密集型测试分配有限且适合 lane 的预算；更新 Inspector 文档与适用 Agent Note；定义并实现项目文档检查对框架托管根指令的精确处理；记录聚焦测试与默认验证证据。
- 范围外：公开包 API、session 格式、Shell 进程生命周期、Oxlint 行为、全局 Vitest 并发或重试策略、无关 Inspector 能力，以及无关测试清理。

## 验收标准

- [x] AC-1：Oxlint 修复重试约定仍证明只打印最终诊断，并具有适合两个真实子进程在已配置全量 worker 拓扑下运行的有限预算。
- [x] AC-2：Bash `start()` 约定在允许子进程完成前证明返回句柄处于 running 状态，不使用机器速度阈值。
- [x] AC-3：Inspector `Runtime.enable` 保持 pending，直到浏览器 Client 为准确 source generation 与 Runtime session 安装 Console observer；断联、陈旧 acknowledgement 与 dispose 会使 pending enable 失败或结算，且不泄漏 provisional subscription。
- [x] AC-4：session-snapshot 的 child turn 超时路径报告自身拥有的 child 与 minimum-turn 诊断，而不是 Vitest 通用的 `waitFor` 超时，包括发生调度延迟时。
- [x] AC-5：确定性协议测试会暂停 acknowledgement，证明 enable 在此之前尚未就绪；释放 acknowledgement 后证明 Console 交付；四条修正路径的聚焦测试均不依赖重试、全局串行化或把固定 sleep 当作正确性条件，并全部通过。
- [x] AC-6：Inspector README 与适用 Agent Note 以双语记录已发布的 acknowledgement、所有权与失败行为。
- [x] AC-7：独立 QA 在未变化的最终候选上仅运行一次默认 `./bin/vibe verify . --format json`，所有已配置检查均通过；doctor、文档同步及 `git diff --check` 健康。
- [x] AC-8：文档检查保留已安装 Vibe Kit 托管根块及其激活哈希，只在项目自有 prose 换行检查中豁免该定界托管区，保留明确冻结的整文件字数上限，并继续拒绝普通项目自有硬换行和超额字数。

## 设计与技术说明

- Inspector 就绪行为必须先获得 Accepted 技术决策及独立评审，再进入实施。
- 按可观察状态同步，或在触发前注册 event waiter。有限超时只是失败上限，不是成功条件。
- 仅为在已配置争用下确实可能超过 Vitest 默认预算的子进程密集型测试扩大超时。
- 准备度门禁恢复后，由一名 RD 写入实施，并由一名独立 QA 负责最终完整验证。

## 风险与未决事项

- 只改 Inspector 测试超时会掩盖 event 丢失窗口；协议必须让就绪可观察。
- 无界 waiter 可能把清晰的断言失败变成长时间挂起；每个 waiter 都保留有限且归属明确的失败预算。
- 陈旧或已断联 Client 的 acknowledgement 可能启用错误的 transport generation 或泄漏 provisional state；技术决策必须在代码变更前定义关联、取消与 dispose。
- 全局重试、减少 worker 与扩大整套超时会掩盖具体归属点，保持在范围外。
- 重新排版或在本地重新生成 Vibe Kit 托管块会破坏已激活安装；宽泛排除 Markdown 会掩盖项目自有文档缺陷。
