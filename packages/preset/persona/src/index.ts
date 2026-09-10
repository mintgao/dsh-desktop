/**
 * A per-agent persona as a composable row.
 *
 * `dsh-system-prompt` owns the global persona as its own config, and registers
 * that section unconditionally — so this row is **scope-only**. Mounted inside
 * an agent preset it shadows the deployment persona for that one session,
 * exactly like the per-child persona `dsh-subagent` installs; mounted globally
 * it collides with the registry's own registration and fails loud.
 *
 * That constraint is the reason the row exists. An agent preset cannot mount
 * the prompt registry itself, so without a row of its own a preset could
 * change an agent's tools but never its identity.
 * @module @deepseek-ai/dsh-persona
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'

export { PERSONA_PREFIX_SECTION, PERSONA_SUFFIX_SECTION }

/** Cordis plugin name. */
export const name = 'persona'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt']

/** Persona policy shared by both accepted configuration forms. */
export interface PersonaPolicy {
  /** Make the prefix the complete system prompt, suppressing every other section. */
  complete?: boolean
  /** Whether this agent scope retains dynamic runtime-context snapshots. */
  includeRuntimeContext?: boolean
}

/**
 * Accepted persona input. Legacy text becomes an exact prefix with an empty
 * suffix; text cannot coexist with prefix or suffix, including empty values.
 * Both forms interpolate registered prompt variables strictly.
 */
export type Config = PersonaPolicy & (
  | {
    /** Whole persona template, normalized verbatim to prefix with an empty suffix. */
    text: string
    /** Prohibited alongside legacy text, including an explicitly undefined value. */
    prefix?: never
    /** Prohibited alongside legacy text, including an empty or undefined value. */
    suffix?: never
  }
  | {
    /** Prefix template rendered before first-party guidance. */
    prefix: string
    /** Suffix template rendered after guidance; omitted or empty shadows deployment suffix. */
    suffix?: string
    /** Prohibited alongside prefix, including an explicitly undefined value. */
    text?: never
  }
)

/** Validated persona values supplied to the scoped registration. */
export interface ResolvedConfig {
  /** Prefix template; an empty value shadows the deployment prefix away. */
  prefix: string
  /** Suffix template; an empty value shadows the deployment suffix away. */
  suffix: string
  /** Whether only the prefix contributes to the system prompt. */
  complete: boolean
  /** Whether dynamic runtime-context snapshots remain enabled. */
  includeRuntimeContext: boolean
}

/** Runtime input validation and in-memory normalization; authored input stays unchanged. */
export const Config: z<Config, ResolvedConfig> = z.transform(z.union([
  z.object({
    text: z.string().required(),
    prefix: z.any<unknown>(),
    suffix: z.any<unknown>(),
    complete: z.boolean(),
    includeRuntimeContext: z.boolean(),
  }),
  z.object({
    prefix: z.string().required(),
    suffix: z.string(),
    text: z.any<unknown>(),
    complete: z.boolean(),
    includeRuntimeContext: z.boolean(),
  }),
]), (input): ResolvedConfig => {
  const legacy = Object.hasOwn(input, 'text')
  if (legacy && (Object.hasOwn(input, 'prefix') || Object.hasOwn(input, 'suffix'))) {
    throw new Error('persona text cannot coexist with prefix or suffix')
  }
  const prefix = legacy ? input.text : input.prefix
  const suffix = legacy ? '' : input.suffix ?? ''
  if (typeof prefix !== 'string') throw new Error('persona text or prefix must be a string')
  if (typeof suffix !== 'string') throw new Error('persona suffix must be a string')
  return {
    prefix,
    suffix,
    complete: input.complete ?? false,
    includeRuntimeContext: input.includeRuntimeContext ?? true,
  }
}, true)

/**
 * Register the persona prefix and suffix sections for the mounting context's scope.
 * @param ctx - an agent scope context; an unscoped context collides with the
 * prompt registry's own persona registration and rejects.
 * @param config - the prefix, suffix, and complete-prompt policy.
 */
export function apply(ctx: Context, config: ResolvedConfig): void {
  ctx.effect(() => ctx.systemPrompt.section({
    name: PERSONA_PREFIX_SECTION,
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
    text: config.prefix,
    ...(config.complete ? { complete: true } : {}),
  }), 'persona.section()')
  ctx.effect(() => ctx.systemPrompt.section({
    name: PERSONA_SUFFIX_SECTION,
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX'),
    text: config.suffix,
  }), 'persona.suffix()')
  if (!config.includeRuntimeContext) ctx.systemPrompt.suppressRuntimeContext()
}
