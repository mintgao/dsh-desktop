/** Independent listeners expose real protocol bytes and settle their owned sockets. */
import { expect, it } from 'vitest'
import { startMigrationProvider } from '../migration-provider-fixture.ts'

it('allocates separate endpoints and closes responses before a backup boundary', async () => {
  const first = await startMigrationProvider()
  try {
    const second = await startMigrationProvider()
    try {
      expect(first.url).not.toBe(second.url)
      const response = await fetch(`${first.url}/v1/chat/completions`, {
        method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: '{"model":"fixture"}',
      })
      expect(await response.text()).toContain('data: [DONE]')
      expect(await first.quiescent()).toEqual({ sockets: 0, responses: 0, requests: 1 })
      expect(first.requests[0]?.headers.authorization).toBe('Bearer synthetic')
      expect(second.requests).toEqual([])
      const search = await fetch(`${second.url}/search/messages`, { method: 'POST', body: '{"model":"search-fixture"}' })
      expect(await search.json()).toMatchObject({ content: [{ type: 'text' }, { type: 'web_search_tool_result' }] })
      expect(await second.quiescent()).toEqual({ sockets: 0, responses: 0, requests: 1 })
      expect(first.requests).toHaveLength(1)
      const inspection = await fetch(`${first.url}/__receipt`)
      expect(await inspection.json()).toEqual(first.requests)
      expect(await first.quiescent()).toEqual({ sockets: 0, responses: 0, requests: 1 })
    } finally { await second.close() }
  } finally { await first.close() }
})
