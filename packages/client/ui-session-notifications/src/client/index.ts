/** Browser task-completion notifications and their feature-owned settings row. */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {
  SessionNotificationConfig, SessionNotificationMode, SessionNotificationSettings,
} from '../notification-settings.ts'
import {
  resolveSessionNotificationConfig, SESSION_NOTIFICATION_SETTINGS_NAMESPACE,
} from '../notification-settings.ts'
import { BrowserTaskNotificationPresenter } from './presenter.ts'
import { TaskNotificationController } from './controller.ts'
import type { TaskNotificationRowInjected } from './TaskNotificationRow.tsx'
import { TaskNotificationRow } from './TaskNotificationRow.tsx'
import { en, zh, type SessionNotificationKey } from './locales.ts'

export type {
  TaskNotificationCopy, TaskNotificationState,
} from './controller.ts'
export { TaskNotificationController } from './controller.ts'
export type {
  TaskNotificationPermission, TaskNotificationPresenter, TaskSystemNotification,
  TaskSystemNotificationHandle,
} from './presenter.ts'
export { BrowserTaskNotificationPresenter } from './presenter.ts'
export type { TaskNotificationRowInjected, TaskNotificationRowProps } from './TaskNotificationRow.tsx'
export type { SessionNotificationKey } from './locales.ts'
export type {
  ResolvedSessionNotificationConfig, SessionNotificationConfig, SessionNotificationMode,
  SessionNotificationSettings,
} from '../notification-settings.ts'
export { resolveSessionNotificationConfig } from '../notification-settings.ts'

/** Locale namespace owning the settings row and native-notification copy. */
export const SESSION_NOTIFICATION_LOCALE_NAMESPACE = 'settings.notifications'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task-notification settings and system-notification copy. */
    'settings.notifications': SessionNotificationKey
  }
}

/** Required client services. */
export const inject = ['slots', 'locale', 'sessions', 'settingsScope']

/**
 * Observe the shared session list, present task-completion system notifications,
 * and register this feature's General settings row.
 * @param ctx - client Cordis context.
 * @param config - composition-selected initial notification preference.
 */
export function apply(ctx: ClientContext, config: SessionNotificationConfig): void {
  const resolved = resolveSessionNotificationConfig(config)
  const settings = ctx.settingsScope.bind<SessionNotificationSettings>({
    namespace: SESSION_NOTIFICATION_SETTINGS_NAMESPACE,
  })
  const presenter = new BrowserTaskNotificationPresenter()
  const t = ctx.locale.bind(SESSION_NOTIFICATION_LOCALE_NAMESPACE)
  const controller = new TaskNotificationController(ctx.sessions, settings, presenter, {
    finished: () => t('notification.finished'),
  }, resolved.defaultMode)

  ctx.effect(() => ctx.locale.register(
    SESSION_NOTIFICATION_LOCALE_NAMESPACE, { zh, en },
  ), 'ui-session-notifications: dictionaries')
  ctx.effect(() => controller.start(), 'ui-session-notifications: session and browser observation')

  const injected = (): TaskNotificationRowInjected => ({
    hooks: { taskNotifications: controller.state },
    setMode: (mode: SessionNotificationMode) => { controller.setMode(mode) },
    requestPermission: () => { controller.requestPermission() },
  })
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'task-notifications',
    order: 30,
    locale: SESSION_NOTIFICATION_LOCALE_NAMESPACE,
    inject: injected,
  }, TaskNotificationRow))
}
