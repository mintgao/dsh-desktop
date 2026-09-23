# Agent Note: Vibe Kit 升级到 0.10.1

Status: implemented

[English](2026-09-23-vibe-kit-upgrade-0.10.1.md) | 中文

## 问题

仓库安装的 Vibe Kit 是 0.9.0，而 kit 的规范仓库已发布 0.10.1，项目运行的工作流规则、技能、agent 定义与接管契约都落后于当前发行版。0.10.1 的托管块比 0.9.0 的托管块多 37 词（917 词增至 954 词），合并后根 `AGENTS.md` 从 2870 词增至 2907 词，超过 [doc-budgets.manifest.json](../../../../scripts/doc-budgets.manifest.json) 中的 2871 词上限，因此强制门禁 `verify-doc-budgets` 失败，尽管项目自有指令一个字都没有变。该托管块现在还把手工激活路径描述为与宿主无关，而不再是 Codex 专属，安装后的表述因此不再与 kit 自身契约一致。

## 决策

按 [0.9.0 的升级](2026-09-18-vibe-kit-upgrade.zh.md) 的方式，以升级采纳 v0.10.1 的规范 GitHub 发行包：先校验传输归档的 SHA-256 与 payload 树摘要，再由目标 payload 自带的 CLI 负责 `plan upgrade`、`upgrade` 与首次 doctor，其记录的摘要保存在 `.vibe/manifest.json`。本次升级以单个事务提交，更新十个托管文件，没有冲突，也没有兼容性迁移，并保持项目自有字节不变：根 `AGENTS.md` 的 1953 个项目词保持不变，`.vibe/onboarding.json` 字节保真，不手工接受任何托管冲突。根 `AGENTS.md` 的上限精确上移托管块的增量，由 2871 改为 2908，使该文件保持框架变更前的余量；不通过压缩项目规则来吸收框架块，也绝不手工编辑托管块，因为 kit 会认证其字节区间。安装健康由已安装 CLI 的 doctor 证明：`status: healthy`、版本 0.10.1、期望与实际激活集摘要一致、无诊断项。doctor 之后的接管阶段仍归宿主所有，已安装契约只声明手工新建任务路径，因此本项目中的一个新任务负责适配、最终验证与被恢复的目标。

## 考虑过的替代方案

- 压缩项目自有指令，使 2871 词上限继续成立。
- 裁剪或手工编辑框架托管块以适配预算。
- 框架更新后让 `verify-doc-budgets` 保持失败。
- 继续使用 0.9.0，把升级推迟到后续需求。

## 后果

上限继续跟随框架块，后续每次 kit 升级都重复同样的增量计算，而不是悄悄重新给项目文案定预算。本发行版除版本标识与宿主标签外不改变任何产品面：kit 的宿主注册表现在把 Hermes 条目标记为 `verified`，托管块的手工激活路径与宿主无关，因此本项目中的新 Hermes 任务也可以承担后续任务，而不必是 Codex 任务。本次升级把 Agent-install 契约推进到 schema 与 protocol 4、core protocol 7、Codex adapter protocol 7。健康的安装不等于已激活：已安装契约只声明手工新建任务路径，激活仍需要来自升级之后启动的任务的收据。
