import { protectionFixture } from './bootstrap-protection-fixture.ts'
/** Initial installation binds real seed bytes to existing adoption evidence and exact base-tree absence. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { bootstrapAdoption, bootstrapPlan } from '../bootstrap.ts'
import { deliveryConfig, GitHubError, type GitHub } from '../operations.ts'
import { digest, object } from '../evidence.ts'

it('creates an explicit absent-lock plan from real Git and blocks unproven absence before writes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-bootstrap-'))
  const git = (...args: string[]): string => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8' }).trim()
  try {
    git('init', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid')
    writeFileSync(join(root, 'source'), 'upstream source')
    git('add', '.'); git('commit', '-m', 'upstream')
    const upstream = { id: 1, tag: 'dsh-v1.0.0-alpha.1', commit: git('rev-parse', 'HEAD'), publishedAt: '2026-01-01T00:00:00Z' }
    const config = deliveryConfig(resolve('.github/desktop-delivery/mint.json'))
    const legacy = { schemaVersion: 2, upstreamRepository: config.upstreamRepository, lastPublishedRelease: upstream }
    const bytes = `${JSON.stringify(legacy, null, 2)}\n`
    mkdirSync(join(root, 'state'))
    writeFileSync(join(root, 'state/upstream-adoption.json'), bytes)
    git('add', '.'); git('commit', '-m', 'existing adoption evidence')
    const base = git('rev-parse', 'HEAD')
    const configured = { ...config, bootstrapRulesetId: 123, legacyAdoptionEvidence: { commit: base, path: 'state/upstream-adoption.json', digest: digest(bytes) } }
    mkdirSync(join(root, '.github/desktop-delivery'), { recursive: true })
    const seedLock = { schemaVersion: 1,
      upstreamRepository: config.upstreamRepository,
      release: upstream,
      predecessor: null,
      observed: [upstream] }
    const seedBytes = `${JSON.stringify(seedLock, null, 2)}\n`
    writeFileSync(join(root, config.sourceLockPath), seedBytes)
    const protection = await protectionFixture(configured)
    for (const [path, content] of Object.entries(protection.files)) writeFileSync(join(root, path), content)
    writeFileSync(join(root, 'implementation'), 'reviewed implementation')
    git('add', '.'); git('commit', '-m', 'implementation seed')
    const seed = git('rev-parse', 'HEAD')
    const plan = bootstrapPlan(configured, root, base, seed, base, 'state/upstream-adoption.json')
    expect(plan.baseLock).toEqual({ state: 'absent', baseCommit: base, path: config.sourceLockPath })
    expect(plan.seedLockDigest).toBe(digest(seedBytes))
    expect(object(plan.proposedLock).schemaVersion).toBe(2)
    expect(object(plan.proposedLock).release).toEqual(upstream)
    let writes = 0
    let truncated = true
    const api: GitHub = { async request(method, path) {
      if (method !== 'GET') { writes++; throw new Error('Unexpected fixture write') }
      if (path.includes('/contents/.github/workflows/desktop-delivery-adopt.yml')) throw new GitHubError(404, method, path)
      if (path.includes('/git/ref/heads/main')) return { object: { sha: base } }
      if (path.includes('/git/ref/tags/')) return { object: { type: 'commit', sha: seed } }
      if (path.includes('/rulesets/')) return protection.rules
      const evidencePath = path.split('/contents/')[1]?.split('?')[0]
      if (evidencePath !== undefined && protection.files[evidencePath] !== undefined) return { type: 'file', encoding: 'base64', path: evidencePath, content: Buffer.from(protection.files[evidencePath]).toString('base64') }
      if (path.includes('/environments/')) return { protection_rules: [{ type: 'required_reviewers', reviewers: [{ reviewer: { id: config.maintainerIds[0] } }] }] }
      if (path.endsWith('/pending_deployments')) return []
      if (path.includes('/actions/runs/')) return { event: 'workflow_dispatch', head_branch: `${config.bootstrapTagPrefix}fixture`, path: '.github/workflows/desktop-ci.yml', head_sha: seed, run_attempt: 1, status: 'in_progress' }
      if (path.includes('/git/commits/')) return { tree: { sha: git('rev-parse', `${base}^{tree}`) } }
      if (path.includes('/git/trees/')) return { truncated, tree: [] }
      if (path.includes('/contents/')) throw new Error('Fixture lookup unavailable')
      return { id: config.repositoryId }
    } }
    const context = { ref: `refs/tags/${config.bootstrapTagPrefix}fixture`, commit: seed, runId: '1', attempt: '1' }
    await expect(bootstrapAdoption(configured, plan, api, context)).rejects.toThrow('does not prove')
    await expect(bootstrapAdoption(configured, { ...plan, bootstrapProtectionDigest: '0'.repeat(64) }, api, context)).rejects.toThrow('protection digest differs')
    truncated = false
    await expect(bootstrapAdoption(configured, plan, api, context)).rejects.toThrow('lookup unavailable')
    await expect(bootstrapAdoption(configured, plan, api, { ...context, ref: 'refs/heads/main' })).rejects.toThrow('ref differs')
    expect(writes).toBe(0)
    expect(() => bootstrapPlan(configured, root, seed, seed, base, 'state/upstream-adoption.json')).toThrow('Existing base lock')
    expect(() => bootstrapPlan({ ...configured, legacyAdoptionEvidence: { ...configured.legacyAdoptionEvidence, digest: '0'.repeat(64) } }, root, base, seed, base, 'state/upstream-adoption.json')).toThrow('evidence bytes differ')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
