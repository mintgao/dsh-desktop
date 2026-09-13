/** Exercise the real assembled CLI with entirely synthetic profile and credential roots. */
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { prepareMintProfile } from '../../lib/types/profile.js'
import { BackendSupervisor } from '../../lib/types/backend.js'
import { probeBackendPage } from '../../lib/types/backend-admission.js'
const home = mkdtempSync(join(tmpdir(), 'mint-runtime-check-'))
const executablePath = process.env.PATH
for (const key of Object.keys(process.env)) delete process.env[key]
Object.assign(process.env, { PATH: executablePath, DSH_HOME: join(home, '.dsh'), DSH_AGENTS_HOME: join(home, '.agents'), HOME: home, CFFIXED_USER_HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, '.config'), DSH_TELEMETRY_DISABLED: '1' })
const root = resolve('apps/desktop-mint/backend')
const cli = join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
const record = JSON.parse(readFileSync(join(root, 'assembly.json')))
let backend
try {
  const web = spawnSync(process.execPath, [cli, '--profile', 'web', '--dump-default-config'], { cwd: home, env: process.env, encoding: 'utf8' })
  assert.equal(web.status, 0, web.stderr)
  assert.doesNotMatch(web.stdout, /dsh-client-ui-session-notifications/u)
  await prepareMintProfile(cli, record)
  const before = readFileSync(join(process.env.DSH_HOME, 'profiles/desktop-mint/package.json'))
  await prepareMintProfile(cli, record)
  assert.deepEqual(readFileSync(join(process.env.DSH_HOME, 'profiles/desktop-mint/package.json')), before)
  const profile = join(process.env.DSH_HOME, 'profiles/desktop-mint')
  const lock = join(process.env.DSH_HOME, 'profiles/.desktop-mint-initialization')
  mkdirSync(lock)
  await assert.rejects(prepareMintProfile(cli, record), /active or interrupted/u)
  rmSync(lock, { recursive: true })
  const conflict = join(profile, 'node_modules/@deepseek-ai/dsh-client-ui-session-notifications')
  rmSync(conflict)
  mkdirSync(conflict)
  writeFileSync(join(conflict, 'package.json'), '{"name":"conflicting-user-package"}')
  await assert.rejects(prepareMintProfile(cli, record), /conflicts/u)
  assert.equal(readFileSync(join(conflict, 'package.json'), 'utf8'), '{"name":"conflicting-user-package"}')
  assert.deepEqual(readFileSync(join(profile, 'package.json')), before)
  rmSync(conflict, { recursive: true })
  await prepareMintProfile(cli, record)
  backend = new BackendSupervisor({ executable: process.execPath, cliPath: cli, cwd: home, electronNodeMode: false })
  const url = await backend.start()
  await probeBackendPage(url)
  const auth = await fetch(url, { redirect: 'manual' })
  const cookie = auth.headers.getSetCookie()[0].split(';')[0]
  const page = await fetch(new URL('/', url), { headers: { Cookie: cookie } })
  const html = await page.text()
  const match = html.match(/"(\/plugins\/[^"<>]*dsh-client-ui-session-notifications[^"<>]*)"/u)
  assert.ok(match, 'Mint Client must be advertised by the actual Web graph')
  const client = await fetch(new URL(match[1].replaceAll('&amp;', '&'), url), { headers: { Cookie: cookie } })
  assert.equal(client.status, 200)
  assert.match(await client.text(), /__ModuleLoader__\.load/u)
  console.log('PASS: real official RC.2 + packed Mint Host/Client, authenticated HTML and client asset, preserved existing manifest')
} finally {
  await backend?.stop()
  rmSync(home, { recursive: true, force: true })
}
