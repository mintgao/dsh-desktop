/** General settings row for task-completion system notifications. */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionNotificationMode } from '../notification-settings.ts'
import type { SessionNotificationKey } from './locales.ts'
import type { TaskNotificationController } from './controller.ts'
import css from './TaskNotificationRow.module.css'

/** Registration-side preference and permission face. */
export interface TaskNotificationRowInjected {
  hooks: {
    /** Controller state bound as useTaskNotifications. */
    taskNotifications: TaskNotificationController['state']
  }
  /** Change the notification delivery mode. */
  setMode: (mode: SessionNotificationMode) => void
  /** Ask the browser for system-notification access. */
  requestPermission: () => void
}

/** Full settings-row props. */
export type TaskNotificationRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.notifications'>
  & InjectFace<TaskNotificationRowInjected>

const OPTIONS: readonly { id: SessionNotificationMode; label: SessionNotificationKey }[] = [
  { id: 'off', label: 'settings.mode.off' },
  { id: 'background', label: 'settings.mode.background' },
  { id: 'always', label: 'settings.mode.always' },
]

/**
 * Render the notification mode selector and permission guidance.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function TaskNotificationRow({
  useTaskNotifications, setMode, requestPermission, t,
}: TaskNotificationRowProps) {
  const state = useTaskNotifications(value => value)
  const [open, setOpen] = useState(false)
  const selectedLabel: SessionNotificationKey = state.mode === 'off'
    ? 'settings.mode.off'
    : state.mode === 'always' ? 'settings.mode.always' : 'settings.mode.background'
  const unsupported = state.permission === 'unsupported'

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('settings.title')}</div>
        <div className={css.desc}>{t('settings.description')}</div>
        {state.permission === 'default' && state.mode !== 'off' && (
          <button
            type="button"
            className={css.permissionButton}
            disabled={state.requestingPermission}
            onClick={requestPermission}
          >
            {t(state.requestingPermission
              ? 'settings.permission.requesting'
              : 'settings.permission.allow')}
          </button>
        )}
        {state.permission === 'denied' && state.mode !== 'off' && (
          <div className={css.permissionNotice}>{t('settings.permission.denied')}</div>
        )}
        {unsupported && (
          <div className={css.permissionNotice}>{t('settings.permission.unsupported')}</div>
        )}
      </div>
      <Menu
        open={open}
        onClose={() => { setOpen(false) }}
        items={OPTIONS.map(option => ({ id: option.id, label: t(option.label) }))}
        selectedId={state.mode}
        onSelect={(id) => {
          setOpen(false)
          setMode(id as SessionNotificationMode)
        }}
        align="end"
        portal
        anchor={(
          <button
            type="button"
            className={css.selector}
            aria-haspopup="menu"
            aria-expanded={open}
            disabled={unsupported}
            onClick={() => { setOpen(value => !value) }}
          >
            {t(selectedLabel)}
            <IconChevronDownOutline14 className={css.chevron} />
          </button>
        )}
      />
    </div>
  )
}
