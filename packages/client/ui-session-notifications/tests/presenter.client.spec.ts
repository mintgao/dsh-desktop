// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserTaskNotificationPresenter } from '../src/client/presenter.ts'

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn<() => Promise<NotificationPermission>>(() => Promise.resolve('granted'))
  static readonly instances: FakeNotification[] = []
  readonly title: string
  readonly options: NotificationOptions | undefined
  onclick: (() => void) | null = null
  onclose: (() => void) | null = null
  closed = 0

  constructor(title: string, options?: NotificationOptions) {
    this.title = title
    this.options = options
    FakeNotification.instances.push(this)
  }

  close() {
    this.closed += 1
    this.onclose?.()
  }
}

afterEach(() => {
  FakeNotification.instances.length = 0
  FakeNotification.permission = 'granted'
  FakeNotification.requestPermission.mockClear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('BrowserTaskNotificationPresenter', () => {
  it('reports unsupported environments and no-ops their operations', async () => {
    vi.stubGlobal('Notification', undefined)
    const presenter = new BrowserTaskNotificationPresenter()
    expect(presenter.permission()).toBe('unsupported')
    await expect(presenter.requestPermission()).resolves.toBe('unsupported')
    expect(presenter.show({ title: 'a', body: 'b', tag: 'c' }, vi.fn(), vi.fn())).toBeUndefined()
  })

  it('treats non-DOM runs as background and leaves no browser listeners', () => {
    vi.stubGlobal('document', undefined)
    vi.stubGlobal('window', undefined)
    const presenter = new BrowserTaskNotificationPresenter()
    expect(presenter.isBackground()).toBe(true)
    const dispose = presenter.subscribeEnvironment(vi.fn())
    dispose()
    presenter.focusWindow()
    expect(presenter.permission()).toBe('unsupported')
  })

  it('requests permission and presents clickable tagged notifications', async () => {
    vi.stubGlobal('Notification', FakeNotification)
    const presenter = new BrowserTaskNotificationPresenter()
    expect(presenter.permission()).toBe('granted')
    await expect(presenter.requestPermission()).resolves.toBe('granted')
    const click = vi.fn()
    const close = vi.fn()
    const handle = presenter.show({ title: 'Build', body: 'Task finished', tag: 'task:1' }, click, close)
    expect(handle).toBeDefined()
    const instance = FakeNotification.instances[0]
    expect(instance?.title).toBe('Build')
    expect(instance?.options).toMatchObject({ body: 'Task finished', tag: 'task:1' })
    instance?.onclick?.()
    expect(click).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    handle?.close()
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('tracks background state and releases environment listeners', () => {
    vi.stubGlobal('Notification', FakeNotification)
    const presenter = new BrowserTaskNotificationPresenter()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    expect(presenter.isBackground()).toBe(true)
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    expect(presenter.isBackground()).toBe(false)
    const listener = vi.fn()
    const dispose = presenter.subscribeEnvironment(listener)
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(listener).toHaveBeenCalledTimes(2)
    dispose()
    window.dispatchEvent(new Event('focus'))
    expect(listener).toHaveBeenCalledTimes(2)
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
    presenter.focusWindow()
    expect(focus).toHaveBeenCalledOnce()
  })

  it('does not present without granted permission', () => {
    FakeNotification.permission = 'denied'
    vi.stubGlobal('Notification', FakeNotification)
    const presenter = new BrowserTaskNotificationPresenter()
    expect(presenter.show({ title: 'a', body: 'b', tag: 'c' }, vi.fn(), vi.fn())).toBeUndefined()
    FakeNotification.permission = 'granted'
  })
})
