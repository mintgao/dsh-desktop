/** Coordinate desktop update checks, downloads, and user-controlled installation. */

const DEFAULT_INITIAL_CHECK_DELAY_MS = 10_000
const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000

/** Release information required by the desktop update presentation. */
export interface DesktopUpdateInfo {
  /** Semantic application version published by the update feed. */
  readonly version: string
  /** Optional release display name supplied by the publisher. */
  readonly releaseName?: string | null
}

/** Download progress reported by the update transport. */
export interface DesktopUpdateProgress {
  /** Download completion in the inclusive range 0–100. */
  readonly percent: number
  /** Total bytes expected for the selected update artifact. */
  readonly total: number
  /** Bytes received for the selected update artifact. */
  readonly transferred: number
}

/** State rendered by the native menu, Dock, and window progress indicator. */
export type DesktopUpdateStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'available'; readonly version: string }
  | { readonly kind: 'downloading'; readonly version: string; readonly percent: number }
  | { readonly kind: 'downloaded'; readonly version: string; readonly installOnQuit: boolean }
  | { readonly kind: 'error' }

/** Events emitted by the platform update implementation. */
export interface DesktopUpdateDriverListeners {
  /** Receive a release newer than the running application. */
  readonly updateAvailable: (info: DesktopUpdateInfo) => void
  /** Receive confirmation that the running application is current. */
  readonly updateNotAvailable: (info: DesktopUpdateInfo) => void
  /** Receive download progress for the selected release artifact. */
  readonly downloadProgress: (progress: DesktopUpdateProgress) => void
  /** Receive confirmation that an update is cached and ready to install. */
  readonly updateDownloaded: (info: DesktopUpdateInfo) => void
  /** Receive update transport and signature failures. */
  readonly error: (error: Error) => void
}

/** Platform update operations used by the lifecycle-independent controller. */
export interface DesktopUpdateDriver {
  /** Configure stable-channel, explicit-download update behavior. */
  configure(): void
  /** Register update events and return a disposer for every registration. */
  subscribe(listeners: DesktopUpdateDriverListeners): () => void
  /** Query the configured feed for a newer release. */
  checkForUpdates(): Promise<void>
  /** Download the release reported by the latest successful check. */
  downloadUpdate(): Promise<void>
}

/** Native presentation operations requested by the desktop update controller. */
export interface DesktopUpdatePresentation {
  /** Render the current update state without blocking the application. */
  updateStatus(status: DesktopUpdateStatus): void
  /** Ask whether to download, defer, or inspect one available release. */
  chooseDownload(info: DesktopUpdateInfo): Promise<'download' | 'later' | 'notes'>
  /** Ask how to install one downloaded release. */
  chooseInstall(info: DesktopUpdateInfo): Promise<'restart' | 'on-quit' | 'later'>
  /** Confirm a manual check found no newer release. */
  showUpToDate(currentVersion: string): Promise<void>
  /** Explain that source and unpackaged builds have no update feed. */
  showUnavailable(): Promise<void>
  /** Describe an already-running check or download after a manual request. */
  showBusy(status: DesktopUpdateStatus): Promise<void>
  /** Report an update error; automatic background checks pass false. */
  showError(message: string, interactive: boolean): Promise<void>
  /** Open the public release page for a version. */
  openReleaseNotes(version: string): Promise<void>
}

/** Construction options for one desktop update controller. */
export interface DesktopUpdateControllerOptions {
  /** Whether the running application is an update-capable packaged build. */
  readonly enabled: boolean
  /** Version of the running desktop application. */
  readonly currentVersion: string
  /** Platform update implementation. */
  readonly driver: DesktopUpdateDriver
  /** Native user presentation. */
  readonly presentation: DesktopUpdatePresentation
  /** Stop the backend before handing control to the platform installer. */
  readonly restartAndInstall: () => Promise<void>
  /** Mark the downloaded update for installation during a later normal quit. */
  readonly installOnQuit: () => void
  /** Delay before the first automatic check. */
  readonly initialCheckDelayMs?: number
  /** Interval between subsequent automatic checks. */
  readonly checkIntervalMs?: number
}

/** Own update state, scheduling, prompts, and duplicate-operation suppression. */
export class DesktopUpdateController {
  private readonly enabled: boolean
  private readonly currentVersion: string
  private readonly driver: DesktopUpdateDriver
  private readonly presentation: DesktopUpdatePresentation
  private readonly restartAndInstall: () => Promise<void>
  private readonly installOnQuit: () => void
  private readonly initialCheckDelayMs: number
  private readonly checkIntervalMs: number
  private status: DesktopUpdateStatus = { kind: 'idle' }
  private availableInfo: DesktopUpdateInfo | undefined
  private downloadedInfo: DesktopUpdateInfo | undefined
  private unsubscribe: (() => void) | undefined
  private initialCheckTimer: ReturnType<typeof setTimeout> | undefined
  private repeatedCheckTimer: ReturnType<typeof setInterval> | undefined
  private manualCheck = false
  private downloadWasRequested = false
  private promptInFlight = false
  private errorCount = 0
  private started = false

  /** Create a controller without contacting the update feed. */
  constructor(options: DesktopUpdateControllerOptions) {
    this.enabled = options.enabled
    this.currentVersion = options.currentVersion
    this.driver = options.driver
    this.presentation = options.presentation
    this.restartAndInstall = options.restartAndInstall
    this.installOnQuit = options.installOnQuit
    this.initialCheckDelayMs = options.initialCheckDelayMs ?? DEFAULT_INITIAL_CHECK_DELAY_MS
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
  }

  /** Configure the driver, register events, and schedule background checks once. */
  start(): void {
    if (this.started) return
    this.started = true
    this.presentation.updateStatus(this.status)
    if (!this.enabled) return
    this.driver.configure()
    this.unsubscribe = this.driver.subscribe({
      updateAvailable: (info) => {
        this.handleUpdateAvailable(info)
      },
      updateNotAvailable: (info) => {
        this.handleUpdateNotAvailable(info)
      },
      downloadProgress: (progress) => {
        this.handleDownloadProgress(progress)
      },
      updateDownloaded: (info) => {
        this.handleUpdateDownloaded(info)
      },
      error: (error) => {
        this.handleError(error)
      },
    })
    this.initialCheckTimer = setTimeout(() => {
      this.initialCheckTimer = undefined
      void this.check(false)
    }, this.initialCheckDelayMs)
    this.initialCheckTimer.unref()
    this.repeatedCheckTimer = setInterval(() => {
      void this.check(false)
    }, this.checkIntervalMs)
    this.repeatedCheckTimer.unref()
  }

  /** Run or re-present an update check; manual checks always produce feedback. */
  async check(manual = true): Promise<void> {
    if (!this.enabled) {
      if (manual) await this.presentation.showUnavailable()
      return
    }
    if (this.status.kind === 'checking' || this.status.kind === 'downloading') {
      if (manual) await this.presentation.showBusy(this.status)
      return
    }
    if (this.availableInfo !== undefined) {
      await this.presentAvailableUpdate(this.availableInfo)
      return
    }
    if (this.downloadedInfo !== undefined) {
      await this.presentDownloadedUpdate(this.downloadedInfo)
      return
    }

    this.manualCheck = manual
    this.setStatus({ kind: 'checking' })
    const errorsBeforeCheck = this.errorCount
    try {
      await this.driver.checkForUpdates()
    } catch (error) {
      if (errorsBeforeCheck === this.errorCount) this.handleError(asError(error))
    }
  }

  /** Remove event listeners and scheduled checks before application teardown. */
  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
    if (this.initialCheckTimer !== undefined) clearTimeout(this.initialCheckTimer)
    if (this.repeatedCheckTimer !== undefined) clearInterval(this.repeatedCheckTimer)
    this.initialCheckTimer = undefined
    this.repeatedCheckTimer = undefined
  }

  private handleUpdateAvailable(info: DesktopUpdateInfo): void {
    this.manualCheck = false
    this.availableInfo = info
    this.setStatus({ kind: 'available', version: info.version })
    void this.presentAvailableUpdate(info)
  }

  private handleUpdateNotAvailable(_info: DesktopUpdateInfo): void {
    const report = this.manualCheck
    this.manualCheck = false
    this.setStatus({ kind: 'idle' })
    if (report) void this.presentation.showUpToDate(this.currentVersion)
  }

  private handleDownloadProgress(progress: DesktopUpdateProgress): void {
    const info = this.availableInfo
    if (info === undefined) return
    const percent = Math.max(0, Math.min(100, progress.percent))
    this.setStatus({ kind: 'downloading', version: info.version, percent })
  }

  private handleUpdateDownloaded(info: DesktopUpdateInfo): void {
    this.availableInfo = undefined
    this.downloadedInfo = info
    this.downloadWasRequested = false
    this.setStatus({ kind: 'downloaded', version: info.version, installOnQuit: false })
    void this.presentDownloadedUpdate(info)
  }

  private handleError(error: Error): void {
    this.errorCount += 1
    const interactive = this.manualCheck || this.downloadWasRequested
    this.manualCheck = false
    this.downloadWasRequested = false
    this.setStatus({ kind: 'error' })
    void this.presentation.showError(error.message, interactive)
  }

  private async presentAvailableUpdate(info: DesktopUpdateInfo): Promise<void> {
    if (this.promptInFlight) return
    this.promptInFlight = true
    try {
      const choice = await this.presentation.chooseDownload(info)
      if (choice === 'notes') {
        await this.presentation.openReleaseNotes(info.version)
        return
      }
      if (choice !== 'download') return
      this.downloadWasRequested = true
      this.setStatus({ kind: 'downloading', version: info.version, percent: 0 })
      const errorsBeforeDownload = this.errorCount
      try {
        await this.driver.downloadUpdate()
      } catch (error) {
        if (errorsBeforeDownload === this.errorCount) this.handleError(asError(error))
      }
    } finally {
      this.promptInFlight = false
    }
  }

  private async presentDownloadedUpdate(info: DesktopUpdateInfo): Promise<void> {
    if (this.promptInFlight) return
    this.promptInFlight = true
    try {
      const choice = await this.presentation.chooseInstall(info)
      if (choice === 'restart') {
        await this.restartAndInstall()
      } else if (choice === 'on-quit') {
        this.installOnQuit()
        this.setStatus({ kind: 'downloaded', version: info.version, installOnQuit: true })
      }
    } finally {
      this.promptInFlight = false
    }
  }

  private setStatus(status: DesktopUpdateStatus): void {
    this.status = status
    this.presentation.updateStatus(status)
  }
}

/** Preserve thrown update failures as Error instances for diagnostics. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
