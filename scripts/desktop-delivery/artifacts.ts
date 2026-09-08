/** Bind per-architecture files and mounted payload smoke to exact candidate bytes. */
import { readFileSync, statSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { readCandidate } from './candidate.ts'
import { assetPath, digest, distribution, hex, object, readJson, shadow, shadowRecord, string, type Architecture } from './evidence.ts'

/** Validate architecture reported by macOS lipo, rejecting universal or substituted binaries.
 * @param output - lipo -archs output.
 * @param architecture - required native architecture.
 */
export function checkArchitecture(output: string, architecture: Architecture): void {
  if (output.trim() !== (architecture === 'x64' ? 'x86_64' : 'arm64')) throw new Error('Executable architecture does not match candidate architecture')
}

function checkedSmoke(path: string, candidateDigest: string, architecture: Architecture, dmgDigest: string): Record<string, unknown> {
  const smoke = shadowRecord(readJson(assetPath(dirname(path), basename(path))))
  if (smoke.kind !== 'smoke' || smoke.candidateDigest !== candidateDigest || smoke.architecture !== architecture || smoke.dmgDigest !== dmgDigest || smoke.bootstrap !== true || smoke.backendHttp !== true || smoke.backendStopped !== true || smoke.mountedReadOnly !== true || smoke.detached !== true) throw new Error('Missing or mismatched packaged smoke evidence')
  checkArchitecture(string(smoke.executableArchitectures), architecture)
  return smoke
}

/** Hash one DMG only after the mounted payload passed its required smokes.
 * @param configPath - distribution JSON.
 * @param candidatePath - exact candidate JSON.
 * @param dmgPath - produced regular DMG file.
 * @param smokePath - smoke report bound to that DMG.
 * @param architecture - required native architecture.
 * @returns Non-publishable architecture report.
 */
export function artifact(
  configPath: string, candidatePath: string, dmgPath: string, smokePath: string, architecture: Architecture,
): Record<string, unknown> {
  const config = distribution(readJson(configPath))
  if (!config.architectures.includes(architecture)) throw new Error('Architecture not configured')
  const selected = readCandidate(candidatePath, configPath)
  const path = assetPath(dirname(dmgPath), basename(dmgPath))
  const size = statSync(path).size
  if (size <= 0 || !path.endsWith('.dmg')) throw new Error('Empty or non-DMG artifact')
  const sha256 = digest(readFileSync(path))
  checkedSmoke(smokePath, selected.digest, architecture, sha256)
  return { ...shadow, kind: 'artifact', candidateDigest: selected.digest, architecture, filename: basename(path), size, sha256, smoke: basename(smokePath), smokeDigest: digest(readFileSync(smokePath)) }
}

/** Rehash downloaded files and require one successful report per configured architecture.
 * @param configPath - distribution JSON.
 * @param candidatePath - expected candidate JSON.
 * @param directory - downloaded files directory.
 * @param reportNames - complete architecture report filenames.
 * @returns Combined shadow manifest; dirty candidates cannot qualify.
 */
export function combine(configPath: string, candidatePath: string, directory: string, reportNames: string[]): Record<string, unknown> {
  const config = distribution(readJson(configPath))
  const selected = readCandidate(candidatePath, configPath)
  if (selected.record.qualificationEligible !== true) throw new Error('Dirty candidate is diagnostic and cannot qualify')
  if (reportNames.length !== config.architectures.length || new Set(reportNames).size !== reportNames.length) throw new Error('Missing or duplicate architecture report')
  const architectures = new Set<string>()
  const assets = new Set<string>()
  const reports = reportNames.map((name) => {
    const report = shadowRecord(readJson(assetPath(directory, name)))
    const arch = string(report.architecture) as Architecture
    if (report.kind !== 'artifact' || report.candidateDigest !== selected.digest || !config.architectures.includes(arch) || architectures.has(arch)) throw new Error('Wrong or duplicate architecture candidate')
    architectures.add(arch)
    const filename = string(report.filename)
    const smokeName = string(report.smoke)
    for (const asset of [filename, smokeName]) {
      if (assets.has(asset) || reportNames.includes(asset)) throw new Error('Duplicate asset')
      assets.add(asset)
    }
    const file = assetPath(directory, filename)
    if (!filename.endsWith('.dmg') || statSync(file).size !== report.size || report.size <= 0 || digest(readFileSync(file)) !== hex(report.sha256)) throw new Error('Artifact bytes changed')
    const smoke = assetPath(directory, smokeName)
    if (digest(readFileSync(smoke)) !== hex(report.smokeDigest)) throw new Error('Smoke evidence bytes changed')
    checkedSmoke(smoke, selected.digest, arch, string(report.sha256))
    return report
  })
  return { ...shadow, kind: 'combined', state: 'shadow-qualified', candidateDigest: selected.digest, downstreamCommit: selected.record.downstreamCommit, distribution: config.id, assets: reports, nextAction: 'Shadow preview checks passed. Review evidence; production publication remains a separate unimplemented gate.' }
}

/** Render maintainer-oriented output without claiming publication or notification delivery.
 * @param report - command result.
 * @returns Notification-ready local Markdown.
 */
export function summary(report: Record<string, unknown>): string {
  const upstream = report.next ?? report.upstream ?? report.baseline
  const observed = upstream === null || upstream === undefined ? 'see discovery report' : string(object(upstream).tag)
  const blocker = report.blocker === undefined ? [] : [
    'Blocker:', '',
    ...(typeof report.blocker === 'string' ? report.blocker : string(report.blocker))
      .replace(/\r\n?/gu, '\n').split('\n').map(line => `    ${line}`),
    '',
  ]
  const checks = report.state === 'blocked' ? 'Command blocked; qualification checks are incomplete.' : report.kind === 'combined' ? 'Both native architecture reports, DMG hashes and required smokes verified.' : report.kind === 'candidate' ? 'Source ancestry and workspace dependency/version checks passed.' : report.kind === 'discovery' && report.state !== 'blocked' ? 'Complete observation set reconciled with recorded release identities.' : 'See attached report for checks and blockers.'
  return ['# Desktop delivery shadow', '', `State: ${string(report.state ?? report.kind)}`, `Distribution: ${string(report.distribution ?? 'see candidate')}`, `Candidate: ${string(report.candidateDigest ?? report.downstreamCommit ?? 'not created')}`, `Observed upstream: ${observed}`, `Evidence: ${checks}`, ...blocker, `Next action: ${string(report.nextAction ?? 'Review the attached candidate and artifact evidence.')}`, '', 'Unsigned shadow evidence. Publication eligible: false. No notification was sent.', ''].join('\n')
}
