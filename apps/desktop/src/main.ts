/** Electron main process for the DSH Desktop macOS application. */

import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { BackendSupervisor, type BackendExit } from './backend.ts'
import { externalWebUrl, isAllowedAppNavigation } from './navigation.ts'

const APPLICATION_NAME = 'DSH Desktop'

let backend: BackendSupervisor | undefined
let backendStopped = false
let cleanupPromise: Promise<void> | undefined
let mainWindow: BrowserWindow | undefined
let logStream: WriteStream | undefined
let logPath: string | undefined

app.setName(APPLICATION_NAME)
app.setAboutPanelOptions({
  applicationName: APPLICATION_NAME,
  applicationVersion: app.getVersion(),
  version: app.getVersion(),
  copyright: 'Unofficial distribution maintained by Mint.',
  credits: 'Built on DeepSeek Harness. Not endorsed by DeepSeek.',
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.on('before-quit', (event) => {
    if (backend === undefined || backendStopped) return
    event.preventDefault()
    cleanupPromise ??= backend.stop().finally(() => {
      backendStopped = true
      logStream?.end()
      app.quit()
    })
  })
  app.on('window-all-closed', () => {
    app.quit()
  })
  void app.whenReady().then(startApplication).catch(reportStartupFailure)
}

/** Create the native window, start dsh Web, and load its canonical loopback URL. */
async function startApplication(): Promise<void> {
  const logsDirectory = app.getPath('logs')
  mkdirSync(logsDirectory, { recursive: true })
  logPath = join(logsDirectory, 'backend.log')
  logStream = createWriteStream(logPath, { flags: 'a' })
  logStream.on('error', (error) => {
    console.error(`desktop log: ${error.message}`)
  })
  mainWindow = createMainWindow()
  await mainWindow.loadFile(fileURLToPath(new URL('../resources/startup.html', import.meta.url)))

  const cliPath = resolveCliPath()
  if (!existsSync(cliPath)) {
    throw new Error(`The built dsh CLI was not found at ${cliPath}.`)
  }
  backend = new BackendSupervisor({
    executable: process.execPath,
    cliPath,
    cwd: homedir(),
    log: (text) => {
      logStream?.write(text)
    },
    onUnexpectedExit: reportUnexpectedExit,
  })
  const backendUrl = await backend.start()
  installNavigationPolicy(mainWindow, backendUrl)
  await mainWindow.loadURL(backendUrl)
}

/** Resolve the source-build or packaged CLI entry without changing dsh's data directory. */
function resolveCliPath(): string {
  const override = process.env.DSH_DESKTOP_CLI_PATH
  if (override !== undefined && override !== '') return override
  if (app.isPackaged) {
    return join(process.resourcesPath, 'backend', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  }
  return fileURLToPath(new URL('../../cli/lib/bin.js', import.meta.url))
}

/** Create a sandboxed renderer with no Node or preload bridge. */
function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1_280,
    height: 840,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#f6f8fb',
    title: APPLICATION_NAME,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })
  window.once('ready-to-show', () => {
    window.show()
  })
  window.on('closed', () => {
    mainWindow = undefined
  })
  return window
}

/** Keep app navigation on the backend origin and delegate safe external links to macOS. */
function installNavigationPolicy(window: BrowserWindow, applicationUrl: string): void {
  const openExternal = (candidate: string): void => {
    const url = externalWebUrl(candidate)
    if (url === undefined || isAllowedAppNavigation(url, applicationUrl)) return
    void shell.openExternal(url).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`desktop navigation: could not open ${url}: ${reason}`)
    })
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url, applicationUrl)) return
    event.preventDefault()
    openExternal(url)
  })
}

/** Report a backend exit that happened after the window received its ready URL. */
function reportUnexpectedExit(exit: BackendExit): void {
  const detail = exit.code === null ? `signal ${exit.signal ?? 'unknown'}` : `status ${String(exit.code)}`
  dialog.showErrorBox(
    `${APPLICATION_NAME} stopped`,
    `The DSH backend exited unexpectedly (${detail}).${logLocationSuffix()}${diagnosticSuffix(exit.diagnostics)}`,
  )
  app.quit()
}

/** Report an application startup failure and close the partially started backend. */
function reportStartupFailure(error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error)
  dialog.showErrorBox(`${APPLICATION_NAME} could not start`, `${reason}${logLocationSuffix()}`)
  app.quit()
}

/** Describe the persistent desktop log when it has been initialized. */
function logLocationSuffix(): string {
  return logPath === undefined ? '' : `\n\nLog: ${logPath}`
}

/** Include bounded backend diagnostics when no log viewer is available. */
function diagnosticSuffix(diagnostics: string): string {
  return diagnostics === '' ? '' : `\n\nRecent backend output:\n${diagnostics}`
}
