/**
 * The token-lock file: one polling client per bot identity. iLink serves one
 * identity to one polling client per token, so a second instance must fail
 * loudly instead of silently splitting messages. The lock is a small JSON file
 * the holder heartbeats once per poll cycle; a holder whose heartbeat is older
 * than the stale threshold is overridden, which is what makes a crashed
 * instance's lock self-healing.
 * @module @deepseek-ai/dsh-channel-weixin/src/lock
 */

import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** File name of the token lock inside the configured lock directory. */
const LOCK_FILE_NAME = 'weixin-token.lock'

/** One acquired token lock; the holder heartbeats it per poll cycle and releases it at disposal. */
export interface WeixinTokenLock {
  /** Refresh the heartbeat; rejects once another holder owns the file. */
  heartbeat(): Promise<void>
  /** Release the lock; a no-op once another holder owns the file. */
  release(): Promise<void>
}

/** How to acquire one token lock. */
export interface WeixinTokenLockRequest {
  /** Directory the lock file lives in; the Mint bundle points it at the desktop data directory. */
  readonly directory: string
  /** This instance's holder identity. */
  readonly holderId: string
  /** A holder whose heartbeat is older than this is stale and gets overridden, in milliseconds. */
  readonly staleMs: number
  /** Clock override for tests. */
  readonly now?: () => number
}

/** The outcome of one acquisition attempt. */
export type WeixinTokenLockResult =
  | { readonly kind: 'acquired'; readonly lock: WeixinTokenLock; readonly overrode?: string | undefined }
  | { readonly kind: 'held'; readonly holderId: string }

/** The lock file's stored shape. */
interface LockFileContent {
  readonly holder: string
  readonly heartbeatAt: number
}

/** Whether one filesystem failure carries the given errno code. */
function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code
}

/** Read one lock file; an absent, unreadable, or malformed file is absent by definition. */
async function readLockFile(path: string): Promise<LockFileContent | undefined> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  try {
    const decoded: unknown = JSON.parse(raw)
    if (typeof decoded !== 'object' || decoded === null) return undefined
    const holder = (decoded as Record<string, unknown>)['holder']
    const heartbeatAt = (decoded as Record<string, unknown>)['heartbeatAt']
    if (typeof holder !== 'string' || holder === '' || typeof heartbeatAt !== 'number') return undefined
    return { holder, heartbeatAt }
  } catch {
    return undefined
  }
}

/**
 * Acquire the token lock for one holder. Steps, each explicit: create the file
 * exclusively — success is acquisition; on `EEXIST` read the current holder — a
 * live heartbeat refuses with `held`, a stale or unreadable one is overridden
 * by writing this holder's content; any other filesystem failure rejects, and
 * the caller reports it as the connection diagnostic.
 * @param request - directory, holder identity, and the stale threshold.
 * @returns the acquisition outcome.
 */
export async function acquireTokenLock(request: WeixinTokenLockRequest): Promise<WeixinTokenLockResult> {
  const now = request.now ?? Date.now
  const path = join(request.directory, LOCK_FILE_NAME)
  await mkdir(request.directory, { recursive: true })
  const content = (): LockFileContent => ({ holder: request.holderId, heartbeatAt: now() })
  const lock: WeixinTokenLock = {
    async heartbeat() {
      const current = await readLockFile(path)
      if (current !== undefined && current.holder !== request.holderId) {
        throw new Error(`the token lock was taken over by ${current.holder}`)
      }
      await writeFile(path, JSON.stringify(content()))
    },
    async release() {
      const current = await readLockFile(path)
      if (current !== undefined && current.holder !== request.holderId) return
      try {
        await unlink(path)
      } catch (error: unknown) {
        if (!hasCode(error, 'ENOENT')) throw error
      }
    },
  }
  try {
    const handle = await open(path, 'wx')
    await handle.writeFile(JSON.stringify(content()))
    await handle.close()
    return { kind: 'acquired', lock }
  } catch (error: unknown) {
    if (!hasCode(error, 'EEXIST')) throw error
  }
  const existing = await readLockFile(path)
  if (existing !== undefined && now() - existing.heartbeatAt < request.staleMs) {
    return { kind: 'held', holderId: existing.holder }
  }
  await writeFile(path, JSON.stringify(content()))
  return { kind: 'acquired', lock, overrode: existing?.holder }
}
