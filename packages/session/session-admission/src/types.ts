/** External Session admission requests and the caller-owned values the transaction cannot infer. */

import type { MessageSource } from '@deepseek-ai/dsh-llm'

/** Optional explicit model route and output cap for an admitted Agent. */
export interface SessionAdmissionModel {
  /** Registered provider route. */
  readonly provider: string
  /** Provider-owned model id. */
  readonly model: string
  /** Optional positive output-token cap. */
  readonly maxTokens?: number
}

/**
 * One external request to create an ordinary root Session. Only the universally
 * required fields are mandatory: an absolute workspace path, a non-empty prompt,
 * and both presets. `title` and `model` are optional, because a trigger that has
 * no title leaves naming to the composition's title capability and a trigger with
 * no route inherits the deployment default.
 */
export interface SessionAdmissionRequest {
  /** Existing local directory to resolve or create as a Workspace. */
  readonly workspacePath: string
  /** Explicit Session title; omission leaves naming to the composition's title capability. */
  readonly title?: string
  /** Non-empty initial text prompt. */
  readonly prompt: string
  /** Agent composition mounted before publication. */
  readonly agentPreset: string
  /** Sandbox and approval preset applied before prompt admission. */
  readonly permissionPreset: string
  /** Optional explicit route; omission snapshots the complete current default, including reasoning effort. */
  readonly model?: SessionAdmissionModel
}

/** Caller-owned values the admission transaction cannot infer. */
export interface SessionAdmissionOptions {
  /**
   * Session id brand prefix. Each trigger keeps its own, so a Session's id states
   * which trigger created it.
   */
  readonly sessionIdPrefix: string
  /**
   * The admitted message text and its fully built provenance member. The service
   * never invents provenance: the trigger knows its own delivery, sender, and rule.
   */
  readonly followup: {
    readonly text: string
    readonly source: MessageSource
  }
  /**
   * Subject every validation message opens with, so an error names the trigger
   * that rejected the request.
   */
  readonly errorSubject: string
  /** Cancels the transaction through publication. */
  readonly signal: AbortSignal
}
