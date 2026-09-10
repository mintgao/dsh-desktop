/** Compose real native menu and renderer observations on a disposable runner. */
import assert from 'node:assert/strict'
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { object, digest } from './evidence.ts'
import { NativeNotificationObserver } from './migration-native-notifications.ts'
import { NativeReleaseFixture } from './migration-native-release.ts'
import { nativeUpdatePreference } from './migration-native-menu.ts'
import { acknowledgeNativeWelcome, nativeAppearance, nativeBrowserState, nativeTranscript, nativeComposer, nativeNotificationSettings, withNativeBrowser, type NativeBrowserState } from './migration-native-browser.ts'
import type { MigrationDebugger } from './migration-debugger.ts'
import type { NativeMigrationVisitor } from './migration-native.ts'

const electron = "process.getBuiltinModule('module').createRequire(process.execPath)('electron')"

async function inspect(connection: MigrationDebugger, expression: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const result = await connection.send('Runtime.evaluate', { expression, returnByValue: true }, signal)
  if (result['exceptionDetails'] !== undefined) throw new Error(JSON.stringify(result['exceptionDetails']))
  return object(object(result['result'])['value'])
}

/** Options supplied by the fixture owner for one real process. */
export interface NativeVisitorOptions {
  root: string
  evidence: string
  stage: 'populate' | 'upgrade' | 'reopen' | 'restore'
  notificationSource: string
  architecture: 'arm64' | 'x64'
  previousBrowser?: NativeBrowserState
  previousPreferences?: Record<string, unknown>
}

/** Build a visitor whose evidence comes only from actual native/UI actions.
 * @param options - Private fixture paths and preceding observed values.
 * @returns Hooks for the normal-main runner; creating hooks launches nothing.
 */
export function migrationNativeVisitor(options: NativeVisitorOptions): NativeMigrationVisitor {
  const release = new NativeReleaseFixture()
  return {
    async beforeMain(connection, signal, script) {
      return await release.install(connection, script, options.architecture, signal)
    },
    async afterResume() { await release.installed() },
    async visit(connection, endpoint, ready, signal) {
      const preferencesPath = join(options.root, 'userdata', 'manual-update-preferences.json')
      const readyPath = join(options.evidence, 'native-agent-ready.json')
      const deadline = performance.now() + 20_000
      while (!existsSync(readyPath)) {
        signal.throwIfAborted()
        if (performance.now() >= deadline) throw new Error('Actual native backend fixture did not finish preparing sessions')
        await delay(25, undefined, { signal })
      }
      const agent = object(JSON.parse(readFileSync(readyPath, 'utf8')))
      assert.equal(agent['stage'], options.stage)
      let menu
      for (;;) {
        menu = await inspect(connection, `(()=>{const {app,Menu}=${electron};const item=Menu.getApplicationMenu().getMenuItemById('check-for-updates');
          return {pid:process.pid,locale:app.getLocale(),version:app.getVersion(),enabled:item.enabled,label:item.label}})()`, signal)
        const expectedMenu = options.stage === 'reopen'
          ? /^(?:Check for Updates…|检查更新…)$/u.test(String(menu['label'])) : String(menu['label']).includes('9.9.9')
        const transport = await inspect(connection, 'globalThis.__dshMigrationReleaseTransport', signal)
        if (menu['enabled'] === true && expectedMenu && Array.isArray(transport['requests']) && transport['requests'].length > 0) break
        if (performance.now() >= deadline) throw new Error('Actual release reader did not present the synthetic available release')
        await delay(25, undefined, { signal })
      }
      assert.equal(menu['pid'], ready['pid'])
      const initial = existsSync(preferencesPath) ? object(JSON.parse(readFileSync(preferencesPath, 'utf8'))) : undefined
      if (options.previousPreferences !== undefined) assert.deepEqual(initial, options.previousPreferences)
      let preferenceAction: unknown
      if (options.stage === 'populate' || options.stage === 'upgrade') {
        const chinese = String(menu['locale']).toLowerCase().startsWith('zh')
        const label = options.stage === 'populate' ? chinese ? '明天提醒我' : 'Remind Me Tomorrow'
          : chinese ? '跳过 9.9.9' : 'Skip 9.9.9'
        assert.equal(typeof menu['pid'], 'number')
        assert.equal(typeof menu['label'], 'string')
        preferenceAction = await nativeUpdatePreference(menu['pid'] as number, menu['label'] as string, label, signal)
      }
      const expectedField = options.stage === 'populate' || options.stage === 'restore' ? 'remindAfterMs' : 'skippedVersion'
      let preferences
      for (;;) {
        preferences = existsSync(preferencesPath) ? object(JSON.parse(readFileSync(preferencesPath, 'utf8'))) : {}
        if (expectedField === 'skippedVersion' ? preferences[expectedField] === '9.9.9' : typeof preferences[expectedField] === 'number') break
        if (performance.now() >= deadline) throw new Error('Actual native preference action did not persist')
        await delay(25, undefined, { signal })
      }
      assert.equal(preferences['formatVersion'], 1)
      const preferenceDigest = digest(readFileSync(preferencesPath))
      const renderer = await withNativeBrowser(endpoint, String(ready['url']), async (page) => {
        const errors: string[] = []
        page.on('pageerror', (error) => { errors.push(String(error)) })
        let welcome: unknown
        if (options.stage === 'populate') welcome = await acknowledgeNativeWelcome(page)
        else {
          const count = await page.getByRole('dialog', { name: /^(Internal Testing Notice|内测声明)$/u }).count()
          assert.equal(count, 0)
          welcome = { absent: true, count }
        }
        const browserState = await nativeBrowserState(page, 'qualification-native-selected', 'Qualification native selected', options.previousBrowser)
        const appearance = await nativeAppearance(page, options.stage, 'Synthetic native assistant paragraph')
        const transcript = await nativeTranscript(page, options.stage)
        const poll = async (name: string, check: (value: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> => {
          const end = performance.now() + 20_000
          for (;;) {
            signal.throwIfAborted()
            const errorPath = join(options.evidence, 'live-observer-error.json')
            if (existsSync(errorPath)) throw new Error(readFileSync(errorPath, 'utf8'))
            const path = join(options.evidence, name)
            if (existsSync(path)) {
              const value = object(JSON.parse(readFileSync(path, 'utf8')))
              if (check(value)) return value
            }
            if (performance.now() >= end) throw new Error(`Actual native backend observation missing: ${name}`)
            await delay(25, undefined, { signal })
          }
        }
        const composer = await nativeComposer(page, options.stage, {
          started: async () => await poll('busy-started.json', value => String(value['text']).includes(options.stage)),
          release: () => { writeFileSync(join(options.evidence, 'release-busy'), 'release'); return Promise.resolve() },
          completed: async text => await poll('live-qualification-native-selected.json', (value) => {
            if (value['status'] !== 'idle' || !Array.isArray(value['events'])) return false
            const events = value['events'].map(object)
            const message = events.find(event => event['type'] === 'user/message' && JSON.stringify(event['data']).includes(text))
            return message !== undefined && events.some(event => event['type'] === 'turn/end' && Number(event['seq']) > Number(message['seq']))
          }),
        })
        const notificationObserver = await NativeNotificationObserver.create(page, options.notificationSource)
        let notifications
        try {
          notifications = await nativeNotificationSettings(page, options.stage, async (mode, background) => {
            await inspect(connection, `(()=>{const {BrowserWindow}=${electron};const win=BrowserWindow.getAllWindows()[0];win.restore();win.show();win.focus();return {focused:win.isFocused()}})()`, signal)
            await page.waitForFunction(() => document.visibilityState === 'visible' && document.hasFocus())
            rmSync(join(options.evidence, 'release-busy'), { force: true })
            const text = `native-busy-barrier notification ${options.stage} ${mode} ${background}`
            const input = page.locator('[data-composer-input][contenteditable="true"]')
            await input.click()
            await page.keyboard.press('ControlOrMeta+A')
            await page.keyboard.type(text)
            await page.keyboard.press('Enter')
            await poll('busy-started.json', value => String(value['text']).includes(text))
            await page.getByRole('button', { name: /^(Stop|停止)$/u, exact: true }).waitFor({ state: 'visible' })
            await inspect(connection, `(()=>{const {BrowserWindow}=${electron};const win=BrowserWindow.getAllWindows()[0];${background ? 'win.minimize()' : 'win.focus()'};return {focused:win.isFocused(),minimized:win.isMinimized()}})()`, signal)
            await page.waitForFunction(hidden => (document.visibilityState !== 'visible' || !document.hasFocus()) === hidden, background)
            const observation = await notificationObserver.capture(mode, background, () => {
              writeFileSync(join(options.evidence, 'release-busy'), 'release')
              return Promise.resolve()
            })
            await poll('live-qualification-native-selected.json', value => value['status'] === 'idle' && JSON.stringify(value['events']).includes(text))
            await inspect(connection, `(()=>{const {BrowserWindow}=${electron};const win=BrowserWindow.getAllWindows()[0];win.restore();win.show();win.focus();return {focused:win.isFocused()}})()`, signal)
            return observation
          })
        } finally { await notificationObserver.close() }
        const originalUrl = page.url()
        await inspect(connection, `(()=>{const {BrowserWindow}=${electron};const windows=BrowserWindow.getAllWindows();
          if(windows.length!==1)throw new Error('Expected one normal window');const wc=windows[0].webContents;
          globalThis.__dshMigrationNavigation={events:[],created:0};
          wc.on('will-navigate',(event,url)=>globalThis.__dshMigrationNavigation.events.push({url,prevented:event.defaultPrevented}));
          wc.on('did-create-window',()=>globalThis.__dshMigrationNavigation.created++);return {installed:true}})()`, signal)
        const popup = await page.evaluate(() => window.open('about:blank', '_blank') === null)
        assert.equal(popup, true)
        await page.evaluate(() => { window.location.assign('about:blank') })
        const navigationDeadline = performance.now() + 10_000
        let navigation
        for (;;) {
          navigation = await inspect(connection, 'globalThis.__dshMigrationNavigation', signal)
          if (Array.isArray(navigation['events']) && navigation['events'].length > 0) break
          if (performance.now() >= navigationDeadline) throw new Error('Actual renderer navigation did not reach the normal main policy')
          await delay(25, undefined, { signal })
        }
        assert.deepEqual(navigation['events'], [{ url: 'about:blank', prevented: true }])
        assert.equal(navigation['created'], 0)
        assert.equal(page.url(), originalUrl)
        await page.reload({ waitUntil: 'load' })
        assert.equal(new URL(page.url()).origin, new URL(originalUrl).origin)
        const originPolicy = { originalUrl, rejectedUrl: 'about:blank', popupDenied: popup, navigation, reloadedUrl: page.url() }
        await page.screenshot({ path: join(options.evidence, 'normal-window.png') })
        const accessibility = await page.locator('body').ariaSnapshot()
        assert.deepEqual(errors, [])
        return { welcome, browserState, appearance, transcript, notifications, composer, originPolicy, accessibility, errors }
      })
      return { agent, menu, initial, preferenceAction, preferences, preferenceDigest,
        transport: await release.observe(connection, signal), renderer }
    },
  }
}
