import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import Invariants from '@deepseek-ai/dsh-invariants'
import { apply, inject, name } from '../src/invariant.ts'

describe('ui-session-notifications invariant companion', () => {
  it('registers under the package name with an empty installer', async () => {
    expect(name).toBe('client-ui-session-notifications-invariant')
    expect(inject).toEqual(['invariants'])
    const ctx = new Context()
    await ctx.plugin(Invariants, { enabled: true }).await()
    await expect(apply(ctx)).resolves.toBeTypeOf('function')
  })
})
