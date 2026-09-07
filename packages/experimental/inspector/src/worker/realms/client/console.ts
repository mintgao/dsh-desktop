/** ConsoleBackend over the typed Client Console event transport. */

import type { ClientRuntimeSessionId } from '../../../shared/bridge/ids.ts'
import type { RuntimeBackendObjectHandle } from '../../../shared/cdp/ids.ts'
import type { RuntimeConsoleBackendEvent } from '../../../shared/cdp/index.ts'
import type { ClientRuntimeRouter, ClientRuntimeTarget } from '../../bridge/runtime-rpc.ts'
import type { ConsoleBackend, ConsoleSubscriptionHandle } from '../../../shared/cdp/realm.ts'
import { clientConsoleEvent } from './values.ts'
import type { ClientScriptIdentity } from './scripts.ts'

/** Adapts session-local Client Console events to common Runtime values. */
export class ClientConsoleBackend implements ConsoleBackend {
  private readonly subscriptions = new Set<ConsoleSubscriptionHandle>()

  constructor(
    private readonly target: ClientRuntimeTarget,
    private readonly sessionId: ClientRuntimeSessionId,
    private readonly router: ClientRuntimeRouter,
    private readonly scriptIds: ClientScriptIdentity,
  ) {}

  subscribe(
    listener: (event: RuntimeConsoleBackendEvent<RuntimeBackendObjectHandle>) => void,
  ): ConsoleSubscriptionHandle {
    const subscription = this.router.subscribeConsole(this.target, this.sessionId, (event) => {
      listener(clientConsoleEvent(event, scriptKey => this.scriptIds.toRuntime(scriptKey)))
    })
    this.subscriptions.add(subscription)
    return {
      ready: subscription.ready,
      dispose: () => {
        if (!this.subscriptions.delete(subscription)) return
        subscription.dispose()
      },
    }
  }

  async clear(): Promise<void> {}

  /** Disable every active Console subscription for this connection. */
  close(): void {
    for (const subscription of this.subscriptions) subscription.dispose()
    this.subscriptions.clear()
  }
}
