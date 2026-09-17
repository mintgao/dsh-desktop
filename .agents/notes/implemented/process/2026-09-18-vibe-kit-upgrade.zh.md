# Agent Note: Vibe Kit 升级到 0.9.0

Status: implemented

[English](2026-09-18-vibe-kit-upgrade.md) | 中文

## 问题

仓库安装的 Vibe Kit 是 0.3.0，而 kit 的规范仓库已发布 0.9.0，项目运行的工作流规则、技能与 agent 定义落后当前发行版六个小版本。0.9.0 的托管块比 0.3.0 更大：它增加了宿主接管生命周期、技术决策就绪与适配规则。合并后根 `AGENTS.md` 从 2209 词增至 2870 词，超过 [doc-budgets.manifest.json](../../../../scripts/doc-budgets.manifest.json) 中的 2210 词上限，因此强制门禁 `verify-doc-budgets` 失败，尽管项目自有指令一个字都没有变。

## 决策

以升级方式采纳 v0.9.0 的规范 GitHub 发行包：先校验传输归档的 SHA-256 与 payload 树摘要，再由目标 payload 自带的 CLI 负责 `plan upgrade`、`upgrade` 与首次 doctor。升级保持项目自有字节不变：根 `AGENTS.md` 的 1953 个项目词保持不变，`.vibe/onboarding.json` 字节保真，不手工接受任何托管冲突。根 `AGENTS.md` 的上限精确上移托管块的增量，由 2210 改为 2871，使该文件保持框架变更前的余量；不通过压缩项目规则来吸收框架块，也绝不手工编辑托管块，因为 kit 会认证其字节区间。安装健康由已安装 CLI 的 doctor 证明；其后的接管阶段仍归宿主所有，本次变更不主张其中任何一项。

## 考虑过的替代方案

- 压缩项目自有指令，使旧上限继续成立。
- 裁剪或手工编辑框架托管块以适配预算。
- 框架更新后让 `verify-doc-budgets` 保持失败。
- 继续使用 0.3.0，把升级推迟到后续需求。

## 后果

上限自此跟随框架块，后续每次 kit 升级都重复同样的增量计算，而不是悄悄重新给项目文案定预算。本次升级新增纳入版本控制的安装文件（`AGENT_INSTALL.md`、`agent-install.json`）、`vibe-release` 技能、`vibe-tech-lead` agent 与 `.vibe/core/technical-decision-readiness.md`。健康的安装不等于已激活：就绪仍需宿主激活收据，本次变更不产生该收据。
