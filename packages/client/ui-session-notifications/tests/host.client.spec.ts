import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SettingsProvider, type SettingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  Config, DEFAULT_SESSION_NOTIFICATION_MODE, resolveSessionNotificationConfig,
  SESSION_NOTIFICATION_SETTINGS_NAMESPACE, apply,
} from '../src/index.ts'

class MemorySettings extends SettingsProvider {
  readonly writable = true
  protected load(): Promise<Record<string, unknown>> { return Promise.resolve({}) }
  protected persist(_ns: SettingsNamespace, _section: Record<string, unknown>): Promise<void> {
    return Promise.resolve()
  }
}

describe('ui-session-notifications host', () => {
  it('registers, validates, and disposes its durable namespace', async () => {
    const ctx = new Context()
    await ctx.plugin(MemorySettings).await()
    const fiber = ctx.plugin({ Config, apply }, { defaultMode: 'background' })
    await fiber.await()
    const ns = SESSION_NOTIFICATION_SETTINGS_NAMESPACE
    expect(ctx.settings.get(ns)).toEqual({ mode: 'background' })
    await ctx.settings.update(ns, { mode: 'always' })
    expect(ctx.settings.get(ns)).toEqual({ mode: 'always' })
    await expect(ctx.settings.update(ns, { mode: 'sometimes' })).rejects.toThrow()
    await fiber.dispose()
    expect(ctx.settings.describe().map(row => row.ns)).not.toContain(ns)
  })

  it('loads without a settings provider', async () => {
    const ctx = new Context()
    await ctx.plugin({ Config, apply }, Config({})).await()
    expect(ctx.get('settings')).toBeUndefined()
    expect(Config({})).toEqual({ defaultMode: DEFAULT_SESSION_NOTIFICATION_MODE })
    expect(resolveSessionNotificationConfig({}))
      .toEqual({ defaultMode: DEFAULT_SESSION_NOTIFICATION_MODE })
    expect(resolveSessionNotificationConfig(undefined))
      .toEqual({ defaultMode: DEFAULT_SESSION_NOTIFICATION_MODE })
  })
})
