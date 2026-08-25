/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-desktop-mint`.
 * @module @deepseek-ai/dsh-desktop-mint/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-desktop-mint'

/** Cordis companion plugin name. */
export const name = 'desktop-mint-bundle-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: the package owns a static patch list while each
// selected feature package owns the mutable relationships it creates.
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
