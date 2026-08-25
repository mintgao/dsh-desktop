// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  createSnapshotStore, type SessionListState, type WorkspaceListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { TaskNotificationRow, type TaskNotificationRowProps } from '../src/client/TaskNotificationRow.tsx'
import type { TaskNotificationState } from '../src/client/controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function emptySessions() {
  return bindSnapshotSelector(createSnapshotStore<SessionListState>({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  }))
}

function emptyWorkspaces() {
  return bindSnapshotSelector(createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }))
}

function mount(initial: TaskNotificationState) {
  const state = createSnapshotStore(initial)
  const setMode = vi.fn((mode: TaskNotificationState['mode']) => {
    state.update((draft) => { draft.mode = mode })
  })
  const requestPermission = vi.fn()
  const props: TaskNotificationRowProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useTaskNotifications: bindSnapshotSelector(state),
    setMode,
    requestPermission,
    t: makeTranslate(en),
  }
  render(<TaskNotificationRow {...props} />)
  return { requestPermission, setMode, state }
}

describe('TaskNotificationRow', () => {
  it('renders the default mode and changes it through the menu', () => {
    const b = mount({ mode: 'background', permission: 'granted', requestingPermission: false })
    const trigger = screen.getByRole('button', { name: /Background only/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Always' }))
    expect(b.setMode).toHaveBeenCalledWith('always')
    expect(screen.getByRole('button', { name: /Always/ })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /Always/ }))
    expect(screen.getByRole('menuitem', { name: 'Off' })).toBeDefined()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menuitem', { name: 'Off' })).toBeNull()
  })

  it('requests default permission and reports the in-flight state', () => {
    const b = mount({ mode: 'background', permission: 'default', requestingPermission: false })
    fireEvent.click(screen.getByRole('button', { name: 'Allow system notifications' }))
    expect(b.requestPermission).toHaveBeenCalledOnce()
    act(() => {
      b.state.update((draft) => { draft.requestingPermission = true })
    })
    expect(screen.getByRole('button', { name: 'Requesting…' }).hasAttribute('disabled')).toBe(true)
  })

  it('explains denied and unsupported environments', () => {
    const denied = mount({ mode: 'always', permission: 'denied', requestingPermission: false })
    expect(screen.getByText(/System notifications are disabled/)).toBeDefined()
    cleanup()
    denied.state.set({ mode: 'off', permission: 'denied', requestingPermission: false })

    mount({ mode: 'background', permission: 'unsupported', requestingPermission: false })
    expect(screen.getByText('This client does not support system notifications.')).toBeDefined()
    expect(screen.getByRole('button', { name: /Background only/ }).hasAttribute('disabled')).toBe(true)
  })

  it('renders Off without permission guidance', () => {
    mount({ mode: 'off', permission: 'default', requestingPermission: false })
    expect(screen.getByRole('button', { name: /Off/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Allow system notifications' })).toBeNull()
  })
})
