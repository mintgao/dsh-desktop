/** Execute a real standard-preset Agent inside the selected packaged Mint composition. */
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, realpathSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { observePi } from './migration-pi-observer.mjs'

const packages = join(process.env.DSH_MIGRATION_APP, 'Contents/Resources/backend/node_modules/@deepseek-ai')
const { LlmAdapter, createUserMessage } = await import(pathToFileURL(join(packages, 'dsh-llm/lib/index.js')).href)
const { DeepSeekUploadIndex, deepSeekFileScope, DeepSeekFileId } = await import(pathToFileURL(join(packages, 'dsh-llm-deepseek/lib/index.js')).href)
const { credentialRef, credentialKey } = await import(pathToFileURL(join(packages, 'dsh-credentials/lib/index.js')).href)
const { getOrCreateAnonymousUserId, ANONYMOUS_USER_ID_FILE_NAME } = await import(pathToFileURL(join(packages, 'dsh-anonymous-user-id/lib/index.js')).href)

const packedRequire = createRequire(join(packages, 'dsh/lib/bin.js'))
const { parse: parseYaml } = await import(pathToFileURL(packedRequire.resolve('yaml')).href)
const observedRequests = []

class FixtureAdapter extends LlmAdapter {
  loopRequests = new Set()
  providerInfo(provider) { return { id: provider, name: 'Migration fixture' } }
  async resolveModel(provider, model) {
    return { provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 32768 },
      reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'low' } }
  }
  async *stream(options) {
    assert.equal(options.provider, 'qualification-fixture')
    observedRequests.push({ model: options.model, system: options.system, messages: options.messages, purpose: options.purpose })
    if (options.model.startsWith('qualification-loop-') && !this.loopRequests.has(options.model)) {
      this.loopRequests.add(options.model)
      for (let index = 0; index < 4; index++) {
        yield { type: 'block-start', index, blockType: 'tool-call' }
        yield { type: 'block-end', index, block: { type: 'tool-call', id: `qualification-call-${index}`,
          name: 'qualification_parallel', arguments: JSON.stringify({ id: String(index) }) } }
      }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (options.model.startsWith('qualification-ptc-') && !this.loopRequests.has(options.model)) {
      this.loopRequests.add(options.model)
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'qualification-ptc-call', name: 'run_code',
        arguments: JSON.stringify({ code: 'console.log(await tools.qualification_echo({value:"qualification-ptc-value"}))', description: 'Synthetic persistent PTC observation' }) } }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = options.purpose === 'compaction'
      ? 'Qualification compacted summary: preserve the synthetic initial request, tool result, and private workspace identity.'
      : 'Synthetic packaged Agent response'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function backendDefaults(ctx, stage, prior) {
  const baseline = stage === 'populate' || stage === 'restore'
  const selection = { provider: 'qualification-fixture', model: baseline ? 'baseline-default' : 'target-default',
    reasoningEffort: baseline ? 'low' : 'high' }
  if (stage === 'upgrade' || stage === 'restore') assert.deepEqual(ctx.agentDefaultModel.currentSelection(), prior.backendDefaults.selection)
  if (stage === 'populate' || stage === 'upgrade') {
    await ctx.agentDefaultModel.saveSelection(selection)
    await ctx.settings.update('agent-presets', { default: 'standard' })
    await ctx.settings.update('permission', { defaultPreset: baseline ? 'workspace-write' : 'read-only' })
    await ctx.settings.update('agent-loop', { maxParallelToolCalls: baseline ? 1 : 2 })
  }
  assert.deepEqual(ctx.agentDefaultModel.currentSelection(), selection)
  assert.equal(ctx.agentPresets.defaultId, 'standard')
  assert.equal(ctx.agentLoop.config.maxParallelToolCalls, baseline ? 1 : 2)
  const settingsPath = join(process.env.DSH_HOME, 'settings.yaml')
  for (const [ns, update] of [['permission', { defaultPreset: 'qualification-invalid' }], ['agent-loop', { maxParallelToolCalls: 0 }]]) {
    const before = readFileSync(settingsPath)
    await assert.rejects(ctx.settings.update(ns, update))
    assert.deepEqual(readFileSync(settingsPath), before)
  }
  const created = await ctx.sessionController.create({ cwd: process.cwd(), sessionId: `qualification-default-${stage}` })
  const agent = ctx.agents.get(created.sessionId)
  assert.ok(agent)
  await turn(ctx, agent, 'Synthetic default selection', async () => {
    const accepted = await ctx.sessionController.prompt({ requestId: `qualification-prompt-${stage}`, sessionId: created.sessionId,
      mode: 'queue', content: [{ type: 'text', text: 'Synthetic default selection' }] }, new AbortController().signal)
    assert.equal(accepted.accepted, true)
  })
  const events = baseline ? agent.session.events : agent.session.snapshotEvents()
  const requests = events.filter(event => event.type === 'request/header')
  assert.ok(requests.length > 0)
  assert.deepEqual(requests.at(-1).data.header.config, selection)
  assert.equal(agent.session.header.agentPreset, 'standard')
  assert.equal(ctx.permissionPresets.current(agent.session), baseline ? 'workspace-write' : 'read-only')
  const permission = events.filter(event => ['permission/preset', 'sandbox/mode', 'approval/policy'].includes(event.type))
  assert.equal(permission.find(event => event.type === 'sandbox/mode').data.mode, baseline ? 'workspace-write' : 'read-only')
  assert.equal(permission.find(event => event.type === 'approval/policy').data.policy, 'ask')
  const sentinel = join(process.cwd(), `permission-read-${stage}.txt`)
  const destination = join(process.cwd(), `permission-write-${stage}.txt`)
  writeFileSync(sentinel, 'Synthetic permission sentinel')
  assert.equal(existsSync(destination), false)
  const signal = new AbortController().signal
  const read = await ctx.tools.execute({ callId: `qualification-permission-read-${stage}`, name: 'read',
    arguments: { file_path: sentinel }, agent, signal })
  assert.equal(read.isError, false)
  assert.match(JSON.stringify(read.content), /Synthetic permission sentinel/)
  const write = await ctx.tools.execute({ callId: `qualification-permission-write-${stage}`, name: 'write',
    arguments: { file_path: destination, content: 'Synthetic permitted write' }, agent, signal })
  assert.equal(write.isError, !baseline)
  if (baseline) assert.equal(readFileSync(destination, 'utf8'), 'Synthetic permitted write')
  else assert.equal(existsSync(destination), false)
  assert.equal(readFileSync(sentinel, 'utf8'), 'Synthetic permission sentinel')
  return { selection, sessionId: created.sessionId, preset: agent.session.header.agentPreset, requests, permission,
    operations: { read, write, destinationExists: existsSync(destination), sentinel: readFileSync(sentinel, 'utf8') },
    maxParallelToolCalls: ctx.agentLoop.config.maxParallelToolCalls }
}

async function shellSettings(ctx, stage, prior) {
  const baseline = stage === 'populate' || stage === 'restore'
  const expected = { cwd: process.cwd(), timeoutMs: baseline ? 5000 : 6000, maxTimeoutMs: 10000, maxOutputBytes: baseline ? 64 : 80 }
  if (stage === 'upgrade' || stage === 'restore') assert.deepEqual(ctx.settings.get('shell'), prior.shell.settings)
  if (stage === 'populate' || stage === 'upgrade') await ctx.settings.update('shell', expected)
  const settings = ctx.settings.get('shell')
  for (const [key, value] of Object.entries(expected)) assert.equal(settings[key], value)
  const pwdSpec = ctx.shell.resolve({ command: 'pwd' })
  assert.equal(pwdSpec.workdir, expected.cwd)
  assert.equal(pwdSpec.timeoutMs, expected.timeoutMs)
  assert.equal(pwdSpec.stdoutMaxBytes, expected.maxOutputBytes)
  let pwd
  try { pwd = await ctx.shell.run(pwdSpec) }
  catch (error) {
    if (process.env.DSH_MIGRATION_CONFINED_DEVELOPMENT !== '1' || error.name !== 'SandboxUnavailableError'
      || !String(error).includes('sandbox_apply: Operation not permitted')) throw error
    return { status: 'blocked', settings, pwdSpec, reason: String(error), scope: 'harness confinement prevents nested product sandbox; no shell behavior qualified' }
  }
  assert.equal(pwd.exitCode, 0)
  assert.equal(pwd.stdout.text.trim(), expected.cwd)
  assert.notEqual(pwd.sandbox.mode, 'danger-full-access')
  assert.equal(pwd.sandbox.denied, false)
  assert.ok(pwd.sandbox.enforcement)
  const capped = ctx.shell.resolve({ command: 'true', timeoutMs: 20000 })
  assert.equal(capped.timeoutMs, expected.maxTimeoutMs)
  const success = await ctx.shell.run(capped)
  assert.equal(success.exitCode, 0)
  const output = await ctx.shell.run(ctx.shell.resolve({ command: "printf '%s' '" + 'x'.repeat(256) + "'; printf '%s' '" + 'e'.repeat(256) + "' >&2" }))
  assert.equal(output.exitCode, 0)
  for (const stream of ['stdout', 'stderr']) {
    assert.equal(output[stream].truncated, true)
    assert.ok(output[stream].text.length <= expected.maxOutputBytes)
    assert.ok(output[stream].text.length > 0)
  }
  const path = join(process.env.DSH_HOME, 'settings.yaml')
  const before = readFileSync(path)
  await assert.rejects(ctx.settings.update('shell', { timeoutMs: 0 }))
  await assert.rejects(ctx.settings.update('shell', { graceMs: Number.MAX_SAFE_INTEGER }))
  assert.deepEqual(readFileSync(path), before)
  return { settings, pwdSpec, pwd, capped, success, output, invalidPreserved: sha256(before) }
}

async function loopExecution(ctx, stage) {
  const { defineContentToolFixture } = await import(pathToFileURL(join(packages, 'dsh-tools/lib/index.js')).href)
  const cap = stage === 'populate' || stage === 'restore' ? 1 : 2
  assert.equal(ctx.agentLoop.config.maxParallelToolCalls, cap)
  let active = 0
  let highWater = 0
  const trace = []
  const gates = new Map()
  const release = () => { for (const resolve of gates.values()) resolve(); gates.clear() }
  const unregister = ctx.tools.register(defineContentToolFixture({
    name: 'qualification_parallel', description: 'Synthetic owned concurrency observation',
    parameters: { id: { type: 'string', required: true } }, isConcurrencySafe: () => true,
    async execute({ id }) {
      active++
      highWater = Math.max(highWater, active)
      trace.push({ kind: 'start', id, active })
      assert.ok(active <= cap)
      await new Promise(resolve => {
        gates.set(id, resolve)
        if (gates.size === cap) setImmediate(release)
      })
      trace.push({ kind: 'settle', id, active })
      active--
      return [{ type: 'text', text: `Synthetic tool result ${id}` }]
    },
  }))
  let handle
  try {
    handle = await ctx.agents.create({ sessionId: `qualification-loop-${stage}`, meta: { cwd: process.cwd(), agentPreset: 'standard' },
      agentOptions: { provider: 'qualification-fixture', model: `qualification-loop-${stage}` },
      setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, 'standard') } })
    await turn(ctx, handle.agent, 'Synthetic four-call scheduling')
    assert.equal(active, 0)
    assert.equal(highWater, cap)
    assert.deepEqual(trace.filter(entry => entry.kind === 'start').map(entry => entry.id), ['0', '1', '2', '3'])
    assert.equal(trace.filter(entry => entry.kind === 'settle').length, 4)
    const events = stage === 'populate' || stage === 'restore' ? handle.agent.session.events : handle.agent.session.snapshotEvents()
    const toolEvents = events.filter(event => event.type === 'tool/call' || event.type === 'tool/result')
    assert.equal(toolEvents.length, 8)
    assert.deepEqual(toolEvents.filter(event => event.type === 'tool/result').map(event => event.data.message.source.callId),
      ['qualification-call-0', 'qualification-call-1', 'qualification-call-2', 'qualification-call-3'])
    return { cap, highWater, trace, toolEvents }
  } finally { release(); if (handle) await handle.dispose(); unregister() }
}

async function richHistory(ctx, stage, prior) {
  const baseline = stage === 'populate' || stage === 'restore'
  const eventsOf = agent => baseline ? agent.session.events : agent.session.snapshotEvents()
  const handles = []
  const { defineContentToolFixture } = await import(pathToFileURL(join(packages, 'dsh-tools/lib/index.js')).href)
  const unregister = ctx.tools.register(defineContentToolFixture({ name: 'qualification_echo', description: 'Echo a synthetic owned PTC value',
    parameters: { value: { type: 'string', required: true } }, isConcurrencySafe: () => true,
    async execute({ value }) { assert.equal(value, 'qualification-ptc-value'); return [{ type: 'text', text: value }] } }))
  const open = async (id, preset, model) => {
    const setup = async agentCtx => { await ctx.agentPresets.mount(agentCtx, preset) }
    const agentOptions = { provider: 'qualification-fixture', model }
    const handle = stage === 'populate'
      ? await ctx.agents.create({ sessionId: id, meta: { cwd: process.cwd(), agentPreset: preset }, agentOptions, setup })
      : await ctx.agents.resume({ resumeSessionId: id, agentOptions, setup })
    handles.push(handle)
    return handle.agent
  }
  try {
    const agent = await open('qualification-rich-history', 'standard', 'qualification-rich')
    if (stage === 'populate') {
      await turn(ctx, agent, 'Synthetic initial rich request with qualification-history-marker')
      await turn(ctx, agent, 'Preserve the prior answer and summarize the synthetic history')
      const compacted = await ctx.commands.execute(agent, '/compact', [], new AbortController().signal)
      writeFileSync(`${process.env.DSH_MIGRATION_RESULT}.compaction.json`, JSON.stringify({ compacted, events: eventsOf(agent) }))
      assert.equal(compacted?.result.kind, 'success')
      assert.ok(compacted.result.sourceEventSeq !== undefined, 'Real compaction must commit a useful completed span')
      assert.ok(observedRequests.some(request => request.purpose === 'compaction'))
      await turn(ctx, agent, 'Continue from the qualification compacted summary')
    }
    const before = [...eventsOf(agent)]
    assert.ok(before.some(event => event.type === 'compaction/summary' && JSON.stringify(event.data).includes('Qualification compacted summary')))
    const assistants = before.filter(event => event.type === 'assistant/message')
    assert.ok(assistants.length > 0)
    if (baseline) {
      const references = assistants.filter(event => event.sourceEventSeqs?.length > 0)
      assert.ok(references.length > 0)
      for (const event of references) for (const seq of event.sourceEventSeqs) {
        assert.ok(seq < event.seq && before.some(source => source.seq === seq), 'Source-event references must resolve to earlier actual events')
      }
    } else {
      for (const event of assistants) {
        assert.equal(event.sourceEventSeqs, undefined)
        assert.ok(Array.isArray(event.data.stream) && event.data.stream.length > 0)
        const streamed = event.data.stream.filter(record => record.type === 'text-chunks').flatMap(record => record.texts).join('')
        assert.equal(streamed, event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join(''))
      }
    }
    if (stage !== 'populate') {
      const originalMessages = prior.rich.events.filter(event => ['user/message', 'assistant/message'].includes(event.type)).map(event => event.data.message)
      const migratedMessages = before.filter(event => ['user/message', 'assistant/message'].includes(event.type)).slice(0, originalMessages.length).map(event => event.data.message)
      assert.deepEqual(migratedMessages, originalMessages)
      if (stage === 'restore') assert.deepEqual(before.slice(0, prior.rich.events.length), prior.rich.events)
    }
    let childId
    if (stage === 'populate') {
      const child = await ctx.sessionController.fork({ sessionId: agent.session.id })
      childId = child.sessionId
      const childAgent = ctx.agents.get(childId)
      assert.ok(childAgent)
      await turn(ctx, childAgent, 'Synthetic inherited child continuation')
    } else {
      childId = prior.rich.childId
      const child = await ctx.agents.resume({ resumeSessionId: childId,
        agentOptions: { provider: 'qualification-fixture', model: 'qualification-rich-child' },
        setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, 'standard') } })
      handles.push(child)
      assert.equal(child.agent.session.header.parentSession, agent.session.id)
      await turn(ctx, child.agent, 'Synthetic inherited child continuation after restart')
    }
    const childSnapshot = await ctx.sessionQuery.readSession(childId)
    assert.equal(childSnapshot.session.parentSession, agent.session.id)
    const inheritedCount = baseline ? childSnapshot.session.seedLength : childSnapshot.inheritedEventCount
    assert.ok(Number.isInteger(inheritedCount) && inheritedCount > 0)
    assert.ok(childSnapshot.events.some(event => event.type === 'compaction/summary'))
    const ptc = await open('qualification-ptc-history', 'ptc', `qualification-ptc-${stage}`)
    if (stage === 'populate' || stage === 'upgrade') await turn(ctx, ptc, 'Run the synthetic echo through the shipped PTC worker')
    const ptcEvents = [...eventsOf(ptc)]
    const dispatches = ptcEvents.filter(event => event.type === (baseline ? 'tool/code-dispatch' : 'tool/ptc-dispatch'))
    assert.ok(dispatches.length > 0, 'Actual PTC dispatch must be logged')
    assert.ok(ptcEvents.some(event => event.type === 'tool/result' && JSON.stringify(event.data).includes('qualification-ptc-value')))
    if (stage === 'restore') assert.deepEqual(ptcEvents.slice(0, prior.rich.ptcEvents.length), prior.rich.ptcEvents)
    await ctx.sessions.flush(agent.session)
    await ctx.sessions.flush(ptc.session)
    return { events: before, childId, child: childSnapshot, ptcEvents, dispatches }
  } finally { for (const handle of handles.reverse()) await handle.dispose(); unregister() }
}

async function authoredPreset(ctx, stage, prior) {
  const preset = 'migration-authored-standard'
  if (stage === 'populate') await ctx.agentPresets.copy('standard', preset, 'Synthetic authored standard')
  const entry = await ctx.agentPresets.resolve(preset)
  const document = await ctx.agentPresets.readDocument(preset)
  const identity = { id: entry.id, name: entry.name, description: entry.description, trust: entry.trust,
    presetDigest: sha256(readFileSync(entry.path)), content: document.content }
  if (prior) assert.deepEqual(identity, prior.authoredPreset.identity)
  const settingsPath = join(process.env.DSH_HOME, 'settings.yaml')
  const settingsDigest = sha256(readFileSync(settingsPath))
  const options = { agentOptions: { provider: 'qualification-fixture', model: 'fixture' },
    setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, preset) } }
  const handle = stage === 'restore'
    ? await ctx.agents.resume({ ...options, resumeSessionId: 'qualification-authored-populate' })
    : await ctx.agents.create({ ...options, sessionId: `qualification-authored-${stage}`, meta: { cwd: process.cwd(), agentPreset: preset } })
  try {
    const requestStart = observedRequests.length
    await turn(ctx, handle.agent, 'Synthetic authored persona request')
    const requests = observedRequests.slice(requestStart).filter(request => request.model === 'fixture' && request.purpose === undefined)
    assert.ok(requests.length > 0)
    const rendered = `You are a coding agent powered by the fixture model. Your working directory is ${process.cwd()}.`
    assert.ok(JSON.stringify(requests[0]).includes(rendered))
    const events = stage === 'populate' || stage === 'restore' ? handle.agent.session.events : handle.agent.session.snapshotEvents()
    const logged = events.filter(event => event.type === 'request/header' || event.type === 'system/message')
    assert.ok(JSON.stringify(logged).includes(rendered))
    assert.equal(handle.agent.session.header.agentPreset, preset)
    if (stage === 'restore') assert.deepEqual(events.slice(0, prior.authoredPreset.events.length), prior.authoredPreset.events)
    const originalDefault = ctx.settings.get('agent-presets').default
    await ctx.settings.update('agent-presets', { default: preset })
    let authoredDefault
    try {
      const selected = await ctx.sessionController.create({ cwd: process.cwd(), sessionId: `qualification-authored-default-${stage}` })
      const defaultAgent = ctx.agents.get(selected.sessionId)
      assert.ok(defaultAgent)
      await turn(ctx, defaultAgent, 'Synthetic authored default selection')
      assert.equal(defaultAgent.session.header.agentPreset, preset)
      const defaultEvents = stage === 'populate' || stage === 'restore' ? defaultAgent.session.events : defaultAgent.session.snapshotEvents()
      const headers = defaultEvents.filter(event => event.type === 'request/header')
      assert.ok(headers.length > 0)
      authoredDefault = { sessionId: selected.sessionId, preset: defaultAgent.session.header.agentPreset, requests: headers }
    } finally { await ctx.settings.update('agent-presets', { default: originalDefault }) }
    assert.equal(sha256(readFileSync(entry.path)), identity.presetDigest)
    assert.equal(sha256(readFileSync(settingsPath)), settingsDigest)
    return { identity, settingsDigest, requests, events, rendered, authoredDefault }

  } finally { await handle.dispose() }
}

async function userInputs(ctx, agent, stage, prior) {
  const paths = [join(process.cwd(), 'AGENTS.md'), join(process.env.DSH_HOME, 'AGENTS.md'),
    join(process.cwd(), '.agents/skills/migration-fixture/SKILL.md')]
  const files = paths.map(path => ({ path, sha256: sha256(readFileSync(path)), mode: statSync(path).mode & 0o777 }))
  if (prior) assert.deepEqual(files, prior.userInputs.files)
  const listed = await ctx.skills.list({ cwd: process.cwd(), scope: agent })
  assert.ok(listed.some(skill => skill.name === 'migration-fixture'))
  const skill = await ctx.skills.get('migration-fixture', { cwd: process.cwd(), scope: agent })
  assert.ok(skill)
  assert.ok(skill.content.includes('qualification-skill-body'))
  const requests = observedRequests.filter(request => request.model === 'fixture' && request.purpose === undefined)
  if (stage === 'populate' || stage === 'upgrade') {
    assert.ok(requests.length > 0)
    const visible = JSON.stringify(requests.at(-1))
    writeFileSync(`${process.env.DSH_MIGRATION_RESULT}.input-observation.json`, JSON.stringify({ files, requests }))
    assert.ok(visible.includes('qualification-project-instruction'))
    assert.ok(visible.includes('qualification-global-instruction'))
  }
  return { files, skill, requests }
}

async function spill(ctx, agent, stage) {
  const content = `Synthetic spill ${stage}`
  const saved = await ctx.spillStore.saveText({ owner: { sessionId: agent.session.id },
    source: { kind: 'tool', toolName: 'qualification', callId: `qualification-spill-${stage}`, label: 'Synthetic output' },
    suggestedName: 'synthetic.txt', content })
  assert.ok(saved.locator.startsWith(`${process.env.TMPDIR}/`))
  assert.equal(readFileSync(saved.locator, 'utf8'), content)
  assert.equal(statSync(saved.locator).mode & 0o777, 0o600)
  return { ...saved, digest: sha256(readFileSync(saved.locator)), mode: statSync(saved.locator).mode & 0o777 }
}

async function deepseekSettings(ctx, stage, prior) {
  const ns = 'llm-deepseek'
  const { BlockAssembler } = await import(pathToFileURL(join(packages, 'dsh-llm/lib/index.js')).href)
  const endpoint = process.env.DSH_MIGRATION_PROVIDER_URL
  const baseline = stage === 'populate' || stage === 'restore'
  if (stage === 'upgrade' || stage === 'restore') assert.deepEqual(ctx.settings.get(ns), prior.deepseek.settings)
  if (stage === 'populate') {
    await ctx.credentials.set(credentialRef('QUALIFICATION_DEEPSEEK_KEY'), 'synthetic-deepseek-key')
    await ctx.settings.update(ns, { apiKeyEnv: 'QUALIFICATION_DEEPSEEK_KEY', baseURL: `${endpoint}/v1`, thinking: 'disabled',
      models: [{ id: 'migration-deepseek', contextWindow: 8192, maxTokens: 512 }] })
  }
  if (stage === 'upgrade') await ctx.settings.update(ns, { models: ctx.settings.get(ns).models.map(model => ({ ...model, systemPromptUpdate: 'in-history' })) })
  const model = await ctx.llm.resolveModelInfo('deepseek-official', 'migration-deepseek')
  assert.equal(model.context.contextWindow, 8192)
  assert.equal(model.systemPromptUpdate, baseline ? undefined : 'in-history')
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({ provider: 'deepseek-official', model: 'migration-deepseek', reasoningEffort: 'off', maxTokens: 64,
    messages: [createUserMessage({ content: [{ type: 'text', text: 'Synthetic DeepSeek setting' }], source: { kind: 'user' } })] })) assembler.push(chunk)
  assert.equal(assembler.finish.kind, 'stop')
  assert.deepEqual(assembler.message({ kind: 'model', provider: 'deepseek-official', model: 'migration-deepseek' }).content, [{ type: 'text', text: 'hello' }])
  const response = await fetch(`${endpoint}/__receipt`)
  assert.equal(response.status, 200)
  const request = (await response.json()).at(-1)
  assert.equal(request.path, '/v1/chat/completions')
  assert.equal(request.headers.authorization, 'Bearer synthetic-deepseek-key')
  const body = JSON.parse(request.body)
  assert.equal(body.model, 'migration-deepseek')
  assert.equal(body.max_tokens, 64)
  if (!baseline) {
    const before = readFileSync(join(process.env.DSH_HOME, 'settings.yaml'))
    await assert.rejects(ctx.settings.update(ns, { models: ctx.settings.get(ns).models.map(model => ({ ...model, systemPromptUpdate: 'leading' })) }))
    assert.deepEqual(readFileSync(join(process.env.DSH_HOME, 'settings.yaml')), before)
  }
  return { settings: ctx.settings.get(ns), model, request, finish: assembler.finish }
}

async function webSearch(ctx, stage, prior) {
  const ns = 'web-search-deepseek'
  const endpoint = process.env.DSH_MIGRATION_PROVIDER_URL
  const baseline = stage === 'populate' || stage === 'restore'
  if (stage === 'upgrade' || stage === 'restore') assert.deepEqual(ctx.settings.get(ns), prior.webSearch.settings)
  if (stage === 'populate' || stage === 'upgrade') {
    await ctx.credentials.set(credentialRef('QUALIFICATION_SEARCH_KEY'), 'synthetic-search-key')
    await ctx.settings.update(ns, { baseURL: `${endpoint}/search`, apiKeyEnv: 'QUALIFICATION_SEARCH_KEY',
      model: baseline ? 'baseline-search' : 'target-search', apiVersion: '2023-06-01',
      maxTokens: baseline ? 256 : 512, maxUses: baseline ? 1 : 2 })
  }
  const result = await ctx.web.search({ query: 'Synthetic migration query' })
  assert.deepEqual(result, { sources: [{ url: 'https://a.test', title: 'A' }], truncated: false })
  const response = await fetch(`${endpoint}/__receipt`)
  assert.equal(response.status, 200)
  const request = (await response.json()).at(-1)
  assert.equal(request.method, 'POST')
  assert.equal(request.path, '/search/messages')
  assert.equal(request.headers['x-api-key'], 'synthetic-search-key')
  assert.equal(request.headers.authorization, 'Bearer synthetic-search-key')
  assert.equal(request.headers['anthropic-version'], '2023-06-01')
  assert.deepEqual(JSON.parse(request.body), { model: baseline ? 'baseline-search' : 'target-search',
    max_tokens: baseline ? 256 : 512,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Perform a web search for the query: Synthetic migration query' }] }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: baseline ? 1 : 2 }] })
  const described = ctx.settings.describe({ redactSecrets: true }).find(entry => entry.ns === ns)
  assert.ok(described)
  assert.ok(!JSON.stringify(described).includes('synthetic-search-key'))
  return { settings: ctx.settings.get(ns), request, result, described }
}

async function subagentSelection(ctx, stage, prior) {
  const ns = 'subagent-model-selection'
  const baseline = stage === 'populate' || stage === 'restore'
  if (stage === 'upgrade' || stage === 'restore') assert.deepEqual(ctx.settings.get(ns), prior.subagentSelection.settings)
  const allowedModels = [{ provider: 'qualification-fixture', model: 'fixture' }]
  if (stage === 'populate') await ctx.settings.update(ns, { enabled: false, allowedModels })
  const create = async suffix => {
    const { sessionId } = await ctx.sessionController.create({ cwd: process.cwd(), sessionId: `qualification-selection-${stage}-${suffix}` })
    const agent = ctx.agents.get(sessionId)
    assert.ok(agent)
    return agent
  }
  const observe = agent => {
    const schemas = ctx.tools.schemas(agent)
    const subagent = schemas.find(schema => schema.name === 'subagent')
    assert.ok(subagent)
    const selectable = ['provider', 'model', 'reasoning_effort'].every(key => subagent.parameters.properties[key] !== undefined)
    assert.equal(schemas.some(schema => schema.name === 'list_subagent_models'), selectable)
    const events = baseline ? agent.session.events : agent.session.snapshotEvents()
    const policies = events.filter(event => event.type === 'subagent/model-selection-policy')
    if (selectable) assert.deepEqual(policies.at(-1).data.allowedModels, allowedModels)
    else assert.equal(policies.length, 0)
    return { sessionId: agent.session.id, selectable, subagent, policies }
  }
  const existing = await create('existing')
  const before = observe(existing)
  assert.equal(before.selectable, stage === 'reopen')
  if (stage === 'upgrade') await ctx.settings.update(ns, { enabled: true })
  const current = await create('current')
  const after = observe(current)
  assert.equal(after.selectable, !baseline)
  assert.deepEqual(observe(existing), before)
  if (stage === 'upgrade') {
    await ctx.settings.update(ns, { enabled: false })
    const disabled = observe(await create('disabled'))
    assert.equal(disabled.selectable, false)
    assert.deepEqual(observe(current), after)
    await ctx.settings.update(ns, { enabled: true })
  }
  await ctx.sessions.flush(existing.session)
  await ctx.sessions.flush(current.session)
  return { settings: ctx.settings.get(ns), before, after }
}

async function credentials(ctx, stage) {
  const ref = credentialRef('DSH_QUALIFICATION_REF')
  const key = credentialKey('qualification-fixture', 'route')
  const grant = credentialKey('qualification-fixture', 'grant')
  const value = stage === 'populate' || stage === 'restore' ? 'synthetic-baseline' : 'synthetic-target'
  if (stage === 'upgrade') {
    assert.deepEqual(await ctx.credentials.resolve(ref), { value: 'synthetic-baseline', source: 'file' })
    assert.deepEqual(await ctx.credentials.readRecord(key), { kind: 'api-key', key: 'synthetic-baseline' })
    assert.deepEqual(await ctx.credentials.readRecord(grant), { kind: 'grant', payload: { synthetic: 'synthetic-baseline' } })
  }
  if (stage === 'populate' || stage === 'upgrade') {
    await ctx.credentials.set(ref, value)
    await ctx.credentials.modifyRecord(key, async () => ({ kind: 'api-key', key: value }))
    await ctx.credentials.modifyRecord(grant, async () => ({ kind: 'grant', payload: { synthetic: value } }))
  }
  assert.deepEqual(await ctx.credentials.resolve(ref), { value, source: 'file' })
  assert.deepEqual(await ctx.credentials.readRecord(key), { kind: 'api-key', key: value })
  assert.deepEqual(await ctx.credentials.readRecord(grant), { kind: 'grant', payload: { synthetic: value } })
  const inherited = credentialRef('DSH_QUALIFICATION_INHERITED')
  assert.deepEqual(await ctx.credentials.resolve(inherited), { value: 'synthetic-inherited', source: 'env' })
  await assert.rejects(ctx.credentials.set(inherited, 'refused'), /launching environment/)
  await assert.rejects(ctx.credentials.unset(inherited), /launching environment/)
  const layered = credentialRef('QUALIFICATION_LAYER')
  assert.deepEqual(await ctx.credentials.resolve(layered), { value: 'synthetic-project', source: 'project-env' })
  await ctx.credentials.set(layered, 'synthetic-managed')
  assert.deepEqual(await ctx.credentials.resolve(layered), { value: 'synthetic-managed', source: 'file' })
  await ctx.credentials.unset(layered)
  assert.deepEqual(await ctx.credentials.resolve(layered), { value: 'synthetic-project', source: 'project-env' })
  assert.deepEqual(await ctx.credentials.resolve(credentialRef('QUALIFICATION_USER')), { value: 'synthetic-user', source: 'user-env' })
  const mode = statSync(join(process.env.DSH_HOME, '.credentials.yaml')).mode & 0o777
  assert.equal(mode, 0o600)
  return { reference: value, record: await ctx.credentials.readRecord(key), grant: await ctx.credentials.readRecord(grant), mode,
    precedence: ['env', 'file', 'project-env', 'user-env'], inheritedWritesRefused: true }
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

async function attachments(ctx, stage, prior) {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC', 'base64')
  const image = stage === 'populate' ? await ctx.attachments.saveImage({ data: png, mediaType: 'image/png', name: 'baseline.png' }) : prior.attachments.image
  const loaded = await ctx.attachments.readImage(image)
  const imageDigest = sha256(loaded.data)
  if (stage !== 'populate') assert.equal(imageDigest, prior.attachments.imageDigest)
  let file
  let interrupted = false
  let conflictRefused = false
  if (stage === 'upgrade' || stage === 'reopen') {
    const bytes = Uint8Array.of(1, 2, 3)
    file = stage === 'upgrade' ? await ctx.attachments.saveFile({ data: bytes, name: 'target.bin' })
      : JSON.parse(readFileSync(process.env.DSH_MIGRATION_UPGRADED, 'utf8')).attachments.file
    const chunks = []
    for await (const chunk of ctx.attachments.readFileStream(file)) chunks.push(Buffer.from(chunk))
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(bytes))
    if (stage === 'upgrade') {
      const abort = new AbortController()
      const reason = new Error('Synthetic interrupted upload')
      await assert.rejects(ctx.attachments.saveFileStream({ name: 'cancelled.bin', signal: abort.signal,
        data: (async function* () { yield Uint8Array.of(1, 2); abort.abort(reason); yield Uint8Array.of(3, 4) })(),
      }), error => error === reason)
      assert.deepEqual(readdirSync(join(process.env.DSH_HOME, 'attachments/v1/tmp')), [])
      interrupted = true
      const conflictingBytes = Uint8Array.of(4, 5, 6)
      const conflictingRef = await ctx.attachments.saveFile({ data: conflictingBytes, name: 'conflict.bin' })
      const path = ctx.attachments.fileHostPath(conflictingRef)
      chmodSync(path, 0o600)
      writeFileSync(path, Uint8Array.of(9, 9, 9))
      await assert.rejects(ctx.attachments.saveFile({ data: conflictingBytes, name: 'conflict.bin' }), { code: 'ATTACHMENT_CORRUPT' })
      assert.deepEqual(readFileSync(path), Buffer.from([9, 9, 9]))
      conflictRefused = true
    }
  }
  return { image, imageDigest, file, interrupted, conflictRefused }
}

async function uploadIndex(stage) {
  const path = join(process.env.DSH_HOME, 'llm-deepseek/files-v3.json')
  const index = new DeepSeekUploadIndex(path)
  const scope = deepSeekFileScope('https://fixture.invalid', 'synthetic-only')
  const record = { scope, attachmentId: `sha256:${'a'.repeat(64)}`, variantId: `sha256:${'b'.repeat(64)}`,
    fileId: DeepSeekFileId('synthetic-upload'), bytes: 3, createdAt: 1000, expiresAt: 10000 }
  if (stage === 'populate') assert.equal((await index.commit(record, 1000, 1000)).accepted, true)
  const before = sha256(readFileSync(path))
  assert.deepEqual(await index.get(scope, record.variantId, 1000, 1000), record)
  assert.equal(sha256(readFileSync(path)), before)
  return { digest: before, record }
}

async function workspace(ctx, stage, sessionId, prior) {
  let current = await ctx.workspaceRegistry.resolveByPath(process.cwd())
  if (stage === 'populate') {
    current ??= await ctx.workspaceRegistry.create(process.cwd(), 'Baseline workspace')
    await current.setTitle('Baseline workspace')
    await current.attachSession(sessionId)
    const second = join(process.cwd(), 'second-workspace')
    mkdirSync(second)
    await ctx.workspaceRegistry.create(second, 'Second workspace')
  }
  assert.ok(current)
  const baseline = stage === 'populate' || stage === 'restore'
  if (stage === 'upgrade') {
    assert.equal(current.title, 'Baseline workspace')
    assert.equal(current.id, prior.workspace.id)
    await current.setTitle('Target workspace')
    await ctx.workspaceRegistry.insertBefore(current.id)
    const before = ctx.workspaceRegistry.list().map(item => item.id)
    await assert.rejects(ctx.workspaceRegistry.create('relative'), /Workspace path is not fully qualified/)
    assert.deepEqual(ctx.workspaceRegistry.list().map(item => item.id), before)
  }
  if (stage === 'populate' || stage === 'upgrade') {
    const archivedId = `qualification-default-${stage}`
    await current.attachSession(archivedId)
    await ctx.workspaceRegistry.archiveSession(archivedId)
    assert.equal(current.sessionIds.includes(archivedId), true)
  }
  const archivedSessionIds = [...ctx.workspaceRegistry.archivedSessionIds]
  assert.ok(archivedSessionIds.includes('qualification-default-populate'))
  assert.equal(archivedSessionIds.includes('qualification-default-upgrade'), !baseline)
  assert.equal(current.title, baseline ? 'Baseline workspace' : 'Target workspace')
  assert.ok(current.sessionIds.includes(sessionId))
  const order = ctx.workspaceRegistry.list().map(item => item.id)
  if (stage === 'restore') assert.deepEqual(order, prior.workspace.order)
  return { id: current.id, path: current.path, title: current.title, sessionIds: current.sessionIds, order, archivedSessionIds, relativePathRefused: stage === 'upgrade' }
}

async function turn(ctx, agent, text, dispatch) {
  let running = false
  let dispose
  const completion = new Promise((resolve) => {
    dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent) return
      if (status === 'running') running = true
      if (status === 'idle' && running) { dispose(); resolve() }
    })
  })
  try {
    if (dispatch) await dispatch()
    else agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await completion
  } finally { dispose() }
  await ctx.sessions.flush(agent.session)
}

/** Services consumed by the fixture; no persistence or credential provider is replaced. */
export const inject = ['agents', 'agentLoop', 'agentPresets', 'llm', 'sessions', 'sessionPersistence', 'settings', 'credentials', 'workspaceRegistry', 'attachments', 'sessionProjectionCache', 'sessionQuery', 'agentDefaultModel', 'permissionPresets', 'sessionController', 'tools', 'web', 'skills', 'spillStore', 'shell', 'commands']

/** Run one owned Agent stage and retain observed history after owner disposal.
 * @param ctx - injected packaged Cordis context.
 */
export async function apply(ctx) {
  try {
    const stage = process.env.DSH_MIGRATION_STAGE
    assert.ok(['populate', 'upgrade', 'reopen', 'restore'].includes(stage))
    assert.equal(realpathSync(process.env.DSH_AGENTS_HOME), realpathSync(join(process.env.HOME, '.agents')))
    const isolation = { argv: process.argv, cwd: process.cwd(), roots: Object.fromEntries(['HOME', 'DSH_HOME', 'DSH_AGENTS_HOME', 'TMPDIR'].map(name => [name, realpathSync(process.env[name])])), writerCredentials: ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN'].filter(name => process.env[name] !== undefined) }
    assert.deepEqual(isolation.writerCredentials, [])
    const settingsBefore = readFileSync(join(process.env.DSH_HOME, 'settings.yaml'), 'utf8')
    const settingsSentinel = { sentinel: 'preserve synthetic unrelated keys', nested: [1, false, null] }
    assert.deepEqual(parseYaml(settingsBefore)['qualification-unrelated'], settingsSentinel)
    if (stage === 'populate') assert.deepEqual(JSON.parse(settingsBefore)['qualification-unrelated'], settingsSentinel)
    const id = 'generated-baseline-history'
    let coldQuery
    let coldChild
    if (stage !== 'populate') {
      const rows = await ctx.sessionQuery.listSessions()
      const row = rows.find(item => item.header.id === id)
      assert.ok(row)
      assert.equal(row.live, false)
      assert.equal(row.persisted, true)
      const filtered = await ctx.sessionQuery.filterSessions([{ kind: 'id', values: [id] }])
      assert.deepEqual(filtered, [row])
      const snapshot = await ctx.sessionQuery.readSession(id)
      assert.equal(snapshot.session.id, id)
      const text = snapshot.events.filter(event => event.type === 'assistant/message').map(event => event.data.message.content)
      assert.ok(text.length > 0)
      await assert.rejects(ctx.sessionQuery.searchSessions({ query: 'Synthetic' }), { code: 'SESSION_QUERY_SEARCH_DISABLED' })
      await assert.rejects(ctx.sessionQuery.searchEvents({ sessionId: id, query: 'Synthetic' }), { code: 'SESSION_QUERY_SEARCH_DISABLED' })
      coldQuery = { row, events: snapshot.events, inheritedEventCount: snapshot.inheritedEventCount, searchDisabled: true }
      const priorStage = JSON.parse(readFileSync(stage === 'reopen' ? process.env.DSH_MIGRATION_UPGRADED : process.env.DSH_MIGRATION_BASELINE, 'utf8'))
      const childId = priorStage.rich.childId
      const childRow = rows.find(item => item.header.id === childId)
      assert.ok(childRow)
      assert.equal(childRow.live, false)
      assert.equal(childRow.persisted, true)
      assert.equal(ctx.sessions.get(childId), undefined)
      const child = await ctx.sessionQuery.readSession(childId)
      const inherited = stage === 'restore' ? child.session.seedLength : child.inheritedEventCount
      assert.ok(inherited > 0 && inherited < child.events.length)
      assert.equal(ctx.sessions.get(childId), undefined)
      if (stage === 'reopen' || stage === 'restore') assert.deepEqual(child.events, priorStage.rich.child.events)
      coldChild = { row: childRow, snapshot: child, inheritedEventCount: inherited, liveAfterQuery: false }

    }
    const cachePath = join(process.env.DSH_HOME, 'storages/session_projcache/sessions', `${id}.json`)
    let predecessorFoldRefused = false
    if (stage === 'upgrade') {
      assert.equal(JSON.parse(readFileSync(cachePath, 'utf8')).version, 4)
      const snapshot = await ctx.sessionPersistence.stat(id)
      assert.ok(snapshot)
      assert.equal(ctx.sessionProjectionCache.cachedSnapshot(snapshot.header, 0), undefined)
      predecessorFoldRefused = true
    }
    ctx.llm.registerAdapter(['qualification-fixture'], new FixtureAdapter())
    const baselineObservation = stage === 'populate' ? undefined : JSON.parse(readFileSync(process.env.DSH_MIGRATION_BASELINE, 'utf8'))
    const defaults = await backendDefaults(ctx, stage, baselineObservation)
    const setup = async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, 'standard') }
    const agentOptions = { provider: 'qualification-fixture', model: 'fixture' }
    await ctx.agentPresets.resolve('standard')
    const handle = stage === 'populate'
      ? await ctx.agents.create({ sessionId: id, meta: { cwd: process.cwd(), agentPreset: 'standard' }, agentOptions, setup })
      : await ctx.agents.resume({ resumeSessionId: id, agentOptions, setup })
    let result
    try {
      if (stage === 'populate' || stage === 'upgrade') {
        await turn(ctx, handle.agent, stage === 'populate' ? 'Synthetic initial request' : 'Synthetic continuation')
        await ctx.settings.update('locale', { preference: stage === 'populate' ? 'zh' : 'en' })
      }
      const events = stage === 'populate' || stage === 'restore' ? handle.agent.session.events : handle.agent.session.snapshotEvents()
      const messages = events.filter(event => event.type === 'assistant/message')
      assert.ok(messages.length > 0)
      assert.equal(messages.at(-1).data.message.content.filter(block => block.type === 'text').map(block => block.text).join(''),
        'Synthetic packaged Agent response')
      const prior = stage === 'populate' ? undefined : JSON.parse(readFileSync(process.env.DSH_MIGRATION_BASELINE, 'utf8'))
      const anonymousId = getOrCreateAnonymousUserId({ env: process.env })
      const identityBytes = readFileSync(join(process.env.DSH_HOME, ANONYMOUS_USER_ID_FILE_NAME))
      assert.equal(identityBytes.toString(), `${anonymousId}\n`)
      if (prior) {
        assert.equal(anonymousId, prior.identity.id)
        assert.equal(sha256(identityBytes), prior.identity.digest)
      }
      if (stage === 'restore') {
        assert.deepEqual(events.slice(0, prior.events.length), prior.events)
        assert.equal(events.length, prior.events.length + 1)
        assert.equal(events.at(-1).type, 'session/end-seed')
        assert.deepEqual(events.at(-1).data, {})
      }
      if (stage === 'upgrade' || stage === 'reopen') assert.ok(messages.length >= 2)
      const locale = ctx.settings.get('locale')
      assert.equal(locale.preference, stage === 'populate' || stage === 'restore' ? 'zh' : 'en')
      await ctx.sessionProjectionCache.write(handle.agent.session)
      const cache = JSON.parse(readFileSync(cachePath, 'utf8'))
      assert.equal(cache.version, stage === 'populate' || stage === 'restore' ? 4 : 7)
      if (stage === 'upgrade' || stage === 'reopen') assert.equal(cache.record.identity.formatVersion, 3)
      result = { stage, isolation, coldChild, events, rich: await richHistory(ctx, stage, prior), shell: await shellSettings(ctx, stage, prior), authoredPreset: await authoredPreset(ctx, stage, prior), userInputs: await userInputs(ctx, handle.agent, stage, prior), spill: await spill(ctx, handle.agent, stage), backendDefaults: defaults, loopExecution: await loopExecution(ctx, stage), subagentSelection: await subagentSelection(ctx, stage, prior), webSearch: await webSearch(ctx, stage, prior), deepseek: await deepseekSettings(ctx, stage, prior), coldQuery, locale, pi: await observePi(ctx, stage, prior), identity: { id: anonymousId, digest: sha256(identityBytes) }, projection: { version: cache.version, identity: cache.record.identity, digest: sha256(readFileSync(cachePath)), predecessorFoldRefused }, assistantMessages: messages.length, credentials: await credentials(ctx, stage), workspace: await workspace(ctx, stage, id, prior),
        attachments: await attachments(ctx, stage, prior), uploadIndex: await uploadIndex(stage) }
    } finally { await handle.dispose() }
    const settingsAfter = readFileSync(join(process.env.DSH_HOME, 'settings.yaml'), 'utf8')
    assert.deepEqual(parseYaml(settingsAfter)['qualification-unrelated'], settingsSentinel)
    result.settingsDocument = { before: settingsBefore, after: settingsAfter, sentinel: settingsSentinel, initialEncoding: stage === 'populate' ? 'JSON' : 'YAML', beforeDigest: sha256(settingsBefore), afterDigest: sha256(settingsAfter) }
    writeFileSync(process.env.DSH_MIGRATION_RESULT, JSON.stringify(result))
    console.log('DSH_MIGRATION_AGENT_COMPLETE')
  } catch (error) {
    writeFileSync(process.env.DSH_MIGRATION_RESULT, JSON.stringify({ error: String(error), stack: error.stack }))
    console.log('DSH_MIGRATION_AGENT_COMPLETE')
  }
}
