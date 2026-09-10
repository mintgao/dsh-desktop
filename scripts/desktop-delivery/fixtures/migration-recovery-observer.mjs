/** Observe real packaged recovery after a separate, stopped-store fixture preparation. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { globSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'

const stage = process.env.DSH_MIGRATION_STAGE
const preparation = stage.startsWith('prepare-')
const projection = stage === 'projection-invalid'
const builtWorker = stage === 'built-worker'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

/** Preparation owns its Domain handle; observations require the ordinary consumer. */
export const inject = preparation ? ['storageDomain'] : projection ? ['sessionProjectionCache'] : builtWorker ? ['sessionQuery']
  : stage.startsWith('credentials-invalid-') ? ['credentials'] : ['workspaceRegistry']

/** Execute a synthetic interruption or observe the ordinary consumer's recovery.
 * @param ctx - exact packaged context with the selected services injected.
 */
export async function apply(ctx) {
  try {
    let observation
    if (stage === 'env-home-proxy') {
      assert.equal(process.env.HTTP_PROXY, 'http://127.0.0.1:1')
      assert.equal(process.env.NO_PROXY, '127.0.0.1,localhost,::1,[::1]')
      observation = { homeProxy: process.env.HTTP_PROXY, noProxy: process.env.NO_PROXY }
    } else if (builtWorker) {
      const id = 'generated-baseline-history'
      const directory = join(process.env.DSH_HOME, 'sessions')
      const files = globSync(`**/${id}/session.v3.jsonl.zstd`, { cwd: directory })
      assert.equal(files.length, 1)
      const path = join(directory, files[0])
      const workerPath = join(process.env.DSH_MIGRATION_APP,
        'Contents/Resources/backend/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/worker.cjs')
      const snapshot = await ctx.sessionQuery.readSession(id)
      const before = hash(readFileSync(path))
      const verify = async (expectedEventCount) => {
        const worker = new Worker(workerPath, { workerData: { path, compression: 'zstd', expectedId: id, expectedEventCount } })
        let timer
        const exit = new Promise(resolve => worker.once('exit', resolve))
        try {
          const result = await Promise.race([
            new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject) }),
            exit.then(code => { throw new Error(`Verifier exited before its result: ${code}`) }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Built verifier deadline exceeded')), 20000) }),
          ])
          assert.equal(await exit, 0)
          return result
        } finally { clearTimeout(timer); await worker.terminate() }
      }
      const accepted = await verify(snapshot.events.length)
      const refused = await verify(snapshot.events.length + 1)
      assert.equal(accepted.ok, true)
      assert.equal(refused.ok, false)
      assert.equal(hash(readFileSync(path)), before)
      observation = { workerDigest: hash(readFileSync(workerPath)), generationDigest: before,
        expectedEventCount: snapshot.events.length, accepted, refused, runtime: process.versions }
    } else if (preparation) {
      const packages = join(process.env.DSH_MIGRATION_APP, 'Contents/Resources/backend/node_modules/@deepseek-ai')
      const { workspaceDomainSpec } = await import(pathToFileURL(join(packages, 'dsh-workspace/lib/index.js')).href)
      const domain = await ctx.storageDomain.open(workspaceDomainSpec)
      try {
        const before = domain.global.get()
        const table = domain.table('workspaces')
        const record = table.get(before.workspaceIds[0])
        assert.ok(record)
        const orphan = 'qualification-pending-orphan'
        assert.equal(table.get(orphan), undefined)
        await table.put(orphan, { ...record, sessionIds: [] })
        await domain.global.set({ ...before, pendingMutation: { operation: stage.slice('prepare-'.length), workspaceId: orphan } })
        observation = { before, orphan, scope: 'fixture-preparation' }
      } finally { await domain.close() }
    } else if (projection) {
      const directory = join(process.env.DSH_HOME, 'storages/session_projcache/sessions')
      const backups = readdirSync(directory).filter(name => /^qualification-broken\.json\.bak\.\d{12}$/.test(name))
      assert.equal(backups.length, 1)
      const fixture = JSON.parse(readFileSync(process.env.DSH_MIGRATION_FIXTURE, 'utf8'))
      assert.equal(hash(readFileSync(join(directory, backups[0]))), fixture.brokenDigest)
      assert.equal(hash(readFileSync(join(directory, 'generated-baseline-history.json'))), fixture.survivorDigest)
      assert.equal(readdirSync(directory).includes('qualification-broken.json'), false)
      observation = { backup: backups[0], brokenDigest: fixture.brokenDigest, survivorDigest: fixture.survivorDigest }
    } else {
      const prepared = JSON.parse(readFileSync(process.env.DSH_MIGRATION_FIXTURE, 'utf8')).observation
      assert.equal(ctx.workspaceRegistry.get(prepared.orphan), undefined)
      assert.deepEqual(ctx.workspaceRegistry.list().map(workspace => workspace.id), prepared.before.workspaceIds)
      assert.deepEqual([...ctx.workspaceRegistry.archivedSessionIds], prepared.before.archivedSessionIds)
      const document = JSON.parse(readFileSync(join(process.env.DSH_HOME, 'storages/workspace.json'), 'utf8'))
      assert.equal(document.global.pendingMutation, undefined)
      assert.equal(document.tables.workspaces[prepared.orphan], undefined)
      observation = { order: prepared.before.workspaceIds, archived: prepared.before.archivedSessionIds, orphanRemoved: prepared.orphan }
    }
    // Worker physical identities contain bigint stat values; preserve their exact decimal representation.
    writeFileSync(process.env.DSH_MIGRATION_RESULT, JSON.stringify({ stage, observation }, (_key, value) =>
      typeof value === 'bigint' ? { type: 'bigint', decimal: value.toString() } : value))
    console.log('DSH_MIGRATION_AGENT_COMPLETE')
  } catch (error) {
    writeFileSync(process.env.DSH_MIGRATION_RESULT, JSON.stringify({ error: String(error), stack: error.stack }))
    console.log('DSH_MIGRATION_AGENT_COMPLETE')
  }
}
