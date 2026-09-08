# 经审查交付验证

[English](verification.md) | 中文

## 范围与决策证据

[RD-1–RD-6](brief.zh.md) 遵循[已接受操作决策](../../decisions/20260908-desktop-reviewed-delivery.zh.md)。所有者确认管理员信任模型。Tech Lead `distribution_design` 编写决策；`distribution_review` 独立批准可重复种子最终提交和调度通知身份。协调者于 `2026-09-08T12:14:46Z` 重新确认实现就绪。本实现任务没有启用远程写入者或通知。

## 在线基线检查

2026-09-08，只读 GitHub 检查识别到仓库 `mintgao/dsh-desktop`（ID `1344813014`）、受保护默认分支 `main`、现有发布环境 `mint-publication` 及旧控制器、最终处理者和发布者 App。环境具有分支限制，但没有必需审查者。主分支保护要求审查，却没有必需状态检查；Actions PR 创建被禁用。这些观察是启用阻塞，不能假定配置已修正。

最后公开版本为 `desktop-v0.1.2-alpha.3.unsigned.1`，Release ID 为 `380641449`，附注标签对象 `e9ee382654e1df501f21ddd012948157a1124adb` 解析到源码 `67406fc6af451f7f68874cb31c2d0f3242c0c8ad`。记录的上游是 `dsh-v0.1.2-alpha.3`，提交 `dd6322d604e00eec1ba5e0c8541159906a21094a`；Git 祖先检查通过。尚未解决的采用仍是 [PR 64](https://github.com/mintgao/dsh-desktop/pull/64)，头提交 `b02b0bc1ed4492715b7003a0b19b8fe38901cd20`。

两份实际公开 DMG 均已下载，与保留校验和匹配。旧校验和条目带单个 `bundle/` 前缀，因此在平铺下载目录直接运行 `shasum -c` 无法定位文件。显式验证此前缀及确切文件名，保留原有预期摘要；没有修改发布文件。

| 架构 | 字节数 | SHA-256 |
|---|---|---|
| arm64 | 176212489 | `e7f45dc0ec39504171f2248732de3c1eeab756c6e2f1388d745f022ffa7020ce` |
| x64 | 179047088 | `2be2e3fc1ece76132fd7ba2ce5b5d87010fc8895f68213e0148c4c779ebe3e49` |

已从现有状态分支提交 `fd2ad450f6524d7e9047743064e19cfa235373bd` 的 `state/upstream-adoption.json` 读取固定旧采用证据，字节摘要为 `290e509f5ad48ac13233ef7bfdf252770054ed26d48323240efc54de563812aa`。模式 2 记录 alpha.3 为最后已发布版本，alpha.4 与 PR 64 为阻塞状态，与实际公开基线一致。较旧的 `.github/upstream-sync-state.json` 记录陈旧版本，不能用于引导种子。

## 已执行操作检查

经过认证的只读 `migration-preflight` 命令生成相同的基线安装包摘要，并识别 PR 64 为尚未解决的采用。它因真实保护配置、旧写入者及管理员证据前置条件返回 `blocked`。这证明拒绝检查有效，不能证明已具备启用条件。在线命令使用维护者凭证；运行时 token 行为需要独立权限测试及实际 Actions 验收。

ARM64 复制安装检查使用本地 `0.1.2-alpha.3` DMG 通过，SHA-256 为 `a47fa900fa2f48de0d9744ab35bff5075acd0196c86aa7ee83c075bdb3973a48`。只读挂载和临时复制安装均启动了引导程序与 HTTP 后端，停止并清理了资源。含未提交修改的诊断候选正确地保持不具备资格。这项检查不覆盖 x64、可见应用窗口或现有用户数据。

## 数据兼容性

从保留版本提交到当前开发基线及限定修改的源码比较，没有改变 DSH 会话、设置、凭证或工作区持久化的拥有模块。已有差异包括沙箱执行辅助函数、私有实验 Inspector 线协议变化、依赖声明和测试开发工具；这些不是用户持久格式迁移的证据。候选[评估](../../../.github/desktop-delivery/data-compatibility.json) 明确排除未来上游采用及未测试的降级与恢复行为。

临时原生安装测试使用隔离应用数据，不能证明现有用户数据可升级或被旧运行时重新打开。未来采用如改变持久化，发布前必须提供新评估及上层规定的迁移证据。

## 实现验收

独立 QA 接受冻结本地实现的 RD-1–RD-6。最初 34 项针对性测试及 13 项受影响恢复与通知测试通过。真实 Git 场景覆盖人工修正、拒绝过期 seed、仅修改源码锁的再次最终化、两次连续桌面修复及后续有序上游采用。已批准变更失败会创建去重状态通知；无效批准不能创建通知。

最终实现仅运行一次标准 `./bin/vibe verify . --format json`，lint、typecheck、test、build 四项配置命令全部通过。Vitest 报告 1,076 个文件和 17,339 项测试通过，9 个文件和 116 项测试跳过。没有配置命令失败或跳过。验证期间 45 个实现文件指纹和已跟踪差异保持不变。本次仅记录证据的更新前，完整文档检查通过 32 项检查。

QA 更新了诊断候选，并使用最终配置再次执行真实 ARM64 复制安装检查。报告摘要为 `f1dc4c3d4fcb5165c3ac0e0840304e5e1a94b9250f493bcb182f41f865f842b8`；挂载及复制应用启动、认证 HTTP、进程清理、卸载及删除均通过。工作区未提交，因此资格验证和发布资格仍为 false。

本地回执位于 `/private/tmp/dsh-reviewed-final-default.json`、`/private/tmp/dsh-reviewed-final-candidate-state.json`、`/private/tmp/dsh-reviewed-final-copy-smoke.json` 和 `/private/tmp/dsh-reviewed-final-qa.md`。QA 与实现使用不同 Agent；传输上下文限制不可用，因此不声称主机隔离。

实际上线仍受已记录的保护、旧权限、机器人审查、草稿访问及待处理采用前提阻塞。没有验证公开发布、GitHub 写入、替换已安装应用、x64 资格验证、签名产物、原生 GUI 或现有用户数据迁移。[上线记录](rollout.zh.md) 负责下一步授权操作；本地验收不启用替代机制。

## 基于 main 的待推送候选

独立待推送分支基于受保护 `main` 的 `089d92d9f6e051472c2522af32aac75ed3e04742`，包含独立 spill 时间戳夹具修正 `32ad30353e25aedfc9dfb75775136a78b014dba5`，排除恢复提交和其他无关工作区改动。引导可见性修正及实际管理员证据已经独立技术审查。

独立 QA 使用此基线支持的完整 `./bin/vibe verify .` 命令，其 Vibe CLI 不支持 `--format`。两个候选因未改动的 spill 夹具失败后，修正后的最终候选通过 lint、typecheck、test 和 build：17,294 项测试通过、116 项跳过，1,074 个文件通过、9 个文件跳过。最终运行期间 107 个待推送文件的摘要均未变化。本次仅记录证据的更新发生在该运行之后。

保留回执为 `/private/tmp/dsh-rollout/qa-default-ready.log`，SHA-256 为 `7d0d45fa84002633a750b9217e0ba6d56d66c356352d288ff5c417263dba96ce`；`/private/tmp/dsh-rollout/qa-final.md` 保留前两次失败及最终验收。待推送文档检查通过 32 项检查，最终证据文字另行检查配对、链接及换行。这些源码检查不代表新增原生资格验证或远程执行。
