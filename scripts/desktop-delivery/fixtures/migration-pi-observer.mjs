/** Exercise the assembled Pi adapter through its public settings and streaming APIs. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Preserve and exercise valid routes, catalog errors, rejected writes and host discovery.
 * @param ctx - assembled packaged context.
 * @param stage - baseline, target or restored process stage.
 * @param prior - actual baseline observation, when one exists.
 * @returns Real adapter observations and the resulting settings section.
 */
export async function observePi(ctx, stage, prior) {
  const packages = join(process.env.DSH_MIGRATION_APP, 'Contents/Resources/backend/node_modules/@deepseek-ai')
  const { BlockAssembler } = await import(pathToFileURL(join(packages, 'dsh-llm/lib/index.js')).href)
  const { credentialRef } = await import(pathToFileURL(join(packages, 'dsh-credentials/lib/index.js')).href)
  const endpoint = process.env.DSH_MIGRATION_PROVIDER_URL
  const baseURL = `${endpoint}/v1`
  const route = 'qualification-pi'
  const retained = 'aion-labs/aion-2.0'
  const removed = 'arcee-ai/virtuoso-large'
  const file = join(process.env.DSH_HOME, 'settings.yaml')
  const ns = 'llm-pi-ai'
  const receipt = async () => {
    const response = await fetch(`${endpoint}/__receipt`)
    assert.equal(response.status, 200)
    return await response.json()
  }
  const stream = async (provider, model, options = {}) => {
    const assembler = new BlockAssembler()
    for await (const chunk of ctx.llm.stream({ provider, model, messages: [], ...options })) assembler.push(chunk)
    return { finish: assembler.finish, message: assembler.message({ kind: 'model', provider, model }) }
  }
  const successful = async (provider, model, options = {}) => {
    const result = await stream(provider, model, options)
    assert.equal(result.finish.kind, 'stop')
    assert.deepEqual(result.message.content, [{ type: 'text', text: 'hello' }])
    return result
  }
  if (stage === 'populate') {
    await ctx.credentials.set(credentialRef('QUALIFICATION_PI_KEY'), 'synthetic-pi-key')
    await ctx.settings.update(ns, { providers: {
      [route]: { api: 'openai-completions', baseURL, apiKeyEnv: 'QUALIFICATION_PI_KEY',
        headers: { 'X-Company-Code': 'synthetic-tenant' }, thinkingBudgets: { medium: 512 },
        compat: { supportsStore: false, supportsDeveloperRole: false, supportsThinkingTokenBudget: true },
        models: [{ id: 'migration-model', contextWindow: 32768, maxTokens: 8192, reasoningEfforts: { medium: 'medium' } }] },
      openrouter: { baseURL, apiKeyEnv: 'QUALIFICATION_PI_KEY', models: [{ id: retained }, { id: removed }] },
    } })
  } else if (stage !== 'reopen') {
    assert.deepEqual(ctx.settings.get(ns), prior.pi.settings)
  }
  assert.ok(ctx.llm.listProviders().some(provider => provider.id === route))
  assert.ok((await ctx.llm.listModels(route)).some(model => model.id === 'migration-model'))
  const valid = await successful(route, 'migration-model')
  const compat = {}
  const budgetOptions = { reasoningEffort: 'medium', maxTokens: 4096, system: 'Synthetic compatibility instruction' }
  await successful(route, 'migration-model', budgetOptions)
  const initialBudget = JSON.parse((await receipt()).at(-1).body)
  assert.equal(initialBudget.store, undefined)
  assert.equal(initialBudget.messages[0].role, 'system')
  if (stage === 'populate' || stage === 'upgrade' || stage === 'restore') assert.equal(initialBudget.thinking_token_budget, 512)
  compat.initial = initialBudget
  let drift
  if (stage === 'upgrade') {
    const bytes = readFileSync(file)
    const error = ctx.llm.listConfigurableProviders().find(entry => entry.provider === 'openrouter')?.error
    assert.ok(error?.includes(removed))
    assert.deepEqual((await ctx.llm.listModels('openrouter')).map(model => model.id), [retained])
    const count = (await receipt()).length
    const failed = await stream('openrouter', removed)
    assert.equal(failed.finish.kind, 'error')
    assert.equal(failed.finish.failure.code, 'INVALID_CONFIG')
    assert.equal((await receipt()).length, count)
    assert.deepEqual(readFileSync(file), bytes)
    await successful('openrouter', retained)
    assert.deepEqual(readFileSync(file), bytes)
    await ctx.settings.mutate(ns, [{ op: 'set', path: ['providers', 'openrouter', 'api'], value: 'openai-completions' }])
    assert.equal(ctx.llm.listConfigurableProviders().find(entry => entry.provider === 'openrouter')?.error, undefined)
    await successful('openrouter', removed)
    drift = { error, refusal: failed.finish, requestsBeforeRefusal: count, repaired: true }
  } else {
    await successful('openrouter', retained)
    await successful('openrouter', removed)
  }
  const rejected = []
  if (stage === 'upgrade' || stage === 'reopen') {
    await ctx.settings.mutate(ns, [
      { op: 'set', path: ['providers', route, 'compat', 'thinkingTokenBudgetField'], value: 'thinking_budget_tokens' },
      { op: 'set', path: ['providers', route, 'compat', 'vllmPriority'], value: 0 },
    ])
    await successful(route, 'migration-model', budgetOptions)
    const explicit = JSON.parse((await receipt()).at(-1).body)
    assert.equal(explicit.thinking_budget_tokens, 512)
    assert.equal(explicit.thinking_token_budget, undefined)
    assert.equal(explicit.priority, 0)
    const responsesRoute = 'qualification-responses'
    await ctx.settings.update(ns, { providers: { [responsesRoute]: {
      api: 'openai-responses', baseURL, apiKeyEnv: 'QUALIFICATION_PI_KEY', models: [{ id: 'migration-responses', maxTokens: 8192 }],
      compat: { supportsMaxOutputTokens: false },
    } } })
    await successful(responsesRoute, 'migration-responses', { maxTokens: 4096 })
    const withoutCap = JSON.parse((await receipt()).at(-1).body)
    assert.equal(withoutCap.max_output_tokens, undefined)
    await ctx.settings.mutate(ns, [{ op: 'set', path: ['providers', responsesRoute, 'compat', 'supportsMaxOutputTokens'], value: true }])
    await successful(responsesRoute, 'migration-responses', { maxTokens: 4096 })
    const withCap = JSON.parse((await receipt()).at(-1).body)
    assert.equal(withCap.max_output_tokens, 4096)
    Object.assign(compat, { explicit, withoutCap, withCap })
    for (const [label, update] of [
      ['empty-route', { providers: { 'qualification-empty': {} } }],
      ['invalid-header', { providers: { [route]: { headers: { 'bad header name': 'synthetic' } } } }],
      ['invalid-scalar', { providers: { [route]: { baseURL: 123 } } }],
      ['invalid-thinking-field', { providers: { [route]: { compat: { thinkingTokenBudgetField: 'unknown' } } } }],
      ['invalid-priority', { providers: { [route]: { compat: { vllmPriority: 0.5 } } } }],
    ]) {
      const before = readFileSync(file)
      const models = await ctx.llm.listModels(route)
      await assert.rejects(ctx.settings.update(ns, update))
      assert.deepEqual(readFileSync(file), before)
      assert.deepEqual(await ctx.llm.listModels(route), models)
      rejected.push(label)
    }
  }
  const beforeDiscovery = readFileSync(file)
  const start = (await receipt()).length
  const discovered = await ctx.llm.discoverModels('llm-pi-ai', { provider: route, baseURL })
  assert.ok(discovered.some(model => model.id === 'migration-model'))
  const request = (await receipt())[start]
  assert.equal(request.method, 'GET')
  assert.equal(request.headers.authorization, 'Bearer synthetic-pi-key')
  assert.equal(request.headers['x-company-code'], stage === 'populate' || stage === 'restore' ? undefined : 'synthetic-tenant')
  assert.equal(JSON.stringify(discovered).includes('synthetic-pi-key'), false)
  assert.equal(JSON.stringify(discovered).includes('synthetic-tenant'), false)
  assert.deepEqual(readFileSync(file), beforeDiscovery)
  return { valid, compat, drift, rejected, discovered, discoveryRequest: request, settings: ctx.settings.get(ns) }
}
