# 参与 DSH Desktop 开发

[English](CONTRIBUTING.md) | 中文

DSH Desktop Mint 是基于 DeepSeek Harness 构建的非官方下游发行版。本仓库接受桌面应用以及该应用依赖的 Harness 代码变更，但不表示获得 DeepSeek 的背书、合作或授权。

贡献流程既要让下游应用保持可发布，也要保留一条可审查的官方源码同步路径。

## 仓库模型

- `origin` 是 `https://github.com/mintgao/dsh-desktop.git`，它持有下游代码与桌面版发布。
- `upstream` 是 `https://github.com/deepseek-ai/deepseek-harness.git`，它是 DeepSeek Harness 更新的来源。
- `main` 只包含可发布的下游代码。人工变更通过聚焦的分支与 Pull Request 进入；上游引入工作流是有文档记录的例外，并且只有发布检查全部通过后才会直接推送。

## 首次检出

安装 Git 与 Node 版本管理器，然后使用 [`.node-version`](.node-version) 指定的 Node 24。Corepack 会从 `package.json` 读取准确的 pnpm 版本。

```sh
git clone https://github.com/mintgao/dsh-desktop.git
cd dsh-desktop
git remote add upstream https://github.com/deepseek-ai/deepseek-harness.git
corepack enable
pnpm install --frozen-lockfile
pnpm run test:desktop
pnpm run build:desktop
```

两个桌面版命令都成功即表示检出目录可以开发。真实后端启动还需要环境变量或被忽略的根目录 `.env` 文件提供 `DEEPSEEK_API_KEY`。

## 跨设备工作

- 只通过 Git 在电脑之间传递源码。不要把活跃检出目录放进 iCloud Drive、Dropbox 或其他文件同步目录。
- 每台电脑都独立安装依赖和构建。不得在不同架构或操作系统之间复制 `node_modules`、`apps/desktop/backend`、`lib` 或 `dist`。
- 离开一台电脑前，提交语义完整的变更并推送对应分支。临时工作可以在该分支上使用明确标记的 WIP 提交。
- 在另一台电脑上编辑前，运行 `git fetch origin --prune`，切换到同一分支，再运行 `git pull --ff-only`。
- 保持 `main` 干净。人工变更使用 `feat/<topic>`、`fix/<topic>`、`docs/<topic>` 或 `chore/<topic>`，由 Codex 持有的分支使用 `codex/<topic>`。
- 跨电脑或 Agent 继续自动上游任务前，先读取 [`.github/upstream-sync-state.json`](.github/upstream-sync-state.json)、对应 Git 提交与 Release 说明，以及所有未关闭的 `Blocked: adopt DeepSeek Harness ...` 或 `Desktop release withdrawn: ...` Issue。

## 依赖与生成文件规则

- `pnpm-lock.yaml` 是依赖事实来源，依赖变更必须同时提交它。普通环境搭建使用 `pnpm install --frozen-lockfile`。
- 仓库通过 `.gitattributes` 保存 LF 文本；不要在不同设备上自行统一换行符。
- 不得提交构建产物。根目录 `.gitignore` 持有当前生成文件与本地状态排除项。
- 先运行覆盖变更的最小检查，再于推送前运行 `pnpm run typecheck`。文档变更还要运行 `pnpm run doc-sync`。

## 密钥与本地状态

- 不得提交 `.env`、DeepSeek API key、Apple 证书、App Store Connect 密钥、会话数据或看似脱敏但来自真实凭据的副本。
- `~/.dsh` 属于本地用户，不通过本仓库同步。只有在备份经过加密且访问受控时，才能单独备份它。
- GitHub Actions 只能通过桌面发布工作流中列出的加密仓库 Secrets 获取发布凭据。
- 分享日志与 Issue 附件前，必须移除凭据、个人会话内容与私有 workspace 路径。

## 同步上游

[`upstream-sync.yml`](.github/workflows/upstream-sync.yml) 每小时两次检查上游已经公开的 `dsh-v*` Release，并按发布时间逐个引入。对于每个版本，它会取得准确标签，直接合并到 `main`，运行桌面测试与构建、仓库类型检查、文档检查和生成差异检查，并把引入结果写入 [`.github/upstream-sync-state.json`](.github/upstream-sync-state.json)。默认的 `DESKTOP_RELEASE_SIGNING_MODE=unsigned-preview` 阶段会追加 `unsigned.1` 预发布后缀，原子推送引入提交与标签，并把未签名的 arm64、x64 DMG 发布为 GitHub Pre-release。只有维护者明确确认并切换到 `signed` 后，工作流才会恢复准确版本映射、要求 Apple 签名与公证 Secret，并允许稳定更新产物或 Latest 发布。

工作流每次只推进一个上游 Release。合并冲突或检查失败会在任何下游推送前停止，并创建或更新带失败运行链接的 `Blocked: adopt DeepSeek Harness ...` Issue。应在普通分支上修复这个准确版本，把修复合入 `main` 后重新运行工作流；如果标签已经推送而发布中断，下一次运行会重新触发缺失的 Release。状态文件、Git 历史、工作流运行、Release 说明和阻塞 Issue 共同组成跨机器、跨 Agent 的交接记录。

手工同步也要使用相同的专用分支模式，使桌面改动与工作流保护保持可审查：

```sh
git fetch upstream
git switch main
git pull --ff-only origin main
git switch -c chore/sync-upstream-YYYY-MM-DD
git merge --no-ff upstream/master
```

在同步分支解决冲突，按变更文件运行匹配的检查，再通过 Pull Request 合入。不要手工推进状态文件或创建桌面标签；重新运行上游引入工作流，由它一致地记录并发布队首版本。不得强推 `main`，也不得改写 `desktop-v*` 标签。

## Pull Request 与发布

- 在 Pull Request 模板中说明用户可见结果，只列出实际运行的检查，并标记受影响的 Mac 架构。
- 无关变更应拆成不同 Pull Request。每项非平凡的代码、流程或发布决策都要更新其所属文档与 Agent Note。
- 本地打包、未签名小范围预览版、显式签名发布切换、已安装客户端更新和版本撤回流程见[桌面应用参考](apps/desktop/README.zh.md)。由上游驱动的标签会在当前发布阶段要求的检查全部通过后自动公开发布；手工推送的桌面标签仍会为例外发布创建草稿。
