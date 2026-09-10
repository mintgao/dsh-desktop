# Phase B normative composition and scenario registry

Status: Accepted

English | [中文](20260910-desktop-mint-migration-registry.zh.md)

## Authority and admission

Author: `upgrade_decision`. Independent reviewer: `classification_review`; [review evidence](../work-items/20260910-dsh-015-upgrade/phase-b-design-review.json) records approval of design only. This registry governs the [integration decision](20260910-desktop-mint-target-integration.md) and takes precedence over its original unresolved composition and scenario placeholders. These are mandatory requirements, not executed results.

Before target merge, the complete assessed range may truthfully contain `persistedFormatsChanged: true` and blocked or unverified scenarios. Schema-3 trusted adoption checks identities, completeness, digests and ancestry without requiring post-merge migration reports. Phase A publication rejects changed formats. Once the Phase B evaluator merges onto protected main, changed formats require the complete reports below. Test truthful changed/unverified assessment admission during preparation and rejection during publication. Never encode false to pass adoption.

## Exact product composition

The direct-upgrade and restore baseline is delivered `desktop-v0.1.2-alpha.3.unsigned.1`, downstream `67406fc6af451f7f68874cb31c2d0f3242c0c8ad`, upstream `dd6322d604e00eec1ba5e0c8541159906a21094a`. Authority is the digest of `.github/desktop-delivery/legacy-baseline.json` and its retained architecture artifact digests, not the bare upstream runtime.

Both baseline and intended target use desktop-mint with ordered `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app` and `@deepseek-ai/dsh-desktop-mint` Bundles; `patchReload` is live and `ui-session-notifications.defaultMode` is background. Target shared base/Web and standard preset come from `b2e3b2a0125854567a4a5fcba75782e42fe84901`. Preserve the downstream profile declaration and Mint Bundle. Pin and hash `packages/boot/app-boot/src/profile.ts`, `packages/bundle/base/cordis.patch.yml`, `packages/bundle/web-app/cordis.patch.yml`, `packages/bundle/desktop-mint/cordis.patch.yml`, `packages/preset/agent-presets/presets/standard/agent.cordis.yml` and every referenced built-in row. Require resolved Bundle order and exactly one Mint notification row.

The Mint native adapter moves to `apps/desktop-mint`, retaining `io.github.mintgao.dsh-desktop`, branding, browser identity and manual updates. Upstream `apps/desktop` and `apps/desktop-host` remain separate. Sessions use `$DSH_HOME/sessions`; JSON storage uses `$DSH_HOME/storages`; query SQLite uses `:memory:`; generic SQLite is not selected. Qualification-only overrides select a deterministic keyless provider and private paths; they do not replace persistence, settings, credentials, workspace, attachments, projection or native implementations. Third-party plugins, custom backend substitutions and arbitrary overrides are outside this bounded composition.

Source paths below refer to the target upstream revision except retained downstream Mint Bundle/notification code and explicitly identified baseline or planned Mint native paths. Mint-only files are not claimed to exist in the upstream target. Relative `src` shorthand is expanded to its owning package. Scenario evidence must bind the exact final resolved composition.

## Required scenarios

Every ID here and in the settings registry is mandatory in each architecture report. The validator checklist is fixed and cannot be dynamically reduced. Evidence may be shared only as specified under report acceptance.

| Source owner | Required IDs and behavior |
| --- | --- |
| Composition files above; `apps/desktop-mint/src/backend.ts` | composition-exact: actual composition and packed resolution without aliases; fixture-isolation: private home, agents home, cwd, temp/spill roots and Electron userData without real credentials. |
| `packages/session/session-persistence-jsonl/src/index.ts`, `packages/session/session-persistence-jsonl/src/generation.ts`; `packages/session/session-format-catalog/src/index.ts` | session-direct-upgrade: delivered-baseline populated history through packaged target list/read/resume/write/flush/close/reopen; session-history-semantics: requests/system messages/inheritance/references/compaction/PTC/preset/title meaning; session-source-preserved: unchanged originals and one valid successor; session-interruption-retry; session-source-drift; session-invalid-highest; session-exclusive-writer; session-built-worker. |
| `packages/settings/settings-file/src/index.ts` | settings-document-roundtrip: baseline YAML/JSON, supported update/restart, unrelated keys preserved; all settings IDs below. |
| `packages/credentials/credentials-local/src/index.ts` | credentials-roundtrip: synthetic v1 records/refs/precedence/update/restart/permissions; credentials-invalid-refusal: invalid format/record refuses without rewriting. |
| `packages/boot/app-boot/src/index.ts` | env-layer-precedence: inherited/project/home precedence, files unchanged; env-bootstrap-refusal: project proxies and disallowed bootstrap/TLS settings refuse, home proxies accepted. |
| `packages/workspace/workspace/src/spec.ts`, `packages/workspace/workspace/src/index.ts`, `packages/workspace/workspace/src/paths.ts` | workspace-roundtrip: v2 titles/order/archive/session ownership/canonical paths; workspace-interrupted-mutation: pending create/delete recovery; workspace-path-refusal: new relative paths refuse without changing existing records. |
| `packages/session/session-projection-cache/src/spec.ts`, `packages/session/session-projection-cache/src/index.ts`; `packages/storage/storage-json/src/per-record-unit.ts` | projection-v4-v7-rebuild: old listing hints allowed but unbound folds never reused, current checkpoints written; projection-invalid-backup: malformed record backed up byte-exact without damaging other sessions. |
| `packages/session-query/session-query-sqlite/src/index.ts`, `packages/session-query/session-query-sqlite/src/schema.ts`; `packages/storage/storage-sqlite/src/schema.ts` | query-rebuild: in-memory query from authoritative restored logs; storage-selection: JSON and no new durable SQLite backend. |
| `packages/attachment/attachment-local/src/store.ts`, `packages/attachment/attachment-local/src/file-store.ts`, `packages/attachment/attachment-local/src/index.ts` | attachments-old-images: original referenced bytes; attachments-new-files: objects/aliases persist after restart; attachments-conflict-interruption: conflicts refuse and interrupted staging cannot publish false refs. |
| `packages/llm/llm-deepseek/src/upload-index.ts` | upload-index-preserved: synthetic files-v3 records survive without provider requests. |
| `packages/boot/app-boot/src/profile.ts`; `packages/preset/agent-presets/src/discovery.ts`, `packages/preset/agent-presets/src/authoring.ts` | profile-preserved: desktop-mint package/patch/dependencies; preset-authored-preserved: baseline authored supported-built-in preset metadata/bytes/discovery/new session; never migrate to reserved desktop profile. |
| `packages/identity/anonymous-user-id/src/index.ts` | identity-preserved: fixture anonymous identity unchanged. |
| `packages/client/store/src/index.ts`; `packages/api/session-controller/src/client/sessions/service.ts`; `packages/client/ui-conversation/src/client/stores.ts`; `packages/client/ui-workspace/src/client/stores.ts`; `packages/client/ui-trajectory/src/client/duration-store.ts` | browser-state-same-origin: dsh.sessions.current, dsh.conversation.<sessionId>, dsh.workspace.view.v5 and dsh.trajectory.duration observable selections/drafts/views; browser-origin-policy: existing navigation/launch behavior. |
| Baseline `apps/desktop/src/manual-update-preferences.ts` and `apps/desktop/src/main.ts`; planned Mint `apps/desktop-mint/src/manual-update-preferences.ts` and `apps/desktop-mint/src/main.ts` | mint-preferences-preserved: manual-update-preferences.json update/restart/restore and same app/userData identity. |
| `packages/spill/spill-local/src/index.ts`; `packages/skill/skill-filesystem/src/index.ts`; `packages/context/agent-instructions/src/files.ts` | spill-isolated-cleanup: no cleanup outside owned fixture roots; user-inputs-unchanged: synthetic skills/instructions and unrelated files untouched. |
| Qualification runner and committed recovery procedure | backup-quiescent-complete: all writers closed, every configured root hashed; restore-baseline: upgraded data retained separately, full backup restored to empty roots and delivered baseline observes original state; restore-integrity-refusal: incomplete/damaged backup rejects before replacement. |

Both existing and intended Mint native launch use ephemeral port 0. Browser localStorage is origin-scoped; identical keys do not prove cross-origin draft retention. Preserve existing origin policy and qualify same-origin data compatibility. Cross-origin draft migration is neither introduced nor claimed.

## Built-in settings registry

Each scenario reads baseline values, performs supported target updates and restart, preserves unrelated values and verifies effective behavior. Unknown third-party sections remain as bytes/data, but their execution is outside scope.

| Source owner | Required IDs and behavior |
| --- | --- |
| locale.preference; `packages/client/locale/src/index.ts`, `packages/client/locale/src/locale-settings.ts` | settings-locale: supported zh/en unchanged. |
| ui-theme.preference/fontSize; `packages/client/ui-theme/src/index.ts`, `packages/client/ui-theme/src/theme-settings.ts` | settings-theme: appearance/font selection. |
| ui-chat.transcriptView; `packages/client/ui-chat/src/index.ts`, `packages/client/ui-chat/src/chat-settings.ts` | settings-transcript: normal/compact preserved. |
| ui-conversation.busyEnter; `packages/client/ui-conversation/src/index.ts`, `packages/client/ui-conversation/src/submission-settings.ts` | settings-composer: queue/steer effective action. |
| ui-onboarding.welcomeNoticeVersion; `packages/client/ui-settings-general/src/index.ts` | settings-onboarding: acknowledgement retained. |
| ui-session-notifications.mode; `packages/client/ui-session-notifications/src/index.ts`, `packages/client/ui-session-notifications/src/notification-settings.ts` | settings-notifications: off/background/always, absent uses Mint background; native identity-dependent delivery separate. |
| agent-default-model; `packages/core/agent-default-model/src/index.ts` | settings-default-model: provider/model/reasoning selected for new sessions. |
| agent-loop.maxParallelToolCalls; `packages/core/agent-loop/src/index.ts` | settings-loop-limit: positive limit retained and invalid refused. |
| agent-presets.default; `packages/preset/agent-presets/src/index.ts` | settings-default-preset: standard/supported authored preset selected; session alias migration never rewrites settings section. |
| permission; `packages/interaction/permission-presets/src/index.ts` | settings-permission: effective valid baseline policy retained, malformed values cannot weaken it. |
| shell; `packages/shell/bash-local/src/index.ts`, `packages/shell/shell/src/index.ts` | settings-shell: harmless subprocess verifies Bash settings/bounds; PowerShell excluded macOS composition. |
| subagent-model-selection.enabled; `packages/subagent/tool-subagent/src/model-selection-settings.ts` | settings-subagent-selection: retain value, updates affect subsequent composition. |
| web-search-deepseek; `packages/web/web-search-deepseek/src/index.ts` | settings-web-search: config/credential refs retained with injected transport, no real search. |
| llm-deepseek; `packages/llm/llm-deepseek/src/index.ts`, `packages/llm/llm-deepseek/src/types.ts` | settings-deepseek: baseline model config readable, optional systemPromptUpdate in-history accepted, invalid value refused. |
| llm-pi-ai; `packages/llm/llm-pi-ai/src/index.ts`, `packages/llm/llm-pi-ai/src/config.ts`, `packages/llm/llm-pi-ai/src/catalog.ts`, `packages/llm/llm-pi-ai/src/discovery.ts` | settings-pi-valid: configured routes work; settings-pi-catalog-drift: stored catalog errors repairable without deleting routes or breaking valid models; settings-pi-write-validation: invalid changed routes/scalars/headers reject before persistence; settings-pi-host-discovery: headers/credentials stay host-owned; settings-pi-compat: old compat fields and explicit thinking-budget/priority/max-output values without network. |

Pi-ai deferred catalog errors and stricter headers are concrete behavior changes. Invalid stored scalar/header configurations block the affected acceptance scenario; do not silently sanitize or delete them, or report them as migrated.

## Report provenance and acceptance

Report schema 1, purpose `desktop-data-migration-qualification`, binds workflow path `.github/workflows/desktop-delivery-qualify.yml`, workflow commit/runId/attempt; architecture; candidateDigest/downstreamCommit/sourceLockDigest/dataCompatibilityDigest; baseline upstream/sourceCommit/desktopTag/evidenceDigest/artifactDigest; target upstream/dmgDigest/packagedRuntimeDigest; compositionDigest/fixtureManifestDigest/backupManifestDigest; and scenarios id/status/evidenceFiles. Each evidence file has a contained name, size and digest. Generated reports remain outside candidate source and upload within the same attempt.

The aggregator requires exactly one report per architecture matching the native candidate, DMG and workflow identity, all normative IDs unique and passed, and every referenced byte rehashed. Shared negative-test evidence may appear in both reports only when bound to the same candidate and run; packaged direct upgrade and restoration execute independently on each architecture. The manifest binds all reports and payloads in its file inventory. checkedManifest, archive validation and publisher enforce the same identities. Missing, skipped, false, stale or substituted reports fail closed. Design approval requires this registry; publication additionally requires actual passed executions.
