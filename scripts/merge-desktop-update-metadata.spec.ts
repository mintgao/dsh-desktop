import { describe, expect, it } from 'vitest'
import { mergeDesktopUpdateMetadata } from './merge-desktop-update-metadata.ts'

describe('mergeDesktopUpdateMetadata', () => {
  it('publishes both macOS architectures through one deterministic feed', () => {
    const arm64 = metadata('arm64', '2026-08-24T11:00:00.000Z')
    const x64 = metadata('x64', '2026-08-24T11:02:00.000Z')

    expect(mergeDesktopUpdateMetadata([x64, arm64], '1.4.0')).toMatchInlineSnapshot(`
      {
        "files": [
          {
            "sha512": "dmg-arm64",
            "size": 10,
            "url": "DSH-Desktop-Mint-1.4.0-arm64.dmg",
          },
          {
            "sha512": "zip-arm64",
            "size": 20,
            "url": "DSH-Desktop-Mint-1.4.0-arm64.zip",
          },
          {
            "sha512": "dmg-x64",
            "size": 10,
            "url": "DSH-Desktop-Mint-1.4.0-x64.dmg",
          },
          {
            "sha512": "zip-x64",
            "size": 20,
            "url": "DSH-Desktop-Mint-1.4.0-x64.zip",
          },
        ],
        "path": "DSH-Desktop-Mint-1.4.0-arm64.zip",
        "releaseDate": "2026-08-24T11:02:00.000Z",
        "releaseName": "DSH Desktop 1.4.0",
        "sha512": "zip-arm64",
        "version": "1.4.0",
      }
    `)
  })

  it('rejects version drift and missing architecture ZIPs', () => {
    expect(() => mergeDesktopUpdateMetadata([metadata('arm64'), metadata('x64')], '1.4.1')).toThrow(
      /does not match expected/u,
    )
    expect(() => mergeDesktopUpdateMetadata([metadata('arm64'), metadata('arm64')], '1.4.0')).toThrow(
      /no x64 ZIP/u,
    )
  })

  it('rejects malformed durable metadata fields', () => {
    expect(() => mergeDesktopUpdateMetadata([
      metadata('arm64'),
      { version: '1.4.0', files: [{ url: 'DSH-Desktop-Mint-1.4.0-x64.zip', sha512: '', size: 20 }] },
    ], '1.4.0')).toThrow(/has no sha512/u)
  })
})

/** Build architecture-specific metadata matching electron-builder output. */
function metadata(architecture: 'arm64' | 'x64', releaseDate = '2026-08-24T11:00:00.000Z'): object {
  return {
    version: '1.4.0',
    files: [
      {
        url: `DSH-Desktop-Mint-1.4.0-${architecture}.dmg`,
        sha512: `dmg-${architecture}`,
        size: 10,
      },
      {
        url: `DSH-Desktop-Mint-1.4.0-${architecture}.zip`,
        sha512: `zip-${architecture}`,
        size: 20,
      },
    ],
    path: `DSH-Desktop-Mint-1.4.0-${architecture}.zip`,
    sha512: `zip-${architecture}`,
    releaseDate,
    releaseName: 'DSH Desktop 1.4.0',
  }
}
