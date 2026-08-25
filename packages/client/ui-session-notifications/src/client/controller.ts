/** Task-completion notification policy over the shared session-list projection. */

import {
  createSnapshotStore, indexSubagentDescendants, type ISessions, type SessionListState,
  type SessionId, type SessionSummary, type SettingsScope, type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  DEFAULT_SESSION_NOTIFICATION_MODE, SESSION_NOTIFICATION_MODE_FIELD,
  type SessionNotificationMode, type SessionNotificationSettings,
} from '../notification-settings.ts'
import type {
  TaskNotificationPermission, TaskNotificationPresenter, TaskSystemNotificationHandle,
} from './presenter.ts'

/** Reactive state consumed by the General settings row. */
export interface TaskNotificationState {
  /** Current delivery mode, including the local default before Host adoption. */
  mode: SessionNotificationMode
  /** Current browser notification permission. */
  permission: TaskNotificationPermission
  /** Whether a permission request is in flight. */
  requestingPermission: boolean
}

/** Localized copy needed outside React when a task settles. */
export interface TaskNotificationCopy {
  /** @returns localized body copy for a finished task. */
  finished(): string
}

interface RootActivity {
  active: boolean
}

/**
 * Derive and present one system notification when a top-level task and every
 * uninterrupted subagent descendant stop running. The controller consumes
 * browser session state only; it neither changes Agent lifecycle nor writes a
 * session event.
 */
export class TaskNotificationController {
  /** Reactive settings-row state. */
  readonly state: SnapshotStore<TaskNotificationState>
  private readonly roots = new Map<SessionId, RootActivity>()
  private readonly visible = new Map<SessionId, TaskSystemNotificationHandle>()

  /**
   * @param sessions - authoritative browser session-list owner and navigation face.
   * @param settings - durable mode scope owned by this feature.
   * @param presenter - browser system-notification adapter.
   * @param copy - localized notification copy.
   * @param defaultMode - initial preference before Host settings adoption.
   */
  constructor(
    private readonly sessions: ISessions,
    private readonly settings: SettingsScope<SessionNotificationSettings>,
    private readonly presenter: TaskNotificationPresenter,
    private readonly copy: TaskNotificationCopy,
    defaultMode: SessionNotificationMode = DEFAULT_SESSION_NOTIFICATION_MODE,
  ) {
    this.state = createSnapshotStore({
      mode: defaultMode,
      permission: presenter.permission(),
      requestingPermission: false,
    })
  }

  /**
   * Subscribe to settings, browser environment, and session-list changes.
   * @returns disposer that stops observation and closes plugin-owned notifications.
   */
  start(): () => void {
    const releaseSettings = this.settings.subscribe(() => { this.adoptSettings() })
    const releaseSessions = this.sessions.list.subscribe(() => { this.syncSessions() })
    const releaseEnvironment = this.presenter.subscribeEnvironment(() => { this.refreshPermission() })
    this.adoptSettings()
    this.syncSessions()
    return () => {
      releaseEnvironment()
      releaseSessions()
      releaseSettings()
      for (const notification of this.visible.values()) notification.close()
      this.visible.clear()
      this.roots.clear()
    }
  }

  /**
   * Change notification delivery immediately and persist the explicit choice.
   * @param mode - Off, background-only, or always.
   */
  setMode(mode: SessionNotificationMode): void {
    if (this.state.getSnapshot().mode !== mode) {
      this.state.update((draft) => { draft.mode = mode })
      void this.settings.set(SESSION_NOTIFICATION_MODE_FIELD, mode)
    }
    if (mode !== 'off' && this.presenter.permission() === 'default') this.requestPermission()
  }

  /** Request system-notification permission from the settings-row user gesture. */
  requestPermission(): void {
    if (this.state.getSnapshot().requestingPermission) return
    this.state.update((draft) => { draft.requestingPermission = true })
    void this.presenter.requestPermission().then(
      (permission) => {
        this.state.set({
          ...this.state.getSnapshot(),
          permission,
          requestingPermission: false,
        })
      },
      () => {
        this.state.set({
          ...this.state.getSnapshot(),
          permission: this.presenter.permission(),
          requestingPermission: false,
        })
      },
    )
  }

  private adoptSettings(): void {
    const section = this.settings.getSnapshot().value
    if (section === undefined || section.mode === this.state.getSnapshot().mode) return
    this.state.update((draft) => { draft.mode = section.mode })
  }

  private refreshPermission(): void {
    const permission = this.presenter.permission()
    if (permission === this.state.getSnapshot().permission) return
    this.state.update((draft) => { draft.permission = permission })
  }

  private syncSessions(): void {
    const state = this.sessions.list.getSnapshot()
    if (state.phase !== 'ready') return
    this.refreshPermission()
    const descendants = indexSubagentDescendants(state.byId)
    const seen = new Set<SessionId>()
    for (const id of state.ids) {
      const root = state.byId[id]
      if (root === undefined || root.origin === 'subagent' || seen.has(root.id)) continue
      seen.add(root.id)
      const active = root.running || (descendants.get(root.id)?.runningCount ?? 0) > 0
      const previous = this.roots.get(root.id)
      if (previous?.active === true && !active && !hasPendingInteraction(root, state)) {
        this.notify(root)
      }
      this.roots.set(root.id, { active })
    }
    for (const id of this.roots.keys()) {
      if (!seen.has(id)) this.roots.delete(id)
    }
  }

  private notify(root: SessionSummary): void {
    const snapshot = this.state.getSnapshot()
    if (snapshot.mode === 'off' || snapshot.permission !== 'granted') return
    if (snapshot.mode === 'background' && !this.presenter.isBackground()) return
    this.visible.get(root.id)?.close()
    const reference: { handle?: TaskSystemNotificationHandle } = {}
    const handle: TaskSystemNotificationHandle | undefined = this.presenter.show({
      title: root.displayTitle,
      body: this.copy.finished(),
      tag: `dsh-task-finished:${root.id}`,
    }, () => {
      this.sessions.open(root.id)
      this.presenter.focusWindow()
    }, () => {
      if (this.visible.get(root.id) === reference.handle) this.visible.delete(root.id)
    })
    if (handle !== undefined) {
      reference.handle = handle
      this.visible.set(root.id, handle)
    }
  }
}

function hasPendingInteraction(root: SessionSummary, state: SessionListState): boolean {
  if (root.pendingInteraction !== undefined) return true
  for (const candidate of Object.values(state.byId)) {
    if (candidate.pendingInteraction === undefined || candidate.origin !== 'subagent') continue
    const seen = new Set<SessionId>()
    let current: SessionSummary | undefined = candidate
    while (current?.origin === 'subagent' && current.parentId !== undefined
      && !seen.has(current.id)) {
      seen.add(current.id)
      if (current.parentId === root.id) return true
      current = state.byId[current.parentId]
    }
  }
  return false
}
