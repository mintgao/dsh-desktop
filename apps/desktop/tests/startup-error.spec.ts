/** Exercise native startup-error presentation with the Electron host replaced by its test adapter. */
import { expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  showErrorBox: vi.fn(),
  quit: vi.fn(),
  whenReady: (): Promise<never> => Promise.reject(new Error('Backend failed at http://127.0.0.1:43123/?token=synthetic-private-token')),
}))
vi.mock('electron', () => ({
  app: { setName: vi.fn(), getVersion: () => '1.0.0', setAboutPanelOptions: vi.fn(), requestSingleInstanceLock: () => true, on: vi.fn(), whenReady: host.whenReady, quit: host.quit },
  dialog: { showErrorBox: host.showErrorBox }, BrowserWindow: vi.fn(), Menu: {}, net: {}, Notification: vi.fn(), shell: {},
}))
vi.mock('electron-updater', () => ({ default: { autoUpdater: {} } }))

it('redacts authenticated URLs before showing the native startup error', async () => {
  await import('../src/main.ts')
  await vi.waitFor(() => {
    expect(host.showErrorBox).toHaveBeenCalledOnce()
  })
  expect(host.showErrorBox).toHaveBeenCalledWith('DSH Desktop could not start', 'Backend failed at http://127.0.0.1:43123/?token=[redacted]')
  expect(host.quit).toHaveBeenCalledOnce()
})
