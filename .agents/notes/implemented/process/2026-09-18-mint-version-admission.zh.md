# Agent Note: 让独立版本的 Mint 包通过依赖布局检查

Status: implemented

[English](2026-09-18-mint-version-admission.md) | 中文

## 问题

`pnpm run verify-npm-install-layout` 在本工作区以 `@deepseek-ai/dsh-desktop-mint has no workspace version 0.1.5-rc.2` 中止。该检查器从工作区合成两个互不兼容的 DSH 发布，并要求每个 `@deepseek-ai/dsh*` 包都带工作区版本，而已接受的版本化组装决策给予 Mint 包独立版本。同一作业在已合并的 RC2 主页 PR 上失败，因此 `main` 上也失败。同一验证通道还有两个较小的问题：隔离交付 CLI 夹具的子进程把 30 秒预算花在 pnpm 的注册表更新检查上；配置的验证测试命令在没有任何构建产出它所读取的 bundle 之前就运行了语料导入扫描。

## 决策

布局检查器把独立版本的 Mint 包视为合成发布族之外的成员：`buildDualDshRegistry` 接收被排除的包名，将其注册表条目原样带过，而官方 `@deepseek-ai/dsh*` 包保留严格的工作区版本要求。包名来自 `mintPackageNames`，由 `scripts/desktop-assembly.ts` 从 `verifyMintCoupling` 已使用的同一份 `MINT_PACKAGES` 清单派生，因此两个消费者不会漂移。单元测试把官方包拒绝保留为反例。

交付 CLI 夹具把 `update-notifier=false` 写入它自己的 `.npmrc`；此前 `pnpm-workspace.yaml` 中的键在 pnpm 11 下没有阻止该检查，于是子进程的 `pnpm install` 一直等待注册表请求直到夹具期限。`.vibe/project.yaml` 中配置的验证 `test` 命令现在先运行 `pnpm run build:lib` 再运行 `pnpm run test`，这正是语料导入扫描所读取的依赖。

## 考虑过的替代方案

- **提高夹具的子进程期限。** 这会把网络请求留在路径里并拖慢每次运行；夹具自身的注释已声明要避免该更新检查。
- **让 Mint 包以独立版本留在族内。** 合成发布的存在意义是在同一个发布族内暴露跨版本放置错误；拥有自己版本线的包不是该族成员，把它克隆成两个合成版本会错误描述已发布的布局。
- **把语料扫描从单元通道移除。** 原则上正确，因为消费产物的门禁属于产物通道，但这会在通道间搬动测试并触及 CI；改为记录为后续工作。

## 后果

依赖布局作业可以在 Mint 包带独立版本的工作区上通过，而真实的 Mint 版本漂移仍会通过官方族检查、耦合检查与测试中的反例失败。夹具不再依赖机器的注册表可达性。默认验证运行现在会在单元通道前构建库平面，因此耗时增加；在带过期构建产物的树上直接运行 `pnpm run test` 仍可能使语料扫描失败，把该扫描迁移到产物通道仍是未完成项。
