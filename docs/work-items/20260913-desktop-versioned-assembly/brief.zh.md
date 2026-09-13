# Desktop 版本化组装

[English](brief.md) | 中文

- ID：`20260913-desktop-versioned-assembly`
- 规模：`L`
- 状态：locally-verified
- 创建日期：2026-09-13

## 目标

通过未修改的上游运行时、单独打包的 Mint 插件和原生外壳采用 DSH RC.2。明确 Desktop 集成接口并自动检查，使常规版本采用无需重复手动调查兼容性。用户仍只接收一个 Desktop 更新。

## 授权与范围

所有者明确要求在本次采用中同时实现两项改进，并制定常设开发规则。PM `assembly_scope` 只读评审了范围，确认没有未解决的产品选择。受保护主线基线为 `8e1df6fd25166943e6105859832b42a4da258755`；已交付 Desktop 为 `desktop-v0.1.5-alpha.2.unsigned.2`，来自 `2c00aa9602335c927a89d3b6208aa6a8d812c32d`，上游为 `b2e3b2a0125854567a4a5fcba75782e42fe84901`。目标为 `dsh-v0.1.5-rc.2`，提交为 `fb2c4b9e698e30edb738bca4cf0618587db7d203`。[独立报告](verification.zh.md)验证了官方运行时闭包和本地组装应用；仍不包含发布和用户安装。

遵循[下游策略](../../context/downstream-policy.zh.md)与[原生归属决策](../../decisions/20260910-desktop-mint-target-integration.zh.md)。Mint 位于 `apps/desktop-mint`；`apps/desktop` 属于上游。原始用户改动保留在原恢复工作区，不包含在本任务中。保留用户 home、自定义 profile 补丁、未签名 arm64 行为、导航和认证保护。不包含新产品功能、Intel 支持、通用插件平台、任意版本兼容、签名激活、远程发布或已安装应用替换。

## 验收条件

- AC-1：组装的 RC.2 运行时具有精确官方来源与完整性。Mint 不要求修改上游 CLI 依赖、内置 profile 或运行时源码。源码祖先关系本身不足以证明。
- AC-2：上游、Mint 软件包和原生外壳具有各自精确身份。记录实际安装组件及完整性；缺失、不匹配或篡改的输入必须失败，不得退回工作区或注册表。
- AC-3：明确的启动、就绪/认证、关闭和原生集成义务具有成功与失败测试，并包含真实 RC.2 产物。只有模拟就绪输出不足以证明。
- AC-4：打包的 Mint 插件通过支持的 DSH profile/插件扩展 API 加载，不使用源码别名；独立纯 Web 组合不含 Mint 默认项。
- AC-5：打包的 arm64 应用在隔离合成环境中启动，显示可用 UI，完成代表性的无密钥会话并退出。诊断隐藏令牌；依赖未签名身份的通知仍未验证。
- AC-6：用户获得一个 Desktop 版本；维护证据列出实际组件。分别报告首次安装、现有 profile/数据兼容与用户安装。测试不访问真实用户 home 或凭据。
- AC-7：常设规则和已执行检查拒绝代表性的 Mint 到核心耦合或被篡改的组装输入。替换耦合的打包路径，而非仅增加并行演示。

## 技术决策就绪状态

- Outcome: `decision-accepted`
- Trigger evidence: 跨进程启动、产物来源、版本兼容及持久化自定义 profile 初始化
- Decision owner: Tech Lead `assembly_architecture`
- Governing decision: [官方运行时产物与 Mint 自有组装](../../decisions/20260913-desktop-versioned-assembly.zh.md)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: [独立技术评审](technical-review.zh.md)
- Material product decisions: 所有者要求在本次 RC.2 采用中实现两项目标；保留现有单一更新、未签名 arm64 范围
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-13T11:27:18.201619+00:00
- Confirmation basis: 编排者检查了 Accepted ADR、含提案摘要的独立批准、AC-1 至 AC-7、保留的未签名 arm64/单一更新范围，以及无未解决产品决策
- Readiness history: 2026-09-13 PM 划定 AC-1 至 AC-7；实施前要求不同的原生技术负责人作者与评审者

当前任务应用原工作区中用户提供的就绪规则；隔离基线安装的是较旧 Vibe 版本。本任务不声称框架升级或激活。

## 验证归属

RD 负责聚焦检查。独立 QA 对最终不变候选负责恰好一次完整默认验证，以及组装和原生验收条件。证据绑定实际输入，并记录失效原因。真实模型调用和已签名通知检查需要另外可用的凭据，不能从模拟推断。
