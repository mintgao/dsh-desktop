/**
 * Cancellation helpers of the WeChat provider: one abort classification and one
 * abortable wait, shared by the login sequence, the poll loop, and the send path.
 * @module @deepseek-ai/dsh-channel-weixin/src/abort
 */

/**
 * Build the abort Error one cancelled wait reports.
 * @param signal - the aborted signal whose reason to surface.
 * @returns the signal's Error reason, or a generic cancellation Error.
 */
export function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  return reason instanceof Error ? reason : new Error('the WeChat channel operation was cancelled')
}

/**
 * Wait for one duration, ending early when the signal aborts.
 * @param ms - the wait duration in milliseconds.
 * @param signal - cancels the wait.
 * @returns resolution after the duration, or a rejection carrying the abort reason.
 */
export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(abortError(signal))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
