/** Loopback-only provider input shared by successive packaged migration processes. */
import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { Socket } from 'node:net'

/** One observed request to the synthetic provider protocol. */
export interface MigrationProviderRequest {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: string
}

/** Owned listener whose state never resides in a backed-up application directory. */
export interface MigrationProviderFixture {
  url: string
  requests: MigrationProviderRequest[]
  /** Resolve once every response and client socket has closed. */
  quiescent(): Promise<{ sockets: number; responses: number; requests: number }>
  /** Close the listener and await resource release, including on a failed case. */
  close(): Promise<void>
}

/** Start a deterministic OpenAI-compatible HTTP input without external network requests.
 * @returns An atomically allocated loopback endpoint and its cleanup/observation handles.
 */
export async function startMigrationProvider(): Promise<MigrationProviderFixture> {
  const requests: MigrationProviderRequest[] = []
  const sockets = new Set<Socket>()
  const waiters = new Set<() => void>()
  let responses = 0
  const notify = (): void => {
    if (sockets.size !== 0 || responses !== 0) return
    for (const waiter of waiters) waiter()
    waiters.clear()
  }
  const server = createServer((request, response) => {
    responses++
    let closed = false
    const settled = (): void => {
      if (closed) return
      closed = true
      responses--
      notify()
    }
    response.once('close', settled)
    let body = ''
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString()
      if (body.length > 1024 * 1024) request.destroy(new Error('Synthetic provider request exceeds fixture limit'))
    })
    request.on('end', () => {
      if (request.method === 'GET' && request.url === '/__receipt') {
        response.writeHead(200, { 'content-type': 'application/json', connection: 'close' })
        response.end(JSON.stringify(requests))
        return
      }
      requests.push({ method: request.method ?? '', path: request.url ?? '', headers: { ...request.headers }, body })
      if (request.method === 'GET' && request.url === '/v1/models') {
        response.writeHead(200, { 'content-type': 'application/json', connection: 'close' })
        response.end(JSON.stringify({ data: [{ id: 'migration-model', context_length: 32768 }] }))
      } else if (request.method === 'POST' && request.url === '/search/messages') {
        response.writeHead(200, { 'content-type': 'application/json', connection: 'close' })
        response.end(JSON.stringify({ content: [{ type: 'text', text: 'ok' },
          { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://a.test', title: 'A' }] }] }))
      } else if (request.method === 'POST' && request.url === '/v1/chat/completions') {
        response.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' })
        for (const event of [
          '{"choices":[{"delta":{"role":"assistant","content":""},"index":0,"finish_reason":null}]}',
          '{"choices":[{"delta":{"content":"hello"},"index":0,"finish_reason":null}]}',
          '{"choices":[{"delta":{},"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
          '[DONE]',
        ]) response.write(`data: ${event}\n\n`)
        response.end()
      } else if (request.method === 'POST' && request.url === '/v1/responses') {
        response.writeHead(200, { 'content-type': 'text/event-stream', connection: 'close' })
        const message = { type: 'message', id: 'synthetic-message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: 'hello', annotations: [] }] }
        for (const event of [
          { type: 'response.created', response: { id: 'synthetic-response', status: 'in_progress' } },
          { type: 'response.output_item.added', output_index: 0, item: { ...message, status: 'in_progress', content: [] } },
          { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'hello' },
          { type: 'response.output_item.done', output_index: 0, item: message },
          { type: 'response.completed', response: { id: 'synthetic-response', status: 'completed', output: [message],
            usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } },
        ]) response.write(`data: ${JSON.stringify(event)}\n\n`)
        response.end()
      } else {
        response.writeHead(404, { connection: 'close' })
        response.end('Unexpected synthetic provider path')
      }
    })
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => { sockets.delete(socket); notify() })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Missing migration provider address')
  return {
    url: `http://127.0.0.1:${address.port}`, requests,
    async quiescent() {
      if (sockets.size !== 0 || responses !== 0) await new Promise<void>((resolve) => { waiters.add(resolve) })
      return { sockets: sockets.size, responses, requests: requests.length }
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error) reject(error); else resolve() })
        server.closeAllConnections()
      })
    },
  }
}
