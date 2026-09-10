# Agent Note: Preserve authored persona configuration through parser normalization

Status: implemented

English | [中文](2026-09-10-authored-persona-configuration.zh.md)

## Problem

A delivered standard preset copied through the public preset API retains `persona.config.text`. The target discovers the unchanged authored file but refuses its persona row because it requires `prefix`; replacing the file would violate authored-input preservation.

## Implementation

Implement the [Accepted compatibility decision](../../../../docs/decisions/20260910-persona-authored-preset-compatibility.md) in the reusable persona parser. The decision owns exact input/refusal semantics and the narrow static configuration-catalog extension. The keyless recorded-session scenario covers scoped legacy persona loading and a cold persisted seeded-child query.

## Alternatives considered

A loader adapter adds resolution-order ownership; rewriting presets or substituting current built-ins discards user inputs. Normalization in the owning parser preserves bytes and leaves native and session processing unchanged.

## Acceptance criteria

Prove actual delivered-baseline authored copy, target new-session/restart persona semantics and logged system content, unchanged files, and complete baseline recovery. Parser, scoped-disposal, non-Mint packed resolution, catalog and keyless snapshot checks accompany the implementation.

## Risks

Ambiguous mixed text/prefix/suffix input must fail before defaults hide field presence. Preserve full text and explicit empty suffix without promising identical complete prompts across runtimes. Track the patch as an upstream contribution candidate; submission remains separately authorized.
