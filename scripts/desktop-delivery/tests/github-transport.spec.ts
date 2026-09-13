/** GitHub download negotiation and credential containment at redirect boundaries. */
import { expect, it } from 'vitest'
import { github } from '../operations.ts'

it.each([
  ['/repos/example/desktop/actions/artifacts/123/zip', 'application/vnd.github+json'],
  ['/repos/example/desktop/releases/assets/123', 'application/octet-stream'],
])('downloads %s with endpoint-specific negotiation', async (path, accept) => {
  const original = globalThis.fetch
  const bytes = new Uint8Array([80, 75, 3, 4])
  let requests = 0
  try {
    globalThis.fetch = async (input, init) => {
      requests++
      if (requests === 1) {
        expect(input).toBe(`https://api.github.com${path}`)
        expect(init?.method).toBe('GET')
        expect(init?.redirect).toBe('manual')
        const headers = new Headers(init?.headers)
        expect(headers.get('accept')).toBe(accept)
        expect(headers.get('authorization')).toBe('Bearer fixture-token')
        return new Response(null, { status: 302, headers: { location: 'https://example.invalid/archive' } })
      }
      expect(input).toEqual(new URL('https://example.invalid/archive'))
      expect(init?.redirect).toBe('error')
      expect(new Headers(init?.headers).get('authorization')).toBeNull()
      return new Response(bytes)
    }
    await expect(github('fixture-token').request('DOWNLOAD', path)).resolves.toEqual(bytes)
    expect(requests).toBe(2)
  } finally {
    globalThis.fetch = original
  }
})

it('returns direct release asset bytes without requiring a redirect', async () => {
  const original = globalThis.fetch
  const bytes = new Uint8Array([1, 2, 3])
  try {
    globalThis.fetch = async (_input, init) => {
      expect(new Headers(init?.headers).get('accept')).toBe('application/octet-stream')
      return new Response(bytes)
    }
    await expect(github(undefined).request('DOWNLOAD', '/repos/example/desktop/releases/assets/123')).resolves.toEqual(bytes)
  } finally {
    globalThis.fetch = original
  }
})
