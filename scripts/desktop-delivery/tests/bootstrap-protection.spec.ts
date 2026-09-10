/** Hidden bypass fallback is limited to unchanged seed-bound administrator evidence. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { bootstrapProtectionPath, bootstrapResponsePath, canonicalJson, checkedBootstrapProtection, prepareBootstrapProtection, seedBootstrapProtection, verifyBootstrapProtection } from '../bootstrap-protection.ts'
import { deliveryConfig, GitHubError } from '../operations.ts'
import { protectionFixture } from './bootstrap-protection-fixture.ts'

it('accepts reordered visible keys and only an omitted or explicitly empty bypass field', async () => {
  const config = { ...deliveryConfig(resolve('.github/desktop-delivery/mint.json')), bootstrapRulesetId: 123 }
  const { rules, files } = await protectionFixture(config)
  const bytes = Buffer.from(files[bootstrapProtectionPath]!)
  const response = Buffer.from(files[bootstrapResponsePath]!)
  const projection = checkedBootstrapProtection(config, bytes, response)
  verifyBootstrapProtection(config, rules, projection)
  const hidden = { ...rules }; delete hidden.bypass_actors
  verifyBootstrapProtection(config, Object.fromEntries(Object.entries(hidden).reverse()), projection)
  expect(canonicalJson({ b: [2, 1], a: { z: 1, c: 2 } })).toBe('{"a":{"c":2,"z":1},"b":[2,1]}')
  for (const change of [{ bypass_actors: null }, { bypass_actors: [{}] }, { bypass_actors: {} }, { updated_at: '2026-09-08T13:00:00Z' }, { rules: [{ type: 'update' }] }, { conditions: { ref_name: { include: ['refs/tags/*'], exclude: [] } } }, { source: 'foreign/repo' }, { id: 124 }]) expect(() =>{  verifyBootstrapProtection(config, { ...hidden, ...change }, projection) }).toThrow()
  for (const key of Object.keys(projection)) {
    const incomplete = Object.fromEntries(Object.entries(hidden).filter(([name]) => name !== key))
    expect(() =>{  verifyBootstrapProtection(config, incomplete, projection) }).toThrow()
  }
  for (const change of [{ repositoryId: 1 }, { repository: 'foreign/repo' }, { rulesetId: 124 }, { administratorId: 1 }, { bypassActors: null }]) expect(() => checkedBootstrapProtection(config, Buffer.from(JSON.stringify({ ...JSON.parse(bytes.toString()) as object, ...change })), response)).toThrow()
  expect(() => checkedBootstrapProtection(config, bytes, Buffer.concat([response, Buffer.from(' ')]))).toThrow('bytes differ')
  expect(() => checkedBootstrapProtection({ ...config, bootstrapRulesetId: 124 }, bytes, response)).toThrow()
  for (const failure of [new GitHubError(403, 'GET', '/rulesets/123'), new Error('network exhausted')]) await expect(seedBootstrapProtection(config, { async request() { throw failure } }, 'a'.repeat(40))).rejects.toThrow(failure.message)
})

it('requires explicit empty bypass in the successful administrator response', async () => {
  const config = { ...deliveryConfig(resolve('.github/desktop-delivery/mint.json')), bootstrapRulesetId: 123 }
  const { rules } = await protectionFixture(config)
  for (const bypass of [undefined, null, [{}]]) {
    const response: Record<string, unknown> = { ...rules, bypass_actors: bypass }
    if (bypass === undefined) delete response.bypass_actors
    await expect(prepareBootstrapProtection(config, { async request(_method, path) {
      if (path === '/user') return { id: config.maintainerIds[0] }
      if (path.includes('/rulesets/')) return response
      return { id: config.repositoryId, full_name: config.repository, permissions: { admin: true } }
    } })).rejects.toThrow('explicitly empty')
  }
})

it('compares the actual public and administrator response pair without rewriting retained bytes', async () => {
  const config = { ...deliveryConfig(resolve('.github/desktop-delivery/mint.json')), bootstrapRulesetId: 22549859 }
  const raw = readFileSync(new URL('./fixtures/ruleset-time/administrator.json', import.meta.url))
  const administrator = JSON.parse(raw.toString()) as Record<string, unknown>
  const fresh = JSON.parse(readFileSync(new URL('./fixtures/ruleset-time/public.json', import.meta.url), 'utf8')) as Record<string, unknown>
  const prepared = await prepareBootstrapProtection(config, { async request(_method, path) {
    if (path === '/user') return { id: config.maintainerIds[0] }
    if (path.includes('/rulesets/')) return administrator
    return { id: config.repositoryId, full_name: config.repository, permissions: { admin: true } }
  } })
  expect(Buffer.from(prepared.response)).toEqual(raw)
  const observed = checkedBootstrapProtection(config, Buffer.from(JSON.stringify(prepared.attestation)), raw)
  verifyBootstrapProtection(config, fresh, observed)
  expect(() => {
    verifyBootstrapProtection(config, { ...fresh, updated_at: '2026-09-08T13:49:50.403Z' }, observed)
  }).toThrow('changed')
  expect(() => {
    verifyBootstrapProtection(config, { ...fresh, enforcement: 'disabled' }, observed)
  }).toThrow()
})
