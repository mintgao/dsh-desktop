/** Public GET-only release discovery with bounded transient retries and complete pagination. */
import { setTimeout as delay } from 'node:timers/promises'
import { compareRelease, object, release, sameRelease, shadow, string, type Distribution, type Release, type SourceLock } from './evidence.ts'

/** Injectable external network and backoff operations. */
export interface GitHubReads { fetch: typeof fetch; wait: (milliseconds: number) => Promise<void> }

async function getJson(path: string, reads: GitHubReads): Promise<{ body: unknown; link: string | null }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response
    try {
      response = await reads.fetch(`https://api.github.com${path}`, { method: 'GET', redirect: 'error', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15_000) })
    } catch (error) {
      if (attempt === 2) throw error
      await reads.wait(250 * 2 ** attempt)
      continue
    }
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
      await response.body?.cancel()
      await reads.wait(250 * 2 ** attempt)
      continue
    }
    if (!response.ok) throw new Error(`GitHub GET failed (${String(response.status)}): ${path}`)
    return { body: await response.json() as unknown, link: response.headers.get('link') }
  }
  throw new Error('GitHub attempts exhausted')
}

/** Retrieve all selected public releases and resolve lightweight or annotated tags.
 * @param config - explicit upstream selection.
 * @param reads - external GET and bounded backoff adapter.
 * @returns Complete immutable observations; failures reject instead of yielding no update.
 */
export async function githubReleases(config: Distribution, reads: GitHubReads = { fetch, wait: delay }): Promise<Release[]> {
  const releases: Release[] = []
  const base = `/repos/${config.upstreamRepository}`
  for (let page = 1; page <= 100; page++) {
    const result = await getJson(`${base}/releases?per_page=100&page=${String(page)}`, reads)
    if (!Array.isArray(result.body)) throw new Error('Malformed GitHub release page')
    for (const raw of result.body) {
      const item = object(raw)
      if (item.draft === true) continue
      if (typeof item.draft !== 'boolean' || typeof item.prerelease !== 'boolean') throw new Error('Malformed GitHub release flags')
      const tag = string(item.tag_name)
      if (!tag.startsWith(config.tagPrefix)) continue
      let ref = object(object((await getJson(`${base}/git/ref/tags/${encodeURIComponent(tag)}`, reads)).body).object)
      for (let depth = 0; ref.type === 'tag' && depth < 5; depth++) {
        const sha = string(ref.sha)
        if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error('Malformed annotated tag SHA')
        ref = object(object((await getJson(`${base}/git/tags/${sha}`, reads)).body).object)
      }
      if (ref.type !== 'commit') throw new Error('Tag does not resolve to a commit')
      releases.push(release({ id: item.id, tag, commit: ref.sha, publishedAt: item.published_at }))
    }
    if (!result.link?.includes('rel="next"')) return releases
    if (result.body.length === 0) throw new Error('Incomplete empty release page')
  }
  throw new Error('Incomplete discovery: pagination limit reached')
}

/** Reconcile a complete observation set with supplied source evidence.
 * @param config - owning distribution.
 * @param lock - recorded release identities.
 * @param values - complete live or offline observations.
 * @returns Ordered next/current report, or a blocking reason.
 */
export function discover(config: Distribution, lock: SourceLock, values: unknown): Record<string, unknown> {
  try {
    const fixture = object(values)
    if (fixture.complete !== true || !Array.isArray(fixture.releases)) throw new Error('Incomplete discovery input')
    const byId = new Map<number, Release>()
    const byTag = new Map<string, Release>()
    for (const value of fixture.releases) {
      const item = release(value)
      if (!item.tag.startsWith(config.tagPrefix)) continue
      for (const existing of [byId.get(item.id), byTag.get(item.tag)]) if (existing !== undefined && !sameRelease(existing, item)) throw new Error(`Conflicting release identity: ${item.tag}`)
      byId.set(item.id, item)
      byTag.set(item.tag, item)
    }
    const observations = [...byId.values()].sort(compareRelease)
    for (const recorded of lock.observed) {
      const observed = byId.get(recorded.id)
      if (observed === undefined) throw new Error(`Missing recorded release: ${recorded.tag}`)
      if (!sameRelease(recorded, observed)) throw new Error(`Changed recorded release: ${recorded.tag}`)
    }
    for (const observed of observations) if (compareRelease(observed, lock.release) < 0 && !lock.observed.some(recorded => sameRelease(recorded, observed))) throw new Error(`Unexpected earlier release: ${observed.tag}`)
    const next = observations.find(item => compareRelease(item, lock.release) > 0) ?? null
    return { ...shadow, kind: 'discovery', distribution: config.id, state: next === null ? 'current' : 'next', baseline: lock.release, observations, next, nextAction: next === null ? 'No newer selected upstream release was observed.' : 'Review upstream source adoption separately; discovery does not authorize packaging or publication.' }
  } catch (error) {
    return { ...shadow, kind: 'discovery', distribution: config.id, state: 'blocked', blocker: error instanceof Error ? error.message : String(error), nextAction: 'Reconcile source evidence and rerun discovery.' }
  }
}
