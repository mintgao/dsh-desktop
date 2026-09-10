/** Production receipts require their own actual behavior fields and refuse development blockers. */
import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrationObservation } from '../migration-observations.ts'
import { notificationLocations } from '../migration-native-notifications.ts'
import { assertMigrationCheckout, qualifyMigration } from '../migration-qualifier.ts'

const stages = ['populated', 'upgraded', 'reopened', 'restored'] as const

it('does not turn a confined shell blocker into production evidence', () => {
  const agent = Object.fromEntries(stages.map(stage => [stage, { shell: { status: 'blocked', reason: 'sandbox unavailable' } }]))
  expect(() => migrationObservation('settings-shell', agent, {}, {})).toThrow()
})

it('requires actual per-stage permission results rather than recorded preset metadata', () => {
  const agent = Object.fromEntries(stages.map(stage => [stage, { backendDefaults: { operations: {
    read: { isError: false }, write: { isError: stage === 'upgraded' || stage === 'reopened' },
    destinationExists: stage === 'populated' || stage === 'restored',
  } } }]))
  expect(migrationObservation('settings-permission', agent, {}, {}).assertions).toHaveLength(1)
  agent.upgraded!.backendDefaults.operations.write.isError = false
  expect(() => migrationObservation('settings-permission', agent, {}, {})).toThrow()
})

it('refuses missing or empty negative execution assertions', () => {
  expect(() => migrationObservation('session-source-drift', {}, {}, {})).toThrow()
  expect(() => migrationObservation('session-source-drift', {}, {}, { scenarios: { 'session-source-drift': [] } })).toThrow()
})

it('does not use an aggregate native result to fill missing browser observations', () => {
  const native = Object.fromEntries(stages.map(stage => [stage, { qualification: true }]))
  expect(() => migrationObservation('browser-origin-policy', {}, native, {})).toThrow()
})

it('requires six distinct granted-permission notification decisions', () => {
  const decisions = ['off', 'background', 'always'].flatMap(mode => [false, true].map(background => ({
    mode, background, observation: { permission: 'granted' }, presented: mode !== 'off' && (mode === 'always' || background),
  })))
  const native = Object.fromEntries(stages.map(stage => [stage, { normal: { actions: { renderer: { notifications: { decisions } } } } }]))
  expect(migrationObservation('settings-notifications', {}, native, {}).assertions).toHaveLength(1)
  decisions[0]!.observation.permission = 'denied'
  expect(() => migrationObservation('settings-notifications', {}, native, {})).toThrow()
  decisions[0]!.observation.permission = 'granted'
  decisions[1] = decisions[0]!
  expect(() => migrationObservation('settings-notifications', {}, native, {})).toThrow()
})

it('locates unique real notification entries and rejects incomplete or ambiguous source', () => {
  const source = 'class Controller { notify(root) { const s = this.state.getSnapshot(); } }\nclass Presenter { show(message) { new globalThis.Notification(message.title); } }'
  expect(notificationLocations(source).notify.lineNumber).toBe(0)
  expect(notificationLocations(source).show.lineNumber).toBe(1)
  expect(() => notificationLocations('class Controller {}')).toThrow(/ambiguous or absent/)
  expect(() => notificationLocations(`${source}\n${source}`)).toThrow(/ambiguous or absent/)
})

it('refuses a mismatched architecture before inspecting artifacts or starting any app', async () => {
  await expect(qualifyMigration({ root: '/missing', config: '/missing', candidate: '/missing', native: '/missing',
    baselineDmg: '/missing', targetDmg: '/missing', architecture: process.arch === 'arm64' ? 'x64' : 'arm64',
    directory: '/missing', workflowCommit: 'a'.repeat(40), runId: 1, runAttempt: 1 })).rejects.toThrow(/architecture-matched/)
})

it('refuses a clean candidate moved to a different commit during execution', () => {
  const root = mkdtempSync(join(tmpdir(), 'migration-checkout-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  try {
    git('init', '-q')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'candidate', '--allow-empty')
    const original = git('rev-parse', 'HEAD')
    assertMigrationCheckout(root, original)
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'moved', '--allow-empty')
    expect(git('status', '--porcelain')).toBe('')
    expect(() => { assertMigrationCheckout(root, original) }).toThrow(/exact clean checkout/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
