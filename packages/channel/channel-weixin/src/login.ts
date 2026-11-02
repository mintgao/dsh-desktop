/**
 * The QR login sequence: fetch a code, poll its status, refresh it on expiry,
 * and yield the login product on confirmation. Exactly one code is live at a
 * time, the sequence reports every phase change so a settings page can render
 * it, and the provider writes the product through `ctx.credentials`.
 * @module @deepseek-ai/dsh-channel-weixin/src/login
 */

import { abortableDelay, abortError } from './abort.ts'
import { errorMessage, ILINK_BASE_URL } from './transport.ts'
import type { WeixinQrChallenge, WeixinQrStatus, WeixinTransport } from './transport.ts'
import type { WeixinLoginGrant, WeixinLoginState } from './types.ts'

/** Wait between two status polls, in milliseconds. */
const STATUS_POLL_INTERVAL_MS = 1_000

/** Fresh codes one sequence may burn before it fails. */
const MAX_QR_REFRESHES = 3

/** How the sequence is built. */
export interface WeixinLoginOptions {
  /** The iLink calls the sequence makes. */
  readonly transport: WeixinTransport
  /** Called after every observable change of the sequence. */
  readonly onState: (state: WeixinLoginState) => void
  /** Wait between two status polls, in milliseconds; tests shorten it. */
  readonly pollIntervalMs?: number
  /** Wait helper; tests substitute one that skips real time. */
  readonly delay?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined
}

/**
 * One QR login sequence. `begin` fetches the first code, `wait` polls until the
 * scan is confirmed; an expired code is replaced within the refresh bound, and
 * a status poll that failed is retried on the next tick.
 */
export class WeixinLoginSequence {
  private current: WeixinLoginState = { phase: 'idle' }
  private challenge: WeixinQrChallenge | undefined
  private baseUrl = ILINK_BASE_URL

  constructor(private readonly options: WeixinLoginOptions) {}

  /** The observable state of the sequence. */
  get state(): WeixinLoginState {
    return this.current
  }

  /**
   * Fetch the first code and report `waiting`. A failed fetch reports `failed`
   * with the diagnostic and rejects.
   * @param signal - cancels the fetch when the login is abandoned.
   */
  async begin(signal: AbortSignal): Promise<void> {
    try {
      await this.fetchCode(signal)
    } catch (error: unknown) {
      if (signal.aborted) throw abortError(signal)
      this.report({ phase: 'failed', diagnostic: errorMessage(error) })
      throw error
    }
  }

  /**
   * Poll until the scan is confirmed, refreshing an expired code within the
   * refresh bound. A confirmed scan resolves with the login product; an abort
   * or an exhausted refresh bound rejects.
   * @param signal - cancels the sequence when the login is abandoned.
   * @returns the login product the provider stores as the credential record.
   */
  async wait(signal: AbortSignal): Promise<WeixinLoginGrant> {
    let refreshes = 0
    for (;;) {
      if (signal.aborted) throw abortError(signal)
      const challenge = this.challenge
      if (challenge === undefined) throw new Error('the login sequence has no live QR code')
      let status: WeixinQrStatus
      try {
        status = await this.options.transport.qrStatus(challenge.code, this.baseUrl, signal)
      } catch {
        if (signal.aborted) throw abortError(signal)
        // A status poll that failed is retried on the next tick: the platform's
        // QR flow expects a client that keeps asking until the code is burned.
        this.options.onState(this.current)
        await this.delay(signal)
        continue
      }
      if (status.status === 'confirmed') {
        this.report({ phase: 'confirmed' })
        return status.grant
      }
      if (status.status === 'scanned') {
        this.report({ phase: 'scanned', qrUrl: challenge.url === '' ? undefined : challenge.url })
      } else if (status.status === 'redirect') {
        this.baseUrl = status.baseUrl
      } else if (status.status === 'expired') {
        refreshes += 1
        if (refreshes > MAX_QR_REFRESHES) {
          const diagnostic = `the QR code expired ${refreshes} times without a scan`
          this.report({ phase: 'failed', diagnostic })
          throw new Error(diagnostic)
        }
        await this.fetchCode(signal)
      }
      await this.delay(signal)
    }
  }

  /** Fetch one fresh code and report `waiting` with its URL. */
  private async fetchCode(signal: AbortSignal): Promise<void> {
    const challenge = await this.options.transport.fetchQr(signal)
    this.challenge = challenge
    this.report({ phase: 'waiting', qrUrl: challenge.url === '' ? undefined : challenge.url })
  }

  /** Report one state; an unchanged state is not re-announced. */
  private report(next: WeixinLoginState): void {
    if (next.phase === this.current.phase && next.qrUrl === this.current.qrUrl && next.diagnostic === this.current.diagnostic) return
    this.current = next
    this.options.onState(next)
  }

  /** The configured wait between two polls. */
  private delay(signal: AbortSignal): Promise<void> {
    return (this.options.delay ?? abortableDelay)(this.options.pollIntervalMs ?? STATUS_POLL_INTERVAL_MS, signal)
  }
}
