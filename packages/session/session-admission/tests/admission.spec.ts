/**
 * Behavior suite for the extracted admission transaction: the caller-owned values
 * and the validation the cross-package parity suite does not drive — request
 * rejection, the explicit model route, the initial model-selection listener, the
 * branded Session id, and the admitted message text.
 */

import type { Context } from '@deepseek-ai/cordis'
import { ReasoningEffortId, type LlmCallConfig } from '@deepseek-ai/dsh-llm'
import {
  WebhookDeliveryId,
  WebhookRuleId,
  WebhookSourceId,
} from '@deepseek-ai/dsh-webhook'
import { describe, expect, it } from 'vitest'
import {
  admitSession,
  type SessionAdmissionOptions,
  type SessionAdmissionRequest,
} from '../src/index.ts'

interface AdmissionHarness {
  readonly ctx: Context
  readonly calls: string[]
  readonly messages: unknown[]
  readonly created: Array<Record<string, unknown>>
  readonly attachedIds: string[]
  readonly bindingIds: string[]
  readonly modelListeners: Map<string, unknown>
  readonly agent: unknown
  markRequestHeader(): void
  readonly request: SessionAdmissionRequest
  readonly options: SessionAdmissionOptions
}

/** Build a same-process fake that records every side effect by name. */
function harness(): AdmissionHarness {
  const calls: string[] = []
  const messages: unknown[] = []
  const created: Array<Record<string, unknown>> = []
  const attachedIds: string[] = []
  const bindingIds: string[] = []
  const modelListeners = new Map<string, unknown>()
  const controller = new AbortController()
  let requestHeader: object | undefined
  const session = {
    id: 'channel-session',
    header: { cwd: '/workspace' },
    requestHeader: () => requestHeader,
  }
  const agent = {
    id: 'channel-session',
    session,
    followup(message: unknown) {
      calls.push('followup')
      messages.push(message)
    },
  }
  const handle = {
    agent,
    async dispose() {
      calls.push('dispose')
    },
  }
  const workspace = {
    path: '/workspace',
    async attachSession(sessionId: string) {
      calls.push('attach')
      attachedIds.push(sessionId)
    },
    async detachSession() {
      calls.push('detach')
    },
  }
  const fake = {
    logger: { warn: () => {} },
    permissionPresets: {
      resolve(name: string) {
        calls.push(`permission-resolve:${name}`)
        return {}
      },
      set(_session: unknown, name: string) {
        calls.push(`permission-set:${name}`)
      },
    },
    agentDefaultModel: {
      currentSelection() {
        calls.push('default-model')
        return { provider: 'default-provider', model: 'default-model', reasoningEffort: ReasoningEffortId('high') }
      },
    },
    agentPresets: {
      async resolve(name: string) {
        calls.push(`preset-resolve:${name}`)
        return { id: name }
      },
      async standingKeyFor(name: string) {
        calls.push(`standing:${name}`)
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
        return workspace
      },
    },
    agents: {
      async create(createOptions: Record<string, unknown> & { setup?: (ctx: unknown) => Promise<void> }) {
        calls.push('agent-create')
        created.push(createOptions)
        await createOptions.setup?.({
          on(event: string, listener: unknown) {
            modelListeners.set(event, listener)
            return () => {}
          },
        })
        return handle
      },
    },
    sessionTitle: {
      rename() {
        calls.push('title')
        return {}
      },
    },
  }
  const request: SessionAdmissionRequest = {
    workspacePath: '/workspace',
    title: 'Review PR',
    prompt: 'Review it',
    agentPreset: 'standard',
    permissionPreset: 'read-only',
  }
  const options: SessionAdmissionOptions = {
    sessionIdPrefix: 'channel-',
    followup: {
      text: 'Channel delivery body',
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
    errorSubject: 'channel Session request',
    signal: controller.signal,
  }
  return {
    ctx: fake as unknown as Context,
    calls,
    messages,
    created,
    attachedIds,
    bindingIds,
    modelListeners,
    agent,
    markRequestHeader() { requestHeader = {} },
    request,
    options,
  }
}

async function admit(test: AdmissionHarness, request: SessionAdmissionRequest = test.request): Promise<void> {
  await admitSession(test.ctx, request, test.options, async (sessionId) => {
    test.calls.push('onAttached')
    test.bindingIds.push(sessionId)
  })
}

/** Read the initial model-selection listener installed during Agent setup. */
function modelRequestListener(test: AdmissionHarness): (
  next: () => Promise<LlmCallConfig>,
) => Promise<LlmCallConfig> {
  const listener = test.modelListeners.get('agent/request')
  if (typeof listener !== 'function') {
    throw new Error('admission did not install its initial model selection')
  }
  const request = listener as (
    payload: unknown,
    next: () => Promise<LlmCallConfig>,
  ) => Promise<LlmCallConfig>
  return next => request({ agent: test.agent }, next)
}

const valid = {
  workspacePath: '/workspace',
  prompt: 'Review it',
  agentPreset: 'standard',
  permissionPreset: 'read-only',
}

const malformed: Array<[string, unknown]> = [
  ['a null request', null],
  ['a primitive request', 'workspace'],
  ['an array request', [valid]],
  ['a request without a workspace path', { ...valid, workspacePath: undefined }],
  ['a non-string workspace path', { ...valid, workspacePath: 42 }],
  ['a relative workspace path', { ...valid, workspacePath: 'workspace' }],
  ['a whitespace title', { ...valid, title: ' ' }],
  ['a non-string title', { ...valid, title: 7 }],
  ['an empty prompt', { ...valid, prompt: '' }],
  ['a whitespace prompt', { ...valid, prompt: '  ' }],
  ['an empty agent preset', { ...valid, agentPreset: '' }],
  ['a missing permission preset', { ...valid, permissionPreset: undefined }],
  ['a null model', { ...valid, model: null }],
  ['a primitive model', { ...valid, model: 'explicit-provider' }],
  ['an array model', { ...valid, model: [] }],
  ['a model without a provider', { ...valid, model: { model: 'm' } }],
  ['a model without a model id', { ...valid, model: { provider: 'p' } }],
  ['a non-number output cap', { ...valid, model: { provider: 'p', model: 'm', maxTokens: 'ten' } }],
  ['a fractional output cap', { ...valid, model: { provider: 'p', model: 'm', maxTokens: 1.5 } }],
  ['an unsafe output cap', { ...valid, model: { provider: 'p', model: 'm', maxTokens: 2 ** 53 } }],
  ['a zero output cap', { ...valid, model: { provider: 'p', model: 'm', maxTokens: 0 } }],
  ['a negative output cap', { ...valid, model: { provider: 'p', model: 'm', maxTokens: -3 } }],
]

describe('session admission', () => {
  it('preflights, mounts, attaches, writes the binding, configures, and admits in order', async () => {
    const test = harness()
    await admit(test)

    expect(test.calls).toEqual([
      'default-model',
      'permission-resolve:read-only',
      'preset-resolve:standard',
      'standing:standard',
      'workspace:/workspace',
      'agent-create',
      'mount:standard',
      'attach',
      'onAttached',
      'permission-set:read-only',
      'title',
      'followup',
    ])
    expect(test.messages).toHaveLength(1)
    expect(test.messages[0]).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: 'Channel delivery body' }],
      source: {
        kind: 'webhook', provider: 'github', source: 'primary', deliveryId: 'delivery', ruleId: 'review',
      },
    })
  })

  it('brands the Session id with the caller prefix and creates the Agent in the bound workspace', async () => {
    const test = harness()
    await admit(test)

    expect(test.attachedIds).toHaveLength(1)
    expect(test.attachedIds[0]).toMatch(/^channel-/)
    expect(test.bindingIds).toEqual(test.attachedIds)
    expect(test.created[0]).toMatchObject({
      sessionId: test.bindingIds[0],
      signal: test.options.signal,
      meta: { cwd: '/workspace', agentPreset: 'standard' },
      agentOptions: { provider: 'default-provider', model: 'default-model' },
    })
  })

  it('uses a complete explicit model route without consulting the default', async () => {
    const capped = harness()
    await admit(capped, { ...capped.request, model: { provider: 'explicit-provider', model: 'explicit-model', maxTokens: 10 } })
    expect(capped.calls).not.toContain('default-model')
    expect(capped.created[0]).toMatchObject({
      agentOptions: { provider: 'explicit-provider', model: 'explicit-model', maxTokens: 10 },
    })

    const uncapped = harness()
    await admit(uncapped, { ...uncapped.request, model: { provider: 'explicit-provider', model: 'explicit-model' } })
    expect(uncapped.calls).not.toContain('default-model')
    expect(uncapped.created[0]).toMatchObject({
      agentOptions: { provider: 'explicit-provider', model: 'explicit-model' },
    })
    expect(uncapped.created[0]).not.toHaveProperty('agentOptions.maxTokens')
  })

  it('keeps the default reasoning effort until the first request header is durable', async () => {
    const test = harness()
    await admit(test)
    const request = modelRequestListener(test)

    await expect(request(async () => ({
      provider: 'default-provider',
      model: 'default-model',
      reasoningEffort: ReasoningEffortId('inherited'),
    }))).resolves.toEqual({
      provider: 'default-provider',
      model: 'default-model',
      reasoningEffort: 'high',
    })
    await expect(request(async () => ({
      provider: 'other-provider',
      model: 'default-model',
      reasoningEffort: ReasoningEffortId('other-provider-effort'),
    }))).resolves.toMatchObject({ reasoningEffort: 'other-provider-effort' })
    await expect(request(async () => ({
      provider: 'default-provider',
      model: 'other-model',
      reasoningEffort: ReasoningEffortId('other-model-effort'),
    }))).resolves.toMatchObject({ reasoningEffort: 'other-model-effort' })

    test.markRequestHeader()
    await expect(request(async () => ({
      provider: 'default-provider',
      model: 'default-model',
      reasoningEffort: ReasoningEffortId('later'),
    }))).resolves.toEqual({
      provider: 'default-provider',
      model: 'default-model',
      reasoningEffort: 'later',
    })
  })

  it('leaves the inherited reasoning effort out when the caller routed no effort', async () => {
    const test = harness()
    await admit(test, { ...test.request, model: { provider: 'explicit-provider', model: 'explicit-model' } })

    await expect(modelRequestListener(test)(async () => ({
      provider: 'explicit-provider',
      model: 'explicit-model',
      reasoningEffort: ReasoningEffortId('inherited'),
    }))).resolves.toEqual({ provider: 'explicit-provider', model: 'explicit-model' })
  })

  it.each(malformed)('rejects %s before any side effect', async (_name, request) => {
    const test = harness()
    await expect(admit(test, request as SessionAdmissionRequest)).rejects.toThrow(TypeError)
    expect(test.calls).toEqual([])
  })

  it('opens every rejection with the caller error subject and names the field', async () => {
    const test = harness()

    await expect(admit(test, { ...test.request, prompt: '' }))
      .rejects.toThrow('channel Session request prompt must be a non-empty string')
    await expect(admit(test, { ...test.request, workspacePath: 'relative' }))
      .rejects.toThrow('channel Session request workspacePath must be absolute, got "relative"')
    expect(test.calls).toEqual([])
  })
})
