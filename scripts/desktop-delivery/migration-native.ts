/** Normal Electron startup observation without replacing its main process or sandbox. */
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { MigrationDebugger } from './migration-debugger.ts'
import { digest, object } from './evidence.ts'
import { migrationGroupQuiescent, terminateMigrationGroup } from './migration-processes.ts'

const electronExpression = "process.getBuiltinModule('module').createRequire(process.execPath)('electron')"
const pathsExpression = `(()=>{const {app,BrowserWindow}=${electronExpression};return {
  pid:process.pid,versions:process.versions,ready:app.isReady(),appPath:app.getAppPath(),argv:process.argv,
  environment:Object.fromEntries(['HOME','CFFIXED_USER_HOME','DSH_HOME','DSH_AGENTS_HOME','TMPDIR','MAC_CHROMIUM_TMPDIR'].map(name=>[name,process.env[name]])),
  paths:Object.fromEntries(['home','logs','userData','sessionData','temp'].map(name=>[name,app.getPath(name)])),
  windows:BrowserWindow.getAllWindows().map(window=>({url:window.webContents.getURL()}))}})()`

function checkedPaths(value: unknown, root: string): Record<string, unknown> {
  const observed = object(value)
  const paths = object(observed['paths'])
  const environment = object(observed['environment'])
  if (environment['DSH_HOME'] !== join(root, 'home/.dsh') || environment['DSH_AGENTS_HOME'] !== join(root, 'home/.agents')) throw new Error('Native backend configuration roots are not private')
  for (const name of ['home', 'logs', 'userData', 'sessionData', 'temp']) {
    const path = paths[name]
    if (typeof path !== 'string') throw new Error(`Native path ${name} is missing`)
    // Electron may choose a log path before creating it. Its existing private home
    // ancestor and lexical descendant are checked before ready; post-ready uses realpath.
    let ancestor = path
    const missing = []
    while (!existsSync(ancestor)) {
      missing.unshift(basename(ancestor))
      const parent = dirname(ancestor)
      if (parent === ancestor) throw new Error(`Native path has no existing ancestor: ${path}`)
      ancestor = parent
    }
    const canonical = join(realpathSync(ancestor), ...missing)
    const child = relative(root, canonical)
    if (child === '' || child === '..' || child.startsWith(`..${sep}`) || child.startsWith(sep)) {
      throw new Error(`Native path ${name} escapes fixture: ${path}`)
    }
  }
  return observed
}

/** Observation hooks attach to the existing main process and BrowserWindow. */
export interface NativeMigrationVisitor {
  /** Install narrowly scoped observer/transport inputs while main is paused. */
  beforeMain(connection: MigrationDebugger, signal: AbortSignal, script: { scriptId: string; source: string }): Promise<unknown>
  /** Finish owned constructor breakpoints before awaiting normal-window readiness. */
  afterResume?(connection: MigrationDebugger, signal: AbortSignal): Promise<void>
  /** Exercise the normally loaded BrowserWindow and native controls. */
  visit(connection: MigrationDebugger, browserEndpoint: string, ready: Record<string, unknown>, signal: AbortSignal): Promise<unknown>
}

/** Prove an exact packaged Electron pauses before Mint main executes.
 * @param app - Exact unpacked application whose runtime inventory is owned by the caller.
 * @param root - Fresh caller-owned fixture directory retained for evidence on failure.
 * @returns Before-entrypoint paths and actual inspector pause, without resuming main.
 */
export async function probeMigrationNativeBarrier(app: string, root: string): Promise<Record<string, unknown>> {
  return await executeMigrationNative(app, root)
}

/** Run the unchanged main and renderer only on a disposable hosted native runner.
 * @param app - Exact architecture-matched packaged app.
 * @param root - Caller-owned private roots, including any restored fixture data.
 * @param visitor - Actual normal-window actions and narrowly scoped fixture transport.
 * @returns Startup, effective native actions and post-ready path observations.
 */
export async function exerciseMigrationNative(
  app: string, root: string, visitor: NativeMigrationVisitor,
): Promise<Record<string, unknown>> {
  if (process.env['GITHUB_ACTIONS'] !== 'true' || process.env['RUNNER_ENVIRONMENT'] !== 'github-hosted') {
    throw new Error('Normal native qualification requires a disposable GitHub-hosted macOS runner')
  }
  return await executeMigrationNative(app, root, visitor)
}

async function executeMigrationNative(app: string, root: string, visitor?: NativeMigrationVisitor): Promise<Record<string, unknown>> {
  if (process.platform !== 'darwin') throw new Error('Native migration requires macOS')
  root = realpathSync(root)
  for (const name of ['home', 'home/.agents', 'userdata', 'tmp', 'workspace']) mkdirSync(join(root, name), { mode: 0o700, recursive: true })
  const sandbox = join(root, 'confinement.sb')
  writeFileSync(sandbox, `(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* (subpath ${JSON.stringify(root)}) (literal "/dev/null"))\n`)
  const executable = join(app, 'Contents/MacOS/DSH Desktop')
  const args = ['--inspect-brk=127.0.0.1:0', `--user-data-dir=${join(root, 'userdata')}`,
    ...visitor === undefined ? [] : ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0']]
  const child = spawn(visitor === undefined ? '/usr/bin/sandbox-exec' : executable,
    visitor === undefined ? ['-f', sandbox, executable, ...args] : args, {
      cwd: join(root, 'workspace'), detached: true,
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: join(root, 'home'), CFFIXED_USER_HOME: join(root, 'home'),
        TMPDIR: join(root, 'tmp'), MAC_CHROMIUM_TMPDIR: join(root, 'tmp'), DSH_HOME: join(root, 'home/.dsh'), DSH_AGENTS_HOME: join(root, 'home/.agents'), DSH_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  const closed = once(child, 'close')
  void closed.catch(() => { /* The owning startup/cleanup awaits report this spawn failure. */ })
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort(new Error('Native pre-entrypoint probe deadline exceeded')) }, visitor === undefined ? 15_000 : 120_000)
  let debuggerConnection: MigrationDebugger | undefined
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (bytes: Buffer) => {
    stdout += bytes.toString()
    if (stdout.length > 1024 * 1024) controller.abort(new Error('Native stdout exceeds fixture limit'))
  })
  try {
    const address = await new Promise<string>((resolve, reject) => {
      const abort = (): void => { reject(new Error('Native inspector endpoint deadline exceeded')) }
      controller.signal.addEventListener('abort', abort, { once: true })
      child.stderr.on('data', (bytes: Buffer) => {
        stderr += bytes.toString()
        if (stderr.length > 1024 * 1024) controller.abort(new Error('Native stderr exceeds fixture limit'))
        const match = /Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/u.exec(stderr)
        if (match?.[1] !== undefined) { controller.signal.removeEventListener('abort', abort); resolve(match[1]) }
      })
      child.once('error', reject)
      child.once('close', (code) => {
        controller.signal.removeEventListener('abort', abort)
        reject(new Error(`Native process exited before inspector: ${code}; ${stderr}`))
      })
    })
    debuggerConnection = await MigrationDebugger.connect(address, controller.signal)
    await debuggerConnection.send('Debugger.enable', {}, controller.signal)
    await debuggerConnection.send('Runtime.runIfWaitingForDebugger', {}, controller.signal)
    const pause = await debuggerConnection.event('Debugger.paused', controller.signal)
    if (pause['reason'] !== 'Break on start') throw new Error('Native entrypoint did not report its startup barrier')
    const response = await debuggerConnection.send('Runtime.evaluate', { expression: pathsExpression, returnByValue: true }, controller.signal)
    if (response['exceptionDetails'] !== undefined) throw new Error(JSON.stringify(response['exceptionDetails']))
    const observation = checkedPaths(object(response['result'])['value'], root)
    if (observation['ready'] !== false || !Array.isArray(observation['windows']) || observation['windows'].length !== 0) {
      throw new Error('Native application advanced past the pre-entrypoint barrier')
    }
    if (!Array.isArray(pause['callFrames']) || pause['callFrames'].length === 0) throw new Error('Native barrier has no paused entrypoint')
    const location = object(object(pause['callFrames'][0])['location'])
    if (location['lineNumber'] !== 0 || location['columnNumber'] !== 0 || typeof location['scriptId'] !== 'string') {
      throw new Error('Native barrier is not the first entrypoint instruction')
    }
    const script = await debuggerConnection.send('Debugger.getScriptSource', { scriptId: location['scriptId'] }, controller.signal)
    const entry = await debuggerConnection.send('Runtime.evaluate', { expression: `(()=>{
      const fs=process.getBuiltinModule('fs'),path=process.getBuiltinModule('path'),{app}=${electronExpression};
      const manifest=JSON.parse(fs.readFileSync(path.join(app.getAppPath(),'package.json'),'utf8'));
      const entry=path.join(app.getAppPath(),manifest.main);return {entry,source:fs.readFileSync(entry,'utf8')}})()`,
    returnByValue: true }, controller.signal)
    if (entry['exceptionDetails'] !== undefined) throw new Error(JSON.stringify(entry['exceptionDetails']))
    const packagedEntry = object(object(entry['result'])['value'])
    if (typeof script['scriptSource'] !== 'string' || packagedEntry['source'] !== script['scriptSource']) {
      throw new Error('Native paused source differs from the exact packaged main entrypoint')
    }
    const entrypoint = { path: packagedEntry['entry'], sha256: digest(script['scriptSource']) }
    let normal: Record<string, unknown> | undefined
    if (visitor !== undefined) {
      const input = await visitor.beforeMain(debuggerConnection, controller.signal, { scriptId: location['scriptId'], source: script['scriptSource'] })
      const register = await debuggerConnection.send('Runtime.evaluate', { expression: `(()=>{
        const {app,BrowserWindow}=${electronExpression};
        globalThis.__dshMigrationReady=new Promise(resolve=>{
          const observe=window=>{const loaded=()=>{const url=window.webContents.getURL();
            if(url.startsWith('http://127.0.0.1:')){
              window.webContents.removeListener('did-finish-load',loaded);
              resolve({url,pid:process.pid,versions:process.versions,ready:app.isReady(),argv:process.argv,
                environment:Object.fromEntries(['HOME','CFFIXED_USER_HOME','DSH_HOME','DSH_AGENTS_HOME','TMPDIR','MAC_CHROMIUM_TMPDIR'].map(name=>[name,process.env[name]])),
                paths:Object.fromEntries(['home','logs','userData','sessionData','temp'].map(name=>[name,app.getPath(name)]))});
            }};window.webContents.on('did-finish-load',loaded);loaded()};
          app.on('browser-window-created',(_event,window)=>observe(window));
          BrowserWindow.getAllWindows().forEach(observe);
        });return true})()`, returnByValue: true }, controller.signal)
      if (register['exceptionDetails'] !== undefined) throw new Error(JSON.stringify(register['exceptionDetails']))
      await debuggerConnection.send('Debugger.resume', {}, controller.signal)
      await visitor.afterResume?.(debuggerConnection, controller.signal)
      const loaded = await debuggerConnection.send('Runtime.evaluate', { expression: 'globalThis.__dshMigrationReady',
        awaitPromise: true, returnByValue: true }, controller.signal)
      if (loaded['exceptionDetails'] !== undefined) throw new Error(JSON.stringify(loaded['exceptionDetails']))
      const ready = checkedPaths(object(loaded['result'])['value'], root)
      if (ready['ready'] !== true) throw new Error('Normal native window loaded before application readiness')
      const browserEndpoint = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/u.exec(stderr)?.[1]
      if (browserEndpoint === undefined) throw new Error('Normal renderer has no owned browser DevTools endpoint')
      const actions = await visitor.visit(debuggerConnection, browserEndpoint, ready, controller.signal)
      normal = { input, ready, actions }
      await debuggerConnection.send('Runtime.evaluate', { expression: `${electronExpression}.app.quit()` }, controller.signal)
      await debuggerConnection.close()
      debuggerConnection = undefined
      const exited = await Promise.race([closed, new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => { reject(new Error('Normal native shutdown deadline exceeded')) }, { once: true })
      })])
      if (exited[0] !== 0 || exited[1] !== null) throw new Error(`Normal native shutdown failed: ${JSON.stringify(exited)}`)
      if (child.pid === undefined || !await migrationGroupQuiescent(child.pid, 5000)) {
        throw new Error('Native descendants survived normal main shutdown')
      }
      normal['shutdown'] = { exit: exited, groupQuiescent: true }
    }
    const result = { qualification: false, entrypoint, normal, scope: visitor === undefined ? 'confined Electron pre-entrypoint barrier only' : 'normally launched packaged Electron observations', observation, pause }
    writeFileSync(join(root, 'barrier.json'), `${JSON.stringify(result, null, 2)}\n`)
    return result
  } finally {
    clearTimeout(timer)
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined
    try {
      if (child.pid !== undefined) {
        const cleanup = await terminateMigrationGroup(child.pid)
        writeFileSync(join(root, 'process-cleanup.json'), `${JSON.stringify(cleanup)}\n`)
      }
      await debuggerConnection?.close()
      await Promise.race([closed, new Promise<never>((_resolve, reject) => {
        cleanupTimer = setTimeout(() => { reject(new Error('Native process did not close after termination')) }, 10_000)
      })])
    } finally {
      clearTimeout(cleanupTimer)
      writeFileSync(join(root, 'stdout.log'), stdout)
      writeFileSync(join(root, 'stderr.log'), stderr)
    }
  }
}
