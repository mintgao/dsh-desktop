/** Adapt the CommonJS electron-updater package to the desktop update controller. */

import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateDownloadedEvent, type UpdateInfo } from 'electron-updater'
import type {
  DesktopUpdateDriver,
  DesktopUpdateDriverListeners,
  DesktopUpdateInfo,
  DesktopUpdateProgress,
} from './updates.ts'

const { autoUpdater } = electronUpdater

/** Severity and text sink for updater diagnostics. */
export type DesktopUpdateLog = (level: 'info' | 'warn' | 'error', message: string) => void

/** Configure and expose electron-updater without leaking it into controller tests. */
export class ElectronUpdateDriver implements DesktopUpdateDriver {
  private readonly updater: AppUpdater
  private readonly log: DesktopUpdateLog

  /** Create an adapter over the process-wide updater. */
  constructor(log: DesktopUpdateLog, updater: AppUpdater = autoUpdater) {
    this.log = log
    this.updater = updater
  }

  /** Select stable releases, explicit downloads, and user-controlled installation. */
  configure(): void {
    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.updater.autoRunAppAfterInstall = true
    this.updater.allowPrerelease = false
    this.updater.allowDowngrade = false
    this.updater.fullChangelog = true
    this.updater.logger = {
      info: (message) => {
        this.log('info', logValue(message))
      },
      warn: (message) => {
        this.log('warn', logValue(message))
      },
      error: (message) => {
        this.log('error', logValue(message))
      },
    }
  }

  /** Bridge electron-updater events and return a complete listener disposer. */
  subscribe(listeners: DesktopUpdateDriverListeners): () => void {
    const updateAvailable = (info: UpdateInfo): void => {
      listeners.updateAvailable(updateInfo(info))
    }
    const updateNotAvailable = (info: UpdateInfo): void => {
      listeners.updateNotAvailable(updateInfo(info))
    }
    const downloadProgress = (progress: ProgressInfo): void => {
      listeners.downloadProgress(updateProgress(progress))
    }
    const updateDownloaded = (info: UpdateDownloadedEvent): void => {
      listeners.updateDownloaded(updateInfo(info))
    }
    const error = (failure: Error): void => {
      listeners.error(failure)
    }
    this.updater.on('update-available', updateAvailable)
    this.updater.on('update-not-available', updateNotAvailable)
    this.updater.on('download-progress', downloadProgress)
    this.updater.on('update-downloaded', updateDownloaded)
    this.updater.on('error', error)
    return () => {
      this.updater.removeListener('update-available', updateAvailable)
      this.updater.removeListener('update-not-available', updateNotAvailable)
      this.updater.removeListener('download-progress', downloadProgress)
      this.updater.removeListener('update-downloaded', updateDownloaded)
      this.updater.removeListener('error', error)
    }
  }

  /** Query the public GitHub release feed. */
  async checkForUpdates(): Promise<void> {
    await this.updater.checkForUpdates()
  }

  /** Download the architecture-matched ZIP selected from release metadata. */
  async downloadUpdate(): Promise<void> {
    await this.updater.downloadUpdate()
  }

  /** Hand the already-downloaded release to Squirrel.Mac and relaunch. */
  quitAndInstall(): void {
    this.updater.quitAndInstall(false, true)
  }
}

/** Keep only release fields the native presentation owns. */
function updateInfo(info: UpdateInfo): DesktopUpdateInfo {
  return info.releaseName === undefined
    ? { version: info.version }
    : { version: info.version, releaseName: info.releaseName }
}

/** Keep bounded progress fields used by the menu and Dock. */
function updateProgress(progress: ProgressInfo): DesktopUpdateProgress {
  return {
    percent: progress.percent,
    total: progress.total,
    transferred: progress.transferred,
  }
}

/** Render arbitrary logger values without throwing from the update dispatcher. */
function logValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
