/** Runtime enable-epoch readiness and dynamic-realm isolation behavior. */

import { describe, expect, it, vi } from 'vitest'
import type { RuntimeBackendObjectHandle } from '../src/shared/cdp/ids.ts'
import type {
  ConsoleBackend,
  ConsoleSubscriptionHandle,
  RuntimeBackend,
} from '../src/shared/cdp/realm.ts'
import { inspectorId } from '../src/shared/identity.ts'
import { INSPECTOR_PROTOCOL_VERSION } from '../src/shared/bridge/version.ts'
import type { WorkerToSourceFrame } from '../src/shared/bridge/messages/observation.ts'
import { ClientRuntimeRouter } from '../src/worker/bridge/runtime-rpc.ts'
import { ClientSourceRouter } from '../src/worker/bridge/source-rpc.ts'
import { InspectorSourceRegistry, type SourceConnection } from '../src/worker/bridge/hub.ts'
import { InspectorRealmRegistry } from '../src/worker/inspection/realm-store.ts'
import type { InspectorRealm, InspectorRealmSession } from '../src/worker/inspection/realm.ts'
import { InspectorRealmSessionSet } from '../src/worker/cdp/realm-sessions.ts'
import { RuntimeDomainSession } from '../src/worker/cdp/domains/runtime/session.ts'

interface HostControl {
  readonly enable: ReturnType<typeof vi.fn<RuntimeBackend['enable']>>
  readonly disable: ReturnType<typeof vi.fn<RuntimeBackend['disable']>>
  readonly subscriptions: TestConsoleSubscription[]
  readonly readiness: Promise<void>[]
}

interface TestConsoleSubscription extends ConsoleSubscriptionHandle {
  readonly dispose: ReturnType<typeof vi.fn<ConsoleSubscriptionHandle['dispose']>>
}

interface ClientConnection {
  readonly connection: SourceConnection
  readonly sent: WorkerToSourceFrame[]
}

interface RuntimeHarness {
  readonly sources: InspectorSourceRegistry
  readonly runtimeRouter: ClientRuntimeRouter
  readonly sourceRouter: ClientSourceRouter
  readonly registry: InspectorRealmRegistry
  readonly realms: InspectorRealmSessionSet
  readonly runtime: RuntimeDomainSession
  readonly host: HostControl
  readonly initialClients: readonly ClientConnection[]
  readonly sent: unknown[]
  close(): void
}

describe('Runtime readiness epochs', () => {
  it('joins one initial epoch and queues realms opened while it is pending', async () => {
    const hostReady = Promise.withResolvers<undefined>()
    const harness = createRuntimeHarness([hostReady.promise])
    try {
      harness.runtime.handle({ id: 1, method: 'Runtime.enable', params: {} })
      harness.runtime.handle({ id: 2, method: 'Runtime.enable', params: {} })
      await vi.waitFor(() => { expect(harness.host.subscriptions).toHaveLength(1) })
      expect(harness.host.enable).toHaveBeenCalledOnce()
      expect(cdpResponse(harness, 1)).toBeUndefined()

      const client = openClient(harness.sources, 'queued')
      expect(lastFrame(client, 'client-console/enable')).toBeUndefined()
      hostReady.resolve(undefined)
      await vi.waitFor(() => {
        expect(cdpResponse(harness, 1)).toMatchObject({ result: {} })
        expect(cdpResponse(harness, 2)).toMatchObject({ result: {} })
      })
      const enable = await waitForFrame(client, 'client-console/enable')
      expect(clientContextEvents(harness)).toHaveLength(0)
      acknowledge(harness.sources, client.connection, enable, { ok: true })
      await vi.waitFor(() => { expect(clientContextEvents(harness)).toHaveLength(1) })

      harness.runtime.handle({ id: 3, method: 'Runtime.enable', params: {} })
      await vi.waitFor(() => { expect(cdpResponse(harness, 3)).toMatchObject({ result: {} }) })
      expect(frames(client, 'client-console/enable')).toHaveLength(1)
      expect(harness.host.subscriptions).toHaveLength(1)
    } finally {
      harness.close()
    }
  })

  it('rolls back a failed initial snapshot and retries with a fresh subscription', async () => {
    const harness = createRuntimeHarness([], ['initial-failed', 'initial-success'])
    const failedClient = harness.initialClients[0]!
    const successfulClient = harness.initialClients[1]!
    try {
      harness.runtime.handle({ id: 10, method: 'Runtime.enable', params: {} })
      const failedEnable = await waitForFrame(failedClient, 'client-console/enable')
      const successfulEnable = await waitForFrame(successfulClient, 'client-console/enable')
      acknowledge(harness.sources, successfulClient.connection, successfulEnable, { ok: true })
      expect(cdpResponse(harness, 10)).toBeUndefined()
      acknowledge(harness.sources, failedClient.connection, failedEnable, {
        ok: false,
        error: { code: 'installation-failed', message: 'hooks unavailable' },
      })
      await vi.waitFor(() => {
        expect(cdpErrorMessage(harness, 10)).toContain('installation-failed: hooks unavailable')
      })
      expect(harness.host.subscriptions[0]?.dispose).toHaveBeenCalledOnce()
      expect(harness.host.disable).toHaveBeenCalledOnce()
      expect(lastFrame(successfulClient, 'client-console/disable')).toMatchObject({
        subscriptionId: successfulEnable.subscriptionId,
      })
      expect(clientContextEvents(harness)).toHaveLength(0)

      harness.runtime.handle({ id: 11, method: 'Runtime.enable', params: {} })
      await vi.waitFor(() => {
        expect(frames(failedClient, 'client-console/enable')).toHaveLength(2)
        expect(frames(successfulClient, 'client-console/enable')).toHaveLength(2)
      })
      const failedRetry = lastFrame(failedClient, 'client-console/enable')!
      const successfulRetry = lastFrame(successfulClient, 'client-console/enable')!
      expect(failedRetry.subscriptionId).not.toBe(failedEnable.subscriptionId)
      expect(successfulRetry.subscriptionId).not.toBe(successfulEnable.subscriptionId)
      acknowledge(harness.sources, failedClient.connection, failedRetry, { ok: true })
      acknowledge(harness.sources, successfulClient.connection, successfulRetry, { ok: true })
      await vi.waitFor(() => {
        expect(cdpResponse(harness, 11)).toMatchObject({ result: {} })
        expect(clientContextEvents(harness)).toHaveLength(2)
      })
    } finally {
      harness.close()
    }
  })

  it('invalidates an awaiting epoch on disable and fences late readiness', async () => {
    const hostReady = Promise.withResolvers<undefined>()
    const harness = createRuntimeHarness([hostReady.promise])
    try {
      harness.runtime.handle({ id: 20, method: 'Runtime.enable', params: {} })
      await vi.waitFor(() => { expect(harness.host.subscriptions).toHaveLength(1) })
      harness.runtime.handle({ id: 21, method: 'Runtime.disable', params: {} })
      await vi.waitFor(() => {
        expect(cdpErrorMessage(harness, 20)).toContain('invalidated by Runtime.disable')
        expect(cdpResponse(harness, 21)).toMatchObject({ result: {} })
      })
      expect(harness.host.subscriptions[0]?.dispose).toHaveBeenCalledOnce()
      hostReady.resolve(undefined)
      await Promise.resolve()
      expect(clientContextEvents(harness)).toHaveLength(0)
    } finally {
      harness.close()
    }
  })

  it('isolates a dynamic readiness failure from sibling realms and the enabled domain', async () => {
    const harness = createRuntimeHarness()
    try {
      harness.runtime.handle({ id: 30, method: 'Runtime.enable', params: {} })
      await vi.waitFor(() => { expect(cdpResponse(harness, 30)).toMatchObject({ result: {} }) })
      const failedClient = openClient(harness.sources, 'dynamic-failed')
      const healthyClient = openClient(harness.sources, 'dynamic-healthy')
      const failedEnable = await waitForFrame(failedClient, 'client-console/enable')
      const healthyEnable = await waitForFrame(healthyClient, 'client-console/enable')
      acknowledge(harness.sources, failedClient.connection, failedEnable, {
        ok: false,
        error: { code: 'installation-failed', message: 'dynamic observer failed' },
      })
      acknowledge(harness.sources, healthyClient.connection, healthyEnable, { ok: true })
      await vi.waitFor(() => { expect(clientContextEvents(harness)).toHaveLength(1) })
      expect(harness.realms.byContextId(harness.runtimeRouter.targets()[0]!.contextId)).toBeUndefined()
      expect(harness.realms.byContextId(harness.runtimeRouter.targets()[1]!.contextId)).toBeDefined()
      expect(harness.host.disable).not.toHaveBeenCalled()

      harness.runtime.handle({ id: 31, method: 'Runtime.enable', params: {} })
      await vi.waitFor(() => { expect(cdpResponse(harness, 31)).toMatchObject({ result: {} }) })
      expect(frames(healthyClient, 'client-console/enable')).toHaveLength(1)
    } finally {
      harness.close()
    }
  })
})

function createRuntimeHarness(
  readiness: Promise<void>[] = [],
  initialClientSuffixes: readonly string[] = [],
): RuntimeHarness {
  const sources = new InspectorSourceRegistry([], 32_768, 8)
  const runtimeRouter = new ClientRuntimeRouter(sources, 100)
  const sourceRouter = new ClientSourceRouter(sources, 100, 1_048_576, 32_768)
  const initialClients = initialClientSuffixes.map(suffix => openClient(sources, suffix))
  const host = hostRealm(readiness)
  const registry = new InspectorRealmRegistry(host.realm, runtimeRouter, sourceRouter)
  const realms = new InspectorRealmSessionSet(registry)
  const sent: unknown[] = []
  const runtime = new RuntimeDomainSession({ send: (value) => { sent.push(value) }, close: vi.fn() }, realms)
  return {
    sources,
    runtimeRouter,
    sourceRouter,
    registry,
    realms,
    runtime,
    host: host.control,
    initialClients,
    sent,
    close: () => {
      runtime.close()
      realms.close()
      registry.close()
      sourceRouter.close()
      runtimeRouter.close()
      sources.close()
    },
  }
}

function hostRealm(readiness: Promise<void>[]): { readonly realm: InspectorRealm; readonly control: HostControl } {
  const subscriptions: TestConsoleSubscription[] = []
  const enable = vi.fn<RuntimeBackend['enable']>(async () => {})
  const disable = vi.fn<RuntimeBackend['disable']>(async () => {})
  const control: HostControl = { enable, disable, subscriptions, readiness }
  const descriptor = {
    realmId: inspectorId<'InspectorRealmId'>('host-realm', 'realmId'),
    sourceId: inspectorId<'InspectorSourceId'>('host-source', 'sourceId'),
    generation: inspectorId<'InspectorSourceGeneration'>('host-generation', 'generation'),
    kind: 'host' as const,
    label: 'Host',
  }
  const realm: InspectorRealm = {
    descriptor,
    context: { kind: 'native' },
    capabilities: {
      runtime: ['evaluate'],
      console: ['events'],
      sources: [],
      debugger: [],
    },
    openSession: (): InspectorRealmSession => {
      const backend = runtimeBackend(enable, disable)
      const console: ConsoleBackend = {
        subscribe: () => {
          const handle: TestConsoleSubscription = {
            ready: readiness.shift() ?? Promise.resolve(),
            dispose: vi.fn<ConsoleSubscriptionHandle['dispose']>(),
          }
          subscriptions.push(handle)
          return handle
        },
        clear: async () => {},
      }
      return {
        descriptor,
        context: { kind: 'native' },
        runtime: { state: 'supported', backend },
        console: { state: 'supported', backend: console },
        sources: { state: 'unsupported', reason: 'unused in Runtime readiness tests' },
        debugger: { state: 'unsupported', reason: 'unused in Runtime readiness tests' },
        nativeDomains: { state: 'unsupported', reason: 'unused in Runtime readiness tests' },
        close: vi.fn(),
      }
    },
  }
  return { realm, control }
}

function runtimeBackend(
  enable: RuntimeBackend['enable'],
  disable: RuntimeBackend['disable'],
): RuntimeBackend {
  const undefinedCompletion = async () => ({ result: { descriptor: { type: 'undefined' as const } } })
  return {
    enable,
    disable,
    evaluate: undefinedCompletion,
    getProperties: async () => ({ properties: [] }),
    callFunction: undefinedCompletion,
    awaitPromise: undefinedCompletion,
    globalLexicalScopeNames: async () => [],
    releaseObject: async (_handle: RuntimeBackendObjectHandle) => {},
    releaseObjectGroup: async () => {},
  }
}

function openClient(sources: InspectorSourceRegistry, suffix: string): ClientConnection {
  const sent: WorkerToSourceFrame[] = []
  const connection: SourceConnection = {
    kind: 'client',
    send: (frame) => { sent.push(frame) },
    close: vi.fn(),
  }
  sources.receive(connection, {
    v: INSPECTOR_PROTOCOL_VERSION,
    t: 'source/open',
    source: {
      sourceId: `client-${suffix}`,
      generation: `generation-${suffix}`,
      kind: 'client',
      label: `Client ${suffix}`,
      timeOriginMs: 1,
      capabilities: [
        { type: 'client-runtime', origin: `https://${suffix}.test` },
        { type: 'client-console' },
      ],
    },
    topics: [],
  })
  return { connection, sent }
}

function frames<Type extends WorkerToSourceFrame['t']>(
  client: ClientConnection,
  type: Type,
): Array<Extract<WorkerToSourceFrame, { t: Type }>> {
  return client.sent.filter(
    (candidate): candidate is Extract<WorkerToSourceFrame, { t: Type }> => candidate.t === type,
  )
}

function lastFrame<Type extends WorkerToSourceFrame['t']>(
  client: ClientConnection,
  type: Type,
): Extract<WorkerToSourceFrame, { t: Type }> | undefined {
  return frames(client, type).at(-1)
}

async function waitForFrame<Type extends WorkerToSourceFrame['t']>(
  client: ClientConnection,
  type: Type,
): Promise<Extract<WorkerToSourceFrame, { t: Type }>> {
  await vi.waitFor(() => { expect(lastFrame(client, type)).toBeDefined() })
  return lastFrame(client, type)!
}

function acknowledge(
  sources: InspectorSourceRegistry,
  connection: SourceConnection,
  enable: Extract<WorkerToSourceFrame, { t: 'client-console/enable' }>,
  outcome:
    | { readonly ok: true }
    | {
      readonly ok: false
      readonly error: { readonly code: 'installation-failed' | 'session-conflict'; readonly message: string }
    },
): void {
  sources.receive(connection, {
    v: INSPECTOR_PROTOCOL_VERSION,
    t: 'client-console/enable-result',
    sourceId: enable.sourceId,
    generation: enable.generation,
    sessionId: enable.sessionId,
    subscriptionId: enable.subscriptionId,
    outcome,
  })
}

function cdpResponse(harness: RuntimeHarness, id: number): Record<string, unknown> | undefined {
  return harness.sent.find(
    (value): value is Record<string, unknown> => isRecord(value) && value.id === id,
  )
}

function cdpErrorMessage(harness: RuntimeHarness, id: number): string | undefined {
  const error = cdpResponse(harness, id)?.error
  return isRecord(error) && typeof error.message === 'string' ? error.message : undefined
}

function clientContextEvents(harness: RuntimeHarness): Array<Record<string, unknown>> {
  return harness.sent.filter(
    (value): value is Record<string, unknown> => isRecord(value) && value.method === 'Runtime.executionContextCreated',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
