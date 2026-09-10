import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { createScope, type ScopeKey } from '@deepseek-ai/dsh-scope'
import { describe, expect, it } from 'vitest'
import * as Persona from '@deepseek-ai/dsh-persona'
import { PERSONA_SUFFIX_SECTION, PERSONA_PREFIX_SECTION } from '@deepseek-ai/dsh-persona'

async function harness(deploymentPersona: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt, { personaPrefix: deploymentPersona })
  return ctx
}

/** The rendered text of the persona slot as one scope sees it. */
async function personaText(ctx: Context, scope?: ScopeKey): Promise<string | undefined> {
  const assembly = await ctx.systemPrompt.assemble(scope === undefined ? {} : { scope })
  return assembly.sections.find(section => section.name === PERSONA_PREFIX_SECTION)?.text
}

describe('the persona row', () => {
  it('shadows and interpolates the environment per scope, restoring both defaults on disposal', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt, { personaPrefix: 'Deployment.', personaSuffix: 'Global workspace.' })
      ctx.systemPrompt.variable('cwd', () => '/local')
      ctx.systemPrompt.section({ name: 'guidance', order: 100, text: 'Use tools.' })
      const key: ScopeKey = { agent: 'environment' }
      const scope = createScope(ctx, key)
      const fiber = await scope.ctx.plugin(Persona, { prefix: 'Preset.', suffix: 'Workspace {{cwd}}.' })
      const assembly = await ctx.systemPrompt.assemble({ scope: key })
      expect(assembly.sections.find(section => section.name === PERSONA_SUFFIX_SECTION)?.text).toBe('Workspace {{cwd}}.')
      expect(renderPrompt(assembly)).toBe('You are an AI agent powered by DeepSeek Harness.\n\nPreset.\n\nUse tools.\n\nWorkspace /local.')
      expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain('Global workspace.')
      await fiber.dispose()
      const restored = renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))
      expect(restored).toContain('Deployment.')
      expect(restored).toContain('Global workspace.')
      expect(restored).not.toContain('Workspace /local.')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it.each([{}, { suffix: '' }])('shadows the default environment with an omitted or empty value: %j', async (environment) => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt, { personaSuffix: 'Global workspace.' })
      const key: ScopeKey = { agent: 'empty-environment' }
      const scope = createScope(ctx, key)
      await scope.ctx.plugin(Persona, { prefix: 'Preset.', ...environment })
      expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))).not.toContain('Global workspace.')
      expect((await ctx.systemPrompt.assemble({ scope: key })).sections.find(section => section.name === PERSONA_SUFFIX_SECTION)?.text).toBe('')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects an unscoped mount, which would collide with the registry default', async () => {
    const ctx = await harness('deployment identity')

    await expect(ctx.plugin(Persona, { prefix: 'composition identity' }))
      .rejects.toThrow(/"deployment:persona-prefix" is already registered/)
  })

  it('shadows the deployment default for one scope only', async () => {
    const ctx = await harness('deployment identity')
    const key: ScopeKey = { agent: 'a1' }
    const scope = createScope(ctx, key)

    await scope.ctx.plugin(Persona, { prefix: 'preset identity' })

    expect(await personaText(ctx, key)).toBe('preset identity')
    expect(await personaText(ctx)).toBe('deployment identity')
  })

  it('gives two scopes independent personas', async () => {
    const ctx = await harness('')
    const first: ScopeKey = { agent: 'a1' }
    const second: ScopeKey = { agent: 'a2' }

    await createScope(ctx, first).ctx.plugin(Persona, { prefix: 'first identity' })
    await createScope(ctx, second).ctx.plugin(Persona, { prefix: 'second identity' })

    expect(await personaText(ctx, first)).toBe('first identity')
    expect(await personaText(ctx, second)).toBe('second identity')
  })

  it('shadows the deployment persona away entirely when its text is empty', async () => {
    const ctx = await harness('deployment identity')
    const key: ScopeKey = { agent: 'a1' }

    await createScope(ctx, key).ctx.plugin(Persona, { prefix: '' })

    // The slot is still occupied, so the deployment persona is gone for this
    // agent; an empty section is dropped when the prompt renders.
    expect(await personaText(ctx, key)).toBe('')
    expect(await personaText(ctx)).toBe('deployment identity')
  })

  it('restores the shadowed default when its fiber unloads', async () => {
    const ctx = await harness('deployment identity')
    const key: ScopeKey = { agent: 'a1' }
    const scope = createScope(ctx, key)
    const fiber = await scope.ctx.plugin(Persona, { prefix: 'preset identity' })
    expect(await personaText(ctx, key)).toBe('preset identity')

    await fiber.dispose()

    expect(await personaText(ctx, key)).toBe('deployment identity')
  })

  it('interpolates prompt variables strictly, like any other section', async () => {
    const ctx = await harness('')
    const key: ScopeKey = { agent: 'a1' }
    ctx.systemPrompt.variable('model', () => 'deepseek-v4-pro')

    await createScope(ctx, key).ctx.plugin(Persona, { prefix: 'You run on {{model}}.' })

    // `assemble()` keeps section text uninterpolated; `renderPrompt()` is the
    // stage that resolves `{{…}}` against the assembly's variables.
    expect(await personaText(ctx, key)).toBe('You run on {{model}}.')
    expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: key })))
      .toContain('You run on deepseek-v4-pro.')
  })

  it('makes a complete persona the exact prompt after every other contribution', async () => {
    const ctx = await harness('deployment identity')
    const key: ScopeKey = { agent: 'a1' }
    const scope = createScope(ctx, key)
    ctx.systemPrompt.section({ name: 'global:extra', order: 100, text: 'global guidance' })

    await scope.ctx.plugin(Persona, { prefix: 'Only this.', suffix: '{{unknown}}', complete: true })
    scope.ctx.on('system-prompt/assemble', async (assembly, _context, next) => {
      assembly.sections.push({ name: 'late:extra', text: 'late guidance' })
      return next()
    }, { prepend: true })

    const assembly = await ctx.systemPrompt.assemble({ scope: key })
    expect(assembly.sections).toEqual([{ name: PERSONA_PREFIX_SECTION, text: 'Only this.' }])
    expect(renderPrompt(assembly)).toBe('Only this.')
  })

  it('can suppress runtime context for its scope without changing the global assembly', async () => {
    const ctx = await harness('deployment identity')
    const key: ScopeKey = { agent: 'a1' }
    const scope = createScope(ctx, key)
    ctx.systemPrompt.context({ name: 'policy', order: 1, text: 'global policy' })

    const fiber = await scope.ctx.plugin(Persona, {
      prefix: 'Only this.',
      includeRuntimeContext: false,
    })
    const suppressed = await ctx.systemPrompt.assemble({ scope: key })
    expect(suppressed.contexts).toEqual([])
    const global = await ctx.systemPrompt.assemble()
    expect(global.contexts).toEqual([
      { name: 'policy', text: 'global policy' },
    ])

    await fiber.dispose()
    expect((await ctx.systemPrompt.assemble({ scope: key })).contexts).toEqual([
      { name: 'policy', text: 'global policy' },
    ])
  })

  it('keeps runtime context when normalized input reaches apply', async () => {
    const ctx = await harness('deployment identity')
    const key: ScopeKey = { agent: 'a1' }
    ctx.systemPrompt.context({ name: 'policy', order: 1, text: 'global policy' })

    await ctx.plugin(Object.assign((inner: Context) => {
      Persona.apply(createScope(inner, key).ctx, Persona.Config({ prefix: 'Scoped identity.' }))
    }, { inject: ['systemPrompt'] }))

    expect((await ctx.systemPrompt.assemble({ scope: key })).contexts).toEqual([
      { name: 'policy', text: 'global policy' },
    ])
  })
})


describe('persona input normalization', () => {
  it.each([
    {}, { text: null }, { prefix: null }, { text: 1 }, { prefix: 1 },
    { text: 'same', prefix: 'same' }, { text: '', suffix: '' },
    { text: 'old', prefix: undefined }, { prefix: 'new', text: undefined },
    { prefix: 'new', text: null }, { text: 'old', complete: 'yes' },
  ])('rejects invalid or mixed input without modifying it: %j', (input) => {
    const before = structuredClone(input)
    // @ts-expect-error Deliberately invalid serialized configuration must fail runtime validation.
    expect(() => Persona.Config(input)).toThrow()
    expect(input).toEqual(before)
  })

  it('preserves legacy whitespace and explicit policy while leaving authored input unchanged', () => {
    const input = { text: '  {{cwd}}\n', complete: true, includeRuntimeContext: false, unrelated: 'retained' }
    const before = structuredClone(input)
    expect(Persona.Config(input)).toEqual({ prefix: input.text, suffix: '', complete: true, includeRuntimeContext: false })
    expect(input).toEqual(before)
    expect(Persona.Config({ text: '' })).toEqual({ prefix: '', suffix: '', complete: false, includeRuntimeContext: true })
  })

  it('rejects a mixed row before registration and permits a later valid mount', async () => {
    const ctx = await harness('Deployment.')
    try {
      const key: ScopeKey = { agent: 'rejected-legacy' }
      const scope = createScope(ctx, key)
      // @ts-expect-error A mixed authored row must fail before registering a persona.
      await expect(scope.ctx.plugin(Persona, { text: 'legacy', prefix: 'modern' })).rejects.toThrow(/cannot coexist/)
      expect(await personaText(ctx, key)).toBe('Deployment.')
      await scope.ctx.plugin(Persona, { text: 'Accepted.' })
      expect(await personaText(ctx, key)).toBe('Accepted.')
    } finally { await ctx.fiber.dispose() }
  })

  it('honors legacy complete mode and runtime-context suppression without leaking into sibling scopes', async () => {
    const ctx = await harness('Deployment.')
    try {
      ctx.systemPrompt.context({ name: 'policy', order: 1, text: 'Runtime.' })
      const key: ScopeKey = { agent: 'legacy-complete' }
      await createScope(ctx, key).ctx.plugin(Persona, { text: 'Only legacy.', complete: true, includeRuntimeContext: false })
      const scoped = await ctx.systemPrompt.assemble({ scope: key })
      expect(renderPrompt(scoped)).toBe('Only legacy.')
      expect(scoped.contexts).toEqual([])
      expect((await ctx.systemPrompt.assemble()).contexts).toEqual([{ name: 'policy', text: 'Runtime.' }])
    } finally { await ctx.fiber.dispose() }
  })

  it('renders legacy input in its own scope and restores deployment sections on disposal', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt, { personaPrefix: 'Deployment.', personaSuffix: 'Environment.' })
      ctx.systemPrompt.variable('cwd', () => '/synthetic')
      const key: ScopeKey = { agent: 'legacy' }
      const scope = createScope(ctx, key)
      const fiber = await scope.ctx.plugin(Persona, { text: 'Legacy {{cwd}}.' })
      const scoped = renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))
      expect(scoped).toContain('Legacy /synthetic.')
      expect(scoped).not.toContain('Environment.')
      expect(await personaText(ctx)).toBe('Deployment.')
      await fiber.dispose()
      expect(renderPrompt(await ctx.systemPrompt.assemble({ scope: key }))).toContain('Environment.')
    } finally { await ctx.fiber.dispose() }
  })
})
