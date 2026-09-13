/** Prove authenticated admission before navigating the native window. */
/**
 * Exercise the loopback token exchange and fetch its Web page with the issued cookie.
 * @param url - canonical readiness URL retained in memory by the supervisor.
 * @param request - HTTP adapter; production uses fetch.
 */
export async function probeBackendPage(url: string, request: typeof fetch = fetch): Promise<void> {
  const initial = new URL(url)
  if (initial.protocol !== 'http:' || initial.hostname !== '127.0.0.1' || initial.username !== '' || initial.password !== '') {
    throw new Error('Backend smoke requires loopback HTTP')
  }
  let response = await request(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15_000) })
  if (response.status === 303) {
    await response.body?.cancel()
    const location = response.headers.get('location')
    const target = location === null ? undefined : new URL(location, initial)
    const cookies = response.headers.getSetCookie()
    const cookie = cookies[0]?.split(';')[0]
    if (target?.origin !== initial.origin || target.pathname !== '/' || target.search !== '' || target.hash !== ''
      || target.username !== '' || target.password !== '' || cookies.length !== 1 || cookie === undefined || !cookie.includes('=')) {
      throw new Error('Unsafe or missing backend authentication redirect')
    }
    response = await request(target.href, {
      method: 'GET', redirect: 'error', headers: { Cookie: cookie }, signal: AbortSignal.timeout(15_000),
    })
  }
  const body = await response.text()
  if (!response.ok || !body.includes('<html')) {
    const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim()
    const contentType = ['text/html', 'text/plain', 'application/json', 'application/octet-stream'].includes(mediaType ?? '')
      ? mediaType
      : mediaType === undefined ? 'missing' : 'other'
    throw new Error(`Packaged backend did not serve its Web application (status=${String(response.status)}, content-type=${contentType})`)
  }
}
