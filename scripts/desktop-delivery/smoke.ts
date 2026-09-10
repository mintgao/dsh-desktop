/** Mount unsigned DMGs read-only and exercise the packaged bootstrap and real backend. */
import { spawnSync } from 'node:child_process'
import { cpSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, sep } from 'node:path'
import { BackendSupervisor } from '../../apps/desktop/src/backend.ts'
import { checkArchitecture } from './artifacts.ts'
import { readCandidate } from './candidate.ts'
import { assetPath, digest, distribution, readJson, shadow, type Architecture } from './evidence.ts'

function command(executable: string, args: string[], environment: NodeJS.ProcessEnv): string {
  const result = spawnSync(executable, args, { encoding: 'utf8', env: environment, timeout: 60_000, maxBuffer: 1024 * 1024 })
  if (result.error !== undefined || result.signal !== null || result.status !== 0) throw new Error(`${basename(executable)} failed: ${result.error?.message ?? result.signal ?? String(result.status)}\n${result.stderr}`)
  return result.stdout.trim()
}

/**
 * Exercise the loopback token exchange and fetch its Web page with the issued cookie.
 * @param url - canonical readiness URL retained in memory by the supervisor.
 * @param request - HTTP adapter; production uses fetch.
 */
export async function probeBackendPage(url: string, request: typeof fetch = fetch): Promise<void> {
  const initial = new URL(url)
  if (initial.protocol !== 'http:' || initial.hostname !== '127.0.0.1' || initial.username !== '' || initial.password !== '') {
    throw new Error('Backend smoke requires loopback HTTP')
  }
  let response = await request(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  if (response.status === 303) {
    await response.body?.cancel()
    const location = response.headers.get('location')
    const target = location === null ? undefined : new URL(location, initial)
    const cookies = response.headers.getSetCookie()
    const cookie = cookies[0]?.split(';')[0]
    if (target?.origin !== initial.origin || target.pathname !== '/' || target.search !== '' || target.hash !== ''
      || target.username !== '' || target.password !== '' || cookies.length !== 1 || cookie === undefined || !cookie.includes('=')) {
      throw new Error('Unsafe or missing backend authentication redirect')
    }
    response = await request(target.href, {
      method: 'GET', redirect: 'error', headers: { Cookie: cookie }, signal: AbortSignal.timeout(15_000),
    })
  }
  const body = await response.text()
  if (!response.ok || !body.includes('<html')) {
    const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim()
    const contentType = ['text/html', 'text/plain', 'application/json', 'application/octet-stream'].includes(mediaType ?? '')
      ? mediaType
      : mediaType === undefined ? 'missing' : 'other'
    throw new Error(`Packaged backend did not serve its Web application (status=${String(response.status)}, content-type=${contentType})`)
  }
}


/** Reject root application aliases before any executable is inspected or launched.
 * @param container - mount or isolated installation directory.
 * @param app - expected application directory.
 */
export function validateApplicationRoot(container: string, app: string): void {
  const metadata = lstatSync(app)
  if (metadata.isSymbolicLink() || !metadata.isDirectory() || !realpathSync(app).startsWith(`${realpathSync(container)}${sep}`)) throw new Error('Application root escapes its mount or installation')
  const root = realpathSync(app)
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      const entry = lstatSync(path)
      if (entry.isSymbolicLink()) {
        const target = realpathSync(path)
        if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error('Packaged symlink escapes application payload')
      } else if (entry.isDirectory()) visit(path)
    }
  }
  visit(app)
}

/** Remove writable probe data even when the read-only volume cannot be detached.
 * @param temporary - probe-owned directory containing the mount and writable siblings.
 * @param detach - exact mount detach operation.
 */
export function cleanupSmoke(temporary: string, detach: () => void): void {
  try { detach() }
  catch (error) {
    for (const name of ['installation', 'workspace', 'home']) rmSync(join(temporary, name), { recursive: true, force: true })
    throw error
  }
  rmSync(temporary, { recursive: true, force: true })
}

async function exercisePayload(
  app: string, application: string, architecture: Architecture, desktopVersion: unknown,
  backendVersionExpected: unknown, workspace: string, environment: NodeJS.ProcessEnv,
): Promise<string> {
  const executable = join(app, 'Contents', 'MacOS', application)
  if (!realpathSync(executable).startsWith(`${realpathSync(app)}${sep}`)) throw new Error('Packaged executable escapes mounted image')
  const executableArchitectures = command('/usr/bin/lipo', ['-archs', executable], environment)
  checkArchitecture(executableArchitectures, architecture)
  const version = command('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(app, 'Contents', 'Info.plist')], environment)
  if (version !== desktopVersion) throw new Error('Packaged desktop version differs from candidate')
  command(executable, ['--dsh-package-smoke'], environment)
  const cliPath = join(app, 'Contents', 'Resources', 'backend', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!realpathSync(cliPath).startsWith(`${realpathSync(app)}${sep}`)) throw new Error('Packaged backend escapes mounted image')
  const backendVersion = command(executable, [cliPath, '--version'], { ...environment, ELECTRON_RUN_AS_NODE: '1' })
  if (backendVersion !== backendVersionExpected) throw new Error('Packaged backend version differs from candidate')
  let unexpectedExit: string | undefined
  const backend = new BackendSupervisor({
    executable, cliPath, cwd: workspace, environment, electronNodeMode: true, startupTimeoutMs: 60_000, shutdownTimeoutMs: 5_000,
    onUnexpectedExit: (exit) => { unexpectedExit = JSON.stringify(exit) },
  })
  try {
    const url = await backend.start()
    await probeBackendPage(url)
  } finally {
    await backend.stop()
  }
  if (unexpectedExit !== undefined) throw new Error(`Packaged backend exited unexpectedly: ${unexpectedExit}`)
  return executableArchitectures
}

/** Exercise an actual mounted DMG, without installing or contacting update services.
 * @param configPath - distribution JSON.
 * @param candidatePath - candidate JSON bound to this package.
 * @param dmgPath - unsigned DMG produced by electron-builder.
 * @param architecture - expected native architecture.
 * @param options - optional isolated copy-install check and explicit desktop metadata version.
 * @returns Smoke evidence only after backend termination and DMG detach complete.
 */
export async function smokeDmg(
  configPath: string, candidatePath: string, dmgPath: string, architecture: Architecture,
  options: { copyInstall?: boolean; desktopVersion?: string } = {},
): Promise<Record<string, unknown>> {
  if (process.platform !== 'darwin' || process.arch !== architecture) throw new Error('DMG smoke requires the matching native macOS host')
  const config = distribution(readJson(configPath))
  if (!config.architectures.includes(architecture)) throw new Error('Architecture not configured')
  const selected = readCandidate(candidatePath, configPath)
  const dmg = assetPath(dirname(dmgPath), basename(dmgPath))
  const dmgDigest = digest(readFileSync(dmg))
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-shadow-smoke-'))
  const mount = join(temporary, 'mounted')
  const workspace = join(temporary, 'workspace')
  const home = join(temporary, 'home')
  for (const directory of [mount, workspace, home]) mkdirSync(directory, { mode: 0o700 })
  const environment = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, TMPDIR: temporary, DSH_HOME: join(home, '.dsh'), DSH_TELEMETRY_DISABLED: '1' }
  let mountAttempted = false
  let result: Record<string, unknown>
  try {
    mountAttempted = true
    command('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg], environment)
    const apps = readdirSync(mount).filter(name => name.endsWith('.app'))
    if (apps.length !== 1 || apps[0] !== `${config.application}.app`) throw new Error('DMG must contain exactly the expected application')
    const app = join(mount, `${config.application}.app`)
    validateApplicationRoot(mount, app)
    const executableArchitectures = await exercisePayload(
      app, config.application, architecture, options.desktopVersion ?? selected.record.desktopVersion,
      selected.record.desktopVersion, workspace, environment,
    )
    if (options.copyInstall === true) {
      const installed = join(temporary, 'installation', `${config.application}.app`)
      cpSync(app, installed, { recursive: true, verbatimSymlinks: true })
      validateApplicationRoot(join(temporary, 'installation'), installed)
      await exercisePayload(
        installed, config.application, architecture, options.desktopVersion ?? selected.record.desktopVersion,
        selected.record.desktopVersion, workspace, environment,
      )
    }
    if (digest(readFileSync(dmg)) !== dmgDigest) throw new Error('DMG changed during smoke')
    result = { ...shadow, ...(options.copyInstall === true ? { purpose: 'desktop-release-native-evidence', state: selected.record.qualificationEligible === true ? 'native-checks-passed' : 'diagnostic-native-checks-passed', mode: 'unsigned-preview', copiedInstallation: true, installationStopped: true, installationRemoved: true, qualificationEligible: selected.record.qualificationEligible, desktopVersion: options.desktopVersion ?? selected.record.desktopVersion } : {}), kind: 'smoke', candidateDigest: selected.digest, dmgDigest, architecture, executableArchitectures, bootstrap: true, backendHttp: true, backendStopped: true, mountedReadOnly: true, detached: true }
  } finally {
    cleanupSmoke(temporary, () => {
      if (mountAttempted) command('/usr/bin/hdiutil', ['detach', mount], environment)
    })
  }
  return result
}
