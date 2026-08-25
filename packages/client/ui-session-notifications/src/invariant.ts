/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-session-notifications`.
 * @module @deepseek-ai/dsh-client-ui-session-notifications/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-session-notifications'

/** Cordis companion plugin name. */
export const name = 'client-ui-session-notifications-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the settings scope validates the durable mode, and
 * the controller derives each notification from one authoritative session-list
 * snapshot. Settings and lifecycle agreement are covered by package behavior specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
