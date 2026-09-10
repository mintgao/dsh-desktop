/** Exact samplers own their initial state, raw I/O and callback admission independently. */
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import io from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Hmr from '@deepseek-ai/cordis-plugin-hmr'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Timer from '@deepseek-ai/cordis-plugin-timer'
import { expect, it, vi } from 'vitest'

type Fingerprint = Awaited<ReturnType<typeof io.stat>>
async function boot(root: string, options: Partial<Hmr.Config> = {}): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = `${pathToFileURL(root).href}/`
  try {
    await ctx.plugin(Loader); await ctx.plugin(Timer)
    await ctx.plugin(Hmr, { root: [], ignored: [], debounce: 0, ...options })
    return ctx
  } catch (error) { await ctx.fiber.dispose(); throw error }
}
const absent = () => Object.assign(new Error('absent'), { code: 'ENOENT' })
const denied = () => Object.assign(new Error('denied'), { code: 'EACCES' })
async function fixture() {
  const root = await io.realpath(mkdtempSync(join(tmpdir(), 'dsh-hmr-sampler-')))
  const filename = join(root, 'later', 'nested', 'plugins.yml')
  const ctx = await boot(root)
  return { root, filename, ctx, hmr: ctx.hmr, async close() { await ctx.fiber.dispose(); rmSync(root, { recursive: true, force: true }) } }
}
function intercept(target: string, read: () => Promise<Fingerprint>, observed?: (path: string) => void) {
  const stat = io.stat
  const spy = vi.spyOn(io, 'stat').mockImplementation(((path: fs.PathLike, options: unknown) => {
    observed?.(String(path))
    if (String(path) === target) return read()
    return Reflect.apply(stat, io, [path, options]) as Promise<Fingerprint>
  }))
  syncBuiltinESMExports()
  return () => { spy.mockRestore(); syncBuiltinESMExports() }
}
async function tick(ms = 100) { await vi.advanceTimersByTimeAsync(ms) }

it('awaits initial absence before returning and observes one creation without native subscriptions', async () => {
  const f = await fixture()
  const initial = Promise.withResolvers<Fingerprint>()
  const entered = Promise.withResolvers<undefined>()
  const stat = io.stat
  let count = 0
  const restore = intercept(f.filename, () => {
    if (++count === 1) { entered.resolve(undefined); return initial.promise }
    return stat(f.filename, { bigint: true })
  })
  const native = vi.spyOn(fs, 'watch').mockImplementation(() => { throw new Error('native forbidden') })
  const watchFile = vi.spyOn(fs, 'watchFile').mockImplementation(() => { throw new Error('implicit baseline forbidden') })
  syncBuiltinESMExports()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let settled = false
  const observed: string[] = []
  const changed = Promise.withResolvers<undefined>()
  const registration = f.ctx.hmr.registerConfig(f.filename, () => { observed.push(readFileSync(f.filename, 'utf8')); changed.resolve(undefined) }).then((value) => { settled = true; return value })
  try {
    await entered.promise
    await tick(1000)
    expect(settled).toBe(false)
    expect(count).toBe(1)
    initial.reject(absent())
    const dispose = await registration
    mkdirSync(dirname(f.filename), { recursive: true }); writeFileSync(f.filename, 'created')
    await tick(); await changed.promise
    expect(observed).toEqual(['created'])
    expect(count).toBe(2)
    await dispose()
    await tick(1000)
    expect(count).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
    expect(native).not.toHaveBeenCalled(); expect(watchFile).not.toHaveBeenCalled()
  } finally {
    initial.reject(absent())
    await registration.catch(() => {})
    await f.close(); vi.useRealTimers(); restore(); native.mockRestore(); watchFile.mockRestore(); syncBuiltinESMExports()
  }
})

it('owns one target sample regardless of siblings and tracks aliases, replacement and missing components', async () => {
  const counts: number[][] = []
  for (const siblings of [0, 100]) {
    const f = await fixture()
    const alias = `${f.root}-alias`
    const stat = io.stat
    let samples = 0
    let pending: Promise<Fingerprint> | undefined
    const paths: string[] = []
    const restore = intercept(f.filename, () => {
      samples++; pending = stat(f.filename, { bigint: true }); return pending
    }, (path) => { paths.push(path) })
    const advance = async () => {
      await tick()
      // Settle real filesystem work before advancing the next synthetic interval.
      await pending?.catch(() => undefined)
      await tick(0)
    }
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      for (let i = 0; i < siblings; i++) { const dir = join(f.root, `later-prefix-${i}`); mkdirSync(dir); writeFileSync(join(dir, 'other'), 'other') }
      symlinkSync(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir')
      const observed: string[] = []
      const dispose = await f.ctx.hmr.registerConfig(join(alias, 'later/nested/plugins.yml'), () => { observed.push(existsSync(f.filename) ? readFileSync(f.filename, 'utf8') : 'missing') })
      const row = [samples]
      await expect(f.ctx.hmr.registerConfig(f.filename, () => {})).rejects.toThrow('already registered')
      paths.length = 0
      mkdirSync(dirname(f.filename), { recursive: true }); writeFileSync(f.filename, 'created')
      await advance(); row.push(samples)
      rmSync(join(f.root, 'later'), { recursive: true }); await advance()
      writeFileSync(join(f.root, 'later'), 'not a directory'); await advance()
      unlinkSync(join(f.root, 'later')); mkdirSync(dirname(f.filename), { recursive: true }); writeFileSync(f.filename, 'recreated'); await advance()
      const replacement = join(f.root, 'replacement'); writeFileSync(replacement, 'replacement'); renameSync(replacement, f.filename); await advance()
      expect(observed).toEqual(['created', 'missing', 'recreated', 'replacement'])
      await dispose(); const before = samples; await tick(1000)
      row.push(samples - before); counts.push(row)
      expect(vi.getTimerCount()).toBe(0)
      expect(new Set(paths)).toEqual(new Set([f.filename]))
    } finally { await f.close(); unlinkSync(alias); vi.useRealTimers(); restore() }
  }
  expect(counts).toEqual([[1, 2, 0], [1, 2, 0]])
})

it('does not overlap held recurring reads or admit their result after concurrent disposal', async () => {
  const f = await fixture()
  const pending = Promise.withResolvers<Fingerprint>()
  let samples = 0
  const restore = intercept(f.filename, () => ++samples === 1 ? Promise.reject(absent()) : pending.promise)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let calls = 0
  try {
    const dispose = await f.ctx.hmr.registerConfig(f.filename, () => { calls++ })
    await tick(); await tick(1000)
    expect(samples).toBe(2)
    let closed = 0
    const a = dispose().then(() => { closed++ }); const b = dispose().then(() => { closed++ })
    await tick(1000); expect(closed).toBe(0)
    pending.reject(absent()); await Promise.all([a, b])
    await tick(1000)
    expect(closed).toBe(2); expect(samples).toBe(2); expect(calls).toBe(0); expect(vi.getTimerCount()).toBe(0)
  } finally { pending.reject(absent()); await f.close(); vi.useRealTimers(); restore() }
})

it('settles initial rejection concurrent with close and blocks setup after held canonical resolution', async () => {
  for (const stage of ['canonical', 'initial-failure', 'initial-absence'] as const) {
    const f = await fixture()
    const pending = Promise.withResolvers<Fingerprint>()
    const entered = Promise.withResolvers<undefined>()
    let targetReads = 0
    const target = stage === 'canonical' ? dirname(f.filename) : f.filename
    const restore = intercept(target, () => {
      entered.resolve(undefined); return pending.promise
    }, (path) => { if (path === f.filename) targetReads++ })
    let calls = 0
    const registration = f.ctx.hmr.registerConfig(f.filename, () => { calls++ })
    const rejected = registration.catch((error: unknown) => error)
    try {
      await entered.promise
      const closure = f.ctx.fiber.dispose()
      pending.reject(stage === 'initial-failure' ? denied() : absent())
      await closure
      expect(await rejected).toBeInstanceOf(Error)
      expect(targetReads).toBe(stage === 'canonical' ? 0 : 1)
      expect(calls).toBe(0)
      expect((f.hmr as unknown as { configs: Map<string, unknown> }).configs.size).toBe(0)
    } finally { pending.reject(absent()); await rejected; restore(); await f.close() }
  }
})

it('deduplicates sampling errors, preserves bigint fingerprints and observes recovery', async () => {
  const f = await fixture()
  mkdirSync(dirname(f.filename), { recursive: true }); writeFileSync(f.filename, 'present')
  const initial = await io.stat(f.filename, { bigint: true })
  let result: Fingerprint | Error = initial
  const restore = intercept(f.filename, () => result instanceof Error ? Promise.reject(result) : Promise.resolve(result))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let refreshes = 0; let failures = 0
  f.ctx.on('hmr/config-update-failed', () => { failures++ })
  try {
    const dispose = await f.ctx.hmr.registerConfig(f.filename, () => { refreshes++ })
    expect(refreshes).toBe(1)
    result = denied(); await tick(); await tick()
    expect(failures).toBe(1); expect(refreshes).toBe(1)
    for (const [index, field] of (['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const).entries()) {
      result = { ...initial, [field]: initial[field] + 1n }; await tick()
      expect(refreshes).toBe(index + 2)
    }
    result = denied(); await tick(); expect(failures).toBe(2)
    await dispose(); expect(vi.getTimerCount()).toBe(0)
  } finally { await f.close(); vi.useRealTimers(); restore() }
})

it('allows an error listener to await disposal and contains its later rejection', async () => {
  const f = await fixture()
  let samples = 0
  const restore = intercept(f.filename, () => Promise.reject(++samples === 1 ? absent() : denied()))
  const listener = Promise.withResolvers<undefined>()
  const finish = Promise.withResolvers<undefined>()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  f.ctx.on('hmr/config-update-failed', async () => {
    await f.ctx.fiber.dispose()
    listener.resolve(undefined)
    await finish.promise
    throw new Error('listener rejected after closure')
  })
  try {
    await f.ctx.hmr.registerConfig(f.filename, () => { throw new Error('unexpected refresh') })
    await tick(); await listener.promise
    finish.resolve(undefined); await tick(1000)
    expect(samples).toBe(2); expect(vi.getTimerCount()).toBe(0)
    expect((f.hmr as unknown as { configReports: Set<unknown> }).configReports.size).toBe(0)
  } finally { finish.resolve(undefined); await f.close(); vi.useRealTimers(); restore() }
})

it('validates exact options and environment overrides while preserving module and native routes', async () => {
  const parse = Hmr.Config as (value: unknown) => Hmr.Config
  for (const value of [{ interval: 0 }, { interval: 1.5 }, { binaryInterval: -1 }, { usePolling: 'false' }]) expect(() => parse(value)).toThrow()
  const root = await io.realpath(mkdtempSync(join(tmpdir(), 'dsh-hmr-options-')))
  const priorPolling = process.env.CHOKIDAR_USEPOLLING
  const priorInterval = process.env.CHOKIDAR_INTERVAL
  const native = vi.spyOn(fs, 'watch')
  syncBuiltinESMExports()
  try {
    delete process.env.CHOKIDAR_USEPOLLING; delete process.env.CHOKIDAR_INTERVAL
    for (const choice of [undefined, false, true]) {
      native.mockClear()
      const ctx = await boot(root, choice === undefined ? {} : { usePolling: choice })
      try {
        await ctx.hmr.registerConfig('plugins.yml', () => {})
        expect(native.mock.calls.length > 0).toBe(choice === false)
      } finally { await ctx.fiber.dispose() }
    }
    const module = await boot(root, { root: ['.'] })
    try { expect((module.hmr as unknown as { watcher: { options: { usePolling: boolean } } }).watcher.options.usePolling).toBe(false) }
    finally { await module.fiber.dispose() }
    for (const value of ['false', '0', 'true', '1']) {
      process.env.CHOKIDAR_USEPOLLING = value
      process.env.CHOKIDAR_INTERVAL = '35'
      native.mockClear()
      const ctx = await boot(root, { usePolling: value === 'false' || value === '0' })
      try {
        await ctx.hmr.registerConfig('plugins.yml', () => {})
        expect(native.mock.calls.length > 0).toBe(value === 'false' || value === '0')
      } finally { await ctx.fiber.dispose() }
    }
    for (const [key, value] of [['CHOKIDAR_USEPOLLING', 'maybe'], ['CHOKIDAR_INTERVAL', '20junk'], ['CHOKIDAR_INTERVAL', '0']]) {
      delete process.env.CHOKIDAR_USEPOLLING; delete process.env.CHOKIDAR_INTERVAL
      process.env[key!] = value
      const ctx = await boot(root)
      try { await expect(ctx.hmr.registerConfig('plugins.yml', () => {})).rejects.toThrow(key) }
      finally { await ctx.fiber.dispose() }
    }
  } finally {
    native.mockRestore(); syncBuiltinESMExports()
    if (priorPolling === undefined) delete process.env.CHOKIDAR_USEPOLLING
    else process.env.CHOKIDAR_USEPOLLING = priorPolling
    if (priorInterval === undefined) delete process.env.CHOKIDAR_INTERVAL
    else process.env.CHOKIDAR_INTERVAL = priorInterval
    rmSync(root, { recursive: true, force: true })
  }
})

it('does not retry a failed refresh when sampled state is unchanged', async () => {
  const f = await fixture()
  mkdirSync(dirname(f.filename), { recursive: true }); writeFileSync(f.filename, 'existing')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let calls = 0
  try {
    const dispose = await f.ctx.hmr.registerConfig(f.filename, () => { calls++; throw new Error('refresh failed') })
    await tick(300)
    expect(calls).toBe(1)
    await dispose()
  } finally { await f.close(); vi.useRealTimers() }
})

it('uses the validated environment interval without changing the initial observation', async () => {
  const f = await fixture()
  const prior = process.env.CHOKIDAR_INTERVAL
  let samples = 0
  const restore = intercept(f.filename, () => { samples++; return Promise.reject(absent()) })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    process.env.CHOKIDAR_INTERVAL = '35'
    const dispose = await f.ctx.hmr.registerConfig(f.filename, () => {})
    expect(samples).toBe(1)
    await tick(34); expect(samples).toBe(1)
    await tick(1); expect(samples).toBe(2)
    await dispose(); await tick(1000); expect(samples).toBe(2)
    process.env.CHOKIDAR_INTERVAL = '2147483648'
    await expect(f.ctx.hmr.registerConfig(f.filename, () => {})).rejects.toThrow('32-bit')
  } finally {
    if (prior === undefined) delete process.env.CHOKIDAR_INTERVAL
    else process.env.CHOKIDAR_INTERVAL = prior
    await f.close(); vi.useRealTimers(); restore()
  }
})
