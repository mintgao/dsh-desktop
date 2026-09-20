/**
 * Configuration of the WeChat channel plugin: the deployment bounds every
 * account of the composition runs under. The schema lives beside the service in
 * `index.ts`, where the config catalog walks it statically.
 * @module @deepseek-ai/dsh-channel-weixin/src/config
 */

/** Hard bounds the composition states for every account. */
export interface Config {
  /** Long-poll timeout in milliseconds; the platform may suggest another one, within this bound. */
  readonly pollTimeoutMs: number
  /** Total attempts one poll cycle gets, including the first. */
  readonly pollRetryAttempts: number
  /** Wait between two poll attempts, and between two failed cycles, in milliseconds. */
  readonly pollBackoffMs: number
  /** Total attempts one outbound chunk gets, including the first. */
  readonly sendRetryAttempts: number
  /** Wait between two outbound attempts, in milliseconds. */
  readonly sendBackoffMs: number
  /** Wait a frequency-limited send observes before its retry, in milliseconds. */
  readonly throttleDelayMs: number
  /** Consecutive failed poll cycles that open the circuit breaker. */
  readonly breakerThreshold: number
  /** Largest outbound chunk within the platform's length limit, in characters. */
  readonly chunkLength: number
  /** Directory of the token-lock files; the Mint bundle points it at the desktop data directory. */
  readonly lockDirectory: string
}

/**
 * The stale threshold of one account's token lock: the worst-case poll cycle
 * the configured bounds allow, so a holder retrying inside its own bounds never
 * looks dead to a second instance.
 * @param config - the composition's validated bounds.
 * @returns the threshold in milliseconds.
 */
export function staleThresholdMs(config: Config): number {
  return config.pollRetryAttempts * config.pollTimeoutMs + (config.pollRetryAttempts - 1) * config.pollBackoffMs
}
