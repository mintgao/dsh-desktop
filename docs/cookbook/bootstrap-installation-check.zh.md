# 检查初始桌面安装

[English](bootstrap-installation-check.md) | 中文

## 前提条件

遵循[经审查的交付决策](../decisions/20260908-desktop-reviewed-delivery.zh.md#bootstrap-installation-evidence)。受保护基线不得包含源码锁或常规交付工作流。安装 PR 保持打开。准备完整的管理员迁移证明，并将实际最后发布的桌面资产及校验和文件下载到持久证据目录。这些检查需要仓库、Actions、版本和管理员控制的读取权限，不执行远程写入。

## 记录已完成的先前引导

1. 保留显式上下文 JSON，包含 `schemaVersion: 1`、`purpose: desktop-bootstrap-installation`、`repository`、数值 `repositoryId`、数值 `pullRequest`、`baseBranch`、`baseCommit`、不可变 `tag`、`seedCommit`、`seedTree`、数值 `runId` 和数值 `attempt`。使用已完成的引导定稿尝试，而非草稿探测。每个身份都必须匹配实时 GitHub 证据。
2. 运行 `pnpm run desktop:delivery migration-preflight --config .github/desktop-delivery/mint.json --lock /path/to/legacy-lock.json --bundle /path/to/assets --admin-evidence /path/to/admin.json --bootstrap-context /path/to/prior-context.json --baseline-output /path/to/baseline.json --out /path/to/migration-report.json`。
3. 检查报告。只有显式验证的安装 PR 归入 `bootstrapInstallation`；其他待处理采用仍然阻塞。不提供 `--bootstrap-context` 时，安装 PR 仍待处理。读取失败、树不完整、机器人身份错误、定稿作业跳过和源码谱系变化都会拒绝分类。

## 合并前检查后继版本

1. 将成功基线和迁移报告的精确字节保留在经审查的后继种子中，并提供基线、报告和配置摘要匹配的启用记录。从新的不可变引导标签获取机器人实质性源码锁定稿。不得仅为指向包含证据的后继提交而重写历史证据。
2. 为已完成的后继尝试保存新上下文。在包含精确已审查文件的检出目录运行以下命令；配置和迁移报告路径必须解析到 `--root` 内。

```sh
pnpm run desktop:delivery bootstrap-installation-check \
  --root /path/to/reviewed-checkout \
  --config /path/to/reviewed-checkout/.github/desktop-delivery/mint.json \
  --migration-report .github/desktop-delivery/migration-report.json \
  --lock /path/to/legacy-lock.json --bundle /path/to/assets \
  --admin-evidence /path/to/admin.json \
  --bootstrap-context /path/to/successor-context.json \
  --out /path/to/external-installation-check.json
```

3. 要求 `state: installation-verified` 和实际最终提交。外部结果绑定保留证据摘要及观察时间。它验证嵌入字节、刷新管理员控制及待处理采用，并下载实际版本资产验证哈希。普通下载计数不会使发布身份失效；版本来源、资产、控制、基线或最终提交变化需要纠正并重新检查。
4. 验证实际机器人最后推送者身份及所有者审查资格，然后取得该最终提交所需批准和分支检查。观察不预留远程状态，也不取代这些要求。任何实质变化都会使其失效。已安装的常规工作流禁用新安装检查；启用验证仍可读取保留的历史分类。
