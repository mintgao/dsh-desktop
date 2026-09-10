# 桌面交付试运行验证

[English](verification.md) | 中文

## 候选与所有权

[工作简述](brief.zh.md) 定义 SH-1–SH-7。Tech Lead `distribution_design` 编写[已接受决策](../../decisions/20260908-desktop-delivery-shadow.zh.md)；另一位审查者 `distribution_review` 批准该决策及认证就绪修订。协调者在原生修改前重新开启并确认就绪。RD `shadow_implementation` 负责实现；独立 QA 负责最终验收及一次配置默认验证。

基线为带本地修改的 `507e5beb4f76b7e7dd9f4986ab7d88ff1b2eb936`。现有 onboarding、HMR 和 spill 测试修改及未跟踪开发目录属于无关内容，均保留。本地报告是诊断，不是干净提交的合格证据。未执行推送、合并、发布、工作流派发、通知、凭证修改或安装。

## 开发证据

| 检查 | 结果 | 证据范围 |
|---|---|---|
| 针对性桌面、交付试运行及现有工作流测试 | 通过：10 文件、60 测试 | RD 报告；源码 CLI、身份与版本失败、产物改动、两份配置、原生就绪及诊断脱敏 |
| 限定 oxlint 与宿主 TypeScript | 通过 | RD 对受影响源码执行的命令 |
| 在线公开上游发现 | 通过 | 观察到十二个公开版本；alpha.4 是已记录 alpha.3 基线后的下一个有序候选，不是最新版本 |
| 候选命令 | 通过，仅诊断 | 确切 HEAD、上游祖先及 workspace 版本与依赖检查；有修改检出正确保持不合格 |
| 源码暂存与未签名 ARM64 DMG 构建 | 通过 | 现有 `desktop:stage` 与显式未签名 electron-builder 调用，不发布 |
| 快速文档检查 | 通过：15 项检查 | 包括修正后的双语锚点 |
| 修复后 ARM64 挂载 DMG 冒烟及产物绑定 | 通过 | 启动加载、带认证 HTTP、后端关闭和卸载；DMG SHA-256 为 `a47fa900fa2f48de0d9744ab35bff5075acd0196c86aa7ee83c075bdb3973a48` |
| 完整文档同步 | 通过：32 项检查 | 双语配对、链接、源码文档及站点检查 |
| 最终独立 QA 与默认验证 | 通过：SH-1–SH-7；四项配置检查 | Lint、类型、测试和构建通过；1,069 个测试文件及 17,317 项测试通过，9 个文件及 116 项测试按条件跳过 |

第一次真实 DMG 冒烟复现了桌面解析器对上游认证根 URL 超时。获批修复保留该 URL 并脱敏诊断。第二次冒烟到达 HTTP，暴露出测试工具假定 302，而 BrowserAuth 实际输出 303；测试工具修正保留带认证的同源交换和最终 HTML 验证。失败尝试不是合格证据。

沙箱尝试遇到本地 tsx IPC 限制与打包 DNS 限制。观察到环境失败后使用相同命令在宿主重试，保留产品断言。诊断命令日志和报告位于 `/private/tmp/dsh-shadow-*`，不属于公开产物。

## 独立验收

QA `shadow_qa` 独立复现并验证多行阻塞摘要修复，比较真实挂载 DMG 载荷与重新构建的原生入口，未发现范围内剩余缺陷。打包入口 SHA-256 为 `749e7c080fddeb6f6dfbf56aa60da70acbd3c2be89151127ef7ef5ae6b489ddd`。SH-1–SH-7 在附加本地范围内通过。

第一次默认运行受沙箱 IPC 与回环限制而失败，随后自行结束，没有终止进程。相同命令的宿主重试通过类型、测试和构建，但发现三处测试格式 lint 错误。RD 只修正回调格式，并检查实际仓库 lint wrapper。QA 随后对最终未变化候选执行 `./bin/vibe verify . --format json`：schema 2、`default`、`all-configured`，四项检查通过且无失败。最终已跟踪差异摘要为 `554e7dcecc331f5f8b0ca4a745543a4260e4a35629ff9d58afdfa68e3fc8f15f`；限定源码复查无漂移。只有最后这份回执证明默认检查成功。

回执位于 `/private/tmp/dsh-shadow-qa-default-final.json`、`/private/tmp/dsh-shadow-qa-final-candidate-state.json` 和 `/private/tmp/dsh-shadow-qa-packaged-parser.json`。后续修改只记录验证和状态，实现保持冻结。

## 限制

原生 x64、远程 Actions 执行、Developer ID 签名、公证、已安装客户端替换、用户数据迁移及通知送达均未执行。新增工作流手动触发，对仓库状态只读。现有生产写入者和控制继续生效；本阶段不代表拟议生产迁移已完成。
