/** Task-notification preferences stored in the Host user-settings document. */

import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the session-notifications plugin. */
export const SESSION_NOTIFICATION_SETTINGS_NAMESPACE = 'ui-session-notifications'

/** Field carrying the task-notification delivery mode. */
export const SESSION_NOTIFICATION_MODE_FIELD = 'mode'

/** Modes accepted at the settings and browser presentation boundaries. */
export const SESSION_NOTIFICATION_MODES = ['off', 'background', 'always'] as const

/** User-selected system-notification delivery policy. */
export type SessionNotificationMode = typeof SESSION_NOTIFICATION_MODES[number]

/** Safe default for compositions that mount the reusable plugin without a product choice. */
export const DEFAULT_SESSION_NOTIFICATION_MODE: SessionNotificationMode = 'off'

/** Deployment configuration resolved before the Host and Client halves start. */
export interface SessionNotificationConfig {
  /** Initial user preference when the settings document has no saved value. */
  defaultMode?: SessionNotificationMode
}

/** Complete deployment configuration consumed by both plugin faces. */
export interface ResolvedSessionNotificationConfig {
  /** Initial user preference when the settings document has no saved value. */
  defaultMode: SessionNotificationMode
}

/**
 * Resolve the reusable plugin's safe default before either runtime face starts.
 * @param config - validated composition input.
 * @returns complete notification deployment configuration.
 */
export function resolveSessionNotificationConfig(
  config: SessionNotificationConfig,
): ResolvedSessionNotificationConfig {
  return { defaultMode: config.defaultMode ?? DEFAULT_SESSION_NOTIFICATION_MODE }
}

/** Durable session-notification section shared by the Host schema and browser scope. */
export interface SessionNotificationSettings {
  /** Selected delivery policy. */
  mode: SessionNotificationMode
}

/**
 * Build the durable settings schema with the composition's explicit initial mode.
 * @param defaultMode - preference used only when no value has been stored.
 * @returns settings validation shared by the Host namespace and browser scope.
 */
export function sessionNotificationSettingsSchema(
  defaultMode: SessionNotificationMode,
): z<SessionNotificationSettings> {
  return z.object({
    [SESSION_NOTIFICATION_MODE_FIELD]: z.union([...SESSION_NOTIFICATION_MODES]).default(defaultMode),
  })
}
