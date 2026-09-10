/** Four normal Mint lifecycles over private native, backend and browser data. */
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, object } from './evidence.ts'
import { copyMigrationData, migrationDataInventory } from './migration-data.ts'
import { exerciseMigrationNative } from './migration-native.ts'
import { migrationNativeVisitor } from './migration-native-visitor.ts'
import type { NativeBrowserState } from './migration-native-browser.ts'
import { runtimeInventory } from './runtime-inventory.ts'

/** Run baseline, target, restarted target and restored baseline in normal Electron.
 * @param baselineApp - Exact delivered architecture-matched app verified by the producer.
 * @param targetApp - Exact candidate app verified by the producer.
 * @param output - Fresh retained evidence directory outside the disposable data roots.
 * @param architecture - Actual host/app architecture, checked before launch.
 * @returns Actual native evidence; final qualification also requires backend and negative cases.
 */
export async function exerciseNativeMigration(
  baselineApp: string, targetApp: string, output: string, architecture: 'arm64' | 'x64',
): Promise<Record<string, unknown>> {
  if (process.platform !== 'darwin' || process.arch !== architecture || process.env.GITHUB_ACTIONS !== 'true'
    || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw new Error('Native migration requires its disposable architecture-matched GitHub macOS runner')
  mkdirSync(output, { mode: 0o700 })
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-native-migration-')))
  const roots = ['home', 'userdata', 'workspace', 'tmp'] as const
  const apps = [baselineApp, targetApp]
  const runtime = { baseline: runtimeInventory(baselineApp).sha256, target: runtimeInventory(targetApp).sha256 }
  const observer = readFileSync(fileURLToPath(new URL('./fixtures/migration-native-observer.mjs', import.meta.url)))
  let complete = false
  try {
    for (const name of roots) mkdirSync(join(root, name), { mode: 0o700 })
    mkdirSync(join(root, 'home/.dsh'), { mode: 0o700 })
    writeFileSync(join(root, 'native-observer.mjs'), observer)
    const patch = `- insert:\n    - id: migration-native-observer\n      name: ${JSON.stringify(join(root, 'native-observer.mjs'))}\n`
    writeFileSync(join(root, 'home/.dsh/cordis.patch.yml'), patch)
    const run = async (app: string, stage: 'populate' | 'upgrade' | 'reopen' | 'restore', previous?: Record<string, unknown>) => {
      const evidence = join(output, stage)
      mkdirSync(evidence, { mode: 0o700 })
      const input = { stage, evidence }
      writeFileSync(join(root, 'native-input.json'), JSON.stringify(input))
      writeFileSync(join(evidence, 'input.json'), JSON.stringify({ input, observerDigest: digest(observer), patch, patchDigest: digest(patch) }))
      try {
        const priorActions = previous === undefined ? undefined : object(object(previous['normal'])['actions'])
        const result = await exerciseMigrationNative(app, root, migrationNativeVisitor({ root, evidence, stage, architecture, notificationSource: readFileSync(join(app, 'Contents/Resources/backend/node_modules/@deepseek-ai/dsh-client-ui-session-notifications/lib/client.js'), 'utf8'),
          ...(priorActions === undefined ? {} : {
            previousBrowser: object(object(priorActions['renderer'])['browserState']) as unknown as NativeBrowserState,
            previousPreferences: object(priorActions['preferences']),
          }),
        }))
        writeFileSync(join(evidence, 'observations.json'), JSON.stringify(result))
        return result
      } finally {
        for (const name of ['barrier.json', 'stdout.log', 'stderr.log', 'process-cleanup.json']) {
          if (existsSync(join(root, name))) copyFileSync(join(root, name), join(evidence, name))
        }
      }
    }
    const populated = await run(baselineApp, 'populate')
    const inventory = () => Object.fromEntries(roots.map(name => [name, migrationDataInventory(join(root, name), apps)]))
    const before = inventory()
    for (const name of roots) {
      const original = before[name]
      assert.ok(original)
      copyMigrationData(join(root, name), join(root, 'backup', name), apps, original)
    }
    const upgraded = await run(targetApp, 'upgrade', populated)
    const reopened = await run(targetApp, 'reopen', upgraded)
    const newer = inventory()
    for (const name of roots) {
      assert.deepEqual(migrationDataInventory(join(root, 'backup', name), apps), before[name])
      renameSync(join(root, name), join(root, `upgraded-${name}`))
      const original = before[name]
      assert.ok(original)
      copyMigrationData(join(root, 'backup', name), join(root, name), apps, original)
    }
    const restored = await run(baselineApp, 'restore', populated)
    for (const name of roots) assert.deepEqual(migrationDataInventory(join(root, `upgraded-${name}`), apps), newer[name])
    assert.deepEqual({ baseline: runtimeInventory(baselineApp).sha256, target: runtimeInventory(targetApp).sha256 }, runtime)
    const result = { qualification: false, architecture, runtime, populated, upgraded, reopened, restored,
      backupManifest: before, retainedUpgradedManifest: newer, retainedAfterRestore: true,
      input: { observerDigest: digest(observer), patchDigest: digest(patch) },
      cleanup: 'Synthetic upgraded roots verified after restored baseline observations; retained observations precede fixture cleanup.' }
    writeFileSync(join(output, 'native-migration.json'), JSON.stringify(result))
    complete = true
    return result
  } finally {
    if (complete) rmSync(root, { recursive: true })
    else writeFileSync(join(output, 'diagnostic-fixture.json'), JSON.stringify({ qualification: false, fixtureRoot: root,
      cleanup: 'Retain the stopped owned fixture until failure assessment; never delete recovery diagnostics unconditionally.' }))
  }
}
