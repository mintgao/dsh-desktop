import { describe, expect, it, vi } from 'vitest'
import {
  createSnapshotStore, type ISessions, type SessionId, type SessionListState,
  type SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import {
  TaskNotificationController, type TaskNotificationPresenter,
  type TaskSystemNotification, type TaskSystemNotificationHandle,
} from '../src/client/index.ts'
import type { SessionNotificationSettings } from '../src/notification-settings.ts'

const id = (value: string): SessionId => value as SessionId

function summary(value: string, patch: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: id(value), displayTitle: value, running: false, blank: false, updatedAt: 1, ...patch,
  }
}

function list(rows: SessionSummary[], phase: SessionListState['phase'] = 'ready'): SessionListState {
  return {
    ids: rows.map(row => row.id),
    byId: Object.fromEntries(rows.map(row => [row.id, row])),
    current: undefined,
    phase,
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

class FakePresenter implements TaskNotificationPresenter {
  permissionValue: ReturnType<TaskNotificationPresenter['permission']> = 'granted'
  background = true
  requested: ReturnType<TaskNotificationPresenter['permission']> = 'granted'
  rejectRequest = false
  focused = 0
  readonly shown: Array<{
    message: TaskSystemNotification
    click: () => void
    closeFromSystem: () => void
    handle: TaskSystemNotificationHandle & { closed: number }
  }> = []
  private environment: (() => void) | undefined

  permission() { return this.permissionValue }
  isBackground() { return this.background }
  requestPermission(): Promise<ReturnType<TaskNotificationPresenter['permission']>> {
    return this.rejectRequest
      ? Promise.reject(new Error('permission request failed'))
      : Promise.resolve(this.requested)
  }
  subscribeEnvironment(listener: () => void) {
    this.environment = listener
    return () => { this.environment = undefined }
  }
  show(message: TaskSystemNotification, click: () => void, closeFromSystem: () => void) {
    const handle = { closed: 0, close() { this.closed += 1 } }
    this.shown.push({ message, click, closeFromSystem, handle })
    return handle
  }
  focusWindow() { this.focused += 1 }
  publishEnvironment() { this.environment?.() }
}

function bench(
  initial: SessionListState,
  presenter = new FakePresenter(),
  defaultMode: 'off' | 'background' | 'always' = 'background',
) {
  const feed = createSnapshotStore(initial)
  const open = vi.fn()
  const sessions = { list: feed, open } as unknown as ISessions
  const settings = stubSettingsScope<SessionNotificationSettings>()
  const controller = new TaskNotificationController(sessions, settings.scope, presenter, {
    finished: () => 'Task finished',
  }, defaultMode)
  const dispose = controller.start()
  return { controller, dispose, feed, open, presenter, settings }
}

describe('TaskNotificationController', () => {
  it('uses the composition-selected initial mode before Host adoption', () => {
    const b = bench(list([]), new FakePresenter(), 'always')
    expect(b.controller.state.getSnapshot().mode).toBe('always')
  })

  it('treats the first ready snapshot as a baseline and opens the finished task on click', () => {
    const root = summary('root', { displayTitle: 'Research task' })
    const b = bench(list([root]))
    expect(b.presenter.shown).toEqual([])
    b.feed.set(list([{ ...root, running: true }]))
    b.feed.set(list([root]))
    expect(b.presenter.shown).toHaveLength(1)
    expect(b.presenter.shown[0]?.message).toEqual({
      title: 'Research task',
      body: 'Task finished',
      tag: 'dsh-task-finished:root',
    })
    b.presenter.shown[0]?.click()
    expect(b.open).toHaveBeenCalledWith(id('root'))
    expect(b.presenter.focused).toBe(1)
  })

  it('waits for every subagent descendant and notifies only the root task', () => {
    const root = summary('root', { running: true })
    const child = summary('child', {
      origin: 'subagent', parentId: root.id, running: true,
    })
    const grandchild = summary('grandchild', {
      origin: 'subagent', parentId: child.id, running: true,
    })
    const b = bench(list([root, child, grandchild]))
    b.feed.set(list([{ ...root, running: false }, child, grandchild]))
    b.feed.set(list([{ ...root, running: false }, { ...child, running: false }, grandchild]))
    expect(b.presenter.shown).toEqual([])
    b.feed.set(list([{ ...root, running: false }, { ...child, running: false }, { ...grandchild, running: false }]))
    expect(b.presenter.shown.map(row => row.message.tag)).toEqual(['dsh-task-finished:root'])
  })

  it('suppresses a completion blocked on a root or descendant interaction', () => {
    const root = summary('root', { running: true })
    const child = summary('child', { origin: 'subagent', parentId: root.id })
    const grandchild = summary('grandchild', { origin: 'subagent', parentId: child.id })
    const b = bench(list([root, child, grandchild]))
    b.feed.set(list([{ ...root, running: false, pendingInteraction: 'approval' }, child, grandchild]))
    expect(b.presenter.shown).toEqual([])
    b.feed.set(list([{ ...root, running: true }, child, grandchild]))
    b.feed.set(list([{ ...root, running: false }, child, { ...grandchild, pendingInteraction: 'question' }]))
    expect(b.presenter.shown).toEqual([])
  })

  it('applies background, always, and off policies without delayed notifications', () => {
    const root = summary('root', { running: true })
    const presenter = new FakePresenter()
    presenter.background = false
    const b = bench(list([root]), presenter)
    b.feed.set(list([{ ...root, running: false }]))
    expect(presenter.shown).toEqual([])

    b.controller.setMode('always')
    b.feed.set(list([root]))
    b.feed.set(list([{ ...root, running: false }]))
    expect(presenter.shown).toHaveLength(1)

    b.controller.setMode('off')
    b.feed.set(list([root]))
    b.feed.set(list([{ ...root, running: false }]))
    expect(presenter.shown).toHaveLength(1)
    b.controller.setMode('always')
    expect(presenter.shown).toHaveLength(1)
    expect(b.settings.set).toHaveBeenNthCalledWith(1, 'mode', 'always')
    expect(b.settings.set).toHaveBeenNthCalledWith(2, 'mode', 'off')
  })

  it('adopts Host settings and requests permission from an explicit choice', async () => {
    const presenter = new FakePresenter()
    presenter.permissionValue = 'default'
    presenter.requested = 'granted'
    const b = bench(list([]), presenter)
    b.settings.publish({ status: 'ready', value: { mode: 'off' }, revision: 1, writable: true })
    expect(b.controller.state.getSnapshot().mode).toBe('off')
    b.controller.setMode('background')
    b.controller.setMode('background')
    expect(b.controller.state.getSnapshot()).toMatchObject({
      mode: 'background', requestingPermission: true,
    })
    b.controller.requestPermission()
    await vi.waitFor(() => {
      expect(b.controller.state.getSnapshot()).toMatchObject({
        permission: 'granted', requestingPermission: false,
      })
    })
    b.controller.requestPermission()
    expect(b.controller.state.getSnapshot().requestingPermission).toBe(true)
    await vi.waitFor(() => { expect(b.controller.state.getSnapshot().requestingPermission).toBe(false) })
  })

  it('contains permission-request failures and refreshes permission on environment changes', async () => {
    const presenter = new FakePresenter()
    presenter.permissionValue = 'default'
    presenter.rejectRequest = true
    const b = bench(list([]), presenter)
    b.controller.requestPermission()
    await vi.waitFor(() => { expect(b.controller.state.getSnapshot().requestingPermission).toBe(false) })
    expect(b.controller.state.getSnapshot().permission).toBe('default')
    presenter.permissionValue = 'denied'
    presenter.publishEnvironment()
    expect(b.controller.state.getSnapshot().permission).toBe('denied')
    presenter.publishEnvironment()
    expect(b.controller.state.getSnapshot().permission).toBe('denied')
  })

  it('ignores pending baselines, removed roots, and denied presentation', () => {
    const root = summary('root', { running: true })
    const presenter = new FakePresenter()
    presenter.permissionValue = 'denied'
    const b = bench(list([root], 'pending'), presenter)
    b.feed.set(list([{ ...root, running: false }]))
    expect(presenter.shown).toEqual([])
    b.feed.set(list([root]))
    b.feed.set(list([]))
    b.feed.set(list([{ ...root, running: false }]))
    expect(presenter.shown).toEqual([])
  })

  it('replaces a prior task notification and closes retained handles on disposal', () => {
    const root = summary('root', { running: true })
    const b = bench(list([root]))
    b.feed.set(list([{ ...root, running: false }]))
    b.feed.set(list([root]))
    b.feed.set(list([{ ...root, running: false }]))
    expect(b.presenter.shown).toHaveLength(2)
    expect(b.presenter.shown[0]?.handle.closed).toBe(1)
    b.presenter.shown[0]?.closeFromSystem()
    b.presenter.shown[1]?.closeFromSystem()
    b.feed.set(list([root]))
    b.feed.set(list([{ ...root, running: false }]))
    expect(b.presenter.shown).toHaveLength(3)
    b.dispose()
    expect(b.presenter.shown[2]?.handle.closed).toBe(1)
    b.feed.set(list([root]))
    b.feed.set(list([{ ...root, running: false }]))
    expect(b.presenter.shown).toHaveLength(3)
  })
})
