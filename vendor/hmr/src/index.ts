import { Context, Service, type Plugin } from '@deepseek-ai/cordis'
import type { Dict } from '@deepseek-ai/cosmokit'
import { ModuleLoader, type ModuleJob, type ResolveResult } from '@deepseek-ai/cordis-plugin-loader'
import type { Include } from '@deepseek-ai/cordis-plugin-include'
import { FSWatcher, watch, type ChokidarOptions } from 'chokidar'
import { dirname, relative, resolve } from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import { handleError } from './error.ts'
import type {} from '@deepseek-ai/cordis-plugin-timer'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import picomatch from 'picomatch'
import z from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/cordis' {
  interface Context {
    hmr: Hmr
  }

  interface Events {
    'hmr/change'(url: string): void
    'hmr/reload'(reloads: Map<Plugin, Reload>): void
    /**
     * A watched config-file refresh failed.
     * @param filename - Absolute path observed by HMR.
     * @param error - Normalized refresh failure.
     * @mode parallel
     */
    'hmr/config-update-failed'(filename: string, error: Error): Promise<void> | void
  }
}

/**
 * Recursively collect all module dependencies from a ModuleJob.
 * Skips node: builtins and node_modules to focus on user code.
 */
async function loadDependencies(job: ModuleJob, ignored = new Set<string>()) {
  const dependencies = new Set<string>()
  async function traverse(job: ModuleJob) {
    if (ignored.has(job.url) || dependencies.has(job.url)) return
    if (job.url.startsWith('node:') || job.url.includes('/node_modules/')) return
    dependencies.add(job.url)
    const children = await job.linked
    await Promise.all(Array.prototype.map.call(children, traverse))
  }
  await traverse(job)
  return dependencies
}

interface Reload {
  filename: string
  runtime?: Plugin.Runtime
}

interface ConfigRefresh {
  dirty: boolean
  running?: Promise<void>
}

interface ConfigRegistration {
  close(): Promise<void>
}

async function findWatchRoot(filename: string): Promise<{ filename: string; root: string; depth: number }> {
  let root = dirname(filename)
  let depth = 0
  while (true) {
    try {
      if (!(await stat(root)).isDirectory()) throw new Error(`config watch parent is not a directory: ${root}`)
      const canonicalRoot = await realpath(root)
      return {
        filename: resolve(canonicalRoot, relative(root, filename)),
        root: canonicalRoot,
        depth,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = dirname(root)
      if (parent === root) throw error
      root = parent
      depth += 1
    }
  }
}

function exactConfigOptions(config: Hmr.Config): { usePolling: boolean; interval: number } {
  const environment = process.env.CHOKIDAR_USEPOLLING?.toLowerCase()
  if (environment !== undefined && !['true', 'false', '1', '0'].includes(environment)) throw new Error('CHOKIDAR_USEPOLLING must be true, false, 1 or 0')
  const usePolling = environment === undefined ? config.usePolling ?? true : environment === 'true' || environment === '1'
  const value = process.env.CHOKIDAR_INTERVAL
  if (value !== undefined && !/^[1-9]\d*$/u.test(value)) throw new Error('CHOKIDAR_INTERVAL must be a positive integer')
  const interval = value === undefined ? config.interval ?? 100 : Number(value)
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > 2_147_483_647) throw new Error('Config polling interval must be a positive 32-bit timer integer')
  return { usePolling, interval }
}

class Hmr extends Service {
  static inject = ['loader', 'timer']

  public baseDir: string

  private internal: ModuleLoader
  private watcher!: FSWatcher
  private stopped = false
  private readonly ownedConfigs = new Set<ConfigRegistration>()
  private readonly configReports = new Set<Promise<void>>()
  private readonly configs = new Map<string, ConfigRegistration>()
  private readonly configRefreshes = new WeakMap<object, ConfigRefresh>()
  private readonly refreshTasks = new Set<Promise<void>>()

  /**
   * Changes from externals will always trigger a full reload.
   * Externals are the dependency tree of the CLI worker entry point.
   */
  private externals!: Set<string>

  /**
   * Files that should be reloaded (accepted changes).
   * Includes all stashed files and their dependents.
   */
  private accepted!: Set<string>

  /**
   * Files that should NOT be reloaded.
   * Includes externals and files whose dependents are all declined.
   */
  private declined!: Set<string>

  /** Stashed file changes waiting to be processed */
  private stashed = new Set<string>()

  constructor(ctx: Context, public config: Hmr.Config) {
    super(ctx, 'hmr')
    if (!this.ctx.loader.internal) {
      throw new Error('--expose-internals is required for HMR service')
    }
    this.internal = this.ctx.loader.internal
    this.baseDir = fileURLToPath(new URL(config.base || '.', ctx.baseUrl))
  }

  /**
   * Watch one exact config path outside the configured module roots.
   * Default sampling records initial target state before returning and performs no directory polling.
   * Explicit native mode retains OS startup limits. The initial ancestor must retain its identity.
   * @param filename - Config path, resolved against the HMR base directory.
   * @param refresh - Refresh callback run serially on add, change, or unlink.
   * @returns an asynchronous disposer once the exact watch is ready.
   * @throws when HMR is inactive, the path is already registered, or watcher startup fails.
   */
  async registerConfig(filename: string, refresh: () => Promise<void> | void): Promise<() => Promise<void>> {
    if (!this.watcher || this.stopped) throw new Error('HMR is not active')
    filename = resolve(this.baseDir, filename)
    const options = exactConfigOptions(this.config)
    if (options.usePolling) return this.registerSampledConfig(filename, refresh, options.interval)
    const target = await findWatchRoot(filename)
    const watchFilename = target.filename
    if (this.configs.has(watchFilename)) throw new Error(`config path already registered: ${filename}`)

    const { root, depth } = target
    const requiredPaths = new Set([watchFilename])
    for (let path = dirname(watchFilename);; path = dirname(path)) {
      requiredPaths.add(path)
      if (path === root) break
    }
    const watcher = watch(root, {
      ...this.config,
      usePolling: false,
      cwd: undefined,
      depth,
      ignored: path => !requiredPaths.has(resolve(path)),
      ignoreInitial: false,
    })
    const registration = { close: async () => {
      await watcher.close()
      await this.configRefreshes.get(registration)?.running
    } }
    this.configs.set(watchFilename, registration)
    const onChange = (path: string) => {
      const observed = resolve(path)
      if (observed !== filename && observed !== watchFilename) return
      this.refreshConfig(registration, filename, refresh)
    }
    watcher.on('add', onChange)
    watcher.on('change', onChange)
    watcher.on('unlink', onChange)

    const ready = Promise.withResolvers<void>()
    let readyState: 'pending' | 'resolved' | 'rejected' = 'pending'
    watcher.once('ready', () => {
      readyState = 'resolved'
      ready.resolve()
    })
    watcher.on('error', (error) => {
      if (readyState === 'pending') {
        readyState = 'rejected'
        ready.reject(error)
      } else {
        this.ctx.logger.warn(error)
      }
    })

    try {
      await ready.promise
      return this.ctx.effect(() => async () => {
        if (this.configs.get(watchFilename) === registration) this.configs.delete(watchFilename)
        await watcher.close()
        await this.configRefreshes.get(registration)?.running
      }, 'hmr.registerConfig()')
    } catch (error) {
      this.configs.delete(watchFilename)
      await watcher.close()
      throw error
    }
  }

  private async registerSampledConfig(filename: string, refresh: () => Promise<void> | void, interval: number): Promise<() => Promise<void>> {
    let stopped = false
    let raw: Promise<unknown> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let closing: Promise<void> | undefined
    let identity: string | undefined
    let previous: string | null = null
    let failure: string | undefined
    const registration: ConfigRegistration = { close: () => {
      if (closing) return closing
      stopped = true
      clearTimeout(timer)
      closing = (async () => {
        try { await raw } catch { /* Setup or the cycle owns the raw I/O error. */ }
        if (identity !== undefined && this.configs.get(identity) === registration) this.configs.delete(identity)
        await this.configRefreshes.get(registration)?.running
        this.ownedConfigs.delete(registration)
      })()
      return closing
    } }
    this.ownedConfigs.add(registration)
    const dispose = this.ctx.effect(() => registration.close, 'hmr.registerConfig()')
    const sample = async (): Promise<string | null> => {
      const operation = stat(identity!, { bigint: true })
      raw = operation
      try {
        const value = await operation
        return [value.dev, value.ino, value.mode, value.size, value.mtimeNs, value.ctimeNs].join(':')
      } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes(String((error as NodeJS.ErrnoException).code))) return null
        throw error
      } finally { if (raw === operation) raw = undefined }
    }
    const schedule = () => {
      if (!stopped) timer = setTimeout(() => { void cycle() }, interval)
    }
    const cycle = async () => {
      let observation: string | null
      try { observation = await sample() }
      catch (reason) {
        if (stopped) return
        const error = reason instanceof Error ? reason : new Error(String(reason), { cause: reason })
        const key = `${error.name}:${String((error as NodeJS.ErrnoException).code)}:${error.message}`
        if (failure !== key) {
          failure = key
          this.reportConfigSamplingFailure(filename, error)
        }
        schedule()
        return
      }
      if (stopped) return
      failure = undefined
      if (previous !== observation) {
        previous = observation
        this.refreshConfig(registration, filename, refresh)
      }
      schedule()
    }
    try {
      const resolution = findWatchRoot(filename)
      raw = resolution
      let target: Awaited<typeof resolution>
      try { target = await resolution } finally { if (raw === resolution) raw = undefined }
      if (stopped) throw new Error('Config registration closed during setup')
      identity = target.filename
      if (this.configs.has(identity)) throw new Error(`config path already registered: ${filename}`)
      this.configs.set(identity, registration)
      previous = await sample()
      if (stopped) throw new Error('Config registration closed during setup')
      schedule()
      if (previous !== null) this.refreshConfig(registration, filename, refresh)
      return () => {
        const completion = registration.close()
        dispose()
        return completion
      }
    } catch (error) { await registration.close(); throw error }
  }

  private reportConfigSamplingFailure(filename: string, error: Error): void {
    this.ctx.logger.warn('config sampling at %C failed', filename)
    this.ctx.logger.warn(error)
    // Listeners may await disposal; cleanup never awaits this notification.
    const report = this.ctx.parallel('hmr/config-update-failed', filename, error).catch((rejection: unknown) => {
      this.ctx.logger.warn(rejection)
    }).finally(() => { this.configReports.delete(report) })
    this.configReports.add(report)
  }

  /**
   * Resolve a module specifier to a URL, compatible with Node 22-24.
   */
  private async _resolve(specifier: string, parentURL: string, attrs: ImportAttributes): Promise<ResolveResult> {
    switch (this.internal.version) {
      case 'v1': return await this.internal.resolve(specifier, parentURL, attrs)
      case 'v2': return this.internal.resolveSync(parentURL, { specifier, attributes: attrs })
    }
  }

  async* [Service.init]() {
    yield async () => {
      this.stopped = true
      const closing = [...new Set([...this.ownedConfigs, ...this.configs.values()])].map(registration => registration.close())
      await this.watcher?.close()
      await Promise.allSettled(closing)
      this.configs.clear()
      await Promise.allSettled([...this.refreshTasks])
    }

    const { loader } = this.ctx
    const { root, ignored } = this.config
    if (!this.config.base) {
      this.ctx.logger.info('watching %o', root)
    } else {
      this.ctx.logger.info('watching %o in %s', root, this.baseDir)
    }

    const match = picomatch(ignored)
    const watchBaseDir = await realpath(this.baseDir)

    // Collect externals before opening the watcher so every post-ready change
    // is observed by listeners that already have their classification state.
    const mainUrl = pathToFileURL(resolve(process.argv[1])).href
    const mainJob = this.internal.loadCache.get(mainUrl)
    if (mainJob) {
      this.externals = await loadDependencies(mainJob)
    } else {
      this.externals = new Set()
    }

    this.watcher = watch(root, {
      ...this.config,
      cwd: watchBaseDir,
      ignored: path => match(relative(watchBaseDir, path)),
      // The initial scan re-announces files the boot just consumed: an `add`
      // for a config file refreshes an include whose initial apply may still
      // be in flight, and a failing apply then rolls this plugin back while
      // the scan-triggered refresh waits on that apply — a teardown deadlock
      // that strands boot without a diagnostic. Only events after the scan
      // matter here; `registerConfig` keeps its own initial scan because a
      // user patch layer present at registration must apply once.
      ignoreInitial: true,
    })

    const partialReload = this.ctx.debounce(() => this.partialReload(), this.config.debounce)

    const onChange = (kind: 'add' | 'change' | 'unlink', path: string) => {
      this.ctx.logger.debug('%s detected at %C', kind, path)
      const filename = resolve(watchBaseDir, path)
      const configuredFilename = resolve(this.baseDir, path)
      // Config reload: the file is a loader config file (e.g. cordis.yml).
      for (const entry of loader.entries()) {
        const include = entry.subtree as Include | undefined
        if (include?.filename !== filename && include?.filename !== configuredFilename) continue
        this.refreshConfig(include, include.filename, () => include.refresh())
        return
      }

      if (kind !== 'change') return
      const url = pathToFileURL(filename).href

      // Full reload: the changed file is part of the framework
      if (this.externals.has(url)) return loader.exit()

      // Partial reload: the file is in the ESM loadCache
      // In Node 24, both CJS and ESM modules imported via import() end up
      // in loadCache, so this check covers all module formats.
      if (loader.internal!.loadCache.has(url)) {
        this.stashed.add(url)
        return partialReload()
      }

      this.ctx.emit('hmr/change', url)
    }
    this.watcher.on('add', path => onChange('add', path))
    this.watcher.on('change', path => onChange('change', path))
    this.watcher.on('unlink', path => onChange('unlink', path))

    const ready = Promise.withResolvers<void>()
    let readyState: 'pending' | 'resolved' | 'rejected' = root.length === 0 ? 'resolved' : 'pending'
    if (root.length === 0) {
      ready.resolve()
    } else {
      this.watcher.once('ready', () => {
        readyState = 'resolved'
        ready.resolve()
      })
    }
    this.watcher.on('error', (error) => {
      if (readyState === 'pending') {
        readyState = 'rejected'
        ready.reject(error)
      } else {
        this.ctx.logger.warn(error)
      }
    })
    await ready.promise
  }

  private refreshConfig(key: object, filename: string, refresh: () => Promise<void> | void) {
    const state = this.configRefreshes.get(key) ?? { dirty: false }
    this.configRefreshes.set(key, state)
    state.dirty = true
    if (state.running) return
    const task = (async () => {
      do {
        state.dirty = false
        try {
          await refresh()
        } catch (reason) {
          const error = reason instanceof Error ? reason : new Error(String(reason), { cause: reason })
          this.ctx.logger.warn('config reload at %C failed', filename)
          this.ctx.logger.warn(error)
          try {
            await this.ctx.parallel('hmr/config-update-failed', filename, error)
          } catch (rejection) {
            this.ctx.logger.warn(rejection)
          }
        }
      } while (state.dirty)
    })().finally(() => {
      state.running = undefined
      this.refreshTasks.delete(task)
    })
    state.running = task
    this.refreshTasks.add(task)
  }

  // hide stack trace from HMR
  getOuterStack = (): string[] => [
    // '    at HMR.partialReload (<anonymous>)',
  ]

  async getLinked(url: string) {
    const job = this.internal.loadCache.get(url)
    if (!job) return []
    const linked = await job.linked
    return Array.prototype.map.call(linked, (job: ModuleJob) => job.url) as string[]
  }

  /**
   * Classify changed files into accepted (should reload) and declined (should not).
   *
   * A file is accepted if it's directly changed (stashed) or if any of its
   * dependents are accepted. A file is declined if all its dependents are
   * declined or if it's an external.
   */
  private async analyzeChanges() {
    const pending: string[] = []

    this.accepted = new Set(this.stashed)
    this.declined = new Set(this.externals)

    const isExcluded = (url: string) => url.startsWith('node:') || url.includes('/node_modules/')

    await Promise.all([...this.stashed].map(async (url) => {
      const children = await this.getLinked(url)
      for (const child of children) {
        if (this.accepted.has(child) || this.declined.has(child) || isExcluded(child)) continue
        pending.push(child)
      }
    }))

    while (pending.length) {
      let index = 0, hasUpdate = false
      while (index < pending.length) {
        const url = pending[index]
        const children = await this.getLinked(url)
        let isDeclined = true, isAccepted = false
        for (const child of children) {
          if (this.declined.has(child) || isExcluded(child)) continue
          if (this.accepted.has(child)) {
            isAccepted = true
            break
          } else {
            isDeclined = false
            if (!pending.includes(child)) {
              hasUpdate = true
              pending.push(child)
            }
          }
        }
        if (isAccepted || isDeclined) {
          hasUpdate = true
          pending.splice(index, 1)
          if (isAccepted) {
            this.accepted.add(url)
          } else {
            this.declined.add(url)
          }
        } else {
          index++
        }
      }
      if (!hasUpdate) break
    }

    for (const url of pending) {
      this.declined.add(url)
    }
  }

  private async partialReload() {
    await this.analyzeChanges()

    const pending = new Map<ModuleJob, Plugin>()
    const reloads = new Map<Plugin, Reload>()

    // Build a map of plugin names per config tree URL.
    // Plugin entry files are treated as atomic reload units.
    const nameMap: Dict<Set<string>> = Object.create(null)
    for (const entry of this.ctx.loader.entries()) {
      (nameMap[entry.parent.tree.ctx.baseUrl!] ??= new Set()).add(entry.options.name)
    }

    // Resolve each plugin name to its file URL and check if it needs reload
    for (const baseUrl in nameMap) {
      for (const name of nameMap[baseUrl]) {
        try {
          const { url } = await this._resolve(name, baseUrl, {})
          if (this.declined.has(url)) continue
          const job = this.internal.loadCache.get(url)
          const plugin = this.ctx.loader.unwrapExports(job?.module?.getNamespace())
          if (!job || !plugin) continue
          pending.set(job, plugin)
          this.declined.add(url)
        } catch (err) {
          this.ctx.logger.warn(err)
        }
      }
    }

    // Check each pending plugin's dependency tree for accepted files
    for (const [job, plugin] of pending) {
      this.declined.delete(job.url)
      const dependencies = [...await loadDependencies(job, this.declined)]
      this.declined.add(job.url)

      if (!dependencies.some(dep => this.accepted.has(dep))) continue
      dependencies.forEach(dep => this.accepted.add(dep))

      reloads.set(plugin, {
        filename: job.url,
        runtime: this.ctx.registry.get(plugin),
      })
    }

    /**
     * Clear module caches for all accepted files before re-importing.
     *
     * We need to clear both:
     * 1. ESM loadCache — managed by Node's internal ModuleLoader
     * 2. CJS Module._cache — for CJS modules that were imported via import()
     *
     * In Node 24, CJS modules loaded via import() appear in both caches.
     * If we only clear loadCache, the CJS cache may serve stale modules.
     *
     * We use Map.prototype methods directly on loadCache because:
     * - In Node 22/23, loadCache is a plain Map<url, ModuleJob>
     * - In Node 24, loadCache is a LoadCache extends Map<url, { [type]: ModuleJob }>
     *   where .delete() only sets the type slot to undefined (doesn't remove the entry)
     * Using Map.prototype.delete ensures complete removal in both versions.
     */
    const esmBackup: Dict = Object.create(null)
    const cjsBackup: Dict = Object.create(null)
    const require = createRequire(import.meta.url)
    for (const filename of this.accepted) {
      // Backup and clear ESM loadCache
      const job = Map.prototype.get.call(this.internal.loadCache, filename)
      esmBackup[filename] = job
      Map.prototype.delete.call(this.internal.loadCache, filename)

      // Backup and clear CJS Module._cache
      try {
        const filepath = fileURLToPath(filename)
        if (require.cache[filepath]) {
          cjsBackup[filepath] = require.cache[filepath]
          delete require.cache[filepath]
        }
      } catch {
        // filename might not be a file: URL (e.g. node: protocol), ignore
      }
    }

    const rollback = () => {
      for (const filename in esmBackup) {
        Map.prototype.set.call(this.internal.loadCache, filename, esmBackup[filename])
      }
      for (const filepath in cjsBackup) {
        require.cache[filepath] = cjsBackup[filepath]
      }
    }

    // Attempt to re-import all plugin entry files
    const attempts: Dict = {}
    try {
      for (const [, { filename }] of reloads) {
        attempts[filename] = this.ctx.loader.unwrapExports(await this.ctx.loader.import(filename, this.getOuterStack))
      }
    } catch (e) {
      handleError(this.ctx, e)
      return rollback()
    }

    const reload = (plugin: any, runtime: Plugin.Runtime) => {
      if (!runtime) return
      for (const oldFiber of runtime.fibers) {
        const fiber = oldFiber.parent.registry.plugin(plugin, oldFiber._config, this.getOuterStack)
        fiber.entry = oldFiber.entry
        if (fiber.entry) fiber.entry.fiber = fiber
      }
    }

    try {
      for (const [plugin, { filename, runtime }] of reloads) {
        if (!runtime) continue
        const path = relative(this.baseDir, fileURLToPath(filename))

        try {
          this.ctx.registry.delete(plugin)
        } catch (err) {
          this.ctx.logger.warn('failed to dispose plugin at %C', path)
          this.ctx.logger.warn(err)
        }

        try {
          reload(attempts[filename], runtime)
          this.ctx.logger.info('reload plugin at %C', path)
        } catch (err) {
          this.ctx.logger.warn('failed to reload plugin at %C', path)
          this.ctx.logger.warn(err)
          throw err
        }
      }
    } catch {
      // Rollback: restore caches and re-register old plugins
      rollback()
      for (const [plugin, { filename, runtime }] of reloads) {
        if (!runtime) continue
        try {
          this.ctx.registry.delete(attempts[filename])
          reload(plugin, runtime)
        } catch (err) {
          this.ctx.logger.warn(err)
        }
      }
      return
    }

    this.ctx.emit('hmr/reload', reloads)
    this.stashed = new Set()
  }
}

namespace Hmr {
  export interface Config extends ChokidarOptions {
    base?: string
    root: string[]
    debounce: number
    ignored: string[]
  }

  export const Config: z<Config> = z.object({
    base: z.string(),
    root: z.array(String).role('table').default(['.']),
    ignored: z.array(String).role('table').default([
      '**/node_modules',
      '**/.*',
      'cache',
      'data',
    ]),
    debounce: z.natural().role('ms').default(100),
    usePolling: z.boolean(),
    interval: z.natural().min(1).max(2_147_483_647).role('ms'),
    binaryInterval: z.natural().min(1).role('ms'),
  })
  // [deepseek-harness] vendored modification: removed `.i18n({ 'en-US': enUS, 'zh-CN': zhCN })`
  // and the corresponding `./locales/*.yml` imports, to avoid a runtime YAML import hook
  // (@cordisjs/unyaml) that we don't vendor. See vendor/README.md.
}

export default Hmr
