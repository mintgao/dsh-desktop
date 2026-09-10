/** Owned DevTools connection for a normally launched packaged Electron process. */
import { object } from './evidence.ts'

interface PendingRequest {
  resolve(value: Record<string, unknown>): void
  reject(error: Error): void
}

/** A bounded inspector connection with separately observed startup events. */
export class MigrationDebugger {
  private nextId = 0
  private readonly pending = new Map<number, PendingRequest>()
  private readonly events = new Map<string, Record<string, unknown>[]>()
  private readonly waiters = new Map<string, PendingRequest[]>()
  private failure: Error | undefined

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      try {
        const message = object(JSON.parse(String(event.data)))
        if (typeof message['id'] === 'number') {
          const request = this.pending.get(message['id'])
          if (request === undefined) return
          this.pending.delete(message['id'])
          if (message['error'] !== undefined) request.reject(new Error(JSON.stringify(message['error'])))
          else request.resolve(object(message['result']))
        } else if (typeof message['method'] === 'string') {
          const name = message['method']
          const params = object(message['params'] ?? {})
          const waiter = this.waiters.get(name)?.shift()
          if (waiter !== undefined) waiter.resolve(params)
          else if (name === 'Debugger.paused') {
            const queue = this.events.get(name) ?? []
            if (queue.length >= 128) throw new Error(`Unconsumed DevTools events: ${name}`)
            queue.push(params)
            this.events.set(name, queue)
          }
        }
      } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))) }
    })
    socket.addEventListener('close', () => { this.fail(new Error('DevTools connection closed')) })
    socket.addEventListener('error', () => { this.fail(new Error('DevTools connection failed')) })
  }

  private fail(error: Error): void {
    this.failure ??= error
    for (const request of this.pending.values()) request.reject(error)
    this.pending.clear()
    for (const queue of this.waiters.values()) for (const waiter of queue) waiter.reject(error)
    this.waiters.clear()
  }

  /** Connect only to an already allocated loopback inspector endpoint.
   * @param address - WebSocket URL emitted by the owned process.
   * @param signal - Overall fixture deadline or cancellation.
   * @returns The opened connection, owned by the caller until close.
   */
  static async connect(address: string, signal: AbortSignal): Promise<MigrationDebugger> {
    const url = new URL(address)
    if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.username || url.password) {
      throw new Error('Migration inspector must use a loopback WebSocket')
    }
    signal.throwIfAborted()
    const socket = new WebSocket(address)
    const connection = new MigrationDebugger(socket)
    try {
      await new Promise<void>((resolve, reject) => {
        const abort = (): void => { socket.close(); reject(new Error('Migration inspector connection aborted')) }
        const error = (): void => { signal.removeEventListener('abort', abort); reject(new Error('Migration inspector connection failed')) }
        signal.addEventListener('abort', abort, { once: true })
        socket.addEventListener('error', error, { once: true })
        socket.addEventListener('open', () => {
          signal.removeEventListener('abort', abort)
          socket.removeEventListener('error', error)
          resolve()
        }, { once: true })
      })
      return connection
    } catch (error) { await connection.close(); throw error }
  }

  private async bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted()
    let abort: (() => void) | undefined
    try {
      return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
        abort = () => { reject(new Error('Migration inspector operation aborted')) }
        signal.addEventListener('abort', abort, { once: true })
      })])
    } finally { if (abort !== undefined) signal.removeEventListener('abort', abort) }
  }

  /** Send one protocol request and reject protocol errors or cancellation.
   * @param method - DevTools method.
   * @param params - Method parameters.
   * @param signal - Fixture deadline or cancellation.
   * @returns The protocol result fields.
   */
  async send(method: string, params: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
    if (this.failure !== undefined) throw this.failure
    signal.throwIfAborted()
    const id = ++this.nextId
    const result = new Promise<Record<string, unknown>>((resolve, reject) => { this.pending.set(id, { resolve, reject }) })
    try {
      this.socket.send(JSON.stringify({ id, method, params }))
      return await this.bounded(result, signal)
    } finally { this.pending.delete(id) }
  }

  /** Observe a protocol event; startup pause events are retained before registration.
   * @param method - Exact event name.
   * @param signal - Fixture deadline or cancellation.
   * @returns Event parameters.
   */
  async event(method: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    if (this.failure !== undefined) throw this.failure
    signal.throwIfAborted()
    const ready = this.events.get(method)?.shift()
    if (ready !== undefined) return ready
    let entry: PendingRequest | undefined
    const operation = new Promise<Record<string, unknown>>((resolve, reject) => {
      entry = { resolve, reject }
      const queue = this.waiters.get(method) ?? []
      queue.push(entry)
      this.waiters.set(method, queue)
    })
    try { return await this.bounded(operation, signal) }
    finally {
      const queue = this.waiters.get(method)
      if (queue !== undefined && entry !== undefined) {
        const index = queue.indexOf(entry)
        if (index >= 0) queue.splice(index, 1)
      }
    }
  }

  /** Close the transport and reject outstanding operations before returning. */
  async close(): Promise<void> {
    this.fail(new Error('Migration inspector closed by owner'))
    if (this.socket.readyState === WebSocket.CLOSED) return
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => { reject(new Error('DevTools transport close deadline exceeded')) }, 2000)
        this.socket.addEventListener('close', () => { resolve() }, { once: true })
        this.socket.close()
      })
    } finally { clearTimeout(timer) }
  }
}
