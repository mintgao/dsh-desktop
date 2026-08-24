/** Supervise the dsh Web CLI that supplies the desktop application's backend. */

import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'

const DEFAULT_STARTUP_TIMEOUT_MS = 60_000
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000
const DIAGNOSTIC_LIMIT = 8_000
const READY_LINE = /^dsh web: (http:\/\/127\.0\.0\.1:\d+)(?:\s|$)/u

type BackendChild = ChildProcessByStdio<null, Readable, Readable>

/** Information reported when a ready backend exits without a desktop shutdown request. */
export interface BackendExit {
  /** Numeric exit status, or null when a signal ended the process. */
  code: number | null
  /** Signal that ended the process, or null for an ordinary exit. */
  signal: NodeJS.Signals | null
  /** Recent stdout and stderr lines that can explain the exit. */
  diagnostics: string
}

/** Options for one desktop-owned dsh backend process. */
export interface BackendSupervisorOptions {
  /** Node-compatible executable used to run the dsh CLI. */
  executable: string
  /** Absolute path to the built dsh CLI entry. */
  cliPath: string
  /** Initial working directory exposed to the dsh session. */
  cwd: string
  /** Environment inherited by the backend. */
  environment?: NodeJS.ProcessEnv
  /** Whether the executable is Electron and needs its Node execution mode. */
  electronNodeMode?: boolean
  /** Maximum time to wait for the official Web readiness line. */
  startupTimeoutMs?: number
  /** Grace period between SIGTERM and SIGKILL during shutdown. */
  shutdownTimeoutMs?: number
  /** Receive prefixed backend output for persistent logging. */
  log?: (text: string) => void
  /** Receive a ready backend's unrequested exit. */
  onUnexpectedExit?: (exit: BackendExit) => void
}

/** Parse the canonical loopback URL from a complete dsh Web readiness line. */
export function parseBackendReadyUrl(line: string): string | undefined {
  const candidate = READY_LINE.exec(line)?.[1]
  if (candidate === undefined) return undefined
  const url = new URL(candidate)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port === '') return undefined
  return url.href
}

/** Convert arbitrary stream chunks into complete lines while retaining a trailing fragment. */
class LineAccumulator {
  private remainder = ''

  /** Add one decoded chunk and emit each complete line. */
  push(chunk: string, emit: (line: string) => void): void {
    const lines = `${this.remainder}${chunk}`.split(/\r?\n/u)
    this.remainder = lines.pop() ?? ''
    for (const line of lines) emit(line)
  }

  /** Emit a final unterminated line after the stream closes. */
  finish(emit: (line: string) => void): void {
    if (this.remainder !== '') emit(this.remainder)
    this.remainder = ''
  }
}

/** Own startup detection and bounded shutdown for one dsh Web subprocess. */
export class BackendSupervisor {
  private readonly options: Required<Pick<BackendSupervisorOptions,
    'electronNodeMode' | 'startupTimeoutMs' | 'shutdownTimeoutMs' | 'log' | 'onUnexpectedExit'
  >> & Omit<BackendSupervisorOptions,
    'electronNodeMode' | 'startupTimeoutMs' | 'shutdownTimeoutMs' | 'log' | 'onUnexpectedExit'
  >
  private child: BackendChild | undefined
  private diagnostics = ''
  private ready = false
  private stopping = false
  private startPromise: Promise<string> | undefined
  private stopPromise: Promise<void> | undefined

  /** Create a supervisor without starting its backend. */
  constructor(options: BackendSupervisorOptions) {
    this.options = {
      ...options,
      electronNodeMode: options.electronNodeMode ?? true,
      startupTimeoutMs: options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
      log: options.log ?? (() => undefined),
      onUnexpectedExit: options.onUnexpectedExit ?? (() => undefined),
    }
  }

  /** Start dsh Web and resolve only after it announces its canonical local URL. */
  start(): Promise<string> {
    this.startPromise ??= this.startOnce()
    return this.startPromise
  }

  /** Stop the backend, escalating to SIGKILL after the configured grace period. */
  stop(): Promise<void> {
    this.stopping = true
    this.stopPromise ??= this.stopOnce()
    return this.stopPromise
  }

  private startOnce(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const environment = { ...(this.options.environment ?? process.env) }
      if (this.options.electronNodeMode) environment.ELECTRON_RUN_AS_NODE = '1'
      const runtimeArguments = this.options.electronNodeMode ? ['--expose-internals'] : []
      const child = spawn(
        this.options.executable,
        [...runtimeArguments, this.options.cliPath, 'web', '--no-open', '--port', '0'],
        {
          cwd: this.options.cwd,
          env: environment,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      this.child = child
      const stdout = new LineAccumulator()
      const stderr = new LineAccumulator()
      let settled = false
      const startupTimer = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error(`DSH backend did not become ready within ${String(this.options.startupTimeoutMs)} ms.${this.diagnosticSuffix()}`))
        void this.stop()
      }, this.options.startupTimeoutMs)

      const emitStdout = (line: string): void => {
        this.record('stdout', line)
        if (settled) return
        const url = parseBackendReadyUrl(line)
        if (url === undefined) return
        settled = true
        this.ready = true
        clearTimeout(startupTimer)
        resolve(url)
      }
      const emitStderr = (line: string): void => {
        this.record('stderr', line)
      }
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout.push(chunk, emitStdout)
      })
      child.stderr.on('data', (chunk: string) => {
        stderr.push(chunk, emitStderr)
      })
      child.once('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(startupTimer)
        reject(new Error(`Could not start the DSH backend: ${error.message}.${this.diagnosticSuffix()}`))
      })
      child.once('close', (code, signal) => {
        stdout.finish(emitStdout)
        stderr.finish(emitStderr)
        this.child = undefined
        clearTimeout(startupTimer)
        if (!settled) {
          settled = true
          reject(new Error(`DSH backend exited before it became ready (${this.describeExit(code, signal)}).${this.diagnosticSuffix()}`))
          return
        }
        if (this.ready && !this.stopping) {
          this.options.onUnexpectedExit({ code, signal, diagnostics: this.diagnostics.trim() })
        }
      })
    })
  }

  private stopOnce(): Promise<void> {
    const child = this.child
    if (child === undefined || child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
    return new Promise<void>((resolve) => {
      let completed = false
      const finish = (): void => {
        if (completed) return
        completed = true
        clearTimeout(forceTimer)
        resolve()
      }
      const forceTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }, this.options.shutdownTimeoutMs)
      child.once('close', finish)
      if (!child.kill('SIGTERM') && child.exitCode !== null) finish()
    })
  }

  private record(source: 'stdout' | 'stderr', line: string): void {
    const entry = `[backend ${source}] ${line}`
    this.options.log(`${entry}\n`)
    this.diagnostics = `${this.diagnostics}${entry}\n`.slice(-DIAGNOSTIC_LIMIT)
  }

  private diagnosticSuffix(): string {
    const diagnostics = this.diagnostics.trim()
    return diagnostics === '' ? '' : `\n\nRecent backend output:\n${diagnostics}`
  }

  private describeExit(code: number | null, signal: NodeJS.Signals | null): string {
    return code === null ? `signal ${signal ?? 'unknown'}` : `status ${String(code)}`
  }
}
