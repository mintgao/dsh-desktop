/** Client Console observation shared by every active DevTools Runtime session. */

import type {
  ClientConsoleSubscriptionId,
  ClientRemoteObjectHandle,
  ClientRuntimeSessionId,
} from '../../shared/bridge/ids.ts'
import type {
  ClientConsoleCapability,
  ClientConsoleEnableResultFrame,
} from '../../shared/bridge/messages/runtime/index.ts'
import type { RuntimeConsoleBackendEvent, RuntimeConsoleType } from '../../shared/cdp/index.ts'
import type { ClientRuntimeExecutor } from './runtime.ts'
import { captureClientConsoleStack, clientErrorStack, type ClientScriptKeyResolver } from './stack.ts'

/**
 * Describe browser-side Console observation.
 * @returns The Console capability advertised by a browser Client source.
 */
export function consoleBridgeCapability(): ClientConsoleCapability {
  return { type: 'client-console' }
}

/** Receives one Console event whose object handles belong to the given session. */
export type ClientConsoleSink = (
  sessionId: ClientRuntimeSessionId,
  subscriptionId: ClientConsoleSubscriptionId,
  event: RuntimeConsoleBackendEvent<ClientRemoteObjectHandle>,
) => void

/** Browser-side result retained for duplicate Console enable requests. */
export type ClientConsoleEnableOutcome = ClientConsoleEnableResultFrame['outcome']

const METHODS = [
  ['log', 'log'],
  ['debug', 'debug'],
  ['info', 'info'],
  ['error', 'error'],
  ['warn', 'warning'],
  ['dir', 'dir'],
  ['dirxml', 'dirxml'],
  ['table', 'table'],
  ['trace', 'trace'],
  ['clear', 'clear'],
  ['group', 'startGroup'],
  ['groupCollapsed', 'startGroupCollapsed'],
  ['groupEnd', 'endGroup'],
  ['assert', 'assert'],
  ['profile', 'profile'],
  ['profileEnd', 'profileEnd'],
  ['count', 'count'],
  ['timeEnd', 'timeEnd'],
] as const satisfies readonly (readonly [string, RuntimeConsoleType])[]

type ConsoleMethodName = typeof METHODS[number][0]

interface InstalledMethod {
  readonly name: ConsoleMethodName
  readonly original: (...args: unknown[]) => unknown
  readonly replacement: (...args: unknown[]) => unknown
}

/** Installs one transparent console/error observer and fans out session-local values. */
export class ClientConsoleObserver {
  private readonly subscriptions = new Map<ClientConsoleSubscriptionId, {
    readonly sessionId: ClientRuntimeSessionId
    readonly outcome: ClientConsoleEnableOutcome
  }>()
  private readonly activeBySession = new Map<ClientRuntimeSessionId, ClientConsoleSubscriptionId>()
  private readonly installed: InstalledMethod[] = []
  private active = false
  private closed = false

  constructor(
    private readonly runtime: ClientRuntimeExecutor,
    private readonly sink: ClientConsoleSink,
    private readonly resolveScript: ClientScriptKeyResolver = () => undefined,
  ) {}

  /**
   * Start producing events for one DevTools Runtime session.
   * @param sessionId - Session whose object table retains event arguments.
   * @param subscriptionId - Worker-owned attempt identity.
   * @returns The installed, repeated, or failed result for this tuple.
   */
  enable(
    sessionId: ClientRuntimeSessionId,
    subscriptionId: ClientConsoleSubscriptionId,
  ): ClientConsoleEnableOutcome {
    const repeated = this.subscriptions.get(subscriptionId)
    if (repeated !== undefined) {
      return repeated.sessionId === sessionId
        ? repeated.outcome
        : conflictOutcome()
    }
    if (this.closed) {
      const outcome = installationFailure('Client Console observer is closed')
      this.subscriptions.set(subscriptionId, { sessionId, outcome })
      return outcome
    }
    const active = this.activeBySession.get(sessionId)
    if (active !== undefined && active !== subscriptionId) {
      const outcome = conflictOutcome()
      this.subscriptions.set(subscriptionId, { sessionId, outcome })
      return outcome
    }
    let outcome: ClientConsoleEnableOutcome
    try {
      if (!this.active) this.install()
      outcome = { ok: true }
      this.activeBySession.set(sessionId, subscriptionId)
    } catch (error) {
      outcome = installationFailure(renderError(error))
    }
    this.subscriptions.set(subscriptionId, { sessionId, outcome })
    return outcome
  }

  /**
   * Stop producing events and release Console objects for one session.
   * @param sessionId - Session being disabled or closed.
   * @param subscriptionId - Exact subscription or failure tombstone to remove.
   */
  disable(sessionId: ClientRuntimeSessionId, subscriptionId: ClientConsoleSubscriptionId): void {
    const subscription = this.subscriptions.get(subscriptionId)
    if (subscription === undefined || subscription.sessionId !== sessionId) return
    this.subscriptions.delete(subscriptionId)
    const wasActive = this.activeBySession.get(sessionId) === subscriptionId
    if (wasActive) this.activeBySession.delete(sessionId)
    this.runtime.releaseObjectGroup(sessionId, 'console')
    if (wasActive && this.activeBySession.size === 0) this.uninstall()
  }

  /**
   * Remove every Console record owned by a closing Runtime session.
   * @param sessionId - Closing session whose records and Console object group are released.
   */
  disableSession(sessionId: ClientRuntimeSessionId): void {
    for (const [subscriptionId, subscription] of this.subscriptions) {
      if (subscription.sessionId === sessionId) this.subscriptions.delete(subscriptionId)
    }
    this.activeBySession.delete(sessionId)
    this.runtime.releaseObjectGroup(sessionId, 'console')
    if (this.activeBySession.size === 0) this.uninstall()
  }

  /** Restore original browser hooks and clear every active session. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.reset()
  }

  /** Stop observing the current source generation while allowing a later reconnect. */
  reset(): void {
    this.subscriptions.clear()
    this.activeBySession.clear()
    this.uninstall()
  }

  private install(): void {
    try {
      for (const [name, type] of METHODS) {
        const candidate: unknown = Reflect.get(console, name)
        if (typeof candidate !== 'function') continue
        const original = candidate as (...args: unknown[]) => unknown
        const capture = (values: readonly unknown[]): void => { this.captureConsole(type, values) }
        const replacement = function (this: unknown, ...args: unknown[]): unknown {
          const result = Reflect.apply(original, this, args)
          const values = name === 'assert' ? args.slice(1) : args
          if (name !== 'assert' || !args[0]) capture(values)
          return result
        }
        if (!Reflect.set(console, name, replacement)) {
          throw new Error(`Client Console method ${name} is not replaceable`)
        }
        this.installed.push({ name, original, replacement })
      }
      addGlobalListener('error', this.onError)
      addGlobalListener('unhandledrejection', this.onUnhandledRejection)
      this.active = true
    } catch (error) {
      this.uninstall()
      throw error
    }
  }

  private uninstall(): void {
    this.active = false
    removeGlobalListener('error', this.onError)
    removeGlobalListener('unhandledrejection', this.onUnhandledRejection)
    for (const method of this.installed.splice(0).reverse()) {
      if (Reflect.get(console, method.name) === method.replacement) Reflect.set(console, method.name, method.original)
    }
  }

  private readonly onError = (event: Event): void => {
    const error = Reflect.get(event, 'error') as unknown
    const message = Reflect.get(event, 'message') as unknown
    this.captureException(error ?? new Error(typeof message === 'string' ? message : 'Client error'))
  }

  private readonly onUnhandledRejection = (event: Event): void => {
    this.captureException(Reflect.get(event, 'reason') as unknown)
  }

  private captureConsole(type: RuntimeConsoleType, values: readonly unknown[]): void {
    const timestamp = Date.now()
    const stackTrace = captureClientConsoleStack(this.resolveScript)
    queueMicrotask(() => {
      for (const [sessionId, subscriptionId] of [...this.activeBySession]) {
        try {
          const event = this.runtime.consoleEvent(sessionId, type, values, timestamp, stackTrace)
          if (event !== undefined) this.sink(sessionId, subscriptionId, event)
        } catch {
          // Console observation must not affect the page's original console call.
        }
      }
    })
  }

  private captureException(error: unknown): void {
    const timestamp = Date.now()
    const stackTrace = clientErrorStack(error, this.resolveScript)
    queueMicrotask(() => {
      for (const [sessionId, subscriptionId] of [...this.activeBySession]) {
        try {
          const event = this.runtime.exceptionEvent(sessionId, error, timestamp, stackTrace)
          if (event !== undefined) this.sink(sessionId, subscriptionId, event)
        } catch {
          // Exception observation must not affect browser error dispatch.
        }
      }
    })
  }
}

function addGlobalListener(type: string, listener: EventListener): void {
  const add = Reflect.get(globalThis, 'addEventListener') as unknown
  if (typeof add === 'function') Reflect.apply(add, globalThis, [type, listener])
}

function removeGlobalListener(type: string, listener: EventListener): void {
  const remove = Reflect.get(globalThis, 'removeEventListener') as unknown
  if (typeof remove !== 'function') return
  try {
    Reflect.apply(remove, globalThis, [type, listener])
  } catch {
    // Hook rollback must continue restoring Console methods after a partial install.
  }
}

function installationFailure(message: string): ClientConsoleEnableOutcome {
  return { ok: false, error: { code: 'installation-failed', message: message.slice(0, 2_048) } }
}

function conflictOutcome(): ClientConsoleEnableOutcome {
  return {
    ok: false,
    error: { code: 'session-conflict', message: 'Client Runtime session already owns another Console subscription' },
  }
}

function renderError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
