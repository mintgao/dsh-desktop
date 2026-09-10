/** Exercise real packaged Agents and restore their quiescent fixture backup. */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { digest, object } from './evidence.ts'
import { copyMigrationData, migrationDataInventory } from './migration-data.ts'
import { migrationGroupQuiescent, terminateMigrationGroup } from './migration-processes.ts'
import { runtimeInventory } from './runtime-inventory.ts'
import { startMigrationProvider, type MigrationProviderFixture } from './migration-provider-fixture.ts'

async function within<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { reject(new Error(`${label} deadline exceeded`)) }, milliseconds)
    })])
  } finally { clearTimeout(timer) }
}

function terminate(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return
  try { process.kill(-child.pid, signal) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

async function runStage(
  root: string, app: string, stage: string, confineWrites: boolean, recovery: boolean, runtimeRoots: readonly string[],
): Promise<Record<string, unknown>> {
  const environment = {
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: join(root, 'home'), CFFIXED_USER_HOME: join(root, 'home'),
    TMPDIR: join(root, 'tmp'), MAC_CHROMIUM_TMPDIR: join(root, 'tmp'), DSH_HOME: join(root, 'home', '.dsh'),
    DSH_AGENTS_HOME: join(root, 'home/.agents'), DSH_TELEMETRY_DISABLED: '1', ELECTRON_RUN_AS_NODE: '1',
    DSH_MIGRATION_CONFINED_DEVELOPMENT: confineWrites ? '1' : '0',
    DSH_QUALIFICATION_INHERITED: 'synthetic-inherited',
    DSH_MIGRATION_PROVIDER_URL: readFileSync(join(root, 'provider-url'), 'utf8'),
    DSH_MIGRATION_APP: app, DSH_MIGRATION_STAGE: stage, DSH_MIGRATION_BASELINE: join(root, 'populate.json'),
    DSH_MIGRATION_RESULT: join(root, `${stage}.json`), DSH_MIGRATION_UPGRADED: join(root, 'upgrade.json'),
    DSH_MIGRATION_FIXTURE: join(root, 'recovery-fixture.json'),
  }
  const executable = join(app, 'Contents', 'MacOS', 'DSH Desktop')
  const args = ['--expose-internals', join(app, 'Contents', 'Resources', 'backend', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    '--profile', 'desktop-mint', '--patch', join(root, 'patch.yml'), '--no-open', '--port', '0']
  const child = spawn(confineWrites ? '/usr/bin/sandbox-exec' : executable,
    confineWrites ? ['-f', join(root, 'confinement.sb'), executable, ...args] : args,
    { cwd: join(root, 'workspace'), env: environment, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => { resolve({ code, signal }) })
  })
  let output = ''
  let errorOutput = ''
  const completed = new Promise<void>((resolve, reject) => {
    child.stdout.on('data', (bytes: Buffer) => {
      output += bytes.toString()
      if (output.length > 1024 * 1024) reject(new Error('Migration observer output exceeds limit'))
      if (output.includes('DSH_MIGRATION_AGENT_COMPLETE\n')) resolve()
    })
    child.stderr.on('data', (bytes: Buffer) => {
      errorOutput += bytes.toString()
      if (errorOutput.length > 1024 * 1024) reject(new Error('Migration observer diagnostics exceed limit'))
    })
  })
  try {
    await within(Promise.race([completed, closed.then(({ code, signal }) => {
      throw new Error(`Packaged migration exited before completion: ${String(code)}/${String(signal)}\n${errorOutput}`)
    })]), 60_000, 'Packaged Agent migration')
  } finally {
    try {
      terminate(child, 'SIGTERM')
      try { await within(closed, 10_000, 'Packaged migration shutdown') }
      catch (error) {
        if (child.pid !== undefined) await terminateMigrationGroup(child.pid)
        await within(closed, 5000, 'Packaged migration forced shutdown')
        throw error
      }
      if (child.pid !== undefined && !await migrationGroupQuiescent(child.pid, 5000)) {
        await terminateMigrationGroup(child.pid)
        throw new Error('Packaged migration left surviving process-group members')
      }
    } finally { writeFileSync(join(root, `${stage}.log`), `${output}${errorOutput}`, { mode: 0o600 }) }
  }
  const exit = await closed
  if (exit.code !== 0) throw new Error(`Packaged migration shutdown failed: ${String(exit.code)}/${String(exit.signal)}\n${errorOutput}`)
  const result = object(JSON.parse(readFileSync(join(root, `${stage}.json`), 'utf8')) as unknown)
  if (typeof result.error === 'string') throw new Error(`Packaged ${stage}: ${result.error}`)
  if (result.stage !== stage || (recovery ? typeof result.observation !== 'object' : !Array.isArray(result.events))) {
    throw new Error('Missing packaged migration observation')
  }
  let composition
  if (!recovery) {
    const dumpArgs = [...args.slice(0, 2), '--profile', 'desktop-mint', '--dump-config', '--patch', join(root, 'patch.yml')]
    const dump = spawnSync(confineWrites ? '/usr/bin/sandbox-exec' : executable,
      confineWrites ? ['-f', join(root, 'confinement.sb'), executable, ...dumpArgs] : dumpArgs,
      { cwd: join(root, 'workspace'), env: environment, encoding: 'utf8', timeout: 30_000, maxBuffer: 10 * 1024 * 1024 })
    if (dump.status !== 0 || dump.error !== undefined || dump.signal !== null) throw new Error(`Actual profile dump failed: ${String(dump.error)} ${dump.stderr}`)
    const profile = join(root, 'home/.dsh/profiles/desktop-mint')
    const manifest = readFileSync(join(profile, 'package.json'), 'utf8')
    const recipe = object(object(object(JSON.parse(manifest))['dsh'])['profile'])
    if (recipe['patchReload'] !== 'live' || JSON.stringify(recipe['bundles']) !== JSON.stringify([
      '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-desktop-mint',
    ])) throw new Error('Actual packaged Mint profile composition changed')
    const rows = yaml.load(dump.stdout, { schema: yaml.DEFAULT_SCHEMA.extend([
      new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (value: string) => value }),
    ]) })
    if (!Array.isArray(rows)) throw new Error('Actual composed profile dump has no rows')
    const selectedRow = (id: string): Record<string, unknown> => {
      const matches = rows.map(object).filter(row => row['id'] === id)
      if (matches.length !== 1 || matches[0]?.['disabled'] === true) throw new Error(`Missing or disabled composition row: ${id}`)
      return object(matches[0])
    }
    const storage = selectedRow('storage-domain')
    const query = selectedRow('session-query-sqlite')
    const notifications = selectedRow('ui-session-notifications')
    if (object(storage['config'])['backend'] !== 'json' || object(query['config'])['path'] !== ':memory:'
      || object(query['config'])['openAt'] !== 'never' || object(notifications['config'])['defaultMode'] !== 'background') throw new Error('Actual composition changes approved persistence or notification defaults')
    selectedRow('storage-json')
    if (rows.map(object).some(row => String(row['name']).includes('storage-sqlite') && row['disabled'] !== true)) {
      throw new Error('Unexpected active SQLite storage provider')
    }
    const dataFiles = ['home', 'workspace', 'tmp'].flatMap(name => migrationDataInventory(join(root, name), runtimeRoots).filter(entry => entry.kind === 'file').map(entry => join(root, name, entry.path)))
    const sqliteFiles = dataFiles.filter(path => readFileSync(path).subarray(0, 16).toString('utf8') === 'SQLite format 3\0')
    if (sqliteFiles.length !== 0) throw new Error('Default packaged composition created a durable SQLite database')
    const patch = readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')
    composition = { storage: { domain: storage, query, notifications, sqliteFiles, checkedDataFiles: dataFiles.length },
      manifest, manifestDigest: digest(manifest), patch, patchDigest: digest(patch),
      dump: dump.stdout, dumpDigest: digest(dump.stdout), scope: 'Actual boot-free composed rows, paired with normal profile activation above' }
  }
  return { ...result, composition, process: { pid: child.pid, ...exit, groupQuiescent: true, executable, argv: args, environment, workspace: join(root, 'workspace') } }
}

/** Execute baseline creation, target continuation/restart and restored-baseline observation.
 * @param baselineApp - verified exact delivered application, never an installed application.
 * @param targetApp - selected candidate's verified packaged application.
 * @param output - fresh caller-owned directory for retained observations.
 * @param options - local diagnostics retain an outer write constraint; disposable native CI may use its private account.
 * @returns Executed Agent observations only; complete registry and native UI qualification remain the caller's responsibility.
 */
export async function exerciseAgentMigration(
  baselineApp: string, targetApp: string, output: string, options: { confineWrites: boolean },
): Promise<Record<string, unknown>> {
  if (process.platform !== 'darwin') throw new Error('Packaged Agent migration requires native macOS')
  if (!options.confineWrites && process.env.CI !== 'true') throw new Error('Unconstrained migration requires a disposable native CI account')
  const runtimes = [baselineApp, targetApp]
  const baselineRuntime = runtimeInventory(baselineApp).sha256
  const targetRuntime = runtimeInventory(targetApp).sha256
  const observer = readFileSync(fileURLToPath(new URL('./fixtures/migration-agent-observer.mjs', import.meta.url)))
  const recoveryObserver = readFileSync(fileURLToPath(new URL('./fixtures/migration-recovery-observer.mjs', import.meta.url)))
  const piObserver = readFileSync(fileURLToPath(new URL('./fixtures/migration-pi-observer.mjs', import.meta.url)))
  mkdirSync(output, { mode: 0o700 })
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-agent-migration-')))
  let provider: MigrationProviderFixture | undefined
  let recorded = false
  try {
    provider = await startMigrationProvider()
    const transport = provider
    const quiescence: Record<string, unknown> = {}
    const execute = async (app: string, stage: string, recovery = false): Promise<Record<string, unknown>> => {
      const result = await runStage(root, app, stage, options.confineWrites, recovery, runtimes)
      quiescence[stage] = await within(transport.quiescent(), 10_000, 'Migration provider quiescence')
      return result
    }
    writeFileSync(join(root, 'provider-url'), provider.url)
    writeFileSync(join(root, 'migration-pi-observer.mjs'), piObserver)
    for (const name of ['home', 'tmp', 'workspace']) mkdirSync(join(root, name), { mode: 0o700 })
    mkdirSync(join(root, 'home/.dsh'), { mode: 0o700 })
    mkdirSync(join(root, 'home/.agents'), { mode: 0o700 })
    writeFileSync(join(root, 'home/.dsh/settings.yaml'), JSON.stringify({ 'qualification-unrelated': { sentinel: 'preserve synthetic unrelated keys', nested: [1, false, null] } }), { mode: 0o600 })
    const userEnvironment = 'QUALIFICATION_LAYER=synthetic-user\nQUALIFICATION_USER=synthetic-user\n'
    const projectEnvironment = 'QUALIFICATION_LAYER=synthetic-project\n'
    writeFileSync(join(root, 'home/.dsh/.env'), userEnvironment, { mode: 0o600 })
    writeFileSync(join(root, 'workspace/.env'), projectEnvironment, { mode: 0o600 })
    mkdirSync(join(root, 'workspace/.git'))
    mkdirSync(join(root, 'workspace/.agents/skills/migration-fixture'), { recursive: true, mode: 0o700 })
    writeFileSync(join(root, 'workspace/AGENTS.md'), '# Synthetic project instructions\nPreserve the qualification-project-instruction marker.\n', { mode: 0o600 })
    writeFileSync(join(root, 'home/.dsh/AGENTS.md'), '# Synthetic global instructions\nPreserve the qualification-global-instruction marker.\n', { mode: 0o600 })
    writeFileSync(join(root, 'workspace/.agents/skills/migration-fixture/SKILL.md'),
      '---\nname: migration-fixture\ndescription: Synthetic migration observation\n---\nPreserve qualification-skill-body.\n', { mode: 0o600 })
    writeFileSync(join(root, 'tmp/unrelated-spill-sentinel'), 'Synthetic unrelated temporary data', { mode: 0o600 })
    symlinkSync('unrelated-spill-sentinel', join(root, 'tmp/dsh-spill-ABCDEF'))
    writeFileSync(join(root, 'observer.mjs'), observer)
    writeFileSync(join(root, 'patch.yml'), "- insert:\n    - id: migration-observer\n      name: './observer.mjs'\n")
    writeFileSync(join(root, 'confinement.sb'), `(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* (subpath "${root}") (literal "/dev/null"))\n`)
    const populated = await execute(baselineApp, 'populate')
    const oldSpill = object(populated.spill)
    if (typeof oldSpill.locator !== 'string' || !oldSpill.locator.startsWith(`${join(root, 'tmp')}/`)) throw new Error('Baseline spill escaped private temp')
    const aged = (Date.now() - 45 * 24 * 60 * 60 * 1000) / 1000
    utimesSync(oldSpill.locator, aged, aged)
    const dataRoots = ['home', 'workspace', 'tmp'] as const
    const before = Object.fromEntries(
      dataRoots.map(name => [name, migrationDataInventory(join(root, name), runtimes)]),
    ) as Record<typeof dataRoots[number], ReturnType<typeof migrationDataInventory>>
    for (const name of dataRoots) copyMigrationData(join(root, name), join(root, 'backup', name), runtimes, before[name])
    const upgraded = await execute(targetApp, 'upgrade')
    if (existsSync(oldSpill.locator)) throw new Error('Target startup/disposal did not remove expired baseline spill')
    if (readFileSync(join(root, 'tmp/unrelated-spill-sentinel'), 'utf8') !== 'Synthetic unrelated temporary data') throw new Error('Spill cleanup changed unrelated bytes')
    const reopened = await execute(targetApp, 'reopen')
    writeFileSync(join(root, 'observer.mjs'), recoveryObserver)
    const builtWorker = await execute(targetApp, 'built-worker', true)
    const upgradedData = Object.fromEntries(dataRoots.map(name => [name, migrationDataInventory(join(root, name), runtimes)]))
    const originalLogs = before.home.filter(entry => entry.kind === 'file' && entry.path.startsWith('.dsh/sessions/')
      && /\.jsonl(?:\.zstd)?$/u.test(entry.path))
    if (originalLogs.length === 0) throw new Error('Baseline generated no durable history')
    for (const entry of originalLogs) {
      if (digest(readFileSync(join(root, 'home', entry.path))) !== entry.sha256) throw new Error('Migration changed an original generation')
    }
    for (const name of dataRoots) {
      if (JSON.stringify(migrationDataInventory(join(root, 'backup', name), runtimes)) !== JSON.stringify(before[name])) {
        throw new Error('Complete migration backup damaged before replacement')
      }
    }
    for (const name of dataRoots) {
      renameSync(join(root, name), join(root, `upgraded-${name}`))
      copyMigrationData(join(root, 'backup', name), join(root, name), runtimes, before[name])
    }
    writeFileSync(join(root, 'observer.mjs'), observer)
    const restored = await execute(baselineApp, 'restore')
    for (const name of dataRoots) {
      if (JSON.stringify(migrationDataInventory(join(root, `upgraded-${name}`), runtimes)) !== JSON.stringify(upgradedData[name])) {
        throw new Error('Restored baseline changed retained upgraded data')
      }
    }
    if (readFileSync(join(root, 'home/.dsh/.env'), 'utf8') !== userEnvironment
      || readFileSync(join(root, 'workspace/.env'), 'utf8') !== projectEnvironment) throw new Error('Migration changed environment fixture files')
    const resetData = (): void => {
      for (const name of dataRoots) {
        rmSync(join(root, name), { recursive: true })
        copyMigrationData(join(root, 'backup', name), join(root, name), runtimes, before[name])
      }
    }
    writeFileSync(join(root, 'observer.mjs'), recoveryObserver)
    const recoveryPatch = "- insert:\n    - id: migration-observer\n      name: './observer.mjs'\n"
    const preparationPatch = ['workspace', 'session-controller', 'workspace-controller']
      .map(id => `- id: ${id}\n  disabled: true\n`).join('') + recoveryPatch
    const recovery: Record<string, unknown> = {}
    for (const operation of ['create', 'delete']) {
      resetData()
      writeFileSync(join(root, 'patch.yml'), preparationPatch)
      const prepared = await execute(baselineApp, `prepare-${operation}`, true)
      writeFileSync(join(root, 'recovery-fixture.json'), JSON.stringify(prepared))
      writeFileSync(join(root, 'patch.yml'), recoveryPatch)
      recovery[operation] = { prepared, observed: await execute(targetApp, `recover-${operation}`, true) }
    }
    resetData()
    const cacheDirectory = join(root, 'home/.dsh/storages/session_projcache/sessions')
    const broken = JSON.stringify({ version: 7, record: { identity: { createdAt: 'not-a-number' }, rows: 'not-an-object' } })
    const projectionFixture = { brokenDigest: digest(broken),
      survivorDigest: digest(readFileSync(join(cacheDirectory, 'generated-baseline-history.json'))) }
    writeFileSync(join(cacheDirectory, 'qualification-broken.json'), broken, { mode: 0o600 })
    writeFileSync(join(root, 'recovery-fixture.json'), JSON.stringify(projectionFixture))
    recovery.projection = { fixture: projectionFixture,
      observed: await execute(targetApp, 'projection-invalid', true) }
    const refusals = []
    for (const spec of [
      { stage: 'credentials-invalid-version', path: 'home/.dsh/.credentials.yaml',
        bytes: '{"version":2,"refs":{}}\n', error: 'this build reads version 1' },
      { stage: 'credentials-invalid-record', path: 'home/.dsh/.credentials.yaml',
        bytes: '{"version":1,"records":{"qualification-fixture/route":{"kind":"unknown"}}}\n', error: 'has unknown kind' },
      { stage: 'env-project-proxy', path: 'workspace/.env', bytes: 'HTTP_PROXY=http://127.0.0.1:1\n', error: 'only the launching environment may set' },
      { stage: 'env-home-tls', path: 'home/.dsh/.env', bytes: 'NODE_TLS_REJECT_UNAUTHORIZED=0\n', error: 'only the launching environment may set' },
      { stage: 'env-project-bootstrap', path: 'workspace/.env', bytes: 'DSH_HOME=/synthetic-refused\n', error: 'only the launching environment may set' },
    ]) {
      resetData()
      writeFileSync(join(root, spec.path), spec.bytes, { mode: 0o600 })
      let refused: string | undefined
      try { await execute(targetApp, spec.stage, true) }
      catch (error) {
        const message = String(error)
        if (!message.includes(spec.error)) throw error
        refused = message
      }
      if (refused === undefined || existsSync(join(root, `${spec.stage}.json`))) throw new Error('Invalid fixture activated its observer')
      if (readFileSync(join(root, spec.path), 'utf8') !== spec.bytes) throw new Error('Refused fixture was rewritten')
      quiescence[spec.stage] = await within(transport.quiescent(), 10_000, 'Refused fixture quiescence')
      const receipt = { ...spec, sha256: digest(spec.bytes), refusal: refused, observerActivated: false }
      refusals.push(receipt)
      writeFileSync(join(root, `${spec.stage}-receipt.json`), JSON.stringify(receipt))
    }
    resetData()
    const proxyEnvironment = 'HTTP_PROXY=http://127.0.0.1:1\nNO_PROXY=127.0.0.1\n'
    writeFileSync(join(root, 'home/.dsh/.env'), proxyEnvironment, { mode: 0o600 })
    const homeProxy = await execute(targetApp, 'env-home-proxy', true)
    if (readFileSync(join(root, 'home/.dsh/.env'), 'utf8') !== proxyEnvironment) throw new Error('Home proxy fixture was rewritten')
    if (runtimeInventory(baselineApp).sha256 !== baselineRuntime || runtimeInventory(targetApp).sha256 !== targetRuntime) throw new Error('Packaged application changed during migration')
    const result = { schemaVersion: 1, purpose: 'desktop-packaged-agent-migration-observation', qualification: false,
      architecture: process.arch, baselineRuntime, targetRuntime, observerDigest: digest(observer),
      populated, upgraded, reopened, restored, builtWorker, originalLogs, recovery, refusals, homeProxy,
      spillCleanup: { agedLocator: oldSpill.locator, agedAtSeconds: aged, removedAfterTarget: true, unrelatedBytes: 'Synthetic unrelated temporary data' },
      transport: { requests: transport.requests, quiescence },
      backupManifest: before, upgradedManifest: upgradedData, retainedAfterRestoreDigest: digest(JSON.stringify(upgradedData)),
      fixtureManifest: { producerDigest: digest(observer), baselineHistoryDigest: digest(JSON.stringify(populated.events)),
        recoveryProducerDigest: digest(recoveryObserver), piProducerDigest: digest(piObserver),
        preparationPatchDigest: digest(preparationPatch), recoveryPatchDigest: digest(recoveryPatch),
        userEnvironmentDigest: digest(userEnvironment), projectEnvironmentDigest: digest(projectEnvironment),
        configuredRoots: dataRoots, baselineRuntime, profile: 'desktop-mint', preset: 'standard', provider: 'qualification-fixture' } }
    writeFileSync(join(output, 'agent-migration.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
    recorded = true
    return result
  } finally {
    try {
      for (const name of readdirSync(root).filter(name => name.endsWith('.json') || name.endsWith('.log'))) {
        cpSync(join(root, name), join(output, name), { errorOnExist: true, force: false })
      }
    } finally {
      let providerClosed = false
      try { await provider?.close(); providerClosed = true }
      finally {
        if (recorded && providerClosed) rmSync(root, { recursive: true, force: true })
        else writeFileSync(join(output, 'diagnostic-fixture.json'), JSON.stringify({
          purpose: 'desktop-migration-failure-diagnostics', qualification: false, fixtureRoot: root,
          cleanup: 'Retain the stopped synthetic fixture until the failure has been assessed.',
        }, null, 2) + '\n', { mode: 0o600 })
      }
    }
  }
}
