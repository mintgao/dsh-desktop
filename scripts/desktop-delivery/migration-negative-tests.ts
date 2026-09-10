/** Execute the fixed upstream failure fixtures without replacing migration implementations. */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { digest, object, string } from './evidence.ts'

const execute = promisify(execFile)
const owner = 'packages/session/session-persistence-jsonl/tests/'
const cases = {
  'session-interruption-retry': [
    ['generation.spec.ts', 'leaves a crash-style staging file inert', 1],
    ['generation.spec.ts', 'removes an exclusively created stage when writing or syncing it fails', 1],
    ['multi-edge-publication.spec.ts', 're-prepares populated history after source drift rejects stale publication', 4],
  ],
  'session-source-drift': [
    ['generation.spec.ts', 'fails publication without rerunning migration when the source changes', 1],
    ['multi-edge-publication.spec.ts', 're-prepares populated history after source drift rejects stale publication', 4],
  ],
  'session-invalid-highest': [
    ['migration-refusal.spec.ts', 'refuses native V3', 4],
    ['jsonl.spec.ts', 'selects the highest opposite-encoding generation for its refusal', 1],
  ],
  'session-exclusive-writer': [
    ['lease.two-process.e2e.ts', 'excludes a live holder process and takes over immediately after its crash', 1],
  ],
} as const

/** Require successful concrete assertions from the fixed source test owners.
 * @param reports - Parsed Vitest reports from the exact source candidate.
 * @returns Scenario IDs mapped to the actual successful assertion names.
 */
export function migrationNegativeObservations(reports: unknown[]): Record<string, string[]> {
  const assertions: { file: string; name: string; status: string }[] = []
  for (const value of reports) {
    const report = object(value)
    if (report.success !== true || report.numFailedTests !== 0 || report.numPendingTests !== 0 || !Array.isArray(report.testResults)) {
      throw new Error('Migration source tests failed, skipped or returned an incomplete report')
    }
    for (const value of report.testResults) {
      const suite = object(value)
      if (suite.status !== 'passed' || !Array.isArray(suite.assertionResults)) throw new Error('Migration source suite did not pass')
      for (const value of suite.assertionResults) {
        const assertion = object(value)
        assertions.push({ file: string(suite.name), name: string(assertion.fullName), status: string(assertion.status) })
      }
    }
  }
  if (new Set(assertions.map(assertion => `${assertion.file}:${assertion.name}`)).size !== assertions.length) {
    throw new Error('Duplicate migration source assertions cannot satisfy required cases')
  }
  const observed = Object.fromEntries(Object.entries(cases).map(([id, required]) => {
    const names = required.flatMap(([file, title, minimum]) => {
      const selected = assertions.filter(assertion => assertion.file.replaceAll('\\', '/').endsWith(`/${owner}${file}`)
        && assertion.name.includes(title))
      if (selected.length < minimum || selected.some(assertion => assertion.status !== 'passed')) {
        throw new Error(`Migration negative fixture did not execute: ${id}: ${title}`)
      }
      return selected.map(assertion => `${owner}${file}: ${assertion.name}`)
    })
    return [id, [...new Set(names)]]
  }))
  const restoration = assertions.filter(assertion => assertion.file.replaceAll('\\', '/').endsWith('/scripts/desktop-delivery/tests/migration-data.spec.ts')
    && assertion.name === 'preserves the exact packaged runtime link and rejects damage before creating a restore root')
  if (restoration.length !== 1 || restoration[0]?.status !== 'passed') throw new Error('Migration negative fixture did not execute: restore-integrity-refusal')
  observed['restore-integrity-refusal'] = restoration.map(assertion => `scripts/desktop-delivery/tests/migration-data.spec.ts: ${assertion.name}`)
  return observed
}

/** Run candidate-owned upstream fixtures with private homes and no model credentials.
 * @param root - Exact candidate checkout containing built lib and declared Vitest.
 * @param output - Fresh caller-owned evidence directory.
 * @returns Explicit successful source assertions; this does not qualify packaged positive scenarios.
 */
export async function runMigrationNegativeTests(root: string, output: string): Promise<Record<string, unknown>> {
  if (existsSync(join(root, '.env'))) throw new Error('Migration source test checkout must not contain a credential environment file')
  mkdirSync(output, { mode: 0o700 })
  for (const name of ['home', 'tmp']) mkdirSync(join(output, name), { mode: 0o700 })
  const environment = { PATH: process.env['PATH'], HOME: join(output, 'home'), CFFIXED_USER_HOME: join(output, 'home'),
    TMPDIR: join(output, 'tmp'), MAC_CHROMIUM_TMPDIR: join(output, 'tmp'), DSH_HOME: join(output, 'home/.dsh'), DSH_TELEMETRY_DISABLED: '1' }
  const groups = [
    { name: 'unit', args: ['generation.spec.ts', 'multi-edge-publication.spec.ts', 'migration-refusal.spec.ts', 'jsonl.spec.ts',
      'v2-system-migration.spec.ts', 'v2-ptc-migration.spec.ts'].map(file => `${owner}${file}`).concat('scripts/desktop-delivery/tests/migration-data.spec.ts') },
    { name: 'lease', args: ['--config', 'vitest.e2e.config.ts', `${owner}lease.two-process.e2e.ts`] },
  ]
  const reports: unknown[] = []
  const files = []
  for (const group of groups) {
    const path = join(output, `${group.name}.json`)
    let result
    try {
      result = await execute(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', ...group.args,
        '--reporter=json', `--outputFile=${path}`], { cwd: root, env: environment, timeout: 180_000, maxBuffer: 10 * 1024 * 1024 })
    } catch (error) {
      const failed = error as Error & { stdout?: string; stderr?: string }
      writeFileSync(join(output, `${group.name}.stdout.log`), failed.stdout ?? '')
      writeFileSync(join(output, `${group.name}.stderr.log`), failed.stderr ?? String(error))
      throw error
    }
    writeFileSync(join(output, `${group.name}.stdout.log`), result.stdout)
    writeFileSync(join(output, `${group.name}.stderr.log`), result.stderr)
    const bytes = readFileSync(path)
    reports.push(JSON.parse(bytes.toString()))
    files.push({ name: `${group.name}.json`, size: bytes.length, sha256: digest(bytes) })
  }
  const result = { qualification: false, execution: 'negative-tests', scenarios: migrationNegativeObservations(reports), files }
  writeFileSync(join(output, 'negative-observations.json'), `${JSON.stringify(result, null, 2)}\n`)
  return result
}
