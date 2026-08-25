/** `settings.notifications` dictionaries for the settings row and system notification. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'settings.title': '任务完成通知',
  'settings.description': '当任务及其 subagent 全部结束时发送系统通知。',
  'settings.mode.off': '关闭',
  'settings.mode.background': '仅在后台',
  'settings.mode.always': '始终通知',
  'settings.permission.allow': '允许系统通知',
  'settings.permission.requesting': '正在请求…',
  'settings.permission.denied': '系统通知权限已关闭，请在浏览器或系统设置中允许此应用发送通知。',
  'settings.permission.unsupported': '当前客户端不支持系统通知。',
  'notification.finished': '任务已结束',
} satisfies Record<string, string>

/** The settings.notifications namespace key union. */
export type SessionNotificationKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'settings.title': 'Task completion notifications',
  'settings.description': 'Send a system notification after a task and all of its subagents finish.',
  'settings.mode.off': 'Off',
  'settings.mode.background': 'Background only',
  'settings.mode.always': 'Always',
  'settings.permission.allow': 'Allow system notifications',
  'settings.permission.requesting': 'Requesting…',
  'settings.permission.denied': 'System notifications are disabled. Allow notifications for this app in your browser or system settings.',
  'settings.permission.unsupported': 'This client does not support system notifications.',
  'notification.finished': 'Task finished',
} satisfies Record<SessionNotificationKey, string>
