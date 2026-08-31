# 上游采纳控制平面

[English](README.md) | 中文

本目录归属事务化上游采纳 workflows 在修改任何长期 GitHub 状态之前必须校验的仓库侧 manifest（清单）。

## 文件

- `apps.json` 固定三个 GitHub App 角色、各自要求的 environment，以及 runtime preflight 期望的准确 permission 集。
- `rulesets.json` 声明 `main`、受保护状态 ref、candidate branch 和不可变 `desktop-v*` tag 所需的 branch / tag ruleset 形状。
- `protected-paths.json` 列出 candidate 一旦改动就必须获得准确 head maintainer approval 的 control-plane 文件。
- `.github/workflows/upstream-adoption-observer.yml` 把 validation、finalization、publication 与定时 Controller run 的失败转换为一次受保护的失败状态变更。如果该变更无法通过认证并提交，它会要求 Controller 停用定时任务并投射一个熔断 Issue，避免继续产生重复失败 run。

## 运维规则

- 这些 manifest 需要与归属它们的 workflow、`scripts/upstream-adoption/**` 以及 `scripts/desktop-workflows.spec.ts` 一起修改。workflow 测试就是已提交 Actions 定义仍与 manifest 对齐的本地契约。
- Controller App 只能写活动 candidate branch 和普通 PR / Issue 状态。它绝不写 `main`、受保护状态 ref 或不可变 desktop tag。
- State Finalizer App 是 `refs/heads/automation/upstream-adoption-state`、`main` fast-forward 以及 `desktop-v*` tag 创建的唯一自动化写入者。
- Publisher App 只能修改 GitHub Release。它没有 branch / tag bypass，也没有 Apple 签名凭证。
- `mint-finalizer`、`mint-publication` 与 `mint-signing` environment 只允许 protected branch。手工 validation 与 publication workflow 必须从 `main` dispatch；把 desktop tag 选作 workflow ref 无法进入包含 secret 的 job。
- 每个 policy-verification step 都提供其 token-minting step 所用的同一 App ID 与 private-key secret。runtime facts 使用内存中的 App JWT 读取 repository-installation identity 与 permission，repository 操作则继续使用 installation token。
- 持久化 failure fingerprint 会让未变化的确定性轮询成为成功 no-op。Controller 只在 phase 或 fingerprint 变化时编辑同一个 blocker Issue，并且只在公开 Release 与受保护 cursor 都验证通过后关闭它。
- Candidate 归属由准确 head 上、Controller App 创建的 commit status 认证，而不是由 Git author 文本判断。其他任何 head、任何 protected-path 变更或已解决冲突，都需要具备 `maintain` 或 `admin` 权限的 collaborator 对当前 head 给出 approval；approval 变化是只唤醒 Controller 一次的权威输入。
- Observer 只会在 publication workflow 真正成功结束后触发完成动作。Finalizer 随后下载全部公开 asset，重新校验 digest 与公开 release notes，再推进 cursor；因此已经公开且有效的 Release 可以不重建而恢复。
- 冲突恢复请求存放在 candidate branch 上的 `.github/upstream-adoption-requests/<sanitized-upstream-tag>.json`。它们是精确冲突 head 上的证据，不是本目录中的持久配置。

## 启用生产自动化前

1. 创建这些 manifest 命名的三个 App 与受保护 environment。
2. 在隔离 branch commit 上运行 `pnpm exec tsx scripts/upstream-adoption/cli.ts seed-state <verified-baseline> <output>`，为 `automation/upstream-adoption-state` 建立初始状态。推送初始 commit 前，必须验证 legacy upstream Release、desktop tag、tag commit、公开 Release 与 evidence digest。
3. 安装 `rulesets.json` 描述的准确 ruleset。`main` 和状态 ref 都要求 PR review；只有 Finalizer App 能 bypass 状态规则，Controller 与 Publisher 都没有 `main` 或 tag bypass。
4. 在携带真实 signer key 和初始签名 receipt 的受限 activation PR 合入前，让 `.github/release-policy/activation.json` 保持 `unconfigured`。
5. activation 完成后运行 `Verify Mint release policy` workflow，使仓库能够在不改动状态的前提下证明 owner-authenticated policy。只有 preflight 成功后才启用 `UPSTREAM_ADOPTION_ENABLED`。

本目录任一文件的改动都属于 control-plane change。candidate validation 与 finalization 都要求新的、针对准确 head 的 maintainer approval，之后新策略才能进入 `main`。
