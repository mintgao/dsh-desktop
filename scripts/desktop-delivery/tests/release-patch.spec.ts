/** Same-ID reconciliation rejects successful but conflicting Release PATCH responses. */
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { deliveryConfig, type GitHub } from '../operations.ts'
import { object } from '../evidence.ts'
import { patchRelease } from '../release-patch.ts'

const config = deliveryConfig(resolve('.github/desktop-delivery/mint.json'))
const intended = { id: 10, tag: 'desktop-v1.0.0-unsigned.1', commit: 'a'.repeat(40), draft: false, body: 'Reviewed\nbody', previousBody: 'Reviewed\nbody' }
it.each([false, true])('reconciles the exact state after lost response=%s', async (lost) => {
  let remote: Record<string, unknown> = { id: 10, tag_name: intended.tag, prerelease: true, draft: true, body: intended.previousBody }
  const api: GitHub = { async request(method, path, body) {
    if (path.includes('/git/ref/')) return { object: { type: 'commit', sha: intended.commit } }
    expect(path).toBe(`/repos/${config.repository}/releases/10`)
    if (method === 'PATCH') {
      expect(body).toEqual({ tag_name: intended.tag, draft: false, prerelease: true, body: intended.body, make_latest: 'false' })
      remote = { ...remote, ...object(body), tag_name: object(body).tag_name ?? 'temporary-server-tag' }
      if (lost) throw new Error('Response lost')
    }
    return remote
  } }
  expect(await patchRelease(config, api, intended)).toMatchObject({
    id: 10, tag_name: intended.tag, draft: false, prerelease: true, body: intended.body,
  })
})
it.each([
  { id: 99 }, { tag_name: 'temporary-server-tag' }, { prerelease: false }, { draft: true }, { body: 'Foreign body' },
])('blocks conflicting response state %j after success and ambiguity', async (drift) => {
  for (const lost of [false, true]) {
    let remote: Record<string, unknown> = { id: 10, tag_name: intended.tag, prerelease: true, draft: true, body: intended.previousBody }
    let writes = 0
    const api: GitHub = { async request(method, path, body) {
      if (path.includes('/git/ref/')) return { object: { type: 'commit', sha: intended.commit } }
      if (method === 'PATCH') {
        writes++
        remote = { ...remote, ...object(body), ...drift }
        if (lost) throw new Error('Response lost')
      }
      return remote
    } }
    await expect(patchRelease(config, api, intended)).rejects.toThrow('maintainer recovery')
    expect(writes).toBe(1)
  }
})
it('does not patch when the immutable tag commit changed', async () => {
  let writes = 0
  const api: GitHub = { async request(method, path) {
    if (method === 'PATCH') writes++
    if (path.includes('/git/ref/')) return { object: { type: 'commit', sha: 'b'.repeat(40) } }
    return { id: 10, tag_name: intended.tag, prerelease: true, draft: true, body: intended.previousBody }
  } }
  await expect(patchRelease(config, api, intended)).rejects.toThrow('approved commit')
  expect(writes).toBe(0)
})
