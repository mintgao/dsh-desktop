# 技术评审：恢复默认验证与依赖布局检查的绿灯

[English](technical-review.md) | 中文

结论：通过

## 已核对工件

- `docs/work-items/20260918-green-default-verification/brief.md`（就绪块、设计说明、风险）
- `docs/decisions/20260913-desktop-versioned-assembly.md`
- `docs/work-items/20260913-mint-rc2-release/brief.md`（Workspace version consistency）
- `scripts/verify-npm-install-layout.ts`
- `scripts/desktop-assembly.ts`
- `.vibe/project.yaml`

## 发现

无阻塞性发现。

适用性理由可信。已接受的决策确立了三个独立识别的输入，并要求同步更新生产者与校验器，且不得用工作区版本替代已安装版本。RC2 的 "Workspace version consistency" 一节已把独立版本规则扩展到强制 Mint 包采用官方根版本的工作区检查器，并带有本工作项重复的护栏：共享精确的 Mint 清单、保留官方包版本拒绝、测试变更后的行为。`scripts/verify-npm-install-layout.ts:70` 处的失败是同一类有界缺陷；让 Mint 包按原版本通过合成索引、同时对官方 `@deepseek-ai/dsh*` 包保留严格的工作区版本准入，是在重新界定成员范围而不是移除检查，保住了检查器的目的。AC-1 的反例使官方拒绝仍被测试，且共享清单与 `MINT_PACKAGES`（`scripts/desktop-assembly.ts:13`）一致，后者已被 `verifyMintCoupling` 使用。

两处伴随变更都是局部、可回退且在本工作项范围内的。在夹具内部禁用 pnpm 的注册表更新检查只影响被启动的子进程，不涉及范围之外的产品行为；工作项已说明夹具注释本就打算避免该检查。把配置的 `test` 命令（`.vibe/project.yaml:12`）改为在单元通道之前构建库平面是一行改动，它消除了过期产物失败，而没有抑制该扫描。

## 结论接受的风险

- 原样通过的 Mint 条目对合成消费者不可达（根依赖，`verify-npm-install-layout.ts:199-201`），因此布局检查不验证 Mint 放置；若某条变得可达，第 134 行会拒绝其独立版本。保守且可接受。
- 默认验证运行耗时增加；该构建是增量的。
- 在过期树上直接运行 `pnpm run test` 仍可能出现过期产物失败；迁移到产物通道仍是后续工作。
- 该豁免以精确的 Mint 清单为键，未复制 RC2 的重名护栏；由于注册表索引以名称为键，这可接受。

## 缺失证据

- 检查器的单元测试及其反例未附上；AC-1 与 AC-4 必须提供它们。
- 更新检查的夹具机制（`scripts/desktop-delivery/tests/operations.spec.ts`）未附上；AC-2 必须提供。
- 新的 `.vibe/project.yaml` 命令的确切内容，以及库平面构建是否产出语料扫描所读取的内容；AC-3 必须提供。
