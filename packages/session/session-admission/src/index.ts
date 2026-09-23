/**
 * External Session admission transaction.
 *
 * This package owns the one ordering that turns an outside request into a durable
 * root Session: validate and snapshot before any await, resolve the presets, resolve
 * or create the Workspace, create the Agent with its preset mounted before
 * publication, attach the Session durably, hand the id to the caller's binding hook,
 * apply preset and title, and admit the follow-up. The rollback never leaves a live
 * Agent behind and never replaces the original error.
 *
 * @module @deepseek-ai/dsh-session-admission
 */

import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ModelSelection } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { createUserMessage, errorChain, type LlmCallConfig } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-workspace'
import type { SessionAdmissionOptions, SessionAdmissionRequest } from './types.ts'

export type * from './types.ts'

/** Prefix every hop's failure log carries so a rollback failure names its owner. */
const LOG_SUBJECT = 'session admission'

/** Detached values the transaction keeps across asynchronous preflight. */
interface ResolvedRequest {
  readonly workspacePath: string
  readonly title: string | undefined
  readonly prompt: string
  readonly agentPreset: string
  readonly permissionPreset: string
  readonly modelSelection: ModelSelection
  readonly agentOptions: {
    readonly provider: string
    readonly model: string
    readonly maxTokens?: number
  }
}

/** Require one non-empty string field from an untyped request. */
function requiredString(record: Record<string, unknown>, field: string, errorSubject: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${errorSubject} ${field} must be a non-empty string`)
  }
  return value
}

/** Accept one optional string field from an untyped request. */
function optionalString(
  record: Record<string, unknown>,
  field: string,
  errorSubject: string,
): string | undefined {
  if (record[field] === undefined) return undefined
  return requiredString(record, field, errorSubject)
}

/**
 * Snapshot and validate a same-process request before crossing awaits. Only the
 * universally required fields are enforced here; a trigger with its own stricter
 * schema runs it before calling this service.
 */
function resolveRequest(
  ctx: Context,
  input: SessionAdmissionRequest,
  errorSubject: string,
): ResolvedRequest {
  const candidate: unknown = input
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError(`${errorSubject} must be a Session request object`)
  }
  const record = candidate as Record<string, unknown>
  const workspacePath = requiredString(record, 'workspacePath', errorSubject)
  if (!isAbsolute(workspacePath)) {
    throw new TypeError(`${errorSubject} workspacePath must be absolute, got ${JSON.stringify(workspacePath)}`)
  }
  const title = optionalString(record, 'title', errorSubject)
  const prompt = requiredString(record, 'prompt', errorSubject)
  const agentPreset = requiredString(record, 'agentPreset', errorSubject)
  const permissionPreset = requiredString(record, 'permissionPreset', errorSubject)
  const model = record['model']
  if (model !== undefined && (model === null || typeof model !== 'object' || Array.isArray(model))) {
    throw new TypeError(`${errorSubject} model must be an object`)
  }
  let agentOptions: ResolvedRequest['agentOptions']
  let modelSelection: ModelSelection
  if (model === undefined) {
    const selected = ctx.agentDefaultModel.currentSelection()
    agentOptions = { provider: selected.provider, model: selected.model }
    modelSelection = { ...selected }
  } else {
    const modelRecord = model as Record<string, unknown>
    const provider = requiredString(modelRecord, 'provider', errorSubject)
    const modelId = requiredString(modelRecord, 'model', errorSubject)
    const maxTokens = modelRecord['maxTokens']
    if (maxTokens !== undefined
      && (typeof maxTokens !== 'number' || !Number.isSafeInteger(maxTokens) || maxTokens <= 0)) {
      throw new TypeError(`${errorSubject} model.maxTokens must be a positive safe integer`)
    }
    agentOptions = {
      provider,
      model: modelId,
      ...(maxTokens === undefined ? {} : { maxTokens }),
    }
    modelSelection = { provider, model: modelId }
  }
  return { workspacePath, title, prompt, agentPreset, permissionPreset, modelSelection, agentOptions }
}

/** Log a rollback failure without replacing the operation's original failure. */
function reportRollbackFailure(ctx: Context, subject: string, error: unknown): void {
  ctx.logger.warn(`${LOG_SUBJECT}: ${subject} rollback failed: ${errorChain(error)}`)
}

/** Apply the creation-time selection until its first durable request header exists. */
function installInitialModelSelection(agentCtx: Context, selection: ModelSelection): void {
  agentCtx.on('agent/request', async ({ agent }, next): Promise<LlmCallConfig> => {
    const resolved = await next()
    if (agent.session.requestHeader() !== undefined
      || resolved.provider !== selection.provider
      || resolved.model !== selection.model) return resolved
    const { reasoningEffort: _inheritedEffort, ...withoutInheritedEffort } = resolved
    return {
      ...withoutInheritedEffort,
      ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort },
    }
  })
}

/**
 * Create, attach, configure, and prompt one ordinary root Session.
 *
 * The transaction validates and snapshots before any await, resolves the presets
 * and fails loud before anything is created, honors the abort signal at every await
 * boundary, resolves or creates the Workspace, creates the Agent with its preset
 * mounted inside the creation `setup`, attaches the Session durably, invokes
 * `onAttached` with the new id, applies the permission preset, renames the Session
 * only when the caller supplied a title, and admits the follow-up. Admission of the
 * follow-up ends this service's ownership; the Agent stays lifecycle-owned by `ctx`
 * and follows normal Session behavior.
 *
 * @param ctx - untraced runtime context that owns the resulting Agent.
 * @param request - same-process admission request.
 * @param options - caller-owned brand prefix, follow-up message and provenance, error subject, and cancellation.
 * @param onAttached - called once with the new id after durable attach and before the first
 * prompt; its write is the caller's to compensate.
 * @throws TypeError before any mutation when a required field is missing, empty, or malformed.
 * @throws the original failure after rolling back, or after a best-effort rollback whose own failures are logged and swallowed.
 */
export async function admitSession(
  ctx: Context,
  request: SessionAdmissionRequest,
  options: SessionAdmissionOptions,
  onAttached: (sessionId: SessionId) => Promise<void>,
): Promise<void> {
  const resolved = resolveRequest(ctx, request, options.errorSubject)
  ctx.permissionPresets.resolve(resolved.permissionPreset)
  const preset = await ctx.agentPresets.resolve(resolved.agentPreset)
  await ctx.agentPresets.standingKeyFor(preset.id)
  options.signal.throwIfAborted()

  const workspace = await ctx.workspaceRegistry.create(resolved.workspacePath)
  options.signal.throwIfAborted()
  const sessionId = brandString<SessionId>(`${options.sessionIdPrefix}${randomUUID()}`)
  const handle = await ctx.agents.create({
    sessionId,
    signal: options.signal,
    meta: { cwd: workspace.path, agentPreset: preset.id },
    agentOptions: resolved.agentOptions,
    setup: async (agentCtx) => {
      await ctx.agentPresets.mount(agentCtx, preset.id)
      installInitialModelSelection(agentCtx, resolved.modelSelection)
    },
  })

  let attached = false
  try {
    options.signal.throwIfAborted()
    await workspace.attachSession(sessionId)
    attached = true
    options.signal.throwIfAborted()
    await onAttached(sessionId)
    ctx.permissionPresets.set(handle.agent.session, resolved.permissionPreset)
    if (resolved.title !== undefined) ctx.sessionTitle.rename(handle.agent.session, resolved.title)
    handle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: options.followup.text }],
      source: options.followup.source,
    }))
  } catch (error: unknown) {
    // A failure before `agents.create` returned had nothing to roll back; every
    // failure after it returned owns a live Agent, so disposal always runs. Detach
    // runs only when the attach call itself resolved, because a failure inside that
    // call leaves no attachment to undo.
    if (attached) {
      try {
        await workspace.detachSession(sessionId)
      } catch (rollbackError: unknown) {
        reportRollbackFailure(ctx, `Workspace detach for Session "${sessionId}"`, rollbackError)
      }
    }
    try {
      await handle.dispose()
    } catch (rollbackError: unknown) {
      reportRollbackFailure(ctx, `Agent disposal for Session "${sessionId}"`, rollbackError)
    }
    throw error
  }
}
