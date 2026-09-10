import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
  BackendSupervisor, desktopBackendArguments, DESKTOP_PROFILE, parseBackendReadyUrl,
} from '../src/backend.ts'

const fixture = (name: string): string => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url))

describe('parseBackendReadyUrl', () => {
  it('accepts the official loopback readiness line with an optional LAN suffix', () => {
    expect(parseBackendReadyUrl('dsh web: http://127.0.0.1:4567 (LAN: http://192.168.1.5:4567)')).toBe(
      'http://127.0.0.1:4567/',
    )
  })

  it('rejects non-loopback and unrelated output', () => {
    expect(parseBackendReadyUrl('dsh web: http://localhost:4567')).toBeUndefined()
    expect(parseBackendReadyUrl('server: http://127.0.0.1:4567')).toBeUndefined()
  })
})

describe('BackendSupervisor', () => {
  it('boots the Mint product profile with fixed loopback Web arguments', () => {
    expect(desktopBackendArguments('/app/dsh.js', true)).toEqual([
      '--expose-internals', '/app/dsh.js', '--profile', DESKTOP_PROFILE,
      '--no-open', '--port', '0',
    ])
    expect(desktopBackendArguments('/app/dsh.js', false)).toEqual([
      '/app/dsh.js', '--profile', 'desktop-mint', '--no-open', '--port', '0',
    ])
  })

  it('recognizes a split readiness line and stops the child cleanly', async () => {
    const output: string[] = []
    const supervisor = new BackendSupervisor({
      executable: process.execPath,
      cliPath: fixture('ready-backend.mjs'),
      cwd: process.cwd(),
      electronNodeMode: false,
      startupTimeoutMs: 2_000,
      shutdownTimeoutMs: 500,
      log: (text) => {
        output.push(text)
      },
    })

    await expect(supervisor.start()).resolves.toBe('http://127.0.0.1:43123/')
    await supervisor.stop()
    expect(output.join('')).toContain('[backend stdout] dsh web: http://127.0.0.1:43123')
  })

  it('includes stderr when the child exits before readiness', async () => {
    const supervisor = new BackendSupervisor({
      executable: process.execPath,
      cliPath: fixture('failing-backend.mjs'),
      cwd: process.cwd(),
      electronNodeMode: false,
      startupTimeoutMs: 2_000,
    })

    await expect(supervisor.start()).rejects.toThrow(/configuration missing/u)
  })

  it('times out and stops a child that never announces readiness', async () => {
    const supervisor = new BackendSupervisor({
      executable: process.execPath,
      cliPath: fixture('silent-backend.mjs'),
      cwd: process.cwd(),
      electronNodeMode: false,
      startupTimeoutMs: 25,
      shutdownTimeoutMs: 100,
    })

    await expect(supervisor.start()).rejects.toThrow(/did not become ready within 25 ms/u)
    await supervisor.stop()
  })

  it('reports an exit that follows readiness without a stop request', async () => {
    const onUnexpectedExit = vi.fn()
    const supervisor = new BackendSupervisor({
      executable: process.execPath,
      cliPath: fixture('exiting-backend.mjs'),
      cwd: process.cwd(),
      electronNodeMode: false,
      startupTimeoutMs: 2_000,
      onUnexpectedExit,
    })

    await supervisor.start()
    await vi.waitFor(() => {
      expect(onUnexpectedExit).toHaveBeenCalledOnce()
    })
    expect(onUnexpectedExit).toHaveBeenCalledWith(expect.objectContaining({ code: 19, signal: null }))
  })
})

describe('authenticated backend readiness', () => {
  it('preserves only a literal loopback root URL with one optional nonempty token', () => {
    expect(parseBackendReadyUrl('dsh web: http://127.0.0.1:43123/?token=synthetic-token (LAN: http://10.0.0.1:43123)'))
      .toBe('http://127.0.0.1:43123/?token=synthetic-token')
    expect(parseBackendReadyUrl('dsh web: http://127.0.0.1:43123/')).toBe('http://127.0.0.1:43123/')
    for (const url of [
      'http://127.0.0.1:0/', 'http://127.0.0.1:65536/', 'http://127.0.0.1:043123/',
      'http://127.0.0.1/', 'http://localhost:43123/', 'http://127.1:43123/',
      'http://user@127.0.0.1:43123/', 'https://127.0.0.1:43123/',
      'http://127.0.0.1:43123/path?token=x', 'http://127.0.0.1:43123/../?token=x',
      'http://127.0.0.1:43123/?token=', 'http://127.0.0.1:43123/?token=x&token=y',
      'http://127.0.0.1:43123/?token=x&other=y', 'http://127.0.0.1:43123/?other=x',
      'http://127.0.0.1:43123/?%74oken=x', 'http://127.0.0.1:43123/?token=%ZZ',
      'http://127.0.0.1:43123/?token=x#fragment', 'http://127.0.0.1:43123/#fragment',
    ]) expect(parseBackendReadyUrl(`dsh web: ${url}`), url).toBeUndefined()
  })

  it('keeps the launch token in memory while redacting process logs and stopping the child', async () => {
    const logs: string[] = []
    const supervisor = new BackendSupervisor({
      executable: process.execPath, cliPath: fixture('authenticated-backend.mjs'), cwd: process.cwd(),
      electronNodeMode: false, environment: {}, log: text => logs.push(text),
    })
    try {
      await expect(supervisor.start()).resolves.toBe('http://127.0.0.1:43123/?token=synthetic-launch-token')
    } finally { await supervisor.stop() }
    expect(logs.join('')).toContain('[redacted]')
    expect(logs.join('')).not.toMatch(/synthetic-launch-token|synthetic-lan-token/u)
  })

  it('redacts tokens from early exit, timeout and unexpected exit diagnostics', async () => {
    for (const mode of ['early', 'timeout', 'unexpected']) {
      let finishExit: (diagnostics: string) => void = () => undefined
      const exited = new Promise<string>((resolve) => { finishExit = resolve })
      const supervisor = new BackendSupervisor({
        executable: process.execPath, cliPath: fixture('authenticated-backend.mjs'), cwd: process.cwd(),
        electronNodeMode: false, environment: { DSH_TEST_BACKEND_MODE: mode }, startupTimeoutMs: mode === 'timeout' ? 250 : 2_000,
        onUnexpectedExit: (exit) => {
          finishExit(exit.diagnostics)
        },
      })
      try {
        let diagnostics: string
        if (mode === 'unexpected') { await supervisor.start(); diagnostics = await exited }
        else {
          const error: unknown = await supervisor.start().catch((reason: unknown) => reason)
          expect(error).toBeInstanceOf(Error)
          diagnostics = (error as Error).message
        }
        expect(diagnostics).toContain('[redacted]')
        expect(diagnostics).not.toMatch(/synthetic-launch-token|synthetic-lan-token/u)
      } finally { await supervisor.stop() }
    }
  })
})
