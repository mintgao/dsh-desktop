/** Source-plane desktop delivery CLI; only explicit local output files are written. */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs, type ParseArgsConfig } from 'node:util'
import { isEntry } from '../release/process.ts'
import { artifact, combine, summary } from './artifacts.ts'
import { candidate } from './candidate.ts'
import { discover, githubReleases } from './discovery.ts'
import { distribution, readJson, shadow, sourceLock, type Architecture } from './evidence.ts'
import { reviewedCommand, reviewedSummary } from './reviewed-cli.ts'
import { smokeDmg } from './smoke.ts'

/** Execute one command and write a local report, including explicit blockers on failure.
 * @param args - command arguments after the script name.
 * @returns Exit status: zero on success, one for a blocked command.
 */
export async function main(args: string[]): Promise<number> {
  const options: ParseArgsConfig['options'] = { apply: { type: 'boolean' }, 'copy-install': { type: 'boolean' } }
  const parsed = parseArgs({ args, allowPositionals: true, strict: true, options: { ...options, ...Object.fromEntries(['config', 'lock', 'fixture', 'out', 'summary', 'root', 'expected-commit', 'candidate', 'dmg', 'smoke', 'arch', 'directory', 'reports', 'plan', 'digest', 'base', 'version', 'checkout', 'bundle', 'admin-evidence', 'baseline-output', 'migration-report', 'desktop-version', 'manifest', 'run-id', 'run-attempt', 'tag', 'operation', 'native', 'notes', 'compatibility', 'baseline', 'workflow-commit', 'lock-path', 'kind', 'run-url', 'legacy-ref', 'legacy-path', 'draft-id', 'bootstrap-context', 'target-tag', 'target-commit', 'assessment'].map(name => [name, { type: 'string' as const }])) } })
  const values: Record<string, string | boolean | undefined> = parsed.values
  const required = (name: string): string => {
    const value = values[name]
    if (typeof value !== 'string' || value === '') throw new Error(`Missing --${name}`)
    return value
  }
  const out = required('out')
  let report: Record<string, unknown>
  try {
    if (parsed.positionals.length !== 1) throw new Error('Expected exactly one delivery command')
    const configPath = required('config')
    const config = distribution(readJson(configPath))
    switch (parsed.positionals[0]) {
      case 'discover': {
        const lock = sourceLock(readJson(required('lock')), config)
        const fixture = values.fixture
        report = discover(config, lock, typeof fixture === 'string' ? readJson(fixture) : { complete: true, releases: await githubReleases(config) })
        break
      }
      case 'candidate': report = candidate(resolve(typeof values.root === 'string' ? values.root : '.'), configPath, required('lock'), required('expected-commit')); break
      case 'smoke': report = await smokeDmg(configPath, required('candidate'), required('dmg'), required('arch') as Architecture, { copyInstall: values['copy-install'] === true, ...(typeof values['desktop-version'] === 'string' ? { desktopVersion: values['desktop-version'] } : {}) }); break
      case 'artifact': report = artifact(configPath, required('candidate'), required('dmg'), required('smoke'), required('arch') as Architecture); break
      case 'combine': report = combine(configPath, required('candidate'), required('directory'), required('reports').split(',')); break
      default: report = await reviewedCommand(parsed.positionals[0] ?? '', parsed.values)
    }
  } catch (error) {
    report = { ...shadow, kind: parsed.positionals[0] === 'discover' ? 'discovery' : parsed.positionals[0] ?? 'unknown', state: 'blocked', blocker: error instanceof Error ? error.message : String(error), nextAction: 'Correct the blocking evidence and explicitly rerun this command.' }
  }
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  const render = values['copy-install'] !== true && ['discover', 'candidate', 'smoke', 'artifact', 'combine'].includes(parsed.positionals[0] ?? '') ? summary : reviewedSummary
  if (typeof values.summary === 'string') writeFileSync(values.summary, render(report), { mode: 0o600 })
  process.stdout.write(render(report))
  return report.state === 'blocked' ? 1 : 0
}

if (isEntry(import.meta.url)) process.exitCode = await main(process.argv.slice(2))
