import { protectionFixture } from './bootstrap-protection-fixture.ts'
/** Bootstrap probe never changes release visibility or unrelated asset bytes. */
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { probeDraft, probePlan } from '../probe.ts'
import { deliveryConfig, GitHubError, type GitHub } from '../operations.ts'
import { object } from '../evidence.ts'
it('reconciles fixed probe bytes, removes only its asset and restores the exact draft body', async () => {
  const config = { ...deliveryConfig(resolve('.github/desktop-delivery/mint.json')), bootstrapRulesetId: 123 }
  const protection = await protectionFixture(config)
  const commit = 'a'.repeat(40); const tag = `${config.bootstrapTagPrefix}fixture`
  const draft = { id: 10, tag_name: tag, draft: true, prerelease: true, body: 'Original\nbody\n' }
  let asset: { id: number; name: string; bytes: Uint8Array } | undefined
  let interrupted = true
  let corrupted = false
  const writes: Array<{ method: string; body: unknown }> = []
  const api: GitHub = { async request(method, path, body) {
    if (method !== 'GET' && method !== 'DOWNLOAD') writes.push({ method, body })
    if (path.includes('/contents/.github/workflows/desktop-delivery-adopt.yml')) throw new GitHubError(404, method, path)
    if (path.includes('/git/ref/tags/')) return { object: { type: 'commit', sha: commit } }
    if (path.includes('/rulesets/')) return protection.rules
    const evidencePath = path.split('/contents/')[1]?.split('?')[0]
    if (evidencePath !== undefined && protection.files[evidencePath] !== undefined) return { type: 'file', encoding: 'base64', path: evidencePath, content: Buffer.from(protection.files[evidencePath]).toString('base64') }
    if (path.includes('/environments/')) return { protection_rules: [{ type: 'required_reviewers', reviewers: [{ reviewer: { id: config.maintainerIds[0] } }] }] }
    if (path.endsWith('/pending_deployments')) return []
    if (path.includes('/actions/runs/')) return { path: '.github/workflows/desktop-ci.yml', head_sha: commit, run_attempt: 1, event: 'workflow_dispatch', head_branch: tag, status: 'in_progress', repository: { id: config.repositoryId } }
    if (path.includes('/releases/assets/')) {
      if (method === 'DELETE') { asset = undefined; throw new Error('Delete response lost') }
      return corrupted ? Buffer.from('foreign bytes') : asset?.bytes
    }
    if (path.includes('/releases/10/assets')) {
      if (method === 'POST') {
        if (!(body instanceof Uint8Array)) throw new Error('Expected fixed content')
        asset = { id: 20, name: new URL(path).searchParams.get('name') ?? '', bytes: body }
        if (interrupted) { interrupted = false; throw new Error('Upload response lost') }
        return {}
      }
      return asset === undefined ? [] : [{ id: asset.id, name: asset.name }]
    }
    if (path.endsWith('/releases/10')) {
      if (method === 'PATCH') {
        const edit = object(body)
        expect(Object.keys(edit).sort()).toEqual(['body', 'draft', 'prerelease', 'tag_name'])
        expect(edit.draft).toBe(true)
        expect(edit.tag_name).toBe(tag)
        expect(edit.prerelease).toBe(true)
        Object.assign(draft, edit)
      }
      return draft
    }
    throw new Error(`Unexpected probe fixture ${method} ${path}`)
  } }
  const plan = await probePlan(config, 10, tag, commit, api)
  const context = { ref: `refs/tags/${tag}`, commit, runId: '1', attempt: '1' }
  expect((await probeDraft(config, plan, api, context)).state).toBe('draft-access-verified')
  expect(draft.body).toBe('Original\nbody\n')
  expect(draft.draft).toBe(true)
  expect(asset).toBeUndefined()
  for (const drift of [{ id: 99 }, { tag_name: 'temporary-server-tag' }, { prerelease: false }, { draft: false }, { body: 'Foreign body' }]) {
    const before = writes.length
    const drifting: GitHub = { async request(method, path, body) {
      const result = await api.request(method, path, body)
      if (method === 'PATCH') Object.assign(draft, drift)
      return result
    } }
    await expect(probeDraft(config, plan, drifting, context)).rejects.toThrow('maintainer recovery')
    expect(writes.slice(before).map(write => write.method)).toEqual(['POST', 'PATCH'])
    expect(asset).toBeDefined()
    // Only explicit owner restoration permits resuming the same reviewed probe.
    Object.assign(draft, { id: 10, tag_name: tag, prerelease: true, draft: true, body: 'Original\nbody\n' })
    const resumed = writes.length
    expect((await probeDraft(config, plan, api, context)).state).toBe('draft-access-verified')
    expect(writes.slice(resumed).map(write => write.method)).toEqual(['PATCH', 'DELETE', 'PATCH'])
    expect(asset).toBeUndefined()
  }
  const count = writes.length
  await expect(probeDraft(config, { ...plan, bootstrapProtectionDigest: '0'.repeat(64) }, api, context)).rejects.toThrow('protection digest differs')
  await expect(probeDraft({ ...config, bootstrapEnvironment: 'foreign' }, plan, { async request(method, path, body) {
    if (path.includes('/environments/foreign')) throw new GitHubError(403, method, path)
    return api.request(method, path, body)
  } }, context)).rejects.toThrow()
  for (const failure of [new GitHubError(403, 'GET', '/rulesets/123'), new Error('network exhausted')]) {
    await expect(probeDraft(config, plan, { async request(method, path, body) {
      if (path.includes('/rulesets/')) throw failure
      return api.request(method, path, body)
    } }, context)).rejects.toThrow(failure.message)
  }
  expect(writes.length).toBe(count)
  draft.draft = false
  await expect(probeDraft(config, plan, api, context)).rejects.toThrow('became public')
  expect(writes.length).toBe(count)
  draft.draft = true
  corrupted = true
  asset = { id: 20, name: String(plan.assetName), bytes: Buffer.from('foreign bytes') }
  await expect(probeDraft(config, plan, api, context)).rejects.toThrow('bytes conflict')
  expect(writes.length).toBe(count)
})
