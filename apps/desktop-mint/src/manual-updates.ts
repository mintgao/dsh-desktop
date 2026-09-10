/** Coordinate update awareness for unsigned desktop prereleases without downloading code. */

import { compareVersions } from 'compare-versions'

const DEFAULT_INITIAL_CHECK_DELAY_MS = 30_000
const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000
const DEFAULT_REMINDER_DELAY_MS = 24 * 60 * 60 * 1_000

/** CPU architecture used to select the DMG named on the release page. */
export type DesktopArchitecture = 'arm64' | 'x64'

/** Validated GitHub release fields required by manual update presentation. */
export interface ManualDesktopReleaseInfo {
  /** Semantic desktop version without the `desktop-v` tag prefix. */
  readonly version: string
  /** Immutable GitHub release tag. */
  readonly tagName: string
  /** Release display name. */
  readonly title: string
  /** Exact public GitHub page for this release. */
  readonly url: string
  /** Whether GitHub presents the release as a prerelease. */
  readonly prerelease: boolean
  /** Architecture-matched DMG users should select on the release page. */
  readonly recommendedAssetName: string
  /** GitHub publication timestamp when present. */
  readonly publishedAt?: string
}

/** Conditional GitHub query result returned by the manual release driver. */
export type ManualReleaseCheckResult =
  | { readonly kind: 'not-modified' }
  | { readonly kind: 'modified'; readonly release: ManualDesktopReleaseInfo | null; readonly etag?: string }

/** Network operation used by the manual update controller. */
export interface ManualReleaseDriver {
  /** Read the newest usable desktop release, conditionally when an ETag is available. */
  check(etag?: string): Promise<ManualReleaseCheckResult>
}

/** Durable preferences that suppress or defer release reminders. */
export interface ManualUpdatePreferences {
  /** ETag paired with `cachedRelease`. */
  readonly etag?: string
  /** Last validated response, where null records a successful empty release list. */
  readonly cachedRelease?: ManualDesktopReleaseInfo | null
  /** Release that already produced an automatic notification. */
  readonly lastNotifiedVersion?: string
  /** One-shot time at which a deferred release may notify again. */
  readonly remindAfterMs?: number
  /** Release explicitly skipped by the user. */
  readonly skippedVersion?: string
}

/** Persistence operations for manual update preferences. */
export interface ManualUpdatePreferencesStore {
  /** Load validated preferences, resetting corrupt or unsupported data. */
  load(): Promise<ManualUpdatePreferences>
  /** Replace the complete preferences document. */
  save(preferences: ManualUpdatePreferences): Promise<void>
}

/** State rendered by the application menu and Dock. */
export type ManualUpdateStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'available'; readonly version: string; readonly attention: boolean }
  | { readonly kind: 'error' }

/** Native presentation requested by the manual update controller. */
export interface ManualUpdatePresentation {
  /** Render persistent menu and Dock state. */
  updateStatus(status: ManualUpdateStatus): void
  /** Show a non-blocking notification and invoke `openRelease` only after a user click. */
  notifyAvailable(info: ManualDesktopReleaseInfo, openRelease: () => void): void
  /** Ask whether to open, defer, or skip one release. */
  chooseUpdate(info: ManualDesktopReleaseInfo): Promise<'release' | 'later' | 'skip'>
  /** Open the exact validated GitHub release page. */
  openRelease(info: ManualDesktopReleaseInfo): Promise<void>
  /** Confirm that the running application matches the newest release. */
  showUpToDate(currentVersion: string): Promise<void>
  /** Explain that no public desktop release exists yet. */
  showNoRelease(): Promise<void>
  /** Explain that a local build is newer than the public release. */
  showNewerBuild(currentVersion: string, latestVersion: string): Promise<void>
  /** Explain that source or unsupported builds do not check releases. */
  showUnavailable(): Promise<void>
  /** Describe a check already in flight. */
  showBusy(): Promise<void>
  /** Report a check or presentation failure; background calls pass false. */
  showError(message: string, interactive: boolean): Promise<void>
  /** Close process-owned notifications during application teardown. */
  dispose(): void
}

/** Construction options for one manual update controller. */
export interface ManualUpdateControllerOptions {
  /** Whether the running application may query public releases. */
  readonly enabled: boolean
  /** Version of the running desktop application. */
  readonly currentVersion: string
  /** GitHub release reader. */
  readonly driver: ManualReleaseDriver
  /** Durable reminder store. */
  readonly store: ManualUpdatePreferencesStore
  /** Native user presentation. */
  readonly presentation: ManualUpdatePresentation
  /** Current time provider used by reminder decisions. */
  readonly now?: () => number
  /** Delay before the first automatic check. */
  readonly initialCheckDelayMs?: number
  /** Interval between subsequent automatic checks. */
  readonly checkIntervalMs?: number
  /** Delay selected by the Later action and release-page handoff. */
  readonly reminderDelayMs?: number
}

/** Own manual release checks, reminder decisions, and duplicate-operation suppression. */
export class ManualUpdateController {
  private readonly enabled: boolean
  private readonly currentVersion: string
  private readonly driver: ManualReleaseDriver
  private readonly store: ManualUpdatePreferencesStore
  private readonly presentation: ManualUpdatePresentation
  private readonly now: () => number
  private readonly initialCheckDelayMs: number
  private readonly checkIntervalMs: number
  private readonly reminderDelayMs: number
  private status: ManualUpdateStatus = { kind: 'idle' }
  private preferences: ManualUpdatePreferences = {}
  private availableInfo: ManualDesktopReleaseInfo | undefined
  private initialCheckTimer: ReturnType<typeof setTimeout> | undefined
  private repeatedCheckTimer: ReturnType<typeof setInterval> | undefined
  private promptInFlight = false
  private started = false
  private disposed = false

  /** Create a controller without reading preferences or contacting GitHub. */
  constructor(options: ManualUpdateControllerOptions) {
    this.enabled = options.enabled
    this.currentVersion = options.currentVersion
    this.driver = options.driver
    this.store = options.store
    this.presentation = options.presentation
    this.now = options.now ?? Date.now
    this.initialCheckDelayMs = options.initialCheckDelayMs ?? DEFAULT_INITIAL_CHECK_DELAY_MS
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
    this.reminderDelayMs = options.reminderDelayMs ?? DEFAULT_REMINDER_DELAY_MS
  }

  /** Load preferences and schedule background checks once. */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.presentation.updateStatus(this.status)
    if (!this.enabled) return
    this.preferences = await this.store.load()
    if (this.disposed) return
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

  /** Check or re-present a release; manual calls always produce feedback. */
  async check(manual = true): Promise<void> {
    if (!this.enabled) {
      if (manual) await this.presentation.showUnavailable()
      return
    }
    if (this.status.kind === 'checking') {
      if (manual) await this.presentation.showBusy()
      return
    }
    if (manual && this.availableInfo !== undefined) {
      await this.presentAvailableUpdate(this.availableInfo)
      return
    }

    this.setStatus({ kind: 'checking' })
    try {
      const etag = this.preferences.cachedRelease === undefined ? undefined : this.preferences.etag
      const result = await this.driver.check(etag)
      if (this.disposed) return
      const release = await this.resolveRelease(result)
      if (release === undefined) {
        this.availableInfo = undefined
        this.setStatus({ kind: 'idle' })
        if (manual) await this.presentation.showNoRelease()
        return
      }

      const order = compareVersions(this.currentVersion, release.version)
      if (order === 0) {
        this.availableInfo = undefined
        this.setStatus({ kind: 'idle' })
        if (manual) await this.presentation.showUpToDate(this.currentVersion)
        return
      }
      if (order > 0) {
        this.availableInfo = undefined
        this.setStatus({ kind: 'idle' })
        if (manual) await this.presentation.showNewerBuild(this.currentVersion, release.version)
        return
      }
      await this.handleAvailable(release, manual)
    } catch (error) {
      if (this.disposed) return
      this.setStatus({ kind: 'error' })
      await this.presentation.showError(asError(error).message, manual)
    }
  }

  /** Cancel timers and close native notifications before process teardown. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.initialCheckTimer !== undefined) clearTimeout(this.initialCheckTimer)
    if (this.repeatedCheckTimer !== undefined) clearInterval(this.repeatedCheckTimer)
    this.initialCheckTimer = undefined
    this.repeatedCheckTimer = undefined
    this.presentation.dispose()
  }

  private async resolveRelease(result: ManualReleaseCheckResult): Promise<ManualDesktopReleaseInfo | undefined> {
    if (result.kind === 'not-modified') return this.preferences.cachedRelease ?? undefined
    const { etag: _etag, ...retainedPreferences } = this.preferences
    this.preferences = {
      ...retainedPreferences,
      cachedRelease: result.release,
      ...(result.etag === undefined ? {} : { etag: result.etag }),
    }
    await this.store.save(this.preferences)
    return result.release ?? undefined
  }

  private async handleAvailable(info: ManualDesktopReleaseInfo, manual: boolean): Promise<void> {
    this.availableInfo = info
    if (manual) {
      this.setStatus({ kind: 'available', version: info.version, attention: true })
      await this.presentAvailableUpdate(info)
      return
    }
    if (this.preferences.skippedVersion === info.version) {
      this.setStatus({ kind: 'idle' })
      return
    }

    const reminderDue = this.preferences.remindAfterMs !== undefined
      && this.now() >= this.preferences.remindAfterMs
    const firstNotification = this.preferences.lastNotifiedVersion !== info.version
    const attention = this.preferences.remindAfterMs === undefined || reminderDue
    this.setStatus({ kind: 'available', version: info.version, attention })
    if (!firstNotification && !reminderDue) return

    const { remindAfterMs: _remindAfterMs, skippedVersion: _skippedVersion, ...retainedPreferences } = this.preferences
    this.preferences = {
      ...retainedPreferences,
      lastNotifiedVersion: info.version,
    }
    await this.store.save(this.preferences)
    this.presentation.notifyAvailable(info, () => {
      void this.openReleaseAndDefer(info).catch((error: unknown) => {
        void this.presentation.showError(asError(error).message, true)
      })
    })
  }

  private async presentAvailableUpdate(info: ManualDesktopReleaseInfo): Promise<void> {
    if (this.promptInFlight) return
    this.promptInFlight = true
    try {
      const choice = await this.presentation.chooseUpdate(info)
      if (choice === 'skip') {
        const { remindAfterMs: _remindAfterMs, ...retainedPreferences } = this.preferences
        this.preferences = {
          ...retainedPreferences,
          skippedVersion: info.version,
        }
        await this.store.save(this.preferences)
        this.setStatus({ kind: 'idle' })
        return
      }
      if (choice === 'release') await this.presentation.openRelease(info)
      const { skippedVersion: _skippedVersion, ...retainedPreferences } = this.preferences
      this.preferences = {
        ...retainedPreferences,
        remindAfterMs: this.now() + this.reminderDelayMs,
      }
      await this.store.save(this.preferences)
      this.setStatus({ kind: 'available', version: info.version, attention: false })
    } finally {
      this.promptInFlight = false
    }
  }

  private async openReleaseAndDefer(info: ManualDesktopReleaseInfo): Promise<void> {
    if (this.disposed) return
    await this.presentation.openRelease(info)
    const { skippedVersion: _skippedVersion, ...retainedPreferences } = this.preferences
    this.preferences = {
      ...retainedPreferences,
      remindAfterMs: this.now() + this.reminderDelayMs,
    }
    this.setStatus({ kind: 'available', version: info.version, attention: false })
    await this.store.save(this.preferences)
  }

  private setStatus(status: ManualUpdateStatus): void {
    this.status = status
    this.presentation.updateStatus(status)
  }
}

/** Preserve thrown release-check failures as Error instances for diagnostics. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
