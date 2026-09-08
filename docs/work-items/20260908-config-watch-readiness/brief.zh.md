# 修复配置监听器就绪行为

[English](brief.md) | 中文

- ID: `20260908-config-watch-readiness`
- Size: `M`，共享就绪行为；支持已有 L 级交付工作
- Status: 采样器及修正后合并候选验收通过

## 范围

将[已接受决策](../../decisions/20260908-config-watch-readiness.zh.md) 应用于可复用 HMR 插件及其配置消费者。保留原开发目录及全部目标创建断言。验收及资源限制由决策规定。本工作不包含模块监听重设计、上游提交或公开发布。

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: shared configuration watcher readiness and backend defaults
- Decision owner: Tech Lead `distribution_design`
- Governing decision: [Accepted configuration readiness decision](../../decisions/20260908-config-watch-readiness.zh.md)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: distribution_review approved owned initial baseline and separate I/O, cleanup and notification
- Material product decisions: none
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-08T15:29:42.746770+00:00
- Confirmation basis: Accepted replacement decision and independent lifecycle approval; controlled baseline failure retained
- Readiness history: unbounded polling rejected; bounded Chokidar approved then failed complete verification; owned baseline and lifecycle replacement independently approved

## 归属与验证

协调者负责决策和工作项文档。就绪批准后，唯一 RD 写入者负责 HMR 修正、针对性测试及受影响的实现文档。独立 QA 负责合并后最终候选的验收及完整配置检查；此前检查失败，不能复用为通过证据。原生诊断和轮询实验只是证据，不是最终验收。

## 锚点说明审查

独立审查者 `distribution_review` 批准已记录的初始锚点前提。协调者确认说明后的范围仍为 `implementation-ready`，时间为 `2026-09-08T15:05:17.689280+00:00`；本修正不授权额外祖先订阅或动态重选锚点。

## 验证失败

在 `2026-09-08T15:19:20.125294+00:00`，完整验证在立即创建文件及串行释放两个已有 HMR 用例失败，协调者重新评估受影响的实现决策。Lint、typecheck 和 build 通过，17,298 项测试通过、116 项跳过。失败记录不能证明默认就绪行为。此前批准仅为历史记录；在新原因及修复方案获得独立审查前，禁止继续修改产品实现。

## 替代实现就绪

协调者在 `2026-09-08T15:29:42.746770+00:00` 接受经独立审查的自主管理基线替代方案。失败的 Chokidar 候选仍为历史证据；实现仅限替代决策及同步修正。

- Capability limitation: transport context bounding unavailable for reused agents; no isolated-host claim.

## 采样器验收

独立源码审查批准最终采样器。独立 QA 的六个并发主机进程各自通过全部 15 项 HMR 测试，完整检查中的两个 HMR 测试集也通过。全部 32 项文档检查通过。合并检查通过 lint、typecheck 和 build，17,305 项测试通过、116 项跳过，但一个未修改的压缩耗时断言失败，并报告一个 UI 清理异常。这些失败仍阻止交付；仅凭采样器结果不能重试或发布。

另行限定范围的 fixture 修正通过后续完整检查：17,306 项测试通过、116 项跳过，没有未处理异常；lint、typecheck 和 build 通过。采样器源码保持不变。
