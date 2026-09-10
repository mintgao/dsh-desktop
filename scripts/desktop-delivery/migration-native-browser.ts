/** Actual BrowserWindow actions for the packaged native migration fixture. */
import assert from 'node:assert/strict'
import { chromium, type Page } from 'playwright'
import { object } from './evidence.ts'

/** Attach to the normal Electron window without creating a page or context.
 * @param endpoint - The owned Electron browser DevTools endpoint.
 * @param url - The normal main process's loaded backend URL.
 * @param action - Observations and real UI gestures performed against that window.
 * @returns The action's evidence after disconnecting the CDP transport.
 */
export async function withNativeBrowser<T>(endpoint: string, url: string, action: (page: Page) => Promise<T>): Promise<T> {
  const address = new URL(endpoint)
  if (address.protocol !== 'ws:' || address.hostname !== '127.0.0.1') throw new Error('Native browser endpoint must be loopback')
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 15_000 })
  try {
    assert.equal(browser.contexts().length, 1)
    const context = browser.contexts()[0]
    assert.ok(context)
    const pages = context.pages().filter(page => page.url() === url)
    assert.equal(pages.length, 1, 'The normal native main must own one matching BrowserWindow')
    const page = pages[0]
    assert.ok(page)
    page.setDefaultTimeout(10_000)
    page.setDefaultNavigationTimeout(20_000)
    return await action(page)
  } finally { await browser.close() }
}

async function mutation(page: Page, ns: string, action: () => Promise<unknown>): Promise<unknown> {
  const [response] = await Promise.all([
    page.waitForResponse((response) => {
      if (response.request().method() !== 'POST' || new URL(response.url()).pathname !== '/api/settings/mutate') return false
      const args = object(object(object(response.request().postDataJSON())['payload'])['args'])
      return args['ns'] === ns
    }), action(),
  ])
  assert.equal(response.ok(), true)
  assert.equal(await response.finished(), null)
  const envelope = object(await response.json())
  assert.equal(object(envelope['result'])['ok'], true)
  return envelope
}

/** Acknowledge the actual notice only after proving observation/reload did not save it.
 * @param page - Existing normal native page with the usable synthetic provider configured.
 * @returns The actual notice copy and successful settings mutation response.
 */
export async function acknowledgeNativeWelcome(page: Page): Promise<Record<string, unknown>> {
  const notice = page.getByRole('dialog', { name: /^(Internal Testing Notice|内测声明)$/u })
  await notice.waitFor()
  const before = await notice.innerText()
  await page.reload({ waitUntil: 'load' })
  await notice.waitFor()
  assert.equal(await notice.innerText(), before)
  const write = await mutation(page, 'ui-onboarding', async () => {
    await notice.getByRole('button', { name: /^(Continue|继续)$/u }).click()
  })
  await notice.waitFor({ state: 'hidden' })
  await page.reload({ waitUntil: 'load' })
  await page.getByRole('button', { name: /^(Settings|设置)$/u, exact: true }).waitFor()
  assert.equal(await notice.count(), 0)
  return { before, write, hiddenAfterReload: true }
}

/** Exercise durable theme, font and locale through actual Settings controls.
 * @param page - Existing normal BrowserWindow.
 * @param stage - Which packaged process is observing the fixture.
 * @param conversationText - Exact rendered assistant paragraph from the owned session.
 * @returns Effective document styles, localized copy and settings response evidence.
 */
export async function nativeAppearance(page: Page, stage: 'populate' | 'upgrade' | 'reopen' | 'restore', conversationText: string): Promise<Record<string, unknown>> {
  await page.getByRole('button', { name: /^(Settings|设置)$/u, exact: true }).waitFor()
  const baseline = stage === 'populate' || stage === 'restore'
  const expected = { dark: baseline, font: baseline ? 16 : 18, language: baseline ? 'zh-CN' : 'en' }
  const state = async (): Promise<Record<string, unknown>> => await page.evaluate(() => {
    const style = getComputedStyle(document.body)
    return { dark: document.body.hasAttribute('data-ds-dark-theme'), font: Number.parseInt(document.body.style.getPropertyValue('--dsh-content-font-size')),
      language: document.documentElement.lang, background: style.backgroundColor,
      themeColor: document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content,
      themeColorCount: document.head.querySelectorAll('meta[name="theme-color"]').length,
      legacyTheme: localStorage.getItem('dsh.theme'), legacyLocale: localStorage.getItem('dsh.locale') }
  })
  const assertState = async (): Promise<Record<string, unknown>> => {
    await page.waitForFunction(value => document.body.hasAttribute('data-ds-dark-theme') === value.dark
      && Number.parseInt(document.body.style.getPropertyValue('--dsh-content-font-size')) === value.font
      && document.documentElement.lang === value.language, expected)
    const paragraph = page.getByText(conversationText, { exact: true }).first()
    await paragraph.waitFor({ state: 'visible' })
    const paragraphStyle = await paragraph.evaluate(element => ({
      text: element.textContent, fontSize: getComputedStyle(element).fontSize,
    }))
    assert.equal(paragraphStyle.fontSize, `${expected.font}px`)
    const current: Record<string, unknown> = { ...await state(), paragraphStyle }
    assert.equal(current['themeColorCount'], 1)
    assert.equal(current['themeColor'], current['background'])
    assert.notEqual(current['background'], 'rgba(0, 0, 0, 0)')
    assert.equal(current['legacyTheme'], null)
    assert.equal(current['legacyLocale'], null)
    return current
  }
  const initial = await state()
  const writes: unknown[] = []
  if (stage === 'populate' || stage === 'upgrade') {
    if (stage === 'upgrade') {
      assert.equal(initial['dark'], true)
      assert.equal(initial['font'], 16)
      assert.equal(initial['language'], 'zh-CN')
    }
    await page.getByRole('button', { name: /^(Settings|设置)$/u, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /^(Settings|设置)$/u })
    await dialog.waitFor()
    writes.push(await mutation(page, 'ui-theme', async () => {
      await dialog.getByRole('button', { name: baseline ? /^(Dark|深色)$/u : /^(Light|浅色)$/u }).click()
    }))
    let font = Number((await state())['font'])
    assert.ok(Number.isInteger(font) && font >= 10 && font <= 24)
    while (font !== expected.font) {
      await dialog.getByText(String(font), { exact: true }).hover()
      writes.push(await mutation(page, 'ui-theme', async () => {
        await dialog.getByRole('button', { name: font < expected.font ? /^(Increase font size|增大字号)$/u : /^(Decrease font size|减小字号)$/u }).click()
      }))
      font += font < expected.font ? 1 : -1
      await page.waitForFunction(value => Number.parseInt(document.body.style.getPropertyValue('--dsh-content-font-size')) === value, font)
    }
    const language = await page.evaluate(() => document.documentElement.lang)
    if (language !== expected.language) {
      await dialog.getByRole('button', { name: language === 'en' ? 'English' : '中文', exact: true }).click()
      writes.push(await mutation(page, 'locale', async () => {
        await page.getByRole('menuitem', { name: baseline ? '中文' : 'English', exact: true }).click()
      }))
    }
    await page.getByRole('dialog', { name: baseline ? '设置' : 'Settings', exact: true }).waitFor()
    assert.equal(await page.getByText(baseline ? '外观' : 'Appearance', { exact: true }).count(), 1)
    await page.keyboard.press('Escape')
  }
  const effective = await assertState()
  await page.reload({ waitUntil: 'load' })
  const reloaded = await assertState()
  await page.getByRole('button', { name: baseline ? '设置' : 'Settings', exact: true }).waitFor()
  return { initial, writes, effective, reloaded }
}

/** Browser strings produced by real controls, with their originating URL. */
export interface NativeBrowserState {
  origin: string
  strings: Record<string, string>
  draft: string
  actualDuration: boolean
  sessionId: string
  viewRows: string[]
}

/** Exercise stored-value compatibility under the explicit same-origin precondition.
 * @param page - The actual normal BrowserWindow.
 * @param sessionId - Preserved synthetic session identity.
 * @param title - Exact synthetic session title shown by the real session tree.
 * @param previous - Real prior UI values seeded before a fresh reload, never into live stores.
 * @returns Captured browser strings and effective UI observations.
 */
export async function nativeBrowserState(
  page: Page, sessionId: string, title: string, previous?: NativeBrowserState,
): Promise<NativeBrowserState & { precondition: unknown; before: unknown; after: unknown }> {
  const origin = new URL(page.url()).origin
  assert.equal(new URL(origin).hostname, '127.0.0.1')
  assert.ok(Number(new URL(origin).port) > 0)
  const keys = ['dsh.sessions.current', `dsh.conversation.${sessionId}`, 'dsh.workspace.view.v5', 'dsh.trajectory.duration']
  if (previous !== undefined) {
    assert.equal(previous.sessionId, sessionId)
    assert.deepEqual(Object.keys(previous.strings).sort(), [...keys].sort())
    await page.evaluate((strings) => {
      for (const [key, value] of Object.entries(strings)) localStorage.setItem(key, value)
    }, previous.strings)
    await page.reload({ waitUntil: 'load' })
  }
  const row = page.getByText(title, { exact: true }).locator('xpath=ancestor::*[@role="treeitem"][1]')
  const composer = page.locator('[data-composer-input][contenteditable="true"]')
  const duration = page.getByRole('button', { name: /^(Use actual duration|使用实际时长)$/u })
  const trajectory = page.getByRole('tab', { name: /^(Trajectory|轨迹)$/u })
  const conversation = page.getByRole('tab', { name: /^(Chat|对话)$/u })
  const observe = async (): Promise<unknown> => {
    await row.waitFor({ state: 'visible' })
    assert.equal(await row.getAttribute('aria-selected'), 'true')
    await trajectory.click()
    await duration.waitFor()
    const spans = page.locator('[data-timeline-span]')
    await spans.first().waitFor({ state: 'visible' })
    const timeline = await spans.evaluateAll(elements => elements.map(element => ({
      kind: element.getAttribute('data-timeline-span'), width: element.getBoundingClientRect().width,
      left: element.getBoundingClientRect().left,
    })))
    const pressed = await duration.getAttribute('aria-pressed')
    await conversation.click()
    await composer.waitFor()
    const tree = page.getByRole('tree', { name: /^(Sessions|会话)$/u })
    await tree.waitFor({ state: 'visible' })
    assert.equal(await tree.locator('[role="treeitem"][aria-expanded]').count(), 0, 'Flat view must render no workspace group rows')
    const labels = ['Qualification native selected', 'Qualification native other']
    const viewRows = (await tree.getByRole('treeitem').allTextContents()).flatMap(text => labels.filter(label => text.includes(label)))
    assert.equal(viewRows.length, 2)
    assert.deepEqual([...viewRows].sort(), [...labels].sort())
    return { selected: await row.getAttribute('aria-selected'), draft: await composer.innerText(), pressed, timeline, viewRows }

  }
  let before: unknown
  if (previous !== undefined) {
    before = await observe()
    const value = object(before)
    assert.equal(value['draft'], previous.draft)
    assert.equal(value['pressed'], String(previous.actualDuration))
    assert.deepEqual(value['viewRows'], previous.viewRows)
  } else {
    await row.waitFor()
    await row.click()
  }
  const draft = previous === undefined ? 'Synthetic baseline draft' : 'Synthetic target changed draft'
  await composer.waitFor()
  await composer.click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type(draft)
  assert.equal(await composer.innerText(), draft)
  await page.getByRole('button', { name: /^(View options|视图选项)$/u }).click()
  await page.getByRole('menuitem', { name: /^(In one list|单列表)$/u }).click()
  await page.getByRole('button', { name: /^(View options|视图选项)$/u }).click()
  await page.getByRole('menuitem', { name: /^(Manual|手动排序)$/u }).click()
  await trajectory.click()
  const actualDuration = previous === undefined || !previous.actualDuration
  if (await duration.getAttribute('aria-pressed') !== String(actualDuration)) await duration.click()
  assert.equal(await duration.getAttribute('aria-pressed'), String(actualDuration))
  await conversation.click()
  await page.waitForFunction(({ names, key, text }) => names.every(name => localStorage.getItem(name) !== null)
    && localStorage.getItem(key)?.includes(text) === true, { names: keys, key: `dsh.conversation.${sessionId}`, text: draft })
  const strings = await page.evaluate(names => Object.fromEntries(names.map((name) => {
    const value = localStorage.getItem(name)
    if (value === null) throw new Error(`Browser control did not persist ${name}`)
    return [name, value]
  })), keys)
  const selectionBytes = strings['dsh.sessions.current']
  const viewBytes = strings['dsh.workspace.view.v5']
  assert.ok(typeof selectionBytes === 'string' && typeof viewBytes === 'string')
  assert.equal(object(JSON.parse(selectionBytes))['sessionId'], sessionId)
  const view = object(JSON.parse(viewBytes))
  assert.equal(view['groupBy'], 'flat')
  assert.equal(view['orderBy'], 'manual')
  await page.reload({ waitUntil: 'load' })
  const after = await observe()
  assert.equal(object(after)['draft'], draft)
  assert.equal(object(after)['pressed'], String(actualDuration))
  const viewRows = object(after)['viewRows'] as string[]
  return { origin, strings, draft, actualDuration, sessionId, viewRows, before, after,
    precondition: previous === undefined ? null : { sourceOrigin: previous.origin, targetOrigin: origin, strings: previous.strings,
      scope: 'Explicit fixture seeding before reload; no automatic cross-port persistence claim' } }
}

async function selectSetting(page: Page, ns: string, choices: RegExp, selected: RegExp, allowChange: boolean): Promise<unknown> {
  await page.getByRole('button', { name: /^(Settings|设置)$/u, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /^(Settings|设置)$/u })
  const button = dialog.getByRole('button', { name: choices })
  await button.waitFor()
  let result: unknown = { retained: await button.innerText() }
  if (!allowChange) assert.match(await button.innerText(), selected)
  if (!selected.test(await button.innerText())) {
    await button.click()
    result = await mutation(page, ns, async () => { await page.getByRole('menuitem', { name: selected }).click() })
  }
  await dialog.getByRole('button', { name: selected }).waitFor()
  await page.keyboard.press('Escape')
  return result
}

/** Verify normal/compact against an actual completed process-before-answer turn.
 * @param page - Actual native conversation containing the generated process turn.
 * @param stage - Baseline or candidate process observing preserved settings.
 * @returns Actual hidden process members and visible final answer before/after reload.
 */
export async function nativeTranscript(page: Page, stage: 'populate' | 'upgrade' | 'reopen' | 'restore'): Promise<Record<string, unknown>> {
  const compact = stage === 'upgrade' || stage === 'reopen'
  const selection = compact ? /^(Compact|紧凑)$/u : /^(Normal|标准)$/u
  const write = await selectSetting(page, 'ui-chat', /^(Compact|紧凑|Normal|标准)$/u, selection, stage === 'populate' || stage === 'upgrade')
  const observe = async () => {
    await page.getByText('Synthetic native assistant paragraph', { exact: true }).first().waitFor({ state: 'visible' })
    if (compact) await page.locator('[data-turn-process-hidden="true"]').first().waitFor({ state: 'attached' })
    else await page.getByText('Synthetic native process output', { exact: false }).first().waitFor({ state: 'visible' })
    const members = await page.locator('[data-turn-process-member]').evaluateAll(elements => elements.map(element => ({
      hidden: element.getAttribute('data-turn-process-hidden'), text: element.textContent,
      displayed: getComputedStyle(element).display,
    })))
    if (compact) {
      assert.ok(members.some(member => member.hidden === 'true'))
      for (const member of await page.locator('[data-turn-process-hidden="true"]').all()) {
        await member.waitFor({ state: 'hidden' })
        assert.equal(await member.isVisible(), false, 'Compact process content must actually be hidden')
      }
    }
    else assert.ok(members.every(member => member.hidden !== 'true'))
    return { compact, members, answer: await page.getByText('Synthetic native assistant paragraph', { exact: true }).first().innerText() }
  }
  const effective = await observe()
  await page.reload({ waitUntil: 'load' })
  const reloaded = await observe()
  return { write, effective, reloaded }
}

/** Exercise all declared notification settings through the actual native client control.
 * @param page - Actual BrowserWindow; unsupported OS capability fails without replacement.
 * @param stage - The process determining the final preserved preference.
 * @param decision - Execute one real controlled task in the requested focus state.
 * @returns Selected controls, executed decisions and successful mutations, excluding OS delivery.
 */
export async function nativeNotificationSettings(page: Page, stage: 'populate' | 'upgrade' | 'reopen' | 'restore',
  decision: (mode: 'off' | 'background' | 'always', background: boolean) => Promise<unknown>): Promise<Record<string, unknown>> {
  const choices = /^(Off|关闭|Background only|仅在后台|Always|始终通知)$/u
  const background = /^(Background only|仅在后台)$/u
  const final = stage === 'populate' || stage === 'restore' ? background : /^(Always|始终通知)$/u
  const writes = []
  const initial = await selectSetting(page, 'ui-session-notifications', choices,
    stage === 'reopen' ? /^(Always|始终通知)$/u : background, false)
  if (stage === 'populate' || stage === 'upgrade') {
    writes.push(await selectSetting(page, 'ui-session-notifications', choices, /^(Off|关闭)$/u, true))
    writes.push(await selectSetting(page, 'ui-session-notifications', choices, /^(Always|始终通知)$/u, true))
    writes.push(await selectSetting(page, 'ui-session-notifications', choices, final, true))
  }
  const decisions = []
  for (const [mode, label] of [['off', /^(Off|关闭)$/u], ['background', background], ['always', /^(Always|始终通知)$/u]] as const) {
    writes.push(await selectSetting(page, 'ui-session-notifications', choices, label, true))
    for (const hidden of [false, true]) decisions.push(await decision(mode, hidden))
  }
  writes.push(await selectSetting(page, 'ui-session-notifications', choices, final, true))
  await page.reload({ waitUntil: 'load' })
  await page.getByRole('button', { name: /^(Settings|设置)$/u }).click()
  const selected = page.getByRole('dialog', { name: /^(Settings|设置)$/u }).getByRole('button', { name: final })
  await selected.waitFor()
  const text = await selected.innerText()
  await page.keyboard.press('Escape')
  return { initial, writes, decisions, selected: text, scope: 'Actual persisted controls and executed focus decisions; unsigned identity-dependent OS notification delivery excluded' }
}

/** Owned provider gates and persisted history observations used by the busy UI case. */
export interface NativeComposerBarrier {
  started(): Promise<unknown>
  release(): Promise<void>
  completed(text: string): Promise<unknown>
}

/** Prove plain Enter uses queue/steer while the real Agent is busy.
 * @param page - Normal native session page.
 * @param stage - Determines the persisted busy-Enter preference.
 * @param barrier - Actual synthetic provider start/release and settled event observations.
 * @returns Actual wire admission, queue/steering UI and completed durable history.
 */
export async function nativeComposer(
  page: Page, stage: 'populate' | 'upgrade' | 'reopen' | 'restore', barrier: NativeComposerBarrier,
): Promise<Record<string, unknown>> {
  const steer = stage === 'upgrade' || stage === 'reopen'
  const selected = steer ? /^(Steer|插话发送)$/u : /^(Queue|排队发送)$/u
  const write = await selectSetting(page, 'ui-conversation', /^(Steer|插话发送|Queue|排队发送)$/u, selected, stage === 'populate' || stage === 'upgrade')
  await page.reload({ waitUntil: 'load' })
  const composer = page.locator('[data-composer-input][contenteditable="true"]')
  const submit = async (text: string) => {
    await composer.waitFor()
    await composer.click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type(text)
    const request = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/session/prompt')
    await page.keyboard.press('Enter')
    const admitted = await request
    return object(object(object(admitted.postDataJSON())['payload'])['args'])
  }
  const initial = await submit(`native-busy-barrier ${stage}`)
  const started = await barrier.started()
  const text = `Synthetic busy ${stage} followup`
  let busy
  let pending
  try {
    busy = await submit(text)
    assert.equal(busy['mode'], steer ? 'steer' : 'queue')
    const visible = page.locator(steer ? '[data-pending-steering]' : '[data-queue-dock]').filter({ hasText: text })
    await visible.waitFor({ state: 'visible' })
    assert.equal(await page.locator(steer ? '[data-queue-dock]' : '[data-pending-steering]').filter({ hasText: text }).count(), 0)
    pending = await visible.innerText()
  } finally { await barrier.release() }
  const completed = await barrier.completed(text)
  await page.locator(steer ? '[data-pending-steering]' : '[data-queue-dock]').filter({ hasText: text }).waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => localStorage.getItem('dsh.conversation.busyEnter')), null)
  return { write, initial, started, busy, pending, completed }
}
