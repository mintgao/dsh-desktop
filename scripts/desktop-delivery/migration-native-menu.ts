/** Actual macOS Accessibility gestures for preference-only native update scenarios. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const execute = promisify(execFile)
const script = `on run argv
  set targetPid to (item 1 of argv) as integer
  set action to item 2 of argv
  set targetName to item 3 of argv
  tell application "System Events"
    if UI elements enabled is false then error "Accessibility automation unavailable"
    set matches to every application process whose unix id is targetPid
    if (count of matches) is not 1 then error "Owned native process is not unique"
    set targetProcess to item 1 of matches
    if bundle identifier of targetProcess is not "io.github.mintgao.dsh-desktop" then error "Native bundle identity differs"
    if action is "preflight" then return (bundle identifier of targetProcess) & tab & (name of targetProcess)
    if action is "menu" then
      tell targetProcess
        set frontmost to true
        set appMenu to menu bar item 1 of menu bar 1
        click appMenu
        set itemsFound to every menu item of menu 1 of appMenu whose name is targetName
        if (count of itemsFound) is not 1 then error "Native update menu target is not unique"
        set targetItem to item 1 of itemsFound
        if enabled of targetItem is false then error "Native update menu target is disabled"
        click targetItem
      end tell
      return targetName
    end if
    set buttonsFound to {}
    tell targetProcess
      repeat with nativeWindow in windows
        repeat with element in entire contents of nativeWindow
          if role of element is "AXButton" then
            if name of element is targetName then set end of buttonsFound to element
          end if
        end repeat
      end repeat
    end tell
    if (count of buttonsFound) is 0 then return "absent"
    if (count of buttonsFound) is not 1 then error "Native preference button is not unique"
    set targetButton to item 1 of buttonsFound
    if enabled of targetButton is false then return "disabled"
    if action is "button" then click targetButton
    return targetName
  end tell
end run`

async function accessibility(pid: number, action: string, label: string, signal: AbortSignal): Promise<string> {
  if (process.platform !== 'darwin' || process.env['GITHUB_ACTIONS'] !== 'true' || process.env['RUNNER_ENVIRONMENT'] !== 'github-hosted') {
    throw new Error('Native Accessibility fixtures require a disposable hosted macOS runner')
  }
  const result = await execute('/usr/bin/osascript', ['-e', script, String(pid), action, label], { signal, timeout: 10_000, maxBuffer: 1024 * 1024 })
  return result.stdout.trim()
}

/** Verify live AX access to the exact driver-owned native process without changing permissions.
 * @param pid - PID supplied by the exact native main inspector.
 * @param signal - Overall native fixture cancellation.
 * @returns The observed native bundle identifier and application name.
 */
export async function nativeAccessibilityPreflight(pid: number, signal: AbortSignal): Promise<string> {
  return await accessibility(pid, 'preflight', '', signal)
}

/** Click the actual enabled native update menu and one preference-only dialog action.
 * @param pid - Exact native process PID, never an application-name lookup.
 * @param menuLabel - Read-only label from the real update MenuItem.
 * @param buttonLabel - The actual localized later or version-specific skip button.
 * @param signal - Overall native fixture cancellation.
 * @returns The observed preflight identity and exact clicked labels.
 */
export async function nativeUpdatePreference(
  pid: number, menuLabel: string, buttonLabel: string, signal: AbortSignal,
): Promise<Record<string, string>> {
  if (!/^(?:Remind Me Tomorrow|明天提醒我|Skip [0-9][\w.+-]*|跳过 [0-9][\w.+-]*)$/u.test(buttonLabel)) {
    throw new Error('Only reminder or skip native preference actions are allowed')
  }
  const preflight = await nativeAccessibilityPreflight(pid, signal)
  const menu = await accessibility(pid, 'menu', menuLabel, signal)
  if (menu !== menuLabel) throw new Error('Native menu click did not match the observed label')
  const deadline = performance.now() + 15_000
  for (;;) {
    signal.throwIfAborted()
    const visible = await accessibility(pid, 'find-button', buttonLabel, signal)
    if (visible === buttonLabel) break
    if (visible !== 'absent' && visible !== 'disabled') throw new Error('Unexpected native button observation')
    if (performance.now() >= deadline) throw new Error('Native preference dialog did not become actionable')
    await delay(50, undefined, { signal })
  }
  const button = await accessibility(pid, 'button', buttonLabel, signal)
  if (button !== buttonLabel) throw new Error('Native preference click did not match the observed button')
  return { preflight, menu, button }
}
