/** Backups preserve runtime links and reject damaged inputs before replacing data. */
import { existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { copyMigrationData, migrationDataInventory } from '../migration-data.ts'

it('preserves the exact packaged runtime link and rejects damage before creating a restore root', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-migration-backup-'))
  try {
    const source = join(root, 'home')
    const runtime = join(root, 'runtime')
    mkdirSync(source)
    mkdirSync(runtime)
    mkdirSync(join(source, 'empty'))
    mkdirSync(join(source, 'private'), { mode: 0o700 })
    mkdirSync(join(source, 'private', 'nested'), { mode: 0o700 })
    writeFileSync(join(source, 'private', 'nested', 'record'), 'synthetic', { mode: 0o600 })
    writeFileSync(join(source, 'settings.yaml'), 'locale:\n  preference: zh\n', { mode: 0o600 })
    symlinkSync(runtime, join(source, 'node_modules'))
    const expected = migrationDataInventory(source, [runtime])
    const backup = join(root, 'backup')
    expect(copyMigrationData(source, backup, [runtime], expected)).toEqual(expected)
    expect(readlinkSync(join(backup, 'node_modules'))).toBe(runtime)
    writeFileSync(join(backup, 'settings.yaml'), 'damaged')
    const restored = join(root, 'restored')
    expect(() => copyMigrationData(backup, restored, [runtime], expected)).toThrow('integrity mismatch')
    expect(existsSync(restored)).toBe(false)
    writeFileSync(join(backup, 'settings.yaml'), 'locale:\n  preference: zh\n')
    rmSync(join(backup, 'empty'), { recursive: true })
    expect(() => copyMigrationData(backup, restored, [runtime], expected)).toThrow('integrity mismatch')
    expect(existsSync(restored)).toBe(false)
    expect(migrationDataInventory(source, [runtime])).toEqual(expected)
    symlinkSync(tmpdir(), join(source, 'escape'))
    expect(() => migrationDataInventory(source, [runtime])).toThrow('escapes fixture')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
