/** Runtime identity includes executable permissions, bytes and contained link destinations. */
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runtimeInventory } from '../runtime-inventory.ts'

it('binds file bytes, executable mode and link identity while refusing escaped links', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-runtime-inventory-'))
  try {
    writeFileSync(join(root, 'runtime'), 'first', { mode: 0o600 })
    symlinkSync('runtime', join(root, 'alias'))
    const original = runtimeInventory(root)
    expect(original.entries.map(entry => entry.path)).toEqual(['alias', 'runtime'])
    expect(runtimeInventory(root)).toEqual(original)
    chmodSync(join(root, 'runtime'), 0o700)
    expect(runtimeInventory(root).sha256).not.toBe(original.sha256)
    writeFileSync(join(root, 'runtime'), 'second')
    const changed = runtimeInventory(root)
    expect(changed.entries[1]?.sha256).not.toBe(original.entries[1]?.sha256)
    symlinkSync(tmpdir(), join(root, 'escape'))
    expect(() => runtimeInventory(root)).toThrow('escapes application')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
