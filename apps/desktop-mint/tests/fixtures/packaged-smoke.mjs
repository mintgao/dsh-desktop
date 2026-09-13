/** Exercise the shipped Electron bootstrap and synchronous refusal with isolated native roots. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const executable = resolve(process.argv[2] === '--' ? process.argv[3] : process.argv[2])
for (const rejected of [false, true]) {
  const root = mkdtempSync(join(tmpdir(), 'mint-packaged-smoke-'))
  const home = join(root, 'home'), temporary = join(root, 'tmp')
  mkdirSync(home)
  mkdirSync(temporary)
  try {
    const result = spawnSync(executable, [`--user-data-dir=${join(root, 'userdata')}`, '--dsh-package-smoke'], {
      cwd: root,
      env: {
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, CFFIXED_USER_HOME: home,
        TMPDIR: temporary, MAC_CHROMIUM_TMPDIR: temporary,
        DSH_HOME: join(home, '.dsh'), DSH_AGENTS_HOME: join(home, '.agents'),
        ...(rejected ? { DSH_DESKTOP_CLI_PATH: join(root, 'forbidden.js') } : {}),
      },
      timeout: 30_000, killSignal: 'SIGKILL', encoding: 'utf8',
    })
    assert.equal(result.error, undefined, String(result.error))
    assert.equal(result.signal, null)
    assert.equal(result.status, rejected ? 1 : 0, result.stderr)
    if (rejected) assert.match(result.stderr, /Packaged CLI overrides are unavailable/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
console.log('PASS: packaged initialization exits 0; forbidden CLI override exits 1 without hanging')
