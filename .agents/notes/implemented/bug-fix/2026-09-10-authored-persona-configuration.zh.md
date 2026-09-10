# Agent Note: 通过解析器规范化保留用户 persona 配置

Status: implemented

[English](2026-09-10-authored-persona-configuration.md) | 中文

## Problem

通过公开预设接口复制的已交付 standard 预设保留 `persona.config.text`。目标发现不变的用户文件，但因要求 `prefix` 而拒绝 persona 行；替换文件会违反用户输入保留要求。

## Decision

在可复用 persona 解析器中落实[已接受的兼容性决策](../../../../docs/decisions/20260910-persona-authored-preset-compatibility.zh.md)。决策统一定义准确输入及拒绝语义和有限的静态配置目录扩展。无密钥录制会话场景覆盖作用域内旧版 persona 加载，以及已持久化种子子会话的冷查询。

## Alternatives considered

Loader 适配器增加解析顺序归属；改写预设或替换为当前内置预设丢弃用户输入。由所属解析器规范化可保留字节，并保持原生和会话处理不变。

## Testing

测试覆盖实际已交付基线的用户预设复制、目标新会话及重启的 persona 语义和已记录系统内容、文件不变，以及完整基线恢复。实现同时提供解析器、作用域清理、非 Mint 封装解析、目录和无密钥快照检查。

## Consequences

存在歧义的 text/prefix/suffix 混合输入必须在默认值掩盖字段存在性前失败。保留完整文本及显式空后缀，不承诺跨运行时完整提示相同。将补丁记录为上游贡献候选；提交仍需单独授权。
