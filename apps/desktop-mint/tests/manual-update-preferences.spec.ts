import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileManualUpdatePreferencesStore, parsePreferences } from '../src/manual-update-preferences.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('manual update preferences', () => {
  it('round-trips validated reminders through an atomic file store', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-desktop-updates-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'nested', 'preferences.json')
    const logs: string[] = []
    const store = new FileManualUpdatePreferencesStore(path, message => logs.push(message))
    const preferences = {
      etag: '"one"',
      cachedRelease: release,
      lastNotifiedVersion: release.version,
      remindAfterMs: 1_234,
    }

    await store.save(preferences)

    await expect(store.load()).resolves.toEqual(preferences)
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ formatVersion: 1, ...preferences })
    expect(logs).toEqual([])
  })

  it('resets invalid or unsupported durable documents with a diagnostic', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-desktop-updates-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'preferences.json')
    const logs: string[] = []
    const store = new FileManualUpdatePreferencesStore(path, message => logs.push(message))
    await writeFile(path, '{"formatVersion":2}\n', 'utf8')

    await expect(store.load()).resolves.toEqual({})
    expect(logs[0]).toContain('expected update preference format 1')
  })

  it('rejects partial cached releases and invalid optional values', () => {
    expect(() => parsePreferences({ formatVersion: 1, remindAfterMs: Number.NaN })).toThrow('finite number')
    expect(() => parsePreferences({ formatVersion: 1, cachedRelease: { version: '1.0.0' } })).toThrow('tagName')
    expect(() => parsePreferences({
      formatVersion: 1,
      cachedRelease: { ...release, url: 'https://example.com/download' },
    })).toThrow('URL does not match tagName')
  })
})

const release = {
  version: '1.1.0-preview.1',
  tagName: 'desktop-v1.1.0-preview.1',
  title: 'DSH Desktop Mint 1.1.0-preview.1',
  url: 'https://github.com/mintgao/dsh-desktop/releases/tag/desktop-v1.1.0-preview.1',
  prerelease: true,
  recommendedAssetName: 'DSH-Desktop-Mint-1.1.0-preview.1-arm64.dmg',
} as const
