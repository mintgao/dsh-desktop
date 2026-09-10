/** A real scoped legacy persona child and its cold persisted fork. */
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-session-query'
import { SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'

export const name = 'legacy-persona-query'
export const inject = ['agents', 'agentPresets', 'sessions', 'sessionQuery', 'tools']

/** Register the scenario tool through the normal tool pipeline. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineContentToolFixture({
    name: 'legacy_persona_query',
    description: 'Create a legacy persona child, then read its persisted fork without a live owner.',
    parameters: {},
    async execute() {
      const options = { agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
        setup: async (agentCtx: Context) => { await ctx.agentPresets.mount(agentCtx, 'legacy-persona') } }
      const parent = await ctx.agents.create({ ...options, sessionId: SessionId('legacy-persona-parent'),
        meta: { cwd: process.cwd(), agentPreset: 'legacy-persona' } })
      let fork: Awaited<ReturnType<typeof ctx.agents.create>> | undefined
      try {
        parent.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Reply with exactly the word: PONG. Do not use any tools.' }], source: { kind: 'user' } }))
        await parent.agent.whenIdle()
        await ctx.sessions.flush(parent.agent.session)
        const seed = parent.agent.session.snapshotEvents()
        assert.ok(seed.some(event => event.type === 'turn/end'))
        fork = await ctx.agents.create({ ...options, sessionId: SessionId('legacy-persona-fork'), seed,
          inheritedEventCount: SessionLogOffset(seed.length),
          meta: { cwd: process.cwd(), parentSession: parent.agent.session.id, isSeeded: true, agentPreset: 'legacy-persona' } })
        await ctx.sessions.flush(fork.agent.session)
        const expected = fork.agent.session.snapshotEvents()
        await fork.dispose()
        fork = undefined
        assert.equal(ctx.sessions.get(SessionId('legacy-persona-fork')), undefined)
        const loaded = await ctx.sessionQuery.readSession(SessionId('legacy-persona-fork'))
        assert.deepEqual(loaded.events, expected)
        assert.equal(loaded.inheritedEventCount, seed.length)
        assert.equal(ctx.sessions.get(SessionId('legacy-persona-fork')), undefined)
        return [{ type: 'text', text: JSON.stringify({ persona: 'legacy text mounted', inherited: loaded.inheritedEventCount,
          events: loaded.events.length, live: false, addedQueryMarkers: 0 }) }]
      } finally { await fork?.dispose(); await parent.dispose() }
    },
  })))
}
