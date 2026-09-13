/** Read-only authenticated retrieval of the protected probe descriptor's retained bytes. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { forwardProbeSpec, verifyProbeBytes, verifyProbeInputs, verifyProbeOrigin } from './forward-native-probe-input.ts'
import { object } from './evidence.ts'

const spec = forwardProbeSpec(JSON.parse(readFileSync('.github/desktop-delivery/forward-probe-x64.json', 'utf8')))
const output = process.argv[2]
if (!output || !process.env.GH_TOKEN) throw new Error('Expected private output directory and read-only retrieval token')
const directory = resolve(output)
mkdirSync(directory, { mode: 0o700 })
const signal = AbortSignal.timeout(180_000)
const endpoint = `https://api.github.com/repos/${spec.repository}`
const headers = { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
async function metadata(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${endpoint}${path}`, { headers, signal })
  if (!response.ok) throw new Error('Probe metadata retrieval refused')
  return object(await response.json())
}
const repository = await metadata('')
const run = await metadata(`/actions/runs/${spec.runId}/attempts/${spec.runAttempt}`)
const artifact = await metadata(`/actions/artifacts/${spec.artifactId}`)
verifyProbeOrigin(spec, repository, run, artifact)
const response = await fetch(`${endpoint}/actions/artifacts/${spec.artifactId}/zip`, { headers, signal })
if (!response.ok || !response.body) throw new Error('Probe archive retrieval refused')
const chunks: Uint8Array[] = []
let size = 0
for await (const chunk of response.body) {
  size += chunk.length
  if (size > spec.archive.size) { throw new Error('Probe archive exceeds retained size') }
  chunks.push(chunk)
}
const bytes = Buffer.concat(chunks)
verifyProbeBytes(bytes, spec.archive)
const archive = join(directory, 'retained.zip')
writeFileSync(archive, bytes, { flag: 'wx', mode: 0o600 })
execFileSync('/usr/bin/python3', ['-c', `import os, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
 for name in sys.argv[3:]:
  selected = [i for i in z.infolist() if i.filename == name]
  if len(selected) != 1: raise RuntimeError('Retained entry missing or duplicated')
  with open(os.path.join(sys.argv[2], name), 'xb') as out: out.write(z.read(selected[0]))
`, archive, directory, spec.candidate.name, spec.native.name, spec.dmg.name], {
  env: { PATH: '/usr/bin:/bin', HOME: directory }, timeout: 30_000, stdio: 'ignore',
})
verifyProbeInputs(spec, join(directory, spec.dmg.name),
  readFileSync(join(directory, spec.candidate.name)), readFileSync(join(directory, spec.native.name)))
