# 参与 DSH Desktop 开发

[English](CONTRIBUTING.md) | 中文

DSH Desktop Mint 是基于 DeepSeek Harness 构建的非官方下游发行版。本仓库接受桌面应用以及该应用依赖的 Harness 代码变更，但不表示获得 DeepSeek 的背书、合作或授权。

贡献流程既要让下游应用保持可发布，也要保留一条可审查的官方源码同步路径。

## 仓库模型

- `origin` 是 `https://github.com/mintgao/dsh-desktop.git`，它持有下游代码与桌面版发布。
- `upstream` 是 `https://github.com/deepseek-ai/deepseek-harness.git`，它是 DeepSeek Harness 更新的来源。
- `main` 只包含可发布的下游代码。所有工作通过聚焦的分支与 Pull Request 进入。

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

[`upstream-sync.yml`](.github/workflows/upstream-sync.yml) 每天检查最新的上游 `dsh-v*` 发布，也可以用指定上游 ref 手工触发。若下游尚未包含该版本，工作流会把对应提交合并到专用 `chore/sync-upstream-*` 分支，并创建带预填 PR 对比链接的跟踪 Issue。这样可以让仓库级 Actions 默认权限保持只读，同时把 Pull Request 创建动作留给维护者。工作流绝不会解决冲突、合并 Pull Request、修改桌面版本或发布版本。

手工同步也要使用相同的专用分支模式，使桌面改动与工作流保护保持可审查：

```sh
git fetch upstream
git switch main
git pull --ff-only origin main
git switch -c chore/sync-upstream-YYYY-MM-DD
git merge --no-ff upstream/master
```

在同步分支解决冲突，按变更文件运行匹配的检查，再通过 Pull Request 合入。应分别审查上游源码变更与后续的桌面发布决策。不得强推 `main`，也不得改写已发布的 `desktop-v*` 标签。

## Pull Request 与发布

- 在 Pull Request 模板中说明用户可见结果，只列出实际运行的检查，并标记受影响的 Mac 架构。
- 无关变更应拆成不同 Pull Request。每项非平凡的代码、流程或发布决策都要更新其所属文档与 Agent Note。
- 本地打包、未签名预览版、签名稳定版与已安装客户端更新流程见[桌面应用参考](apps/desktop/README.zh.md)。公开产物只能由标签驱动的发布工作流生成，并在维护者审查对应通道的 DMG、元数据、发布说明与校验和之前保持草稿状态。
