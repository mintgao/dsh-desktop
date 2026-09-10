# 不发布即可检查桌面更新

[English](desktop-delivery-shadow.md) | 中文

## 摘要

桌面交付 CLI（命令行界面）让维护者检查上游版本并验证未签名桌面安装包。报告说明阻塞和下一步，不授权发布，也不通知用户。[交付决策](../decisions/20260908-desktop-delivery-shadow.zh.md) 规定证据要求。

## 目录

- [检查离线版本数据](#inspect-an-offline-release-fixture)
- [检查上游版本](#inspect-upstream-releases)
- [理解安装包证据](#interpret-package-evidence)
- [开发备注](#dev-note)

<a id="inspect-an-offline-release-fixture"></a>

## 检查离线版本数据

在已安装依赖的开发检出中开始。此命令只写入指定的两个临时文件：

```sh
pnpm run desktop:delivery discover --config .github/desktop-delivery/mint.json --lock .github/desktop-delivery/source-lock.json --fixture scripts/desktop-delivery/tests/fixtures/releases.json --out /private/tmp/dsh-shadow-discovery.json --summary /private/tmp/dsh-shadow-discovery.md
```

测试数据报告 `State: next`，指出 `dsh-v0.1.2-alpha.4`。这是该测试数据中下一个未记录版本，不代表最新公开版本。发现不会合并上游源码，维护者单独审查采用。

<a id="inspect-upstream-releases"></a>

## 检查上游版本

在线命令查询 GitHub 公开版本分页，并将标签解析为提交：

```sh
pnpm run desktop:delivery discover --config .github/desktop-delivery/mint.json --lock .github/desktop-delivery/source-lock.json --out /private/tmp/dsh-shadow-live-discovery.json --summary /private/tmp/dsh-shadow-live-discovery.md
```

`next` 指出按顺序的下一个采用候选；`current` 表示完整观察结果中没有更晚候选。`blocked` 表示获取不完整或版本证据不一致。修正原因后再明确重跑。网络失败不能证明应用已是最新。

<a id="interpret-package-evidence"></a>

## 理解安装包证据

[手动试运行工作流](../../.github/workflows/desktop-delivery-shadow.yml) 提供仅发现与未签名验证两种模式。验证将源码版本绑定到派发检出，在原生 arm64 和 x64 runner 上构建 DMG，仅当两者通过时组合报告。它使用与本地检查相同的 CLI。远程执行要求工作流已存在于 GitHub；本地测试不能证明 Actions 运行成功。

CLI 的 `candidate`、`smoke`、`artifact` 和 `combine` 命令生成源码、挂载安装包及组合证据。[可执行 CLI 测试](../../scripts/desktop-delivery/tests/delivery.spec.ts) 提供完整的测试数据调用。本地有修改的检出生成 `qualificationEligible: false` 的诊断。所有试运行报告都标记 `publicationEligible: false`，包括成功的干净双架构运行。

打包后端冒烟以只读方式挂载 DMG，使用临时应用数据，验证 Electron 启动加载、后端启动、带认证的本地 HTTP 和清理，不替换已安装应用。Developer ID 签名、公证、已安装客户端升级和通知送达需要单独验收。

<a id="dev-note"></a>

## 开发备注

无。
