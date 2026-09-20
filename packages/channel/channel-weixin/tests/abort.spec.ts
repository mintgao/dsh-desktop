/**
 * The cancellation helpers: abort classification and the abortable wait.
 */

import { describe, expect, it } from 'vitest'
import { abortableDelay, abortError } from '../src/abort.ts'

describe('abortError', () => {
  it('surfaces an Error reason and wraps any other reason', () => {
    const withReason = new AbortController()
    const reason = new Error('the login was cancelled')
    withReason.abort(reason)
    expect(abortError(withReason.signal)).toBe(reason)
    const withBareReason = new AbortController()
    withBareReason.abort('a bare cancellation')
    expect(abortError(withBareReason.signal).message).toBe('the WeChat channel operation was cancelled')
  })
})

describe('abortableDelay', () => {
  it('resolves after the wait', async () => {
    await expect(abortableDelay(1, new AbortController().signal)).resolves.toBeUndefined()
  })

  it('rejects when the signal aborts during the wait', async () => {
    const controller = new AbortController()
    const pending = abortableDelay(10_000, controller.signal)
    controller.abort(new Error('cancelled mid-wait'))
    await expect(pending).rejects.toThrow('cancelled mid-wait')
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('already cancelled'))
    await expect(abortableDelay(10_000, controller.signal)).rejects.toThrow('already cancelled')
  })
})
