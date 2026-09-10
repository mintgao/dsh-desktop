# Authored preset persona compatibility

Status: Accepted

English | [中文](20260910-persona-authored-preset-compatibility.zh.md)

## Authority and scope

Technical author: `preset_compat_decision`. Independent reviewer: `classification_review`, result `approved`, design only including the schema/catalog addendum. The [review record](../work-items/20260910-dsh-015-upgrade/preset-compatibility-review.json) binds proposal SHA256 `aa8c9d6f73aae19dfb92de7bd89d46a1ebea82cfb5f03bd43039d2b4d11121e8`. The [work item](../work-items/20260910-dsh-015-upgrade/brief.md) owns the separate implementation gate. This supplements [Mint target integration](20260910-desktop-mint-target-integration.md) for the exact delivered baseline `67406fc6af451f7f68874cb31c2d0f3242c0c8ad` and candidate incorporating target `b2e3b2a0125854567a4a5fcba75782e42fe84901`; it promises no arbitrary historical or third-party compatibility.

The [synthetic reproduction summary](../work-items/20260910-dsh-015-upgrade/preset-compatibility-evidence.json) records a baseline public preset copy and real Agent turn, target discovery followed by missing `$.prefix` mount failure, and restored-baseline resume and turn. Preset SHA256 `f04fbc6ec6d38aab78f18690c293ddcb76293107f7e6cd157904b7c0e83094bd` and settings SHA256 `3b510aa4e6656308e2df44d418777ceb40cc1edfb9de8316fbd92e0f0957d7c2` remain unchanged. This is defect and recovery evidence, not target qualification.

## Parser ownership and semantics

Extend the existing reusable `@deepseek-ai/dsh-persona` configuration parser. Normalize released `text` input in memory to current resolved `prefix`, `suffix`, `complete` and `includeRuntimeContext`. Export `Config` as the accepted input union and `ResolvedConfig` as the explicit normalized input to `apply`. Cordis validates before registration using package-local Schemastery transform support. This is an identified downstream patch to an upstream-owned plugin, without Mint identity or defaults. Track it as an upstream contribution candidate; retire it only when an adopted upstream implementation passes the same evidence. Upstream submission requires separate authorization.

Legacy `text: string` with neither `prefix` nor `suffix` resolves to the exact text as prefix and an empty suffix. Current `prefix: string` without `text` keeps current suffix/default behavior. Reject `text` with `prefix`, even when equal, and `text` with `suffix`, even when empty. Reject neither required field, wrong types and null text/prefix before persona registration. Check explicit conflicting field presence before normalization or defaults erase it; preserve unrelated unknown-key handling without global strictness.

Empty legacy text accepts and shadows both deployment persona sections away, like empty current prefix/suffix. Preserve whitespace, templates and the entire text without heuristic splitting. Empty normalized suffix prevents deployment suffix inheritance. `complete` and `includeRuntimeContext` retain existing validation, defaults and meaning. Strict variable rendering, complete-prompt suppression and scoped runtime-context suppression remain authoritative. Failed mounts unwind effects and keep actionable persona-row diagnostics; no fallback, row deletion or substitution of the current standard preset is allowed.

Normalize only in memory. Never write presets or settings; retain `PresetTree.write` suppression and scoped `ctx.effect` disposal. Persona remains model-visible through existing logged system assembly. Introduce no loader service, interception framework, permission, network, native, expression, loop or session-format change.

## Static configuration catalog

Put a statically visible inline union of object inputs inside `z.transform`. Require legacy text or modern prefix without defaults, and reject prohibited-field presence explicitly because ordinary object branches accept extras. Document conflicting fields and normalization in `Config` JSDoc; use `ResolvedConfig` and package prose for normalized output.

Extend only the existing `walkSchemaExpr` static catalog walker to recognize `z.transform(inner, ...)` and recurse into its first argument. Missing or unsupported input expressions still reject. Do not add package exceptions, unknown-expression shortcuts, hidden fields or skipped checks. Transform metadata retains its inner schema; `preserve: true` prevents adapted-input rewriting. Regenerate the configuration catalog from source. The catalog describes accepted caller inputs, including text/prefix/suffix and both policy flags, rather than requiring prefix for every caller.

### Transformed input type selection

For an exported `const Config` with a top-level static transform initializer after existing wrapper unwrapping, require an explicit schema annotation with two type arguments through the actual Schemastery import binding, such as `z<Config, ResolvedConfig>`. Select the first plain named input type and resolve it to a package-owned declaration. Reuse existing transitive type closure, member documentation, name collision and schema-key checks. Missing or unsupported annotations, unsupported input type expressions, unresolved input or external input must fail with precise diagnostics; never fall back to the `apply` output or guess from a same-name declaration. TypeScript owns schema-output/`apply` consistency; input-key checks do not prove transformation semantics.

Every other schema, including ordinary objects/unions and plugins without schemas, retains parameter-based catalog type selection. Focused fixtures prove input-only fields and referenced types appear, undeclared fields reject, every unsupported selection fails, unchanged cases keep parameter selection, and actual persona exposes `Config` while `apply` consumes `ResolvedConfig`. The independently approved selection addendum is bound by [review evidence](../work-items/20260910-dsh-015-upgrade/preset-compatibility-review.json).

## Alternatives and recovery

A separate adapter must intercept the unchanged persona specifier and adds resolution-order ownership. A generalized loader transform expands shared infrastructure for one demonstrated incompatibility. Rewriting authored files, deleting the persona row or replacing the fixture with a target-generated preset violates preservation. The existing parser is the smallest reusable owner.

Keep upgraded roots throughout complete quiescent backup restoration into empty roots and actual delivered-baseline observation, following the migration registry. Never open target-written roots with baseline or imply automatic downgrade. Additional legacy forms or failures require reassessment.

## Required verification

- Parser and scoped tests cover both forms, every refusal, empty text, defaults and explicit flags, interpolation, complete mode, suffix shadowing, independent scopes/disposal and unchanged modern behavior.
- A real keyless Agent request and its logged system message prove rendered legacy persona content and semantic order; mount success alone is insufficient. Do not promise identical whole-prompt bytes or global section ordering across runtimes.
- The actual delivered baseline creates an authored preset through public copy. The unchanged target file supports discovery, new session and restart; metadata, preset and settings hashes bind to actual runtimes. Complete restoration reproduces baseline observables.
- Compatible non-Mint composition resolves the packed plugin without aliases. Update package documentation, the Agent Note and a relevant keyless snapshot.
- Catalog tests expose all transformed union fields, reject undeclared fields and unsupported transform inputs; run catalog freshness and related documentation checks. RD owns focused checks; independent QA owns final candidate/default verification and required architecture qualification.
