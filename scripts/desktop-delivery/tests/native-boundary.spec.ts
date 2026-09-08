import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, symlinkSync, cpSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { cleanupSmoke, validateApplicationRoot } from '../smoke.ts'

test('native probe rejects a root application symlink before launching host files', () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-root-test-'))
  try {
    mkdirSync(join(root, 'mount'))
    mkdirSync(join(root, 'host.app'))
    symlinkSync(join(root, 'host.app'), join(root, 'mount', 'Expected.app'))
    assert.throws(() =>{  validateApplicationRoot(join(root, 'mount'), join(root, 'mount', 'Expected.app')) }, /Application root escapes/u)
    mkdirSync(join(root, 'mount', 'Real.app'))
    validateApplicationRoot(join(root, 'mount'), join(root, 'mount', 'Real.app'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('failed detach retains the mount but independently removes writable probe data', () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-cleanup-test-'))
  try {
    for (const name of ['mounted', 'installation', 'home', 'workspace']) mkdirSync(join(root, name))
    writeFileSync(join(root, 'mounted', 'volume'), 'do not traverse')
    assert.throws(() =>{  cleanupSmoke(root, () => { throw new Error('detach failed') }) }, /detach failed/u)
    assert.equal(existsSync(join(root, 'mounted', 'volume')), true)
    for (const name of ['installation', 'home', 'workspace']) assert.equal(existsSync(join(root, name)), false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('payload links stay within each mounted and copied app while relative framework chains work', () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-links-test-'))
  try {
    const app = join(root, 'App.app')
    mkdirSync(join(app, 'Versions', 'A'), { recursive: true })
    symlinkSync('A', join(app, 'Versions', 'Current'))
    validateApplicationRoot(root, app)
    symlinkSync(root, join(app, 'foreign'))
    assert.throws(() =>{  validateApplicationRoot(root, app) }, /symlink escapes/u)
    rmSync(join(app, 'foreign'))
    symlinkSync(join(app, 'Versions', 'A'), join(app, 'absolute'))
    mkdirSync(join(root, 'installed'))
    cpSync(app, join(root, 'installed', 'App.app'), { recursive: true, verbatimSymlinks: true })
    assert.throws(() =>{  validateApplicationRoot(join(root, 'installed'), join(root, 'installed', 'App.app')) }, /symlink escapes/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
