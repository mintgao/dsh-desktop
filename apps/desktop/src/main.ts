/** Electron main process for the DSH Desktop macOS application. */

import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  net,
  Notification,
  shell,
  type MenuItemConstructorOptions,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
} from 'electron'
import { BackendSupervisor, type BackendExit } from './backend.ts'
import { ElectronUpdateDriver } from './electron-updates.ts'
import { GitHubReleaseDriver } from './github-releases.ts'
import { FileManualUpdatePreferencesStore } from './manual-update-preferences.ts'
import {
  ManualUpdateController,
  type DesktopArchitecture,
  type ManualDesktopReleaseInfo,
  type ManualUpdatePresentation,
  type ManualUpdateStatus,
} from './manual-updates.ts'
import { externalWebUrl, isAllowedAppNavigation } from './navigation.ts'
import {
  DesktopUpdateController,
  type DesktopUpdateInfo,
  type DesktopUpdatePresentation,
  type DesktopUpdateStatus,
} from './updates.ts'

const APPLICATION_NAME = 'DSH Desktop'
const PACKAGE_SMOKE_ARGUMENT = '--dsh-package-smoke'
const UPDATE_MENU_ITEM_ID = 'check-for-updates'
const RELEASES_URL = 'https://github.com/mintgao/dsh-desktop/releases'

let backend: BackendSupervisor | undefined
let backendStopped = false
let cleanupPromise: Promise<void> | undefined
let installUpdateOnQuit = false
let mainWindow: BrowserWindow | undefined
let logStream: WriteStream | undefined
let logPath: string | undefined
let manualUpdateController: ManualUpdateController | undefined
let updateController: DesktopUpdateController | undefined
let updateDriver: ElectronUpdateDriver | undefined
let requestUpdateCheck: (() => Promise<void>) | undefined

if (process.argv.includes(PACKAGE_SMOKE_ARGUMENT)) {
  app.exit(0)
} else {
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
      void stopApplicationBackend().then(finishApplicationQuit)
    })
    app.on('window-all-closed', () => {
      app.quit()
    })
    void app.whenReady().then(startApplication).catch(reportStartupFailure)
  }
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
  installApplicationMenu()
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
  await initializeUpdates()
}

/** Install the standard macOS application menu and the native update command. */
function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: APPLICATION_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          id: UPDATE_MENU_ITEM_ID,
          label: 'Check for Updates…',
          enabled: false,
          click: () => {
            void requestUpdateCheck?.()
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Select manual prerelease awareness or signed stable updates after startup. */
async function initializeUpdates(): Promise<void> {
  if (app.getVersion().includes('-')) {
    await initializeManualUpdates()
    return
  }
  initializeSignedUpdates()
}

/** Start signed stable-channel update checks. */
function initializeSignedUpdates(): void {
  updateDriver = new ElectronUpdateDriver((level, message) => {
    logStream?.write(`[desktop update ${level}] ${message}\n`)
  })
  updateController = new DesktopUpdateController({
    enabled: app.isPackaged && process.platform === 'darwin',
    currentVersion: app.getVersion(),
    driver: updateDriver,
    presentation: createUpdatePresentation(),
    restartAndInstall: async () => {
      installUpdateOnQuit = true
      await stopApplicationBackend()
      updateDriver?.quitAndInstall()
    },
    installOnQuit: () => {
      installUpdateOnQuit = true
    },
  })
  updateController.start()
  requestUpdateCheck = async () => {
    await updateController?.check(true)
  }
}

/** Start manual release awareness for a prerelease channel. */
async function initializeManualUpdates(): Promise<void> {
  const architecture = desktopArchitecture()
  const enabled = app.isPackaged && process.platform === 'darwin' && architecture !== undefined
  const selectedArchitecture = architecture ?? 'x64'
  const presentation = createManualUpdatePresentation(selectedArchitecture)
  manualUpdateController = new ManualUpdateController({
    enabled,
    currentVersion: app.getVersion(),
    driver: new GitHubReleaseDriver({
      architecture: selectedArchitecture,
      currentVersion: app.getVersion(),
      fetch: async (url, init) => net.fetch(url, init),
    }),
    store: new FileManualUpdatePreferencesStore(
      join(app.getPath('userData'), 'manual-update-preferences.json'),
      message => logStream?.write(`[desktop manual update] ${message}\n`),
    ),
    presentation,
  })
  await manualUpdateController.start()
  requestUpdateCheck = async () => {
    await manualUpdateController?.check(true)
  }
}

/** Narrow Electron's process architecture to the macOS artifacts we publish. */
function desktopArchitecture(): DesktopArchitecture | undefined {
  if (process.arch === 'arm64' || process.arch === 'x64') return process.arch
  return undefined
}

/** Map update state and decisions to macOS-native presentation. */
function createUpdatePresentation(): DesktopUpdatePresentation {
  return {
    updateStatus: renderUpdateStatus,
    chooseDownload: async info => chooseUpdateDownload(info),
    chooseInstall: async info => chooseUpdateInstall(info),
    showUpToDate: async (currentVersion) => {
      await showMessageBox({
        type: 'info',
        title: 'DSH Desktop Is Up to Date',
        message: `You’re using the latest version of DSH Desktop (${currentVersion}).`,
        buttons: ['OK'],
      })
    },
    showUnavailable: async () => {
      await showMessageBox({
        type: 'info',
        title: 'Updates Are Unavailable',
        message: 'Automatic updates are available in signed macOS releases of DSH Desktop.',
        detail: 'Source builds and unpackaged development builds do not use the public update feed.',
        buttons: ['OK'],
      })
    },
    showBusy: async (status) => {
      const action = status.kind === 'checking' ? 'checking for an update' : 'downloading the update'
      await showMessageBox({
        type: 'info',
        title: 'Update in Progress',
        message: `DSH Desktop is already ${action}.`,
        buttons: ['OK'],
      })
    },
    showError: async (message, interactive) => {
      logStream?.write(`[desktop update error] ${message}\n`)
      if (!interactive) return
      await showMessageBox({
        type: 'error',
        title: 'Could Not Update DSH Desktop',
        message: 'DSH Desktop could not complete the update operation.',
        detail: `${message}\n\nYou can still download the latest signed release from GitHub.`,
        buttons: ['Open Releases', 'OK'],
        defaultId: 0,
        cancelId: 1,
      }).then(async (result) => {
        if (result.response === 0) await openExternalPage(RELEASES_URL)
      })
    },
    openReleaseNotes: async (version) => {
      await openExternalPage(`${RELEASES_URL}/tag/desktop-v${encodeURIComponent(version)}`)
    },
  }
}

/** Map manual release awareness to native macOS presentation. */
function createManualUpdatePresentation(architecture: DesktopArchitecture): ManualUpdatePresentation {
  const chinese = app.getLocale().toLowerCase().startsWith('zh')
  let notification: Notification | undefined
  return {
    updateStatus: renderManualUpdateStatus,
    notifyAvailable: (info, openRelease) => {
      if (!Notification.isSupported()) return
      notification?.close()
      notification = new Notification({
        title: chinese ? `DSH Desktop ${info.version} 可用` : `DSH Desktop ${info.version} Is Available`,
        body: chinese
          ? `当前版本 ${app.getVersion()}。点击查看 Release，并下载 ${info.recommendedAssetName}。`
          : `You have ${app.getVersion()}. Open the release and download ${info.recommendedAssetName}.`,
        silent: true,
      })
      const currentNotification = notification
      currentNotification.once('click', () => {
        try {
          openRelease()
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          logStream?.write(`[desktop manual update] notification action failed: ${reason}\n`)
        }
      })
      currentNotification.once('close', () => {
        if (notification === currentNotification) notification = undefined
      })
      currentNotification.show()
    },
    chooseUpdate: async info => chooseManualUpdate(info, architecture, chinese),
    openRelease: async info => openExternalPage(info.url),
    showUpToDate: async (currentVersion) => {
      await showMessageBox({
        type: 'info',
        title: chinese ? 'DSH Desktop 已是最新版' : 'DSH Desktop Is Up to Date',
        message: chinese
          ? `你正在使用最新版本 (${currentVersion})。`
          : `You’re using the latest version of DSH Desktop (${currentVersion}).`,
        buttons: [chinese ? '好' : 'OK'],
      })
    },
    showNoRelease: async () => {
      await showMessageBox({
        type: 'info',
        title: chinese ? '暂无公开版本' : 'No Public Release Yet',
        message: chinese
          ? 'DSH Desktop 目前没有可供下载的公开版本。'
          : 'DSH Desktop does not have a public download yet.',
        buttons: [chinese ? '好' : 'OK'],
      })
    },
    showNewerBuild: async (currentVersion, latestVersion) => {
      await showMessageBox({
        type: 'info',
        title: chinese ? '正在使用较新的开发版本' : 'You Have a Newer Development Build',
        message: chinese
          ? `当前版本 ${currentVersion} 比最新公开版本 ${latestVersion} 更新。`
          : `Your ${currentVersion} build is newer than public release ${latestVersion}.`,
        buttons: [chinese ? '好' : 'OK'],
      })
    },
    showUnavailable: async () => {
      await showMessageBox({
        type: 'info',
        title: chinese ? '无法检查更新' : 'Updates Are Unavailable',
        message: chinese
          ? '只有打包后的 macOS 预览版会检查公开 Release。'
          : 'Only packaged macOS prereleases check public GitHub releases.',
        buttons: [chinese ? '好' : 'OK'],
      })
    },
    showBusy: async () => {
      await showMessageBox({
        type: 'info',
        title: chinese ? '正在检查更新' : 'Checking for Updates',
        message: chinese ? 'DSH Desktop 已经在检查公开版本。' : 'DSH Desktop is already checking public releases.',
        buttons: [chinese ? '好' : 'OK'],
      })
    },
    showError: async (message, interactive) => {
      logStream?.write(`[desktop manual update error] ${message}\n`)
      if (!interactive) return
      const result = await showMessageBox({
        type: 'error',
        title: chinese ? '无法检查 DSH Desktop 更新' : 'Could Not Check for DSH Desktop Updates',
        message: chinese ? '无法读取 GitHub Release。' : 'DSH Desktop could not read GitHub releases.',
        detail: chinese
          ? `${message}\n\n你仍然可以直接打开 Releases 页面。`
          : `${message}\n\nYou can still open the Releases page directly.`,
        buttons: [chinese ? '打开 Releases' : 'Open Releases', chinese ? '好' : 'OK'],
        defaultId: 0,
        cancelId: 1,
      })
      if (result.response === 0) await openExternalPage(RELEASES_URL)
    },
    dispose: () => {
      notification?.close()
      notification = undefined
    },
  }
}

/** Ask how one manually installed preview release should be handled. */
async function chooseManualUpdate(
  info: ManualDesktopReleaseInfo,
  architecture: DesktopArchitecture,
  chinese: boolean,
): Promise<'release' | 'later' | 'skip'> {
  const machine = architecture === 'arm64' ? 'Apple Silicon' : 'Intel'
  const result = await showMessageBox({
    type: 'info',
    title: chinese ? '发现 DSH Desktop 新版本' : 'A DSH Desktop Update Is Available',
    message: chinese ? `DSH Desktop ${info.version} 已发布。` : `DSH Desktop ${info.version} is available.`,
    detail: chinese
      ? `当前版本：${app.getVersion()}\n本机：${machine}\n推荐下载：${info.recommendedAssetName}\n\n当前预览版需要前往 GitHub 手动下载安装。`
      : `Current: ${app.getVersion()}\nThis Mac: ${machine}\nRecommended: ${info.recommendedAssetName}\n\nThis preview requires a manual download and installation from GitHub.`,
    buttons: chinese
      ? ['前往 Release 下载', '明天提醒我', `跳过 ${info.version}`]
      : ['Open Release', 'Remind Me Tomorrow', `Skip ${info.version}`],
    defaultId: 0,
    cancelId: 1,
  })
  if (result.response === 0) return 'release'
  if (result.response === 2) return 'skip'
  return 'later'
}

/** Open an update page without allowing shell failures to escape an event listener. */
async function openExternalPage(url: string): Promise<void> {
  try {
    await shell.openExternal(url)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    logStream?.write(`[desktop update error] could not open ${url}: ${reason}\n`)
    await showMessageBox({
      type: 'error',
      title: 'Could Not Open the Release Page',
      message: 'DSH Desktop could not open the release page in your browser.',
      detail: `${reason}\n\n${url}`,
      buttons: ['OK'],
    })
  }
}

/** Ask whether the available signed release should be downloaded. */
async function chooseUpdateDownload(info: DesktopUpdateInfo): Promise<'download' | 'later' | 'notes'> {
  const result = await showMessageBox({
    type: 'info',
    title: 'A DSH Desktop Update Is Available',
    message: `DSH Desktop ${info.version} is available.`,
    detail: `You’re currently using ${app.getVersion()}. The update includes its own tested DSH runtime.`,
    buttons: ['Download Update', 'Later', 'View Release Notes'],
    defaultId: 0,
    cancelId: 1,
  })
  if (result.response === 0) return 'download'
  if (result.response === 2) return 'notes'
  return 'later'
}

/** Ask when the cached release should replace the running application. */
async function chooseUpdateInstall(info: DesktopUpdateInfo): Promise<'restart' | 'on-quit' | 'later'> {
  const result = await showMessageBox({
    type: 'info',
    title: 'DSH Desktop Is Ready to Update',
    message: `DSH Desktop ${info.version} has been downloaded.`,
    detail: 'Restarting closes the local DSH backend before installing. You can also keep working and install on your next normal quit.',
    buttons: ['Restart and Install', 'Install on Quit', 'Later'],
    defaultId: 0,
    cancelId: 2,
  })
  if (result.response === 0) return 'restart'
  if (result.response === 1) return 'on-quit'
  return 'later'
}

/** Render current update state in the application menu, Dock, and window. */
function renderUpdateStatus(status: DesktopUpdateStatus): void {
  const menuItem = Menu.getApplicationMenu()?.getMenuItemById(UPDATE_MENU_ITEM_ID)
  if (menuItem != null) {
    menuItem.label = updateMenuLabel(status)
    menuItem.enabled = status.kind !== 'checking' && status.kind !== 'downloading'
  }
  if (status.kind === 'checking') {
    mainWindow?.setProgressBar(2, { mode: 'indeterminate' })
  } else if (status.kind === 'downloading') {
    mainWindow?.setProgressBar(status.percent / 100, { mode: 'normal' })
  } else {
    mainWindow?.setProgressBar(-1)
  }
  if (process.platform === 'darwin') app.dock?.setBadge(status.kind === 'downloaded' ? '↓' : '')
}

/** Render manual update state without implying that the application downloads code. */
function renderManualUpdateStatus(status: ManualUpdateStatus): void {
  const chinese = app.getLocale().toLowerCase().startsWith('zh')
  const menuItem = Menu.getApplicationMenu()?.getMenuItemById(UPDATE_MENU_ITEM_ID)
  if (menuItem != null) {
    if (status.kind === 'checking') {
      menuItem.label = chinese ? '正在检查更新…' : 'Checking for Updates…'
    } else if (status.kind === 'available') {
      menuItem.label = chinese ? `有新版本 ${status.version}…` : `Update ${status.version} Available…`
    } else {
      menuItem.label = chinese ? '检查更新…' : 'Check for Updates…'
    }
    menuItem.enabled = status.kind !== 'checking'
  }
  if (status.kind === 'checking') {
    mainWindow?.setProgressBar(2, { mode: 'indeterminate' })
  } else {
    mainWindow?.setProgressBar(-1)
  }
  if (process.platform === 'darwin') {
    app.dock?.setBadge(status.kind === 'available' && status.attention ? '1' : '')
  }
}

/** Produce the action label for one update state. */
function updateMenuLabel(status: DesktopUpdateStatus): string {
  switch (status.kind) {
    case 'checking':
      return 'Checking for Updates…'
    case 'available':
      return `Download Update ${status.version}…`
    case 'downloading':
      return `Downloading Update ${status.version} (${Math.round(status.percent)}%)`
    case 'downloaded':
      return status.installOnQuit ? `Update ${status.version} Will Install on Quit` : `Restart to Install ${status.version}…`
    case 'idle':
    case 'error':
      return 'Check for Updates…'
  }
}

/** Use the application window as dialog parent when it is still available. */
function showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
  return mainWindow === undefined ? dialog.showMessageBox(options) : dialog.showMessageBox(mainWindow, options)
}

/** Stop update scheduling, close the backend process tree, and finish log output. */
function stopApplicationBackend(): Promise<void> {
  if (backendStopped) return Promise.resolve()
  cleanupPromise ??= (backend?.stop() ?? Promise.resolve()).finally(() => {
    backendStopped = true
    manualUpdateController?.dispose()
    updateController?.dispose()
    logStream?.end()
  })
  return cleanupPromise
}

/** Continue a normal quit or delegate a cached release to Squirrel.Mac. */
function finishApplicationQuit(): void {
  if (installUpdateOnQuit && updateDriver !== undefined) {
    updateDriver.quitAndInstall()
    return
  }
  app.quit()
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
