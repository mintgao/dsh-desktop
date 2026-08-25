/** Browser adaptation for system task notifications. */

/** Notification permission including environments without the Web Notifications API. */
export type TaskNotificationPermission = NotificationPermission | 'unsupported'

/** System-notification content owned by the task-notification controller. */
export interface TaskSystemNotification {
  /** Visible notification title. */
  title: string
  /** Visible notification body. */
  body: string
  /** Stable replacement tag for one root task. */
  tag: string
}

/** Live handle retained until controller disposal or replacement. */
export interface TaskSystemNotificationHandle {
  /** Close this system notification. */
  close(): void
}

/** Browser capability face consumed by the task-notification controller. */
export interface TaskNotificationPresenter {
  /** @returns current browser notification permission or `unsupported`. */
  permission(): TaskNotificationPermission
  /** @returns whether the page is hidden or its window lacks focus. */
  isBackground(): boolean
  /**
   * Request browser notification permission from a user gesture.
   * @returns the resulting permission or `unsupported`.
   */
  requestPermission(): Promise<TaskNotificationPermission>
  /**
   * Observe focus and visibility changes that may affect presentation or permission copy.
   * @param listener - environment-change observer.
   * @returns disposer for the browser listeners.
   */
  subscribeEnvironment(listener: () => void): () => void
  /**
   * Present one system notification.
   * @param message - visible title, body, and replacement tag.
   * @param onClick - activation callback.
   * @param onClose - close callback used to release the retained handle.
   * @returns a close handle, or undefined when presentation is unavailable.
   */
  show(
    message: TaskSystemNotification,
    onClick: () => void,
    onClose: () => void,
  ): TaskSystemNotificationHandle | undefined
  /** Bring the application window forward after notification activation. */
  focusWindow(): void
}

/** Web Notifications API adapter used by ordinary browsers and Electron renderers. */
export class BrowserTaskNotificationPresenter implements TaskNotificationPresenter {
  /** @returns the current Web Notifications permission. */
  permission(): TaskNotificationPermission {
    return typeof globalThis.Notification === 'undefined'
      ? 'unsupported'
      : globalThis.Notification.permission
  }

  /** @returns whether the current document is outside the user's foreground attention. */
  isBackground(): boolean {
    if (typeof document === 'undefined') return true
    return document.visibilityState !== 'visible' || !document.hasFocus()
  }

  /** @returns the permission settled by the browser prompt. */
  requestPermission(): Promise<TaskNotificationPermission> {
    if (typeof globalThis.Notification === 'undefined') return Promise.resolve('unsupported')
    return globalThis.Notification.requestPermission()
  }

  /**
   * @param listener - focus and visibility observer.
   * @returns disposer for the registered browser listeners.
   */
  subscribeEnvironment(listener: () => void): () => void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}
    document.addEventListener('visibilitychange', listener)
    window.addEventListener('focus', listener)
    return () => {
      document.removeEventListener('visibilitychange', listener)
      window.removeEventListener('focus', listener)
    }
  }

  /**
   * @param message - visible notification content.
   * @param onClick - notification activation callback.
   * @param onClose - notification close callback.
   * @returns the Web Notification close handle when permission is granted.
   */
  show(
    message: TaskSystemNotification,
    onClick: () => void,
    onClose: () => void,
  ): TaskSystemNotificationHandle | undefined {
    if (typeof globalThis.Notification === 'undefined'
      || globalThis.Notification.permission !== 'granted') return undefined
    const notification = new globalThis.Notification(message.title, {
      body: message.body,
      tag: message.tag,
    })
    notification.onclick = () => {
      notification.close()
      onClick()
    }
    notification.onclose = onClose
    return { close: () => { notification.close() } }
  }

  /** Focus the renderer window after the user activates a system notification. */
  focusWindow(): void {
    if (typeof window !== 'undefined') window.focus()
  }
}
