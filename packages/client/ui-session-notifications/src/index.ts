/** Host registration for the browser task-notification preference. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  DEFAULT_SESSION_NOTIFICATION_MODE, resolveSessionNotificationConfig,
  SESSION_NOTIFICATION_MODES, SESSION_NOTIFICATION_SETTINGS_NAMESPACE,
  sessionNotificationSettingsSchema, type SessionNotificationConfig,
} from './notification-settings.ts'

export {
  DEFAULT_SESSION_NOTIFICATION_MODE, SESSION_NOTIFICATION_MODE_FIELD, SESSION_NOTIFICATION_MODES,
  resolveSessionNotificationConfig, SESSION_NOTIFICATION_SETTINGS_NAMESPACE,
  type ResolvedSessionNotificationConfig, type SessionNotificationMode,
  type SessionNotificationSettings,
} from './notification-settings.ts'

/** Deployment configuration shared by this package's Host and Client halves. */
export type Config = SessionNotificationConfig

/** Validated task-notification deployment configuration. */
export const Config: z<Config> = z.object({
  defaultMode: z.union([...SESSION_NOTIFICATION_MODES]).default(DEFAULT_SESSION_NOTIFICATION_MODE),
})

/**
 * Register the durable notification section when a settings provider exists.
 * @param ctx - Host context whose optional settings service owns the section.
 * @param config - composition-selected initial notification preference.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveSessionNotificationConfig(config)
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(SESSION_NOTIFICATION_SETTINGS_NAMESPACE),
      sessionNotificationSettingsSchema(resolved.defaultMode),
    )
  })
}
