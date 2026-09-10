/** Select executed, scenario-specific observations before creating a production receipt. */
import assert from 'node:assert/strict'
import { object } from './evidence.ts'
import type { MIGRATION_SCENARIOS } from './migration-scenarios.ts'

type Scenario = typeof MIGRATION_SCENARIOS[number]
const stages = ['populated', 'upgraded', 'reopened', 'restored'] as const
function at(value: unknown, path: string): unknown {
  for (const key of path.split('.')) value = object(value)[key]
  if (value === undefined || value === null) throw new Error(`Missing executed migration observation: ${path}`)
  return value
}
function sequence(value: unknown): unknown[] { assert.ok(Array.isArray(value)); assert.ok(value.length > 0); return value }
function same(actual: unknown, expected: unknown): void { assert.deepEqual(actual, expected) }

/** Require the observations owned by one fixed scenario, never a common suite-pass flag.
 * @param id - Fixed normative scenario ID.
 * @param agent - Completed actual packaged backend observations.
 * @param native - Completed normal native observations from this architecture.
 * @param negative - Executed candidate-owned negative assertion inventory.
 * @returns Distinct assertion description and the exact supporting raw observations.
 */
export function migrationObservation(
  id: Scenario, agent: Record<string, unknown>, native: Record<string, unknown>, negative: Record<string, unknown>,
): { assertions: string[]; observations: unknown } {
  const backend = (path: string) => Object.fromEntries(stages.map(stage => [stage, at(agent[stage], path)]))
  const renderer = (path: string) => Object.fromEntries(stages.map(stage => [stage, at(native[stage], `normal.actions.renderer.${path}`)]))
  const result = (assertion: string, observations: unknown) => ({ assertions: [assertion], observations })
  const selectedNegative = ['session-interruption-retry', 'session-source-drift', 'session-invalid-highest', 'session-exclusive-writer', 'restore-integrity-refusal']
  if (selectedNegative.includes(id)) {
    const assertions = sequence(at(negative, `scenarios.${id}`))
    assert.ok(assertions.every(value => typeof value === 'string' && value.length > 0))
    return { assertions: assertions as string[], observations: { sourceAssertions: assertions } }
  }
  switch (id) {
    case 'session-direct-upgrade': {
      const histories = backend('events')
      for (const stage of stages) sequence(histories[stage])
      same((histories.restored as unknown[]).slice(0, (histories.populated as unknown[]).length), histories.populated)
      return result('Actual delivered Agent history migrates, continues, reopens and restores its exact original prefix.', { histories, cold: at(agent, 'reopened.coldQuery') })
    }
    case 'session-history-semantics': {
      const history = backend('rich')
      for (const stage of stages) {
        sequence(at(history[stage], 'events')); sequence(at(history[stage], 'child.events')); sequence(at(history[stage], 'ptcEvents')); sequence(at(history[stage], 'dispatches'))
      }
      const cold = Object.fromEntries(['upgraded', 'reopened', 'restored'].map(stage => [stage, at(agent[stage], 'coldChild')]))
      for (const value of Object.values(cold)) { same(at(value, 'row.live'), false); same(at(value, 'liveAfterQuery'), false); assert.ok(Number(at(value, 'inheritedEventCount')) > 0) }
      return result('Real compaction, inherited child continuation, detached cold query and PTC dispatch survive the versioned history conversion.', { history, cold })
    }
    case 'session-source-preserved': return result('Original compressed generations remain byte-identical through target publication and complete restoration.', { originals: sequence(agent.originalLogs), backup: at(agent, 'backupManifest'), retained: at(agent, 'upgradedManifest') })
    case 'session-built-worker': return result('The packaged plain runtime completed the actual built session worker.', at(agent, 'builtWorker'))
    case 'settings-permission': {
      const values = backend('backendDefaults')
      for (const stage of stages) {
        same(at(values[stage], 'operations.read.isError'), false)
        same(at(values[stage], 'operations.write.isError'), stage === 'upgraded' || stage === 'reopened')
        same(at(values[stage], 'operations.destinationExists'), stage === 'populated' || stage === 'restored')
      }
      return result('Real Agent-scoped read remains allowed; workspace-write creates a private file while read-only refuses and leaves it absent.', values)
    }
    case 'settings-default-model': return result('Public default-session creation produces actual provider, model and reasoning request headers.', backend('backendDefaults'))
    case 'settings-default-preset': return result('Public default-session creation selects standard and the supported unchanged authored preset.', { standard: backend('backendDefaults.preset'), authored: backend('authoredPreset.authoredDefault') })
    case 'preset-authored-preserved': {
      const values = backend('authoredPreset')
      for (const stage of stages) same(at(values[stage], 'identity'), at(values.populated, 'identity'))
      return result('Copied delivered preset metadata and bytes remain unchanged while real sessions mount and use its persona.', values)
    }
    case 'settings-document-roundtrip': {
      const values = backend('settingsDocument')
      same(at(values.populated, 'initialEncoding'), 'JSON')
      for (const stage of stages) same(at(values[stage], 'sentinel'), at(values.populated, 'sentinel'))
      return result('Delivered JSON settings and subsequent YAML updates/restarts preserve unrelated nested values.', values)
    }
    case 'settings-loop-limit': {
      const values = backend('loopExecution')
      for (const stage of stages) { const cap = stage === 'populated' || stage === 'restored' ? 1 : 2; same(at(values[stage], 'cap'), cap); same(at(values[stage], 'highWater'), cap); sequence(at(values[stage], 'trace')) }
      return result('Real gated safe tool calls reach configured concurrency one or two without exceeding it.', values)
    }
    case 'settings-shell': {
      const values = backend('shell')
      for (const value of Object.values(values)) { assert.notEqual(object(value).status, 'blocked'); at(value, 'pwd'); at(value, 'output'); at(value, 'capped') }
      return result('Real sandboxed shell execution applies cwd, timeout caps and output limits; invalid updates preserve settings.', values)
    }
    case 'settings-subagent-selection': return result('Real existing and newly created Agent compositions retain their selected subagent tool policies.', backend('subagentSelection'))
    case 'settings-web-search': return result('Real web-search adapter sends configured synthetic request fields and consumes the local response.', backend('webSearch'))
    case 'settings-deepseek': return result('Real DeepSeek adapter applies configured model request behavior without external provider requests.', backend('deepseek'))
    case 'settings-pi-valid': return result('Real Pi adapters use preserved configured routes and local wire responses.', backend('pi.valid'))
    case 'settings-pi-catalog-drift': return result('A real delivered catalog entry removed from target refuses before transport until an explicit supported update.', { original: at(agent, 'populated.pi.valid'), refusal: at(agent, 'upgraded.pi.drift'), retained: backend('pi.settings') })
    case 'settings-pi-write-validation': return result('Actual Pi settings parser refuses unsupported writes without replacing the prior settings document.', backend('pi.rejected'))
    case 'settings-pi-host-discovery': return result('Real target host discovery uses its configured stored key and headers; baseline behavior is separately observed.', { models: backend('pi.discovered'), requests: backend('pi.discoveryRequest') })
    case 'settings-pi-compat': return result('Real SDK wire requests preserve legacy thinking budgets and apply explicit new fields, priority zero and output-token suppression controls.', backend('pi.compat'))
    case 'credentials-roundtrip': return result('Real credential refs and records preserve values and owner-only permissions across four stages.', backend('credentials'))
    case 'env-layer-precedence': return result('Actual inherited, managed, project and home credential layers resolve in order and inherited writes refuse.', { credentials: backend('credentials'), fixture: at(agent, 'fixtureManifest'), transport: at(agent, 'transport') })
    case 'credentials-invalid-refusal': {
      const rows = sequence(agent.refusals).map(object).filter(row => String(row.stage).startsWith('credentials-'))
      same(rows.length, 2); for (const row of rows) same(row.observerActivated, false)
      return result('Real credential provider refuses invalid version and record bytes without activating its consumer or rewriting input.', rows)
    }
    case 'env-bootstrap-refusal': {
      const rows = sequence(agent.refusals).map(object).filter(row => String(row.stage).startsWith('env-'))
      same(rows.length, 3); for (const row of rows) same(row.observerActivated, false)
      return result('Actual bootstrap rejects forbidden project/home overrides while supported home proxy initialization succeeds.', { rows, positive: at(agent, 'homeProxy') })
    }
    case 'workspace-roundtrip': return result('Real workspace v2 title, order, archive membership and session accounting survive updates, restart and restore.', backend('workspace'))
    case 'workspace-path-refusal': same(at(agent, 'upgraded.workspace.relativePathRefused'), true); return result('Actual target registry refuses a relative path without changing existing order.', at(agent, 'upgraded.workspace'))
    case 'workspace-interrupted-mutation': return result('Real JSON-backed workspace consumer recovers independently prepared pending create and delete states.', { create: at(agent, 'recovery.create'), delete: at(agent, 'recovery.delete') })
    case 'projection-v4-v7-rebuild': {
      const values = backend('projection'); same(at(values.populated, 'version'), 4); same(at(values.upgraded, 'version'), 7); same(at(values.upgraded, 'predecessorFoldRefused'), true); same(at(values.reopened, 'identity.formatVersion'), 3)
      return result('Target refuses the predecessor fold, recomputes from authoritative events and writes version seven with current history identity.', values)
    }
    case 'projection-invalid-backup': return result('Actual cache consumer backs up the invalid accepted-version record exactly and preserves the unrelated valid record.', at(agent, 'recovery.projection'))
    case 'query-rebuild': {
      const values = Object.fromEntries(['upgraded', 'reopened', 'restored'].map(stage => [stage, at(agent[stage], 'coldQuery')]))
      for (const value of Object.values(values)) { same(at(value, 'row.live'), false); same(at(value, 'searchDisabled'), true); sequence(at(value, 'events')) }
      return result('Cold exact read/list/filter results rebuild from restored logs; both default-disabled search APIs refuse.', values)
    }
    case 'attachments-old-images': return result('Original saved image references resolve to identical bytes under target, restart and restored baseline.', backend('attachments'))
    case 'attachments-new-files': return result('Target writes actual attachment files and reads identical bytes through saved references after restart.', { write: at(agent, 'upgraded.attachments.file'), reopen: at(agent, 'reopened.attachments.file') })
    case 'attachments-conflict-interruption': same(at(agent, 'upgraded.attachments.interrupted'), true); same(at(agent, 'upgraded.attachments.conflictRefused'), true); return result('Real attachment streams abort with empty staging and conflicting bytes refuse without overwrite.', at(agent, 'upgraded.attachments'))
    case 'upload-index-preserved': return result('Synthetic files-v3 records survive byte-identically without provider upload requests.', backend('uploadIndex'))
    case 'identity-preserved': { const values = backend('identity'); for (const value of Object.values(values)) same(value, values.populated); return result('Actual anonymous identity and exact file bytes remain unchanged across all stages.', values) }
    case 'user-inputs-unchanged': return result('Original project/global instructions and scoped skill bytes remain unchanged and reach real Agent requests.', backend('userInputs'))
    case 'spill-isolated-cleanup': same(at(agent, 'spillCleanup.removedAfterTarget'), true); return result('Target cleans the aged owned spill while preserving unrelated temp bytes and the external-link target.', { spill: backend('spill'), cleanup: at(agent, 'spillCleanup') })
    case 'storage-selection': return result('Actual composed JSON provider and never-open in-memory query configuration create no durable SQLite file.', backend('composition.storage'))
    case 'composition-exact': return result('Actual ordered base/web/Mint profile activation and resolved rows match candidate sources, including one background notification row.', { backend: backend('composition'), native: Object.fromEntries(stages.map(stage => [stage, at(native[stage], 'entrypoint')])) })
    case 'profile-preserved': return result('Actual profile recipe, live patch mode and private user layer remain bound across native and backend processes.', { backend: backend('composition'), native: at(native, 'input') })
    case 'fixture-isolation': return result('Actual backend argv/configuration roots and pre/post-ready Electron paths remain private, with no writer credentials.', { backend: backend('isolation'), processes: backend('process'), native: Object.fromEntries(stages.map(stage => [stage, { before: at(native[stage], 'observation'), after: at(native[stage], 'normal.ready'), backend: at(native[stage], 'normal.actions.agent.isolation') }])) })
    case 'backup-quiescent-complete': return result('All backend/native writers and descendant groups stop before complete mode/file/link backups.', { backend: backend('process'), quiescence: at(agent, 'transport.quiescence'), core: at(agent, 'backupManifest'), native: at(native, 'backupManifest'), nativeShutdown: Object.fromEntries(stages.map(stage => [stage, at(native[stage], 'normal.shutdown')])) })
    case 'restore-baseline': same(native.retainedAfterRestore, true); return result('Complete stopped backup restores real baseline behavior while upgraded roots remain intact until post-restore verification.', { core: at(agent, 'restored'), native: at(native, 'restored'), coreRetained: at(agent, 'retainedAfterRestoreDigest'), nativeRetained: at(native, 'retainedUpgradedManifest') })
    case 'mint-preferences-preserved': return result('Actual native menu later/skip actions persist preferences and restart honors skip without installing anything.', Object.fromEntries(stages.map(stage => [stage, at(native[stage], 'normal.actions')])))
    case 'browser-origin-policy': return result('Actual normal main rejects renderer navigation and popup creation away from its allocated origin; same-origin reload succeeds.', renderer('originPolicy'))
    case 'browser-state-same-origin': return result('Explicitly seeded original browser strings hydrate actual selection, draft, flat row order and duration controls after same-origin reload.', renderer('browserState'))
    case 'settings-locale': return result('Actual Settings locale controls change rendered language and retain it after reload and restart.', renderer('appearance'))
    case 'settings-theme': return result('Actual Settings theme/font controls change document colors and visible conversation paragraph size across restart.', renderer('appearance'))
    case 'settings-transcript': return result('Actual completed process-before-answer history renders the selected normal/compact presentation after reload.', renderer('transcript'))
    case 'settings-composer': return result('Actual plain Enter during a gated running Agent uses the selected queue/steer wire action and visible pending state.', renderer('composer'))
    case 'settings-onboarding': return result('Actual Continue saves acknowledgement; mere observation/reload does not, and subsequent processes show no notice.', renderer('welcome'))
    case 'settings-notifications': {
      const values = renderer('notifications')
      for (const value of Object.values(values)) {
        const decisions = sequence(at(value, 'decisions')).map(object)
        same(decisions.length, 6)
        same(new Set(decisions.map(row => `${String(row.mode)}:${String(row.background)}`)).size, 6)
        for (const row of decisions) { same(at(row, 'observation.permission'), 'granted'); same(row.presented, row.mode !== 'off' && (row.mode === 'always' || row.background === true)) }
      }
      return result('Actual off/background/always settings execute all focused/background controller decisions; OS delivery remains excluded.', values)
    }
    default: throw new Error(`Missing fixed scenario producer: ${id}`)
  }
}
