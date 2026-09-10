/** Synthetic provider and owned-session inputs for the unchanged native Mint composition. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, realpathSync, watch, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const inputPath = join(dirname(fileURLToPath(import.meta.url)), 'native-input.json')
const input = JSON.parse(readFileSync(inputPath, 'utf8'))
const packages = dirname(dirname(dirname(process.argv[1])))
const { LlmAdapter, createUserMessage } = await import(pathToFileURL(join(packages, 'dsh-llm/lib/index.js')).href)
const { defineContentToolFixture } = await import(pathToFileURL(join(packages, 'dsh-tools/lib/index.js')).href)

function waitForRelease(signal, file) {
  return new Promise((resolve, reject) => {
    let watcher
    const finish = error => { watcher?.close(); signal.removeEventListener('abort', abort); error ? reject(error) : resolve() }
    const check = () => { if (existsSync(file)) finish() }
    const abort = () => finish(signal.reason)
    watcher = watch(dirname(file), check)
    watcher.on('error', finish)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else check()
  })
}

class NativeFixtureAdapter extends LlmAdapter {
  processed = new Set()
  providerInfo(provider) { return { id: provider, name: 'Synthetic native migration fixture' } }
  async resolveModel(provider, model) { return { provider, id: model, name: model, inputModalities: ['text'], context: { contextWindow: 32768 } } }
  async listModels(provider) { return [await this.resolveModel(provider, 'native-fixture')] }
  async *stream(options) {
    assert.equal(options.provider, 'qualification-fixture')
    const last = options.messages.findLast(message => message.role === 'user' && message.source?.kind === 'user')
    const text = JSON.stringify(last?.content)
    const key = JSON.stringify([options.sessionId, text])
    const primary = options.purpose === undefined
    if (primary && text?.includes('native-busy-barrier') && !this.processed.has(key)) {
      this.processed.add(key)
      writeFileSync(join(input.evidence, 'busy-started.json'), JSON.stringify({ text, model: options.model }))
      await waitForRelease(options.signal, join(input.evidence, 'release-busy'))
    }
    if (primary && text?.includes('native-process-before-answer') && !this.processed.has(key)) {
      this.processed.add(key)
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: `native-process-${this.processed.size}`,
        name: 'qualification_native_process', arguments: '{}' } }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const answer = 'Synthetic native assistant paragraph'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: answer }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function turn(ctx, agent, text) {
  let running = false
  let remove
  const done = new Promise(resolve => {
    remove = ctx.on('agent/status', ({ agent: who, status }) => {
      if (who !== agent) return
      if (status === 'running') running = true
      if (running && status === 'idle') resolve()
    })
  })
  try {
    agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    await done
    await ctx.sessions.flush(agent.session)
  } finally { remove() }
}

/** Actual public services consumed by the synthetic native input plugin. */
export const inject = ['llm', 'tools', 'agents', 'agentPresets', 'agentDefaultModel', 'sessions', 'sessionTitle']

/** Register deterministic inputs and create real fixture history through the shipped preset.
 * @param ctx - Normal packaged native backend context.
 */
export async function apply(ctx) {
  const roots = Object.fromEntries(['HOME', 'DSH_HOME', 'DSH_AGENTS_HOME', 'TMPDIR'].map(name => [name, realpathSync(process.env[name])]))
  assert.equal(roots.DSH_AGENTS_HOME, realpathSync(join(process.env.HOME, '.agents')))
  const writerCredentials = ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN'].filter(name => process.env[name] !== undefined)
  assert.deepEqual(writerCredentials, [])
  ctx.llm.registerAdapter(['qualification-fixture'], new NativeFixtureAdapter())
  ctx.tools.register(defineContentToolFixture({ name: 'qualification_native_process', description: 'Synthetic transcript process observation',
    parameters: {}, isConcurrencySafe: () => true, async execute() { return [{ type: 'text', text: 'Synthetic native process output' }] } }))
  if (input.stage === 'populate') await ctx.agentDefaultModel.saveSelection({ provider: 'qualification-fixture', model: 'native-fixture' })
  const snapshots = new Set()
  ctx.on('agent/status', ({ agent, status }) => {
    if (status !== 'idle' || !agent.session.id.startsWith('qualification-native-')) return
    const snapshot = (async () => {
      await ctx.sessions.flush(agent.session)
      const events = input.stage === 'populate' || input.stage === 'restore' ? agent.session.events : agent.session.snapshotEvents()
      writeFileSync(join(input.evidence, `live-${agent.session.id}.json`), JSON.stringify({ sessionId: agent.session.id, status, events }))
    })()
    snapshots.add(snapshot)
    void snapshot.then(() => snapshots.delete(snapshot), error => {
      snapshots.delete(snapshot)
      writeFileSync(join(input.evidence, 'live-observer-error.json'), JSON.stringify({ error: String(error) }))
    })
  })
  ctx.effect(() => async () => { await Promise.all(snapshots) })
  const evidence = { stage: input.stage, sessions: [] }
  for (const [id, title] of [['qualification-native-selected', 'Qualification native selected'], ['qualification-native-other', 'Qualification native other']]) {
    const setup = async agentCtx => { await ctx.agentPresets.mount(agentCtx, 'standard') }
    const agentOptions = { provider: 'qualification-fixture', model: 'native-fixture' }
    const handle = input.stage === 'populate'
      ? await ctx.agents.create({ sessionId: id, meta: { cwd: process.cwd(), agentPreset: 'standard' }, agentOptions, setup })
      : await ctx.agents.resume({ resumeSessionId: id, agentOptions, setup })
    try {
      if (input.stage === 'populate') {
        await turn(ctx, handle.agent, `native-process-before-answer ${id}`)
        await ctx.sessionTitle.rename(handle.agent.session, title)
        await ctx.sessions.flush(handle.agent.session)
      }
      const events = input.stage === 'populate' || input.stage === 'restore' ? handle.agent.session.events : handle.agent.session.snapshotEvents()
      assert.ok(events.some(event => event.type === 'tool/call' && JSON.stringify(event.data).includes('qualification_native_process')))
      assert.ok(events.some(event => event.type === 'tool/result' && JSON.stringify(event.data).includes('Synthetic native process output')))
      evidence.sessions.push({ id, title, events })
    } finally { await handle.dispose() }
  }
  writeFileSync(join(input.evidence, 'native-agent-ready.json'), JSON.stringify({ ...evidence, isolation: { roots, argv: process.argv, cwd: process.cwd(), writerCredentials } }))
}
