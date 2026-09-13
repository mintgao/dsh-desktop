/** Execute a fixed retained-A capability probe; never publishes or grants GUI permissions. */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { withCopiedApp } from './migration-qualifier.ts'
import { runtimeInventory } from './runtime-inventory.ts'
import { hostedProbeDriver, runForwardProbe } from './forward-native-probe.ts'
import { forwardProbeSpec, verifyProbeInputs } from './forward-native-probe-input.ts'

const { values } = parseArgs({ options: { spec: { type: 'string' }, dmg: { type: 'string' }, out: { type: 'string' }, 'timeout-ms': { type: 'string' } } })
if (!values.spec || !values.dmg || !values.out || values['timeout-ms'] !== '120000') throw new Error('Expected fixed spec, DMG, output and 120000 ms deadline')
const spec = forwardProbeSpec(JSON.parse(readFileSync(values.spec, 'utf8')))
const dmg = values.dmg
const directory = dirname(dmg)
let receipt: Record<string, unknown> = { purpose: spec.purpose, qualificationEligible: false, state: 'blocked', firstFailure: 'input-authentication' }
try {
  verifyProbeInputs(spec, dmg, readFileSync(join(directory, spec.candidate.name)), readFileSync(join(directory, spec.native.name)))
  receipt = { ...receipt, firstFailure: 'staging-or-runtime-identity' }
  await withCopiedApp(dmg, async (app) => {
    if (runtimeInventory(app).sha256 !== spec.runtimeDigest) throw new Error('Probe runtime digest differs')
    const arch = execFileSync('/usr/bin/lipo', ['-archs', join(app, 'Contents/MacOS/DSH Desktop')], { encoding: 'utf8', timeout: 5000 }).trim()
    if (arch !== 'x86_64') throw new Error('Probe runtime is not native Intel')
    const fixture = hostedProbeDriver(app)
    const result = await runForwardProbe(app, fixture.driver)
    receipt = { ...result, artifact: spec, runnerArchitecture: process.arch,
      roots: { application: app, staging: dirname(dirname(app)), ...fixture.roots } }
    if (result.cleanup.stopped) fixture.dispose()
    if (!result.cleanup.stopped) throw new Error('Probe cleanup remains blocked')
  })
} catch {
  receipt.firstFailure ??= 'staging-or-runtime-immutability:refused'
  receipt.state = 'blocked'
} finally {
  writeFileSync(values.out, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
}
if (receipt.state !== 'observed') process.exitCode = 1
