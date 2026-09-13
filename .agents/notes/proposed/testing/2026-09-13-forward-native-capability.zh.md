# Agent Note: 更新验收前的原生 GUI 能力检查

Status: proposed

[English](2026-09-13-forward-native-capability.md) | 中文

## 问题

安装包后台冒烟检查不能证明托管 Mac 能观察正常桌面窗口或通过应用菜单退出。缺少这些能力时，耗时的更新验收无法成功。

## 提议

构建下一目标前，使用经过认证的保留文件执行[有界能力检查](../../../../docs/decisions/20260913-forward-native-capability.zh.md)。结果仅用于诊断，保留[审核后交付](../../implemented/process/2026-09-08-reviewed-desktop-release-delivery.zh.md)与[影子证据](../../implemented/process/2026-09-08-desktop-delivery-shadow.zh.md)的授权区分；不取代这两个现有决策。

## 已考虑的替代方案

将调试器驱动的启动当作普通启动会测试不同路径。通用 GUI 运行器会在主机能力未知时扩大任务。应复用现有按 PID 定位的辅助功能适配器。

## 验收标准

固定架构及安装包正常打开、提供已渲染内容、通过应用菜单退出，并在时限内重开重复验证。身份错误、访问缺失及清理失败须明确呈现，不能使发布验收通过。

## 风险

托管环境可能无法使用辅助功能。失败后停止依赖它的验收，不授予权限，也不以注入观察替代。能力检查通过后，真实更新及公开交付仍未完成验收。
