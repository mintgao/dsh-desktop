/** Separate upstream adoption order from independently versioned desktop deliveries. */
import { compareVersions, validateStrict } from 'compare-versions'
import { object, release, sameRelease, string, type SourceLock } from './evidence.ts'

/** Validate the declared delivery kind against its source lock and predecessor evidence.
 * @param kind - upstream, desktop or replacement.
 * @param lock - finalized source identity.
 * @param prior - immediate delivery predecessor, or withdrawn manifest for replacement.
 * @returns Delivery predecessor metadata and optional superseded identity.
 */
export function deliveryPredecessor(kind: string, lock: SourceLock, prior: Record<string, unknown>): Record<string, unknown> {
  const previous = release(prior.upstream)
  if (kind === 'upstream') {
    const ordered = [...lock.observed].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id - b.id)
    const index = ordered.findIndex(value => sameRelease(value, lock.release))
    if (index < 1 || !sameRelease(release(ordered[index - 1]), previous) || lock.predecessor === null || !sameRelease(lock.predecessor, previous)) throw new Error('Delivery skips the immediate upstream predecessor')
  } else if (kind === 'desktop' || kind === 'replacement') {
    if (!sameRelease(lock.release, previous)) throw new Error('Same-upstream delivery changed upstream identity')
  } else throw new Error('Unknown desktop release kind')
  if (kind === 'replacement') {
    if (prior.purpose !== 'desktop-release-qualification') throw new Error('Replacement requires a retained production manifest')
    return object(prior.predecessor)
  }
  return { tag: prior.desktopTag ?? prior.tag, kind: prior.purpose, upstream: prior.upstream }
}

/** Require a greater SemVer precedence than every retained previously published desktop.
 * @param version - new desktop version.
 * @param retained - complete release inventory, including drafts that were published.
 * @param retryTag - exact-manifest retry identity validated by the caller.
 */
export function requireNewVersion(version: string, retained: Record<string, unknown>[], retryTag?: string): void {
  requireUnsignedVersion(version)
  for (const item of retained) {
    const tag = string(item.tag_name)
    if (!tag.startsWith('desktop-v') || tag === retryTag) continue
    const previous = tag.slice('desktop-v'.length)
    if (!validateStrict(previous)) throw new Error('Malformed retained desktop version')
    if (compareVersions(version, previous) <= 0) throw new Error('Desktop version must exceed all retained versions, including withdrawals')
  }
}

/** Require strict SemVer with an explicit unsigned preview sequence and no build-only identity.
 * @param version - independently selected desktop version.
 */
export function requireUnsignedVersion(version: string): void {
  if (!validateStrict(version) || !/-(?:[0-9A-Za-z-]+\.)*unsigned\.(?:0|[1-9]\d*)$/u.test(version)) throw new Error('signed-mode-unconfigured')
}
