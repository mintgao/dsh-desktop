# 发布策略证明

[English](README.md) | 中文

本目录归属 owner-authenticated policy 文件；它们决定不可逆的上游采纳动作是否允许执行。只要这些文件没有描述一个 active 且当前仍匹配的策略，finalization、tag 创建和 publication 就会 fail closed。

## 文件

- `activation.json` 是持久 bootstrap record。已提交的默认值保持为 `{"schemaVersion":1,"status":"unconfigured"}`，直到受限 activation PR 引入真实 signer identity。
- `receipt.json` 与 `receipt.json.sig` 默认不提交。生产 activation 会通过同一仓库内、由 owner 授权并使用 squash merge 的 PR 引入它们。
- `receipt.example.json` 是给本地测试和运维评审使用的 schema 形状示例。它绝不携带真实 ID、secret 或 signer 材料。
- `generator.example.json` 是实时事实生成器的输入形状。请把它复制到提交树之外，替换所有占位符，且绝不加入 private key 材料。

## 授权与续期规则

- activation 与 receipt 续期都只允许 squash merge。runtime 会拒绝 merge commit、rebase、fast-forward、fork PR，以及任何 `mergeSha == headSha` 或 merged tree 与 PR head tree 不同的合并结果。
- receipt bundle digest 使用 Accepted 决策中的准确 domain-separated framing：ASCII domain、NUL、u32be version，然后是 receipt 与 signature 两个条目；每个条目再以 u32be path length 和 u64be content length 编码。
- activation record 固定 signer public key 与 rotation chain。receipt 续期只能为当前 activation 推进下一个 sequence；同 sequence 替换和 protected-state rollback 都会被拒绝。
- 对单个 activation 而言 signer key 不可变。key rotation 是单独的 activation 变更；其 `previousActivation` 必须准确链接受保护的 activation 与 receipt 状态。旧 key 使用 `dsh-mint-release-policy-rotation-v1` namespace 签署规范 `rotation-statement` 字节，owner-authorized rotation PR 再同时更改 activation、receipt 与 receipt signature。

## 运维检查表

1. 首次 activation 时，准备一个只改动 `activation.json`、`receipt.json` 和 `receipt.json.sig` 的受限 PR；续期时则只改 `receipt.json` 和 `receipt.json.sig`。
2. 使用具备 administrator 范围的 `GH_TOKEN` 运行 `pnpm exec tsx scripts/upstream-adoption/generate-policy-bundle.ts <config> .github/release-policy/activation.json .github/release-policy/receipt.json`。生成器会读取当前 repository、App installation、受保护 environment、secret name、含 bypass actor 的 ruleset 及 workflow 字节，但绝不读取 secret 值。
3. 运行 `ssh-keygen -Y sign -f <private-key> -n dsh-mint-release-policy-v1 .github/release-policy/receipt.json` 对准确的 receipt 字节签名。private key 必须留在 repository 和 GitHub environment 之外。
   轮换时，先运行 `pnpm exec tsx scripts/upstream-adoption/cli.ts rotation-statement .github/release-policy/activation.json <output>` 生成 approval payload，使用旧 key 与 `dsh-mint-release-policy-rotation-v1` namespace 签署准确字节，把 armored signature 写入 `previousActivation.approvalSignature`，再重新生成 bundle。
4. 由当前个人仓库 owner 使用 GitHub squash merge 合并受限 PR。首次 activation 时，先用占位文件创建 PR 以取得待绑定的编号，再在批准前替换并签名生成文件。
5. 运行 `Verify Mint release policy`，在不改动任何状态的前提下确认 repository identity、App permission、workflow digest、ruleset 观察、signature 有效性，以及受保护 policy state 的单调性。
6. 任何 expiry、digest drift、ruleset 变化、environment secret-name 变化或 App permission drift 都应视为 `policy-drift` blocker；在恢复不可逆自动化前先刷新 receipt。

`mint-finalizer` 只包含 `MINT_FINALIZER_APP_PRIVATE_KEY`，`mint-publication` 只包含 `MINT_PUBLISHER_APP_PRIVATE_KEY`。unsigned-preview 模式下 `mint-signing` 可以为空；启用 signed 模式后，它只能包含 verifier 规定的五个 Apple credential 名称。所有 environment 都只允许受保护 branch。

这些文件记录的是 runtime App 无法在 GitHub 上通过最小权限直接读取的管理面事实。请让它们保持准确、简洁且便于评审。
