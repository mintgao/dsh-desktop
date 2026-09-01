// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type ISessions, type SessionListState,
} from '@deepseek-ai/dsh-api-session-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { UiSession } from '@deepseek-ai/dsh-client-ui-session/client'
import {
  apply, inject, SESSION_NOTIFICATION_LOCALE_NAMESPACE,
} from '../src/client/index.ts'
import { TaskNotificationRow } from '../src/client/TaskNotificationRow.tsx'
import type { TaskNotificationRowInjected } from '../src/client/TaskNotificationRow.tsx'
import type { SessionNotificationSettings } from '../src/notification-settings.ts'

const SLOT = 'settings.general.item'

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(() => Promise.resolve<NotificationPermission>('granted'))
  static readonly messages: Array<{ title: string; body: string }> = []
  onclick: (() => void) | null = null
  onclose: (() => void) | null = null

  constructor(title: string, options: NotificationOptions = {}) {
    FakeNotification.messages.push({ title, body: options.body ?? '' })
  }

  close(): void { this.onclose?.() }
}

afterEach(() => {
  FakeNotification.messages.length = 0
  FakeNotification.requestPermission.mockClear()
  vi.unstubAllGlobals()
})

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const list = createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  })
  const open = vi.fn()
  const sessions = { list, open } as unknown as ISessions
  ctx.provide('sessions', sessions)
  new UiSession(ctx, sessions)
  const settings = stubSettingsScope<SessionNotificationSettings>()
  ctx.provide('settingsScope', { bind: () => settings.scope } as never)
  return { ctx, list, locale, open, settings, slots }
}

function declareItems(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

describe('ui-session-notifications client apply', () => {
  it('declares the exact service dependencies', () => {
    expect(inject).toEqual(['slots', 'locale', 'sessions', 'uiSession', 'settingsScope'])
  })

  it('registers localized copy and the feature-owned settings row', async () => {
    vi.stubGlobal('Notification', FakeNotification)
    const b = await bench()
    declareItems(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply }, { defaultMode: 'background' })
    await fiber.await()
    expect(b.locale.bind(SESSION_NOTIFICATION_LOCALE_NAMESPACE)('settings.title')).toBe('任务完成通知')
    b.locale.setLocale('en')
    expect(b.locale.bind(SESSION_NOTIFICATION_LOCALE_NAMESPACE)('settings.title'))
      .toBe('Task completion notifications')
    const entry = b.slots.entries(SLOT).find(candidate => candidate.component === TaskNotificationRow)
    expect(entry?.options).toMatchObject({ id: 'task-notifications', order: 30 })
    expect(entry?.locale).toBe(SESSION_NOTIFICATION_LOCALE_NAMESPACE)
    const face = (entry?.inject as unknown as (() => TaskNotificationRowInjected))()
    b.list.set({
      ...b.list.getSnapshot(),
      ids: ['apply-task' as never],
      byId: {
        ['apply-task' as never]: {
          id: 'apply-task' as never, displayTitle: 'Apply task', running: true,
          blank: false, updatedAt: 1,
        },
      },
    })
    b.list.update((draft) => { draft.byId['apply-task' as never]!.running = false })
    expect(FakeNotification.messages).toEqual([{ title: 'Apply task', body: 'Task finished' }])
    face.setMode('off')
    expect(face.hooks.taskNotifications.getSnapshot().mode).toBe('off')
    face.requestPermission()
    await vi.waitFor(() => { expect(FakeNotification.requestPermission).toHaveBeenCalledOnce() })
  })

  it('recovers after declaring-slot replacement and disposes its row and dictionaries', async () => {
    const b = await bench()
    const declaration = declareItems(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply }, { defaultMode: 'off' })
    await fiber.await()
    expect(b.slots.entries(SLOT)).toHaveLength(1)
    declaration()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    declareItems(b.slots)
    await Promise.resolve()
    expect(b.slots.entries(SLOT).some(entry => entry.component === TaskNotificationRow)).toBe(true)
    await fiber.dispose()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    expect(b.locale.bind(SESSION_NOTIFICATION_LOCALE_NAMESPACE)('settings.title')).toBe('settings.title')
  })

  it('loads without Client config and disposes quietly before the General slot is declared', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    await fiber.dispose()
  })
})
