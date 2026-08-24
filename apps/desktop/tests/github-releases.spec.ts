import { describe, expect, it, vi } from 'vitest'
import { GitHubReleaseDriver, selectRelease } from '../src/github-releases.ts'

describe('GitHubReleaseDriver', () => {
  it('uses a conditional anonymous request and preserves a 304 response', async () => {
    let capturedInit: RequestInit | undefined
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      capturedInit = init
      return new Response(null, { status: 304 })
    })
    const driver = new GitHubReleaseDriver({ architecture: 'arm64', currentVersion: '1.0.0-preview.1', fetch })

    await expect(driver.check('"release-etag"')).resolves.toEqual({ kind: 'not-modified' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(capturedInit).toEqual({
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'If-None-Match': '"release-etag"',
        'User-Agent': 'DSH-Desktop/1.0.0-preview.1',
        'X-GitHub-Api-Version': '2026-03-10',
      },
    })
  })

  it('returns a validated release and response ETag', async () => {
    const fetch = vi.fn(async () => Response.json([
      githubRelease('desktop-v1.1.0-preview.2', ['DSH-Desktop-Mint-1.1.0-preview.2-arm64.dmg']),
    ], { headers: { etag: '"next"' } }))
    const driver = new GitHubReleaseDriver({ architecture: 'arm64', currentVersion: '1.0.0', fetch })

    await expect(driver.check()).resolves.toMatchObject({
      kind: 'modified',
      etag: '"next"',
      release: {
        version: '1.1.0-preview.2',
        recommendedAssetName: 'DSH-Desktop-Mint-1.1.0-preview.2-arm64.dmg',
        url: 'https://github.com/mintgao/dsh-desktop/releases/tag/desktop-v1.1.0-preview.2',
      },
    })
  })

  it('reports unsuccessful GitHub responses without parsing their body', async () => {
    const driver = new GitHubReleaseDriver({
      architecture: 'x64',
      currentVersion: '1.0.0',
      fetch: async () => new Response('rate limited', { status: 403 }),
    })

    await expect(driver.check()).rejects.toThrow('GitHub release check returned HTTP 403.')
  })
})

describe('selectRelease', () => {
  it('selects the greatest semantic version that contains the current architecture', () => {
    const value = [
      githubRelease('desktop-v1.2.0-preview.3', ['DSH-Desktop-Mint-1.2.0-preview.3-arm64.dmg']),
      githubRelease('desktop-v1.2.0', ['DSH-Desktop-Mint-1.2.0-arm64.dmg']),
      githubRelease('desktop-v2.0.0', ['DSH-Desktop-Mint-2.0.0-x64.dmg']),
      githubRelease('dsh-v9.0.0', ['DSH-Desktop-Mint-9.0.0-arm64.dmg']),
      { ...githubRelease('desktop-v3.0.0', ['DSH-Desktop-Mint-3.0.0-arm64.dmg']), draft: true },
    ]

    expect(selectRelease(value, 'arm64')).toMatchObject({
      version: '1.2.0',
      prerelease: false,
      recommendedAssetName: 'DSH-Desktop-Mint-1.2.0-arm64.dmg',
    })
  })

  it('ignores incomplete releases and rejects a non-array API response', () => {
    expect(selectRelease([
      githubRelease('desktop-vnot-semver', ['DSH-Desktop-Mint-not-semver-arm64.dmg']),
      githubRelease('desktop-v1.0.0', []),
    ], 'arm64')).toBeNull()
    expect(() => selectRelease({ message: 'unexpected' }, 'arm64')).toThrow('must be an array')
  })
})

/** Create the GitHub fields consumed by the release parser. */
function githubRelease(tagName: string, assetNames: readonly string[]): Record<string, unknown> {
  return {
    tag_name: tagName,
    name: `Release ${tagName}`,
    draft: false,
    prerelease: tagName.includes('-preview.'),
    published_at: '2026-08-24T00:00:00Z',
    assets: assetNames.map(name => ({ name })),
  }
}
