# 实施报告

[English](implementation-report.md) | 中文

## 候选与归属

RD 实施[已接受简报](brief.zh.md)，并遵守[已接受决策](../../decisions/20260913-desktop-versioned-assembly.zh.md)范围。隔离工作区为 `/private/tmp/dsh-desktop-rc2-plugin-assembly`，分支为 `codex/desktop-rc2-plugin-assembly`，基线为 `8e1df6fd25166943e6105859832b42a4da258755`。精确上游提交 `fb2c4b9e698e30edb738bca4cf0618587db7d203` 已无冲突合入；编排者已将初始候选提交为 `024eaa1dd70cb741249e70faf15491610d041fbc`，修正改动等待新的本地提交。原恢复工作区改动未受影响。

## 改动

- 将上游 CLI 依赖、随附 profile 模板及其所属文档/测试恢复为 RC.2 原始字节。Mint 仍位于自有软件包与原生目录。
- 用冻结的官方 npm 获取、已安装 tarball 完整比较、受限链接检查、单独 Mint 打包内容、依赖/export 验证及原子阶段替换，取代 `prepare-desktop-backend.ts`。外壳嵌入最终凭据摘要。
- 通过已安装 DSH 的公开 API 初始化原生自定义 profile，原子发布新 profile，拒绝不完整/中断状态，并在修复前检查冲突。就绪准入执行真实认证交换。打包模式拒绝 CLI 覆盖；package smoke 执行已编译的验证与初始化路径。
- 同步更新候选、原生 smoke、发布清单与 forward 验证者。实际安装组件包含完整性和来源；受保护 Mint 配置要求组装输入。历史测试配置保留早期策略。现有 CI 调用方先暂存，再绑定原生外壳。
- 更新下游策略、架构上下文、onboarding 证据、Mint 文档和保留的产品层 Agent Note。原归属理由仍有价值，因此未归档。已接受英文决策与就绪正文仅增加语言切换链接；中文对应文档保留其授权与范围。

## 聚焦证据

- `node --import tsx scripts/build-mint-plugins.ts`：通过，包含标准 Host 声明生成和 Mint TypeScript 编译。运行时打包不使用这些上游构建输出；开发类型检查仍使用仓库生成器。
- `node --import tsx scripts/prepare-desktop-backend.ts`：通过；582 个冻结官方输入，522 个按平台选择的已安装官方包，以及 2 个 Mint 包。每个已安装官方包都与通过完整性检查的 npm tarball 比较。
- `tsc -b apps/desktop-mint`、原生 tsdown、改动文件 oxlint 和 `tsc -p tsconfig.host.json --noEmit`：通过。
- 聚焦 Desktop、Mint、工作流和交付测试：104 项中通过 97 项；七个 forward 测试缺少新要求的组装证据。更新测试数据后，受影响 forward 与 assembly 文件全部 15 项通过，其余 18 个文件此前已通过。更早的 assembly/backend 聚焦检查全部 14 项通过。
- `node apps/desktop-mint/tests/fixtures/assembled-runtime.mjs`：在 host 回环权限及清理凭据的合成根目录下通过。证明纯 Web 排除 Mint、公开 Mint 初始化、现有清单不变、中断锁拒绝、冲突用户包保留、认证 HTML、实际公布的 Mint Client 资源，随后等待关闭完成。
- 八组指定双语文档与 `git diff --check`：通过。完整 `doc-sync` 留给 QA。
- 未签名 arm64 electron-builder 目录打包：通过。沙箱 DNS 和回环失败使用 host 权限原命令复跑；未关闭产品沙箱。

## 精确本地产物

本地应用为 `apps/desktop-mint/dist/mac-arm64/DSH Desktop.app`。运行时清单摘要为 `c9b70ef0aafc9516660d9b0c60cb2d9a895c0e11d2d47ba47da742a8a9961a3e`；`Contents/Resources/app.asar` SHA256 为 `d91e5a66638fa1fc64ddc1762bc27e7a4e6a6e20336fd774a238d76296d33184`。暂存与打包组装凭据的 SHA256 均为 `ef5db71ff7ac3c4bba190b7b052a5c4d5ddecd9265eff89d53ac38e441b94ea2`。

外壳源码摘要为 `84ebce2f2fd6af7ad541c51236987c296ca1a935b98208d3edf175420c83f3f6`。官方锁摘要为 `afa439f37a8b544b3884460a10634c6b474736958942aa4543ea048a95d348df`；描述符摘要为 `9157bc2a957d3bd51c93b41d5747b6a28226099de3ef215d530e2030295f9aa0`。运行时与外壳源码版本均为 `0.1.5-rc.2`；分别标识的 Mint 包版本仍为 `0.1.5-alpha.2`，凭据包含精确 tarball 完整性。

## QA 交接与限制

QA 负责 AC-1 至 AC-7，对不变候选恰好运行一次完整 `./bin/vibe verify .`，执行完整文档检查，以及真实打包 UI/无密钥会话/退出场景。当前安装的 CLI 不支持 `--format json`；保留受支持命令的输出作为验证证据。使用编排者提供并验证过的合成 Electron 隔离方法；仅改变普通 HOME 不能证明 macOS 隔离。RD 未启动普通打包 UI。

[source-lock 提案](source-lock.proposal.json) 包含精确 RC.2 观察，不包含机器人最终确认证据。已发布的 `.github/desktop-delivery/source-lock.json` 保持不变。生产发布验证需要正常的已审核采用最终确认，以及 source-lock/组装匹配；本地打包不等于发布、用户安装、旧数据迁移验收或产品验收。依赖签名身份的通知、真实模型调用、DMG 生成和已安装用户替换仍未验证。未执行完整默认验证、全局记忆更新、远程推送、发布或已安装应用替换。

## 独立 QA 后的修正证据

[QA 报告](verification.zh.md) 保留 `024eaa1` 的事实记录。RD 通过等待完整初始化操作，修正了打包 smoke 的同步失败处理，包括 CLI 覆盖和内嵌凭据检查。持久化的 `test:desktop:packaged` fixture 使用隔离的原生路径执行编译后的应用，要求正常初始化在 30 秒内以 0 退出、非法覆盖以 1 退出。真实的 `test:desktop:assembly` fixture 现在会在源码 CI 和原生 qualification 暂存后执行，并采用环境变量允许列表。交付 fixture 显式提供必需的组装输入；版本不匹配 fixture 包含两个 Mint 清单，继续证明不一致的官方版本会被拒绝。

原样聚焦复跑的 catch-up 来源用例在 2.56 秒内通过，未修改超时或可靠性实现。修正后的交付、工作流和组装测试共 25 项全部通过；已有桌面工作流测试共 14 项全部通过。改动文件 oxlint、Host 类型检查、最终 `npm run desktop:stage`、真实组装 fixture、未签名 arm64 目录打包，以及编译后打包应用的正反例 fixture 均通过。沙盒 IPC、回环监听、DNS 和 Electron SIGABRT 失败均以原命令提升到主机权限重试。Node 为 v22.22.3。精确产物一节标识此次重建后的修正应用。RD 未重复完整默认矩阵；QA 需要验证变化后的候选，包括同时篡改内容与凭据，以及最终文档同步。
