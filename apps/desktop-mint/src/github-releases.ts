/** Read and validate public DSH Desktop releases for manual prerelease updates. */

import { compareVersions, validate } from 'compare-versions'
import type {
  DesktopArchitecture,
  ManualDesktopReleaseInfo,
  ManualReleaseCheckResult,
  ManualReleaseDriver,
} from './manual-updates.ts'

const RELEASES_ENDPOINT = 'https://api.github.com/repos/mintgao/dsh-desktop/releases?per_page=20'
const RELEASE_PAGE_PREFIX = 'https://github.com/mintgao/dsh-desktop/releases/tag/'
const TAG_PREFIX = 'desktop-v'

/** Fetch signature accepted from Electron `net.fetch` and test substitutes. */
export type ReleaseFetch = (url: string, init: RequestInit) => Promise<Response>

/** Construction options for the public GitHub release reader. */
export interface GitHubReleaseDriverOptions {
  /** Architecture of the running application. */
  readonly architecture: DesktopArchitecture
  /** Version included in the anonymous GitHub User-Agent. */
  readonly currentVersion: string
  /** Electron network implementation. */
  readonly fetch: ReleaseFetch
}

/** Select the newest published desktop release containing this Mac's DMG. */
export class GitHubReleaseDriver implements ManualReleaseDriver {
  private readonly architecture: DesktopArchitecture
  private readonly currentVersion: string
  private readonly fetch: ReleaseFetch

  /** Create a credential-free reader for one architecture. */
  constructor(options: GitHubReleaseDriverOptions) {
    this.architecture = options.architecture
    this.currentVersion = options.currentVersion
    this.fetch = options.fetch
  }

  /** Query public releases with an optional conditional request. */
  async check(etag?: string): Promise<ManualReleaseCheckResult> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': `DSH-Desktop/${this.currentVersion}`,
      'X-GitHub-Api-Version': '2026-03-10',
    }
    if (etag !== undefined) headers['If-None-Match'] = etag
    const response = await this.fetch(RELEASES_ENDPOINT, { headers, method: 'GET' })
    if (response.status === 304) return { kind: 'not-modified' }
    if (!response.ok) throw new Error(`GitHub release check returned HTTP ${String(response.status)}.`)
    const release = selectRelease(await response.json(), this.architecture)
    const nextEtag = response.headers.get('etag') ?? undefined
    return nextEtag === undefined
      ? { kind: 'modified', release }
      : { kind: 'modified', release, etag: nextEtag }
  }
}

/** Parse the release API boundary and select the greatest usable semantic version. */
export function selectRelease(value: unknown, architecture: DesktopArchitecture): ManualDesktopReleaseInfo | null {
  if (!Array.isArray(value)) throw new Error('GitHub release response must be an array.')
  const releases = value
    .map(candidate => parseRelease(candidate, architecture))
    .filter((candidate): candidate is ManualDesktopReleaseInfo => candidate !== undefined)
  releases.sort((left, right) => compareVersions(right.version, left.version))
  return releases[0] ?? null
}

/** Return one usable release while ignoring unrelated or incomplete repository releases. */
function parseRelease(value: unknown, architecture: DesktopArchitecture): ManualDesktopReleaseInfo | undefined {
  if (!isRecord(value) || value.draft === true) return undefined
  if (typeof value.tag_name !== 'string' || !value.tag_name.startsWith(TAG_PREFIX)) return undefined
  const version = value.tag_name.slice(TAG_PREFIX.length)
  if (!validate(version) || !Array.isArray(value.assets)) return undefined
  const recommendedAssetName = `DSH-Desktop-Mint-${version}-${architecture}.dmg`
  const hasRecommendedAsset = value.assets.some(asset => isRecord(asset) && asset.name === recommendedAssetName)
  if (!hasRecommendedAsset) return undefined

  const publishedAt = typeof value.published_at === 'string' ? value.published_at : undefined
  return {
    version,
    tagName: value.tag_name,
    title: typeof value.name === 'string' && value.name !== '' ? value.name : `DSH Desktop Mint ${version}`,
    url: `${RELEASE_PAGE_PREFIX}${encodeURIComponent(value.tag_name)}`,
    prerelease: value.prerelease === true,
    recommendedAssetName,
    ...(publishedAt === undefined ? {} : { publishedAt }),
  }
}

/** Narrow JSON values to object records at the GitHub wire boundary. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
