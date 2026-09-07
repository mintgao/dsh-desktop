/** Worker-side Client Console readiness, correlation, and cleanup behavior. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { inspectorId } from '../src/shared/identity.ts'
import { INSPECTOR_PROTOCOL_VERSION } from '../src/shared/bridge/version.ts'
import type { WorkerToSourceFrame } from '../src/shared/bridge/messages/observation.ts'
import { ClientRuntimeRouter } from '../src/worker/bridge/runtime-rpc.ts'
import { InspectorSourceRegistry, type SourceConnection } from '../src/worker/bridge/hub.ts'

interface ConsoleHarness {
  readonly registry: InspectorSourceRegistry
  readonly router: ClientRuntimeRouter
  readonly connection: SourceConnection
  readonly sent: WorkerToSourceFrame[]
}

describe('Client Console readiness router', () => {
  afterEach(() => { vi.useRealTimers() })

  it('settles only the exact acknowledgement and filters events by the active subscription', async () => {
    const harness = createHarness()
    const target = harness.router.targets()[0]!
    const listener = vi.fn()
    const subscription = harness.router.subscribeConsole(target, clientRuntimeSessionId('session-1'), listener)
    const enable = lastFrame(harness, 'client-console/enable')

    harness.registry.receive(harness.connection, consoleEvent(enable, 'before-ready'))
    expect(listener).not.toHaveBeenCalled()
    harness.registry.receive(harness.connection, {
      ...enableResult(enable, { ok: true }),
      subscriptionId: 'unknown-subscription',
    })
    harness.registry.receive(harness.connection, enableResult(enable, { ok: true }))
    await expect(subscription.ready).resolves.toBeUndefined()

    harness.registry.receive(harness.connection, enableResult(enable, { ok: true }))
    harness.registry.receive(harness.connection, consoleEvent(enable, 'active'))
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'console-api' }))

    subscription.dispose()
    expect(lastFrame(harness, 'client-console/disable')).toMatchObject({
      sessionId: enable.sessionId,
      subscriptionId: enable.subscriptionId,
    })
    harness.registry.receive(harness.connection, consoleEvent(enable, 'after-dispose'))
    expect(listener).toHaveBeenCalledOnce()
    harness.router.close()
  })

  it('rejects failure and mismatched acknowledgements with matching cleanup', async () => {
    const harness = createHarness()
    const target = harness.router.targets()[0]!
    const failed = harness.router.subscribeConsole(target, clientRuntimeSessionId('session-failed'), vi.fn())
    const failedEnable = lastFrame(harness, 'client-console/enable')
    harness.registry.receive(harness.connection, enableResult(failedEnable, {
      ok: false,
      error: { code: 'installation-failed', message: 'observer unavailable' },
    }))
    await expect(failed.ready).rejects.toThrow('installation-failed: observer unavailable')
    expect(lastFrame(harness, 'client-console/disable')).toMatchObject({
      sessionId: failedEnable.sessionId,
      subscriptionId: failedEnable.subscriptionId,
    })

    const sourceMismatched = harness.router.subscribeConsole(target, clientRuntimeSessionId('session-source'), vi.fn())
    const sourceMismatchedEnable = lastFrame(harness, 'client-console/enable')
    const otherConnection: SourceConnection = {
      kind: 'client',
      send: vi.fn(),
      close: vi.fn(),
    }
    harness.registry.receive(otherConnection, {
      v: INSPECTOR_PROTOCOL_VERSION,
      t: 'source/open',
      source: {
        sourceId: 'client-2',
        generation: 'generation-2',
        kind: 'client',
        label: 'Second Client',
        timeOriginMs: 2,
        capabilities: [
          { type: 'client-runtime', origin: 'https://second.test' },
          { type: 'client-console' },
        ],
      },
      topics: [],
    })
    harness.registry.receive(otherConnection, {
      ...enableResult(sourceMismatchedEnable, { ok: true }),
      sourceId: 'client-2',
      generation: 'generation-2',
    })
    await expect(sourceMismatched.ready).rejects.toThrow('correlation mismatch')

    const mismatched = harness.router.subscribeConsole(target, clientRuntimeSessionId('session-exact'), vi.fn())
    const mismatchedEnable = lastFrame(harness, 'client-console/enable')
    harness.registry.receive(harness.connection, {
      ...enableResult(mismatchedEnable, { ok: true }),
      sessionId: 'different-session',
    })
    await expect(mismatched.ready).rejects.toThrow('correlation mismatch')
    expect(lastFrame(harness, 'client-console/disable')).toMatchObject({
      sessionId: mismatchedEnable.sessionId,
      subscriptionId: mismatchedEnable.subscriptionId,
    })
    harness.router.close()
  })

  it('rejects timeout, source disconnect, stale dispatch, and router disposal', async () => {
    vi.useFakeTimers()
    const timed = createHarness(25)
    const timedSubscription = timed.router.subscribeConsole(
      timed.router.targets()[0]!,
      clientRuntimeSessionId('session-timeout'),
      vi.fn(),
    )
    const timedRejection = expect(timedSubscription.ready).rejects.toThrow('timed out after 25ms')
    await vi.advanceTimersByTimeAsync(25)
    await timedRejection
    expect(lastFrame(timed, 'client-console/disable')).toBeDefined()
    timed.router.close()

    const disconnected = createHarness()
    const disconnectedTarget = disconnected.router.targets()[0]!
    const disconnectedSubscription = disconnected.router.subscribeConsole(
      disconnectedTarget,
      clientRuntimeSessionId('session-disconnect'),
      vi.fn(),
    )
    disconnected.registry.disconnect(disconnected.connection, 'transport lost')
    await expect(disconnectedSubscription.ready).rejects.toThrow('source closed: transport lost')

    const stale = disconnected.router.subscribeConsole(
      disconnectedTarget,
      clientRuntimeSessionId('session-stale'),
      vi.fn(),
    )
    await expect(stale.ready).rejects.toThrow('disconnected before enable')
    disconnected.router.close()

    const targetClosing = createHarness()
    const closingTarget = targetClosing.router.targets()[0]!
    const targetClosingSessionId = clientRuntimeSessionId('session-target-close')
    const targetSubscription = targetClosing.router.subscribeConsole(closingTarget, targetClosingSessionId, vi.fn())
    targetClosing.router.closeTargetSession(closingTarget, targetClosingSessionId)
    await expect(targetSubscription.ready).rejects.toThrow('DevTools Runtime session closed')
    expect(lastFrame(targetClosing, 'client-console/disable')).toBeDefined()
    targetClosing.router.close()

    const replaced = createHarness()
    const replacedSubscription = replaced.router.subscribeConsole(
      replaced.router.targets()[0]!,
      clientRuntimeSessionId('session-replaced'),
      vi.fn(),
    )
    const replacement: SourceConnection = { kind: 'client', send: vi.fn(), close: vi.fn() }
    replaced.registry.receive(replacement, {
      v: INSPECTOR_PROTOCOL_VERSION,
      t: 'source/open',
      source: {
        sourceId: 'client-1',
        generation: 'generation-replacement',
        kind: 'client',
        label: 'Replacement Client',
        timeOriginMs: 3,
        capabilities: [
          { type: 'client-runtime', origin: 'https://replacement.test' },
          { type: 'client-console' },
        ],
      },
      topics: [],
    })
    await expect(replacedSubscription.ready).rejects.toThrow('source generation replaced')
    replaced.router.close()

    const closing = createHarness()
    const closingSubscription = closing.router.subscribeConsole(
      closing.router.targets()[0]!,
      clientRuntimeSessionId('session-close'),
      vi.fn(),
    )
    closing.router.close()
    await expect(closingSubscription.ready).rejects.toThrow('router closed')
  })

  it('contains synchronous send failures and releases the pending record', async () => {
    const harness = createHarness()
    const target = harness.router.targets()[0]!
    const send = vi.spyOn(harness.connection, 'send').mockImplementation(() => {
      throw new Error('carrier failed')
    })
    const subscription = harness.router.subscribeConsole(target, clientRuntimeSessionId('session-throw'), vi.fn())
    await expect(subscription.ready).rejects.toThrow('carrier failed')
    expect(send).toHaveBeenCalledTimes(2)
    send.mockRestore()
    harness.router.close()
  })
})

function createHarness(timeoutMs = 100): ConsoleHarness {
  const sent: WorkerToSourceFrame[] = []
  const connection: SourceConnection = {
    kind: 'client',
    send: (frame) => { sent.push(frame) },
    close: vi.fn(),
  }
  const registry = new InspectorSourceRegistry([], 32_768, 8)
  const router = new ClientRuntimeRouter(registry, timeoutMs)
  registry.receive(connection, {
    v: INSPECTOR_PROTOCOL_VERSION,
    t: 'source/open',
    source: {
      sourceId: 'client-1',
      generation: 'generation-1',
      kind: 'client',
      label: 'Client',
      timeOriginMs: 1,
      capabilities: [
        { type: 'client-runtime', origin: 'https://client.test' },
        { type: 'client-console' },
      ],
    },
    topics: [],
  })
  return { registry, router, connection, sent }
}

function clientRuntimeSessionId(value: string) {
  return inspectorId<'ClientRuntimeSessionId'>(value, 'sessionId')
}

function lastFrame<Type extends WorkerToSourceFrame['t']>(
  harness: ConsoleHarness,
  type: Type,
): Extract<WorkerToSourceFrame, { t: Type }> {
  const frame = harness.sent.findLast(
    (candidate): candidate is Extract<WorkerToSourceFrame, { t: Type }> => candidate.t === type,
  )
  if (frame === undefined) throw new Error(`Missing ${type} frame`)
  return frame
}

function enableResult(
  enable: Extract<WorkerToSourceFrame, { t: 'client-console/enable' }>,
  outcome:
    | { readonly ok: true }
    | {
      readonly ok: false
      readonly error: { readonly code: 'installation-failed' | 'session-conflict'; readonly message: string }
    },
): object {
  return {
    v: INSPECTOR_PROTOCOL_VERSION,
    t: 'client-console/enable-result',
    sourceId: enable.sourceId,
    generation: enable.generation,
    sessionId: enable.sessionId,
    subscriptionId: enable.subscriptionId,
    outcome,
  }
}

function consoleEvent(
  enable: Extract<WorkerToSourceFrame, { t: 'client-console/enable' }>,
  marker: string,
): object {
  return {
    v: INSPECTOR_PROTOCOL_VERSION,
    t: 'client-console/event',
    sourceId: enable.sourceId,
    generation: enable.generation,
    sessionId: enable.sessionId,
    subscriptionId: enable.subscriptionId,
    event: {
      type: 'console-api',
      event: { type: 'log', arguments: [{ descriptor: { type: 'string', value: marker } }], timestamp: 1 },
    },
  }
}
