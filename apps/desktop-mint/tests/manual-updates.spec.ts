import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ManualUpdateController,
  type ManualDesktopReleaseInfo,
  type ManualReleaseCheckResult,
  type ManualReleaseDriver,
  type ManualUpdatePreferences,
  type ManualUpdatePreferencesStore,
  type ManualUpdatePresentation,
  type ManualUpdateStatus,
} from '../src/manual-updates.ts'

class FakeReleaseDriver implements ManualReleaseDriver {
  readonly etags: Array<string | undefined> = []
  result: ManualReleaseCheckResult = { kind: 'modified', release }
  error: Error | undefined

  async check(etag?: string): Promise<ManualReleaseCheckResult> {
    this.etags.push(etag)
    if (this.error !== undefined) throw this.error
    return this.result
  }
}

class MemoryPreferencesStore implements ManualUpdatePreferencesStore {
  readonly writes: ManualUpdatePreferences[] = []

  constructor(public preferences: ManualUpdatePreferences = {}) {}

  async load(): Promise<ManualUpdatePreferences> {
    return this.preferences
  }

  async save(preferences: ManualUpdatePreferences): Promise<void> {
    this.preferences = preferences
    this.writes.push(preferences)
  }
}

class FakeManualUpdatePresentation implements ManualUpdatePresentation {
  readonly transcript: string[] = []
  choice: 'release' | 'later' | 'skip' = 'later'
  notificationAction: (() => void) | undefined

  updateStatus(status: ManualUpdateStatus): void {
    this.transcript.push(statusLine(status))
  }

  notifyAvailable(info: ManualDesktopReleaseInfo, openRelease: () => void): void {
    this.transcript.push(`notify ${info.version}`)
    this.notificationAction = openRelease
  }

  async chooseUpdate(info: ManualDesktopReleaseInfo): Promise<'release' | 'later' | 'skip'> {
    this.transcript.push(`choose ${info.version} -> ${this.choice}`)
    return this.choice
  }

  async openRelease(info: ManualDesktopReleaseInfo): Promise<void> {
    this.transcript.push(`open ${info.url}`)
  }

  async showUpToDate(currentVersion: string): Promise<void> {
    this.transcript.push(`current ${currentVersion}`)
  }

  async showNoRelease(): Promise<void> {
    this.transcript.push('no release')
  }

  async showNewerBuild(currentVersion: string, latestVersion: string): Promise<void> {
    this.transcript.push(`newer ${currentVersion} than ${latestVersion}`)
  }

  async showUnavailable(): Promise<void> {
    this.transcript.push('unavailable')
  }

  async showBusy(): Promise<void> {
    this.transcript.push('busy')
  }

  async showError(message: string, interactive: boolean): Promise<void> {
    this.transcript.push(`error ${interactive ? 'interactive' : 'background'} ${message}`)
  }

  dispose(): void {
    this.transcript.push('dispose')
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ManualUpdateController', () => {
  it('notifies once per version and keeps the release available from the menu', async () => {
    const { controller, driver, presentation, store } = await createController()

    await controller.check(false)
    await controller.check(false)
    await controller.check()

    expect(driver.etags).toEqual([undefined, undefined])
    expect(presentation.transcript).toEqual([
      'status idle',
      'status checking',
      `status available ${release.version} attention`,
      `notify ${release.version}`,
      'status checking',
      `status available ${release.version} attention`,
      `choose ${release.version} -> later`,
      `status available ${release.version} quiet`,
    ])
    expect(store.preferences).toMatchObject({
      cachedRelease: release,
      lastNotifiedVersion: release.version,
      remindAfterMs: 86_400_000,
    })
    controller.dispose()
  })

  it('opens a clicked notification and schedules one reminder for the next day', async () => {
    let now = 1_000
    const { controller, presentation, store } = await createController({ now: () => now })

    await controller.check(false)
    presentation.notificationAction?.()
    await settlePresentation()
    expect(store.preferences.remindAfterMs).toBe(86_401_000)
    expect(presentation.transcript).toContain(`open ${release.url}`)

    now = 86_401_000
    await controller.check(false)
    expect(presentation.transcript.filter(line => line === `notify ${release.version}`)).toHaveLength(2)
    await controller.check(false)
    expect(presentation.transcript.filter(line => line === `notify ${release.version}`)).toHaveLength(2)
    controller.dispose()
  })

  it('suppresses a skipped version but not a later release', async () => {
    const presentation = new FakeManualUpdatePresentation()
    presentation.choice = 'skip'
    const setup = await createController({ presentation })

    await setup.controller.check()
    await setup.controller.check(false)
    expect(setup.presentation.transcript).not.toContain(`notify ${release.version}`)

    setup.driver.result = { kind: 'modified', release: nextRelease }
    await setup.controller.check(false)
    expect(setup.presentation.transcript).toContain(`notify ${nextRelease.version}`)
    setup.controller.dispose()
  })

  it('reports current, newer, missing, unavailable, and failed checks', async () => {
    const currentSetup = await createController({ currentVersion: release.version })
    await currentSetup.controller.check()
    expect(currentSetup.presentation.transcript).toContain(`current ${release.version}`)
    currentSetup.controller.dispose()

    const newerSetup = await createController({ currentVersion: '2.0.0-preview.1' })
    await newerSetup.controller.check()
    expect(newerSetup.presentation.transcript).toContain(`newer 2.0.0-preview.1 than ${release.version}`)
    newerSetup.controller.dispose()

    const missingSetup = await createController()
    missingSetup.driver.result = { kind: 'modified', release: null }
    await missingSetup.controller.check()
    expect(missingSetup.presentation.transcript).toContain('no release')
    missingSetup.controller.dispose()

    const unavailableSetup = await createController({ enabled: false })
    await unavailableSetup.controller.check()
    expect(unavailableSetup.presentation.transcript).toContain('unavailable')
    unavailableSetup.controller.dispose()

    const failedSetup = await createController()
    failedSetup.driver.error = new Error('offline')
    await failedSetup.controller.check(false)
    await failedSetup.controller.check()
    expect(failedSetup.presentation.transcript).toContain('error background offline')
    expect(failedSetup.presentation.transcript).toContain('error interactive offline')
    failedSetup.controller.dispose()
  })

  it('schedules a delayed background check and cancels later checks on disposal', async () => {
    vi.useFakeTimers()
    const setup = await createController({ initialCheckDelayMs: 25, checkIntervalMs: 100 })

    await vi.advanceTimersByTimeAsync(25)
    expect(setup.driver.etags).toHaveLength(1)
    setup.controller.dispose()
    await vi.advanceTimersByTimeAsync(200)
    expect(setup.driver.etags).toHaveLength(1)
    expect(setup.presentation.transcript.at(-1)).toBe('dispose')
  })
})

interface ControllerSetupOptions {
  readonly enabled?: boolean
  readonly currentVersion?: string
  readonly now?: () => number
  readonly initialCheckDelayMs?: number
  readonly checkIntervalMs?: number
  readonly presentation?: FakeManualUpdatePresentation
}

/** Create a started manual controller with in-memory collaborators. */
async function createController(options: ControllerSetupOptions = {}): Promise<{
  readonly controller: ManualUpdateController
  readonly driver: FakeReleaseDriver
  readonly presentation: FakeManualUpdatePresentation
  readonly store: MemoryPreferencesStore
}> {
  const driver = new FakeReleaseDriver()
  const presentation = options.presentation ?? new FakeManualUpdatePresentation()
  const store = new MemoryPreferencesStore()
  const controller = new ManualUpdateController({
    enabled: options.enabled ?? true,
    currentVersion: options.currentVersion ?? '1.0.0-preview.1',
    driver,
    store,
    presentation,
    now: options.now ?? (() => 0),
    initialCheckDelayMs: options.initialCheckDelayMs ?? 1_000_000,
    checkIntervalMs: options.checkIntervalMs ?? 2_000_000,
  })
  await controller.start()
  return { controller, driver, presentation, store }
}

/** Render status transitions as stable interaction evidence. */
function statusLine(status: ManualUpdateStatus): string {
  if (status.kind === 'available') {
    return `status available ${status.version} ${status.attention ? 'attention' : 'quiet'}`
  }
  return `status ${status.kind}`
}

/** Let notification-triggered async work reach its stable state. */
async function settlePresentation(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const release = {
  version: '1.1.0-preview.1',
  tagName: 'desktop-v1.1.0-preview.1',
  title: 'DSH Desktop Mint 1.1.0-preview.1',
  url: 'https://github.com/mintgao/dsh-desktop/releases/tag/desktop-v1.1.0-preview.1',
  prerelease: true,
  recommendedAssetName: 'DSH-Desktop-Mint-1.1.0-preview.1-arm64.dmg',
} as const

const nextRelease = {
  ...release,
  version: '1.1.0-preview.2',
  tagName: 'desktop-v1.1.0-preview.2',
  url: 'https://github.com/mintgao/dsh-desktop/releases/tag/desktop-v1.1.0-preview.2',
  recommendedAssetName: 'DSH-Desktop-Mint-1.1.0-preview.2-arm64.dmg',
} as const
