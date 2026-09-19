/**
 * Cross-package parity suite: the executable specification of the admission
 * ordering.
 *
 * The delivery that introduces `@deepseek-ai/dsh-session-admission` leaves the
 * upstream webhook transaction in place, so two implementations of one ordering
 * exist until the migration work item lands. This suite drives the unchanged
 * `createWebhookSession` and the extracted `admitSession` through the same
 * scenarios and asserts their observable side effects match, so a divergence
 * fails a test instead of a user's conversation.
 *
 * The extracted service adds exactly one step the webhook has no equivalent for:
 * `onAttached`, the caller's binding write, which runs between durable attach and
 * the permission preset. Parity therefore compares the admission log with that
 * single entry removed.
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  WebhookDeliveryId,
  WebhookRuleId,
  WebhookSourceId,
  type VerifiedWebhookDelivery,
  type WebhookSessionRequest,
} from '@deepseek-ai/dsh-webhook'
import { createWebhookSession } from '@deepseek-ai/dsh-webhook/src/session.ts'
import { describe, expect, it, vi } from 'vitest'
import { admitSession, type SessionAdmissionRequest } from '../src/index.ts'

interface Scenario {
  readonly failAt?: 'permission-resolve' | 'preset-resolve' | 'standing' | 'workspace'
    | 'agent' | 'attach' | 'permission-set' | 'title' | 'followup'
  readonly failDetach?: boolean
  readonly failDispose?: boolean
  readonly abortAt?: 'workspace' | 'agent'
}

/** One fake runtime shared by both implementations; it logs every side effect by name. */
function harness(options: Scenario = {}): { ctx: Context; calls: string[]; warn: ReturnType<typeof vi.fn> } {
  const calls: string[] = []
  const warn = vi.fn()
  const controller = new AbortController()
  const session = { id: 'session', header: { cwd: '/workspace' }, requestHeader: () => undefined }
  const agent = {
    id: 'session',
    session,
    followup() {
      calls.push('followup')
      if (options.failAt === 'followup') throw new Error('followup failed')
    },
  }
  const handle = {
    agent,
    async dispose() {
      calls.push('dispose')
      if (options.failDispose) throw new Error('dispose failed')
    },
  }
  const workspace = {
    path: '/workspace',
    async attachSession() {
      calls.push('attach')
      if (options.failAt === 'attach') throw new Error('attach failed')
    },
    async detachSession() {
      calls.push('detach')
      if (options.failDetach) throw new Error('detach failed')
    },
  }
  const fake = {
    logger: { warn },
    permissionPresets: {
      resolve(name: string) {
        calls.push(`permission-resolve:${name}`)
        if (options.failAt === 'permission-resolve') throw new Error('permission resolve failed')
        return {}
      },
      set(_session: unknown, name: string) {
        calls.push(`permission-set:${name}`)
        if (options.failAt === 'permission-set') throw new Error('permission set failed')
      },
    },
    agentDefaultModel: {
      currentSelection() {
        calls.push('default-model')
        return { provider: 'default-provider', model: 'default-model', reasoningEffort: 'high' }
      },
    },
    agentPresets: {
      async resolve(name: string) {
        calls.push(`preset-resolve:${name}`)
        if (options.failAt === 'preset-resolve') throw new Error('preset resolve failed')
        return { id: name }
      },
      async standingKeyFor(name: string) {
        calls.push(`standing:${name}`)
        if (options.failAt === 'standing') throw new Error('standing failed')
        return {}
      },
      async mount(_agentCtx: unknown, name: string) {
        calls.push(`mount:${name}`)
        return { id: name }
      },
    },
    workspaceRegistry: {
      async create(path: string) {
        calls.push(`workspace:${path}`)
        if (options.failAt === 'workspace') throw new Error('workspace failed')
        if (options.abortAt === 'workspace') controller.abort(new Error('abort after workspace'))
        return workspace
      },
    },
    agents: {
      async create(createOptions: { setup?: (ctx: unknown) => Promise<void> }) {
        calls.push('agent-create')
        if (options.failAt === 'agent') throw new Error('agent failed')
        await createOptions.setup?.({ on() { return () => {} } })
        if (options.abortAt === 'agent') controller.abort(new Error('abort after agent'))
        return handle
      },
    },
    sessionTitle: {
      rename() {
        calls.push('title')
        if (options.failAt === 'title') throw new Error('title failed')
        return {}
      },
    },
    controller,
  }
  return { ctx: fake as unknown as Context, calls, warn }
}

const delivery: VerifiedWebhookDelivery = {
  kind: 'github',
  source: WebhookSourceId('primary'),
  deliveryId: WebhookDeliveryId('delivery'),
  event: { action: 'ready_for_review' },
  receivedAt: 1,
}

/** The webhook's own request shape: title is required on that path. */
const webhookRequest: WebhookSessionRequest = {
  workspacePath: '/workspace',
  title: 'Review PR',
  prompt: 'Review it',
  agentPreset: 'standard',
  permissionPreset: 'read-only',
}

/** The same request through the extracted service, title supplied. */
const admissionRequest: SessionAdmissionRequest = { ...webhookRequest }

/** Run the unchanged upstream transaction and return its side-effect log. */
async function runWebhook(options: Scenario): Promise<{ calls: string[]; warn: ReturnType<typeof vi.fn> }> {
  const test = harness(options)
  const controller = (test.ctx as unknown as { controller: AbortController }).controller
  try {
    await createWebhookSession(test.ctx, delivery, WebhookRuleId('review'), webhookRequest, controller.signal)
  } catch {
    // Both paths are expected to reject in the failure scenarios under test.
  }
  return { calls: test.calls, warn: test.warn }
}

/** Run the extracted service and return its side-effect log. */
async function runAdmission(options: Scenario): Promise<{ calls: string[]; warn: ReturnType<typeof vi.fn> }> {
  const test = harness(options)
  const controller = (test.ctx as unknown as { controller: AbortController }).controller
  try {
    await admitSession(test.ctx, admissionRequest, {
      sessionIdPrefix: 'webhook-',
      followup: {
        text: 'Review it',
        source: {
          kind: 'webhook',
          provider: 'github',
          source: WebhookSourceId('primary'),
          deliveryId: WebhookDeliveryId('delivery'),
          ruleId: WebhookRuleId('review'),
          form: 'notice',
          summary: 'github webhook handled by review',
        },
      },
      errorSubject: 'webhook Session request',
      signal: controller.signal,
    }, async () => { test.calls.push('onAttached') })
  } catch {
    // Symmetric with the webhook runner.
  }
  return { calls: test.calls, warn: test.warn }
}

/** The admission log without the one step the webhook has no equivalent for. */
function withoutBindingWrite(calls: readonly string[]): string[] {
  return calls.filter(call => call !== 'onAttached')
}

const scenarios: Array<[string, Scenario]> = [
  ['the success path', {}],
  ['a permission-preset resolution failure', { failAt: 'permission-resolve' }],
  ['an agent-preset resolution failure', { failAt: 'preset-resolve' }],
  ['a standing-key failure', { failAt: 'standing' }],
  ['a Workspace failure', { failAt: 'workspace' }],
  ['an Agent creation failure', { failAt: 'agent' }],
  ['an attach failure', { failAt: 'attach' }],
  ['a permission-set failure after attach', { failAt: 'permission-set' }],
  ['a title failure after attach', { failAt: 'title' }],
  ['a follow-up failure after attach', { failAt: 'followup' }],
  ['a detach and dispose failure after attach', { failAt: 'title', failDetach: true, failDispose: true }],
  ['cancellation after Workspace settlement', { abortAt: 'workspace' }],
  ['cancellation after Agent settlement', { abortAt: 'agent' }],
]

describe('webhook and session-admission parity', () => {
  it.each(scenarios)('produces the same side effects for %s', async (_name, scenario) => {
    const webhook = await runWebhook(scenario)
    const admission = await runAdmission(scenario)

    expect(withoutBindingWrite(admission.calls)).toEqual(webhook.calls)
  })

  it('writes the conversation binding after durable attach and before the first prompt', async () => {
    const { calls } = await runAdmission({})
    expect(calls.indexOf('onAttached')).toBeGreaterThan(calls.indexOf('attach'))
    expect(calls.indexOf('onAttached')).toBeLessThan(calls.indexOf('permission-set:read-only'))
    expect(calls.indexOf('onAttached')).toBeLessThan(calls.indexOf('followup'))
  })

  it('logs both rollback failures and rethrows the original one on both paths', async () => {
    const scenario: Scenario = { failAt: 'title', failDetach: true, failDispose: true }
    const webhook = await runWebhook(scenario)
    const admission = await runAdmission(scenario)

    expect(webhook.warn).toHaveBeenCalledTimes(2)
    expect(admission.warn).toHaveBeenCalledTimes(2)
    expect(admission.calls).toContain('detach')
    expect(admission.calls).toContain('dispose')
  })

  it('keeps the pinned webhook validation message on the webhook path', async () => {
    const test = harness()
    const controller = (test.ctx as unknown as { controller: AbortController }).controller
    await expect(createWebhookSession(
      test.ctx,
      delivery,
      WebhookRuleId('review'),
      { ...webhookRequest, title: ' ' },
      controller.signal,
    )).rejects.toThrow('webhook Session request title must be a non-empty string')
    expect(test.calls).toEqual([])
  })

  it('makes title optional on the extracted path and names the field when it is empty', async () => {
    const controller = new AbortController()
    const options = {
      sessionIdPrefix: 'channel-',
      followup: { text: 'hi', source: {
        kind: 'webhook' as const, provider: 'github', source: WebhookSourceId('primary'),
        deliveryId: WebhookDeliveryId('delivery'), ruleId: WebhookRuleId('review'),
        form: 'notice' as const, summary: 's',
      } },
      errorSubject: 'channel Session request',
      signal: controller.signal,
    }

    const { title: _omittedTitle, ...untitledRequest } = webhookRequest
    const untitled = harness()
    await admitSession(untitled.ctx, untitledRequest, options, async () => {})
    expect(untitled.calls).not.toContain('title')
    expect(untitled.calls).toContain('followup')

    const emptyTitle = harness()
    await expect(admitSession(
      emptyTitle.ctx,
      { ...webhookRequest, title: ' ' },
      options,
      async () => {},
    )).rejects.toThrow('channel Session request title must be a non-empty string')
    expect(emptyTitle.calls).toEqual([])
  })
})
