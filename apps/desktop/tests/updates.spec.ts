import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DesktopUpdateController,
  type DesktopUpdateDriver,
  type DesktopUpdateDriverListeners,
  type DesktopUpdateInfo,
  type DesktopUpdatePresentation,
  type DesktopUpdateStatus,
} from '../src/updates.ts'

class FakeUpdateDriver implements DesktopUpdateDriver {
  readonly operations: string[] = []
  listeners: DesktopUpdateDriverListeners | undefined

  configure(): void {
    this.operations.push('configure')
  }

  subscribe(listeners: DesktopUpdateDriverListeners): () => void {
    this.operations.push('subscribe')
    this.listeners = listeners
    return () => {
      this.operations.push('unsubscribe')
      this.listeners = undefined
    }
  }

  async checkForUpdates(): Promise<void> {
    this.operations.push('check')
  }

  async downloadUpdate(): Promise<void> {
    this.operations.push('download')
  }

  emitAvailable(version: string): void {
    this.listeners?.updateAvailable({ version })
  }

  emitNotAvailable(version: string): void {
    this.listeners?.updateNotAvailable({ version })
  }

  emitProgress(percent: number): void {
    this.listeners?.downloadProgress({ percent, total: 100, transferred: percent })
  }

  emitDownloaded(version: string): void {
    this.listeners?.updateDownloaded({ version })
  }

  emitError(message: string): void {
    this.listeners?.error(new Error(message))
  }
}

class FakeUpdatePresentation implements DesktopUpdatePresentation {
  readonly transcript: string[] = []
  downloadChoice: 'download' | 'later' | 'notes' = 'later'
  installChoice: 'restart' | 'on-quit' | 'later' = 'later'

  updateStatus(status: DesktopUpdateStatus): void {
    this.transcript.push(statusLine(status))
  }

  async chooseDownload(info: DesktopUpdateInfo): Promise<'download' | 'later' | 'notes'> {
    this.transcript.push(`prompt download ${info.version} -> ${this.downloadChoice}`)
    return this.downloadChoice
  }

  async chooseInstall(info: DesktopUpdateInfo): Promise<'restart' | 'on-quit' | 'later'> {
    this.transcript.push(`prompt install ${info.version} -> ${this.installChoice}`)
    return this.installChoice
  }

  async showUpToDate(currentVersion: string): Promise<void> {
    this.transcript.push(`up to date ${currentVersion}`)
  }

  async showUnavailable(): Promise<void> {
    this.transcript.push('updates unavailable')
  }

  async showBusy(status: DesktopUpdateStatus): Promise<void> {
    this.transcript.push(`busy ${status.kind}`)
  }

  async showError(message: string, interactive: boolean): Promise<void> {
    this.transcript.push(`error ${interactive ? 'interactive' : 'background'}: ${message}`)
  }

  async openReleaseNotes(version: string): Promise<void> {
    this.transcript.push(`open notes ${version}`)
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('DesktopUpdateController', () => {
  it('downloads a selected release and restarts only after a second decision', async () => {
    const driver = new FakeUpdateDriver()
    const presentation = new FakeUpdatePresentation()
    const restartAndInstall = vi.fn(async () => undefined)
    presentation.downloadChoice = 'download'
    presentation.installChoice = 'restart'
    const controller = new DesktopUpdateController({
      enabled: true,
      currentVersion: '1.2.3',
      driver,
      presentation,
      restartAndInstall,
      installOnQuit: vi.fn(),
    })

    controller.start()
    await controller.check()
    driver.emitAvailable('1.3.0')
    await settlePresentation()
    driver.emitProgress(41.6)
    driver.emitDownloaded('1.3.0')
    await settlePresentation()

    expect(driver.operations).toEqual(['configure', 'subscribe', 'check', 'download'])
    expect(restartAndInstall).toHaveBeenCalledOnce()
    expect(presentation.transcript).toMatchInlineSnapshot(`
      [
        "status idle",
        "status checking",
        "status available 1.3.0",
        "prompt download 1.3.0 -> download",
        "status downloading 1.3.0 0%",
        "status downloading 1.3.0 41.6%",
        "status downloaded 1.3.0 pending",
        "prompt install 1.3.0 -> restart",
      ]
    `)
    controller.dispose()
    expect(driver.operations.at(-1)).toBe('unsubscribe')
  })

  it('keeps deferred releases available from the manual menu command', async () => {
    const driver = new FakeUpdateDriver()
    const presentation = new FakeUpdatePresentation()
    const controller = createController(driver, presentation)

    controller.start()
    await controller.check()
    driver.emitAvailable('2.0.0')
    await settlePresentation()
    presentation.downloadChoice = 'notes'
    await controller.check()

    expect(driver.operations.filter(operation => operation === 'check')).toHaveLength(1)
    expect(presentation.transcript.slice(-2)).toEqual(['prompt download 2.0.0 -> notes', 'open notes 2.0.0'])
    controller.dispose()
  })

  it('reports manual results and suppresses background error dialogs', async () => {
    const driver = new FakeUpdateDriver()
    const presentation = new FakeUpdatePresentation()
    const controller = createController(driver, presentation)

    controller.start()
    await controller.check()
    driver.emitNotAvailable('1.2.3')
    await settlePresentation()
    await controller.check(false)
    driver.emitError('offline')
    await settlePresentation()
    await controller.check()
    driver.emitError('signature invalid')
    await settlePresentation()

    expect(presentation.transcript).toContain('up to date 1.2.3')
    expect(presentation.transcript).toContain('error background: offline')
    expect(presentation.transcript).toContain('error interactive: signature invalid')
    controller.dispose()
  })

  it('schedules background checks and remains explainable in development builds', async () => {
    vi.useFakeTimers()
    const driver = new FakeUpdateDriver()
    const presentation = new FakeUpdatePresentation()
    const controller = createController(driver, presentation, true, { initialCheckDelayMs: 25, checkIntervalMs: 100 })

    controller.start()
    await vi.advanceTimersByTimeAsync(25)
    expect(driver.operations.filter(operation => operation === 'check')).toHaveLength(1)
    controller.dispose()
    await vi.advanceTimersByTimeAsync(100)
    expect(driver.operations.filter(operation => operation === 'check')).toHaveLength(1)

    const developmentPresentation = new FakeUpdatePresentation()
    const developmentController = createController(new FakeUpdateDriver(), developmentPresentation, false)
    developmentController.start()
    await developmentController.check()
    expect(developmentPresentation.transcript).toEqual(['status idle', 'updates unavailable'])
  })

  it('records install-on-quit without restarting the running backend', async () => {
    const driver = new FakeUpdateDriver()
    const presentation = new FakeUpdatePresentation()
    const installOnQuit = vi.fn()
    const restartAndInstall = vi.fn(async () => undefined)
    presentation.installChoice = 'on-quit'
    const controller = new DesktopUpdateController({
      enabled: true,
      currentVersion: '1.2.3',
      driver,
      presentation,
      restartAndInstall,
      installOnQuit,
    })

    controller.start()
    await controller.check()
    driver.emitAvailable('1.2.4')
    await settlePresentation()
    presentation.downloadChoice = 'download'
    await controller.check()
    await settlePresentation()
    driver.emitDownloaded('1.2.4')
    await settlePresentation()

    expect(installOnQuit).toHaveBeenCalledOnce()
    expect(restartAndInstall).not.toHaveBeenCalled()
    expect(presentation.transcript.at(-1)).toBe('status downloaded 1.2.4 install-on-quit')
    controller.dispose()
  })
})

/** Build a controller with inert installation callbacks for focused tests. */
function createController(
  driver: DesktopUpdateDriver,
  presentation: DesktopUpdatePresentation,
  enabled = true,
  timing: { readonly initialCheckDelayMs?: number; readonly checkIntervalMs?: number } = {},
): DesktopUpdateController {
  return new DesktopUpdateController({
    enabled,
    currentVersion: '1.2.3',
    driver,
    presentation,
    restartAndInstall: async () => undefined,
    installOnQuit: () => undefined,
    ...timing,
  })
}

/** Let event-triggered async presentation operations reach their first stable state. */
async function settlePresentation(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

/** Render controller state as a stable user-flow transcript. */
function statusLine(status: DesktopUpdateStatus): string {
  switch (status.kind) {
    case 'available':
      return `status available ${status.version}`
    case 'downloading':
      return `status downloading ${status.version} ${status.percent}%`
    case 'downloaded':
      return `status downloaded ${status.version} ${status.installOnQuit ? 'install-on-quit' : 'pending'}`
    case 'idle':
    case 'checking':
    case 'error':
      return `status ${status.kind}`
  }
}
