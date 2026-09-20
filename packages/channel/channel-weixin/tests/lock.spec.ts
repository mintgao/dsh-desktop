/**
 * The token lock: exclusive create, the stale override, the heartbeat, and the
 * release rules.
 */

import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireTokenLock } from '../src/lock.ts'

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) {
    await chmod(root, 0o700).catch(() => undefined)
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
  root = undefined
})

/** One fresh temporary root for a lock test. */
async function tempRoot(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'dsh-channel-weixin-lock-'))
  return root
}

describe('acquireTokenLock', () => {
  it('creates the lock exclusively, heartbeats it, and releases it', async () => {
    const directory = await tempRoot()
    const result = await acquireTokenLock({ directory, holderId: 'holder-a', staleMs: 100 })
    expect(result.kind).toBe('acquired')
    if (result.kind !== 'acquired') return
    const path = join(directory, 'weixin-token.lock')
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ holder: 'holder-a' })
    await result.lock.heartbeat()
    await result.lock.release()
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    // Releasing an already-released lock is a no-op.
    await result.lock.release()
  })

  it('refuses a live holder and overrides a stale one', async () => {
    const directory = await tempRoot()
    await acquireTokenLock({ directory, holderId: 'holder-a', staleMs: 100, now: () => 1_000 })
    const live = await acquireTokenLock({ directory, holderId: 'holder-b', staleMs: 100, now: () => 1_099 })
    expect(live).toEqual({ kind: 'held', holderId: 'holder-a' })
    const stale = await acquireTokenLock({ directory, holderId: 'holder-b', staleMs: 100, now: () => 1_100 })
    expect(stale.kind).toBe('acquired')
    if (stale.kind !== 'acquired') return
    expect(stale.overrode).toBe('holder-a')
    expect(JSON.parse(await readFile(join(directory, 'weixin-token.lock'), 'utf8'))).toMatchObject({ holder: 'holder-b' })
  })

  it('overrides a malformed lock file', async () => {
    const directory = await tempRoot()
    const path = join(directory, 'weixin-token.lock')
    for (const content of ['not json', '"a string"', '{"holder":""}', '{"holder":"x"}', '{"holder":"x","heartbeatAt":"soon"}']) {
      await writeFile(path, content)
      const result = await acquireTokenLock({ directory, holderId: 'holder-a', staleMs: 100, now: () => 1_000 })
      expect(result.kind).toBe('acquired')
    }
  })

  it('rejects once another holder took the lock over', async () => {
    const directory = await tempRoot()
    let now = 1_000
    const first = await acquireTokenLock({ directory, holderId: 'holder-a', staleMs: 100, now: () => now })
    if (first.kind !== 'acquired') throw new Error('the first holder did not acquire the lock')
    now = 2_000
    await first.lock.heartbeat()
    expect(JSON.parse(await readFile(join(directory, 'weixin-token.lock'), 'utf8'))).toMatchObject({ heartbeatAt: 2_000 })
    const second = await acquireTokenLock({ directory, holderId: 'holder-b', staleMs: 100, now: () => 3_000 })
    expect(second.kind).toBe('acquired')
    await expect(first.lock.heartbeat()).rejects.toThrow('taken over by holder-b')
  })

  it('releases only the lock it holds', async () => {
    const directory = await tempRoot()
    const first = await acquireTokenLock({ directory, holderId: 'holder-a', staleMs: 100, now: () => 1_000 })
    if (first.kind !== 'acquired') throw new Error('the first holder did not acquire the lock')
    const second = await acquireTokenLock({ directory, holderId: 'holder-b', staleMs: 100, now: () => 2_000 })
    if (second.kind !== 'acquired') throw new Error('the second holder did not acquire the lock')
    await first.lock.release()
    expect(JSON.parse(await readFile(join(directory, 'weixin-token.lock'), 'utf8'))).toMatchObject({ holder: 'holder-b' })
    await second.lock.release()
    await expect(readFile(join(directory, 'weixin-token.lock'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a filesystem failure that is not an existing lock', async () => {
    const directory = await tempRoot()
    await mkdir(join(directory, 'locks'))
    await chmod(join(directory, 'locks'), 0o500)
    await expect(acquireTokenLock({ directory: join(directory, 'locks'), holderId: 'holder-a', staleMs: 100 }))
      .rejects.toMatchObject({ code: 'EACCES' })
  })

  it('reports a release failure that is not an absent lock', async () => {
    const directory = await tempRoot()
    const result = await acquireTokenLock({ directory, holderId: 'holder-a', staleMs: 100 })
    if (result.kind !== 'acquired') throw new Error('the holder did not acquire the lock')
    await chmod(directory, 0o500)
    await expect(result.lock.release()).rejects.toMatchObject({ code: 'EACCES' })
    await chmod(directory, 0o700)
  })
})
