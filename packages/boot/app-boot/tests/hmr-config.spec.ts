import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Hmr from '@deepseek-ai/cordis-plugin-hmr'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Timer from '@deepseek-ai/cordis-plugin-timer'
import { describe, expect, it, vi } from 'vitest'

async function bootHmr(dir: string, root: string[] = [], usePolling?: boolean): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(dir).href + '/'
  await ctx.plugin(Loader)
  await ctx.plugin(Timer)
  await ctx.plugin(Hmr, {
    root,
    ignored: [],
    debounce: 0,
    ...usePolling === undefined ? {} : { usePolling },
  })
  return ctx
}

async function eventually(test: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!test()) {
    if (Date.now() >= deadline) throw new Error(message)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

describe('HMR exact config paths', () => {
  it('observes module changes when its watch base is a filesystem alias', { timeout: 30_000 }, async () => {
    const target = mkdtempSync(join(tmpdir(), 'dsh-hmr-module-canonical-'))
    const alias = `${target}-alias`
    const aliasFilename = join(alias, 'module.ts')
    symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
    writeFileSync(aliasFilename, 'export const generation = 0\n')
    // This acceptance owns alias-to-cache identity. Other cases below exercise
    // native events; polling keeps Windows fs.watch queue pressure out of it.
    const ctx = await bootHmr(alias, ['.'], true)
    const filename = join(await realpath(target), 'module.ts')
    const expected = pathToFileURL(filename).href
    const cacheHas = vi.spyOn(ctx.loader.internal!.loadCache, 'has').mockReturnValue(false)
    const observed: string[] = []
    ctx.on('hmr/change', (url) => { observed.push(url) })
    try {
      const deadline = Date.now() + 20_000
      for (let generation = 1; !observed.includes(expected); generation += 1) {
        if (Date.now() >= deadline) {
          throw new Error(`HMR did not observe ${expected} through the alias; observed ${JSON.stringify(observed)}`)
        }
        // The watch base, not the writer spelling, is the alias under test.
        // Grow the file on every write: polling must not depend on timestamp
        // precision when several generations land inside one filesystem tick.
        writeFileSync(filename, `export const generation = ${generation}\n${' '.repeat(generation)}\n`)
        // Leave Chokidar's atomic-write window idle so one coalesced change can publish.
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      expect(cacheHas).toHaveBeenCalledWith(expected)
    } finally {
      await ctx.fiber.dispose()
      unlinkSync(alias)
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('collapses filesystem aliases before registering an exact watch', async () => {
    const target = mkdtempSync(join(tmpdir(), 'dsh-hmr-canonical-'))
    const alias = `${target}-alias`
    symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const ctx = await bootHmr(alias)
    try {
      await ctx.hmr.registerConfig('plugins.yml', () => {})
      await expect(ctx.hmr.registerConfig(join(await realpath(target), 'plugins.yml'), () => {}))
        .rejects.toThrow('config path already registered')
    } finally {
      await ctx.fiber.dispose()
      unlinkSync(alias)
      rmSync(target, { recursive: true, force: true })
    }
  })

  it('observes add, change, and unlink outside its module roots', { timeout: 90_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-hmr-config-'))
    const filename = join(dir, 'plugins.yml')
    // Polling keeps topology-sensitive native watcher queue loss out of this
    // backend-neutral config lifecycle assertion.
    const ctx = await bootHmr(dir, [], true)
    const observed: string[] = []
    const waiters: Array<{ resolve(value: string): void }> = []
    const unexpected: string[] = []
    const sequenceDeadline = Promise.withResolvers<never>()
    let waitingFor = 'creation'
    let disposeConfig: (() => Promise<void>) | undefined
    let configDisposal: Promise<void> | undefined
    let configDisposed = false
    let contextDisposed = false
    let fixtureRemoved = false

    const nextUpdate = (label: string, trigger: () => void): Promise<string> => {
      waitingFor = label
      const waiter = Promise.withResolvers<string>()
      const entry = {
        resolve(value: string) {
          waiter.resolve(value)
        },
      }
      waiters.push(entry)
      try {
        trigger()
      } catch (error) {
        const index = waiters.indexOf(entry)
        if (index >= 0) waiters.splice(index, 1)
        throw error
      }
      return Promise.race([waiter.promise, sequenceDeadline.promise])
    }
    try {
      disposeConfig = await ctx.hmr.registerConfig(filename, () => {
        let value: string
        try {
          value = readFileSync(filename, 'utf8')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          value = 'missing'
        }
        observed.push(value)
        const waiter = waiters.shift()
        if (waiter === undefined) unexpected.push(value)
        else waiter.resolve(value)
      })

      const sequenceTimer = setTimeout(() => {
        sequenceDeadline.reject(new Error(
          `HMR config event sequence timed out while awaiting ${waitingFor}; `
          + `observed ${JSON.stringify(observed)}, unexpected ${JSON.stringify(unexpected)}`,
        ))
      }, 75_000)
      try {
        await expect(nextUpdate('creation', () => {
          writeFileSync(filename, 'one', { flag: 'wx' })
        })).resolves.toBe('one')
        await expect(nextUpdate('change', () => { writeFileSync(filename, 'two') })).resolves.toBe('two')
        await expect(nextUpdate('removal', () => { unlinkSync(filename) })).resolves.toBe('missing')
      } finally {
        clearTimeout(sequenceTimer)
      }

      configDisposal = disposeConfig()
      await configDisposal
      configDisposed = true
    } finally {
      try {
        if (disposeConfig !== undefined) {
          configDisposal ??= disposeConfig()
          await configDisposal
          configDisposed = true
        }
      } finally {
        try {
          await ctx.fiber.dispose()
          contextDisposed = true
        } finally {
          rmSync(dir, { recursive: true, force: true })
          fixtureRemoved = !existsSync(dir)
        }
      }
    }

    expect(observed).toEqual(['one', 'two', 'missing'])
    expect(waiters).toHaveLength(0)
    expect(unexpected).toEqual([])
    expect(configDisposed).toBe(true)
    expect(contextDisposed).toBe(true)
    expect(fixtureRemoved).toBe(true)
  })

  it('observes creation when the config parent did not exist at registration', { timeout: 20_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-hmr-config-'))
    const dir = join(root, 'later')
    const filename = join(dir, 'plugins.yml')
    const ctx = await bootHmr(root)
    const observed: string[] = []
    try {
      await ctx.hmr.registerConfig(filename, () => {
        observed.push(readFileSync(filename, 'utf8'))
      })
      mkdirSync(dir)
      writeFileSync(filename, 'created')
      await eventually(() => observed.includes('created'), 'HMR did not observe config creation under a new parent')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('serializes refreshes and waits for them during disposal', { timeout: 20_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-hmr-config-'))
    const filename = join(dir, 'plugins.yml')
    writeFileSync(filename, 'one')
    const ctx = await bootHmr(dir)
    const started = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    const observed: string[] = []
    let active = 0
    let maxActive = 0
    try {
      const dispose = await ctx.hmr.registerConfig(filename, async () => {
        active += 1
        maxActive = Math.max(maxActive, active)
        observed.push(readFileSync(filename, 'utf8'))
        if (observed.length === 1) {
          started.resolve(undefined)
          await release.promise
        }
        active -= 1
      })
      await started.promise
      writeFileSync(filename, 'two')
      // Chokidar coalesces atomic writes for 100 ms by default. Wait beyond
      // that window so this edit is queued before registration disposal.
      await new Promise(resolve => setTimeout(resolve, 250))

      let disposed = false
      const disposal = dispose().then(() => { disposed = true })
      await Promise.resolve()
      expect(disposed).toBe(false)
      release.resolve(undefined)
      await disposal
      expect(maxActive).toBe(1)
      expect(observed).toEqual(['one', 'two'])
    } finally {
      release.resolve(undefined)
      await ctx.fiber.dispose()
    }
  })

  it('normalizes refresh failures and broadcasts them without escaping the watcher', { timeout: 20_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-hmr-config-'))
    const filename = join(dir, 'plugins.yml')
    const ctx = await bootHmr(dir)
    const failure = Promise.withResolvers<{ filename: string; error: Error }>()
    let failureCount = 0
    try {
      ctx.on('hmr/config-update-failed', () => {
        throw new Error('observer failed')
      })
      ctx.on('hmr/config-update-failed', (failedFilename, error) => {
        failureCount += 1
        failure.resolve({ filename: failedFilename, error })
      })
      await ctx.hmr.registerConfig(filename, () => { throw 42 })
      writeFileSync(filename, 'invalid')

      const observed = await failure.promise
      expect(observed.filename).toBe(filename)
      expect(observed.error).toBeInstanceOf(Error)
      expect(observed.error.message).toBe('42')

      // Let Chokidar's atomic-write window close before requiring a distinct
      // second notification from the same path.
      await new Promise(resolve => setTimeout(resolve, 250))
      writeFileSync(filename, 'invalid again')
      await eventually(() => failureCount === 2, 'HMR stopped broadcasting after an observer rejected')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
