import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('desktop release workflow', () => {
  it('keeps stable releases signed and can publish both native update ZIPs automatically', () => {
    const workflow = workflowDocument('.github/workflows/desktop-release.yml')
    const triggers = asRecord(workflow.on, 'workflow triggers')
    const build = workflowJob(workflow, 'build')
    const release = workflowJob(workflow, 'release')
    const buildSteps = workflowSteps(build)
    const releaseSteps = workflowSteps(release)
    const secretStep = namedStep(buildSteps, 'Validate signing secrets')
    const keyStep = namedStep(buildSteps, 'Materialize App Store Connect API key')
    const packageStep = namedStep(buildSteps, 'Build, sign, and notarize DMG and update ZIP')
    const packageSmokeStep = namedStep(buildSteps, 'Smoke packaged updater module')
    const signatureStep = namedStep(buildSteps, 'Verify Developer ID application signature')
    const notarizationStep = namedStep(buildSteps, 'Verify notarization ticket')
    const metadataStep = namedStep(releaseSteps, 'Merge architecture update metadata')
    const checksumStep = namedStep(releaseSteps, 'Write signed release checksums')
    const notesStep = namedStep(releaseSteps, 'Write release notes')
    const releaseStep = namedStep(releaseSteps, 'Create GitHub release')

    expect(triggers).toHaveProperty('workflow_dispatch')
    expect(build.env).toBeUndefined()
    expect(secretStep.env).toEqual({
      CSC_LINK: '${{ secrets.MACOS_CERTIFICATE_P12_BASE64 }}',
      CSC_KEY_PASSWORD: '${{ secrets.MACOS_CERTIFICATE_PASSWORD }}',
      APPLE_API_KEY_P8_BASE64: '${{ secrets.APPLE_API_KEY_P8_BASE64 }}',
      APPLE_API_KEY_ID: '${{ secrets.APPLE_API_KEY_ID }}',
      APPLE_API_ISSUER: '${{ secrets.APPLE_API_ISSUER }}',
    })
    expect(keyStep.env).toEqual({
      APPLE_API_KEY_P8_BASE64: '${{ secrets.APPLE_API_KEY_P8_BASE64 }}',
      APPLE_API_KEY_ID: '${{ secrets.APPLE_API_KEY_ID }}',
    })
    expect(packageStep.env).toEqual({
      CSC_LINK: '${{ secrets.MACOS_CERTIFICATE_P12_BASE64 }}',
      CSC_KEY_PASSWORD: '${{ secrets.MACOS_CERTIFICATE_PASSWORD }}',
      APPLE_API_KEY_ID: '${{ secrets.APPLE_API_KEY_ID }}',
      APPLE_API_ISSUER: '${{ secrets.APPLE_API_ISSUER }}',
    })
    expect(packageStep.run).toContain('--mac dmg zip')
    expect(String(packageSmokeStep.run)).toContain('Contents/MacOS/DSH Desktop')
    expect(String(packageSmokeStep.run)).toContain('--dsh-package-smoke')
    expect(String(signatureStep.run)).toContain('Authority=Developer ID Application:')
    expect(String(signatureStep.run)).toContain('Signature=adhoc')
    expect(notarizationStep.if).toBeUndefined()
    expect(String(metadataStep.run)).toContain('latest-mac-arm64.yml')
    expect(String(metadataStep.run)).toContain('latest-mac-x64.yml')
    expect(String(checksumStep.run)).toContain('cd release-assets')
    expect(String(checksumStep.run)).toContain('sha256sum *.dmg *.zip > SHA256SUMS.txt')
    expect(String(checksumStep.run)).not.toContain('sha256sum release-assets/')
    expect(String(notesStep.run)).toContain('__UPSTREAM_COMMIT__')
    expect(String(releaseStep.run)).toContain('release-assets/latest-mac.yml')
    expect(String(releaseStep.run)).toContain('options+=(--latest)')
    expect(String(releaseStep.run)).toContain('options+=(--draft)')
    expect(String(releaseStep.run)).toContain('if [[ "$PUBLISH" != true ]]')
  })

  it('requires Apple credentials for prerelease tags and creates a signed preview release', () => {
    const workflow = workflowDocument('.github/workflows/desktop-release.yml')
    const prepareSteps = workflowSteps(workflowJob(workflow, 'prepare'))
    const build = workflowJob(workflow, 'build')
    const buildSteps = workflowSteps(build)
    const releaseSteps = workflowSteps(workflowJob(workflow, 'release'))
    const channelStep = namedStep(prepareSteps, 'Validate desktop tag')
    const secretStep = namedStep(buildSteps, 'Validate signing secrets')
    const keyStep = namedStep(buildSteps, 'Materialize App Store Connect API key')
    const previewBuild = namedStep(buildSteps, 'Build, sign, and notarize preview DMG')
    const signatureStep = namedStep(buildSteps, 'Verify Developer ID application signature')
    const notarizationStep = namedStep(buildSteps, 'Verify notarization ticket')
    const checksumStep = namedStep(releaseSteps, 'Write preview release checksums')
    const previewRelease = namedStep(releaseSteps, 'Create GitHub release')

    expect(build.env).toBeUndefined()
    expect(String(channelStep.run)).toContain('mode=preview')
    expect(secretStep.if).toBeUndefined()
    expect(keyStep.if).toBeUndefined()
    expect(previewBuild.if).toBe("needs.prepare.outputs.mode == 'preview'")
    expect(previewBuild.env).toEqual({
      CSC_LINK: '${{ secrets.MACOS_CERTIFICATE_P12_BASE64 }}',
      CSC_KEY_PASSWORD: '${{ secrets.MACOS_CERTIFICATE_PASSWORD }}',
      APPLE_API_KEY_ID: '${{ secrets.APPLE_API_KEY_ID }}',
      APPLE_API_ISSUER: '${{ secrets.APPLE_API_ISSUER }}',
    })
    expect(String(previewBuild.run)).toContain('--mac dmg')
    expect(String(previewBuild.run)).not.toContain('--mac dmg zip')
    expect(String(previewBuild.run)).toContain('--config.forceCodeSigning=true')
    expect(String(previewBuild.run)).toContain('--config.mac.notarize=true')
    expect(String(signatureStep.run)).toContain('Authority=Developer ID Application:')
    expect(notarizationStep.if).toBeUndefined()
    expect(String(checksumStep.run)).toContain('cd release-assets')
    expect(String(checksumStep.run)).toContain('sha256sum *.dmg > SHA256SUMS.txt')
    expect(String(checksumStep.run)).not.toContain('sha256sum release-assets/')
    expect(String(channelStep.run)).toContain('An automatic publication requires its upstream tag and commit.')
    expect(String(previewRelease.run)).toContain('options+=(--prerelease)')
    expect(String(previewRelease.run)).toContain('options+=(--draft)')
  })

  it('loads the updater adapter from both native package-smoke artifacts', () => {
    const workflow = workflowDocument('.github/workflows/desktop-ci.yml')
    const smokeJob = workflowJob(workflow, 'package-smoke')
    const smokeStep = namedStep(workflowSteps(smokeJob), 'Smoke packaged updater module')

    expect(smokeJob.strategy).toMatchObject({
      matrix: {
        include: [
          { arch: 'arm64', runner: 'macos-15' },
          { arch: 'x64', runner: 'macos-15-intel' },
        ],
      },
    })
    expect(String(smokeStep.run)).toContain('Contents/MacOS/DSH Desktop')
    expect(String(smokeStep.run)).toContain('--dsh-package-smoke')
  })
})

describe('desktop upstream workflow', () => {
  it('adopts each published upstream release and dispatches its desktop release', () => {
    const workflow = workflowDocument('.github/workflows/upstream-sync.yml')
    const adopt = workflowJob(workflow, 'adopt')
    const steps = workflowSteps(adopt)
    const commands = steps.map(stepCommand).join('\n')
    const secretStep = namedStep(steps, 'Validate desktop release secrets')

    expect(workflow.permissions).toEqual({ actions: 'write', contents: 'write', issues: 'write' })
    expect(adopt.if).toBe("github.repository == 'mintgao/dsh-desktop'")
    expect(secretStep.env).toEqual({
      MACOS_CERTIFICATE_P12_BASE64: '${{ secrets.MACOS_CERTIFICATE_P12_BASE64 }}',
      MACOS_CERTIFICATE_PASSWORD: '${{ secrets.MACOS_CERTIFICATE_PASSWORD }}',
      APPLE_API_KEY_P8_BASE64: '${{ secrets.APPLE_API_KEY_P8_BASE64 }}',
      APPLE_API_KEY_ID: '${{ secrets.APPLE_API_KEY_ID }}',
      APPLE_API_ISSUER: '${{ secrets.APPLE_API_ISSUER }}',
    })
    expect(String(secretStep.run)).toContain('Missing required desktop release secrets:')
    expect(commands).toContain('.github/upstream-sync-state.json')
    expect(commands).toContain('gh release list')
    expect(commands).toContain('git merge --no-ff')
    expect(commands).toContain('pnpm run test:desktop')
    expect(commands).toContain('pnpm run build:desktop')
    expect(commands).toContain('pnpm run typecheck')
    expect(commands).toContain('pnpm run doc-sync')
    expect(commands).toContain('git diff --exit-code')
    expect(commands).toContain('git push --atomic origin HEAD:main')
    expect(commands).toContain('gh workflow run desktop-release.yml')
    expect(commands).toContain('gh issue create')
    expect(commands).not.toContain('gh pr create')
    expect(commands).not.toContain('gh pr merge')
    expect(commands).not.toContain('gh release create')
  })

  it('records the adopted upstream release and desktop baseline for idempotent handoff', () => {
    const state = JSON.parse(readFileSync(resolve(root, '.github/upstream-sync-state.json'), 'utf8')) as Record<string, unknown>
    const adopted = asRecord(state.lastAdoptedRelease, 'last adopted release')

    expect(state.schemaVersion).toBe(1)
    expect(state.upstreamRepository).toBe('deepseek-ai/deepseek-harness')
    expect(adopted).toEqual({
      tag: 'dsh-v0.1.1-rc.2',
      commit: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
      publishedAt: '2026-08-21T12:35:08Z',
      desktopTag: 'desktop-v0.1.0-preview.5',
    })
  })
})

describe('desktop release withdrawal workflow', () => {
  it('withdraws without deleting recovery data and restores the previous stable release', () => {
    const workflow = workflowDocument('.github/workflows/desktop-release-withdraw.yml')
    const withdraw = workflowJob(workflow, 'withdraw')
    const commands = workflowSteps(withdraw).map(stepCommand).join('\n')

    expect(workflow.permissions).toEqual({ contents: 'write', issues: 'write' })
    expect(withdraw.if).toBe("github.repository == 'mintgao/dsh-desktop'")
    expect(commands).toContain('gh release edit "$RELEASE_TAG"')
    expect(commands).toContain('--draft')
    expect(commands).toContain('gh release edit "$fallback_tag"')
    expect(commands).toContain('--latest')
    expect(commands).toContain('gh issue create')
    expect(commands).toContain('gh issue comment')
    expect(commands).toContain('gh issue reopen')
    expect(commands).toContain('--draft=false')
    expect(commands).not.toContain('gh release delete')
    expect(commands).not.toContain('git push --delete')
  })
})

/** Read one GitHub Actions workflow as a mapping. */
function workflowDocument(path: string): Record<string, unknown> {
  return asRecord(load(readFileSync(resolve(root, path), 'utf8')), path)
}

/** Select one required workflow job. */
function workflowJob(workflow: Record<string, unknown>, name: string): Record<string, unknown> {
  const jobs = asRecord(workflow.jobs, 'workflow jobs')
  return asRecord(jobs[name], `workflow job ${name}`)
}

/** Select and validate a job's ordered step mappings. */
function workflowSteps(job: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(job.steps)) throw new Error('workflow job has no steps')
  return job.steps.map((step, index) => asRecord(step, `workflow step ${String(index + 1)}`))
}

/** Select one named workflow step. */
function namedStep(steps: readonly Record<string, unknown>[], name: string): Record<string, unknown> {
  const step = steps.find(candidate => candidate.name === name)
  if (step === undefined) throw new Error(`workflow has no ${name} step`)
  return step
}

/** Return a shell step's command without stringifying other YAML node types. */
function stepCommand(step: Record<string, unknown>): string {
  return typeof step.run === 'string' ? step.run : ''
}

/** Narrow parsed YAML nodes to mappings. */
function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${context} must be a mapping`)
  return value as Record<string, unknown>
}
