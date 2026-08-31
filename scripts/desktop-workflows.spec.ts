import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('transactional upstream adoption workflows', () => {
  it('retires the noisy legacy schedule and keeps the new controller safely unconfigured by default', () => {
    const legacy = workflowDocument('.github/workflows/upstream-sync.yml')
    const controller = workflowDocument('.github/workflows/upstream-adoption-controller.yml')
    const legacyTriggers = asRecord(legacy.on, 'legacy triggers')
    const controllerTriggers = asRecord(controller.on, 'controller triggers')
    const activationCommands = commands(workflowJob(controller, 'activation'))

    expect(legacyTriggers).toEqual({ workflow_dispatch: null })
    expect(controllerTriggers).toHaveProperty('schedule')
    expect(activationCommands).toContain('UPSTREAM_ADOPTION_ENABLED')
    expect(activationCommands).toContain('safely unconfigured')
    expect(activationCommands).not.toContain('exit 1')
  })

  it('uses the Controller App only for candidate, PR, Issue, and explicit dispatch coordination', () => {
    const workflow = workflowDocument('.github/workflows/upstream-adoption-controller.yml')
    const reconcile = workflowJob(workflow, 'reconcile')
    const text = `${commands(reconcile)}\n${controllerReconcileScript()}`

    expect(reconcile.environment).toBeUndefined()
    expect(text).toContain('actions/create-github-app-token')
    expect(text).toContain('pnpm/action-setup@v4')
    expect(text).toContain('pnpm install --frozen-lockfile --ignore-scripts')
    expect(text).toContain('git merge --no-ff')
    expect(text).toContain('git rev-parse --is-shallow-repository')
    expect(text).toContain('git fetch --unshallow origin')
    expect(text).toContain('git rev-parse -q --verify MERGE_HEAD')
    expect(text).toContain('--slurpfile conflictPaths')
    expect(text).not.toContain('--argjson conflictPaths')
    expect(text).not.toContain('--allow-unrelated-histories')
    expect(text).toContain('.github/upstream-adoption-requests/')
    expect(text).toContain('gh api --method POST "repos/$GITHUB_REPOSITORY/pulls"')
    expect(text).not.toContain('gh pr create')
    expect(text.indexOf('statuses/$candidate_head')).toBeLessThan(text.indexOf('repos/$GITHUB_REPOSITORY/pulls"'))
    expect(text).toContain('gh issue create')
    expect(text).toContain('attempt-decision')
    expect(text).toContain('Known blocker:')
    expect(text).not.toContain('gh issue comment')
    expect(text).not.toContain('refs/heads/main"')
    expect(text).not.toContain('refs/tags/desktop-v')
  })

  it('keeps every workflow run expression within the GitHub parser limit', () => {
    const reconcile = workflowStep(
      workflowDocument('.github/workflows/upstream-adoption-controller.yml'),
      'reconcile',
      'Reconcile queue-head phase',
    )
    const runs = readdirSync(resolve(root, '.github/workflows'))
      .filter(path => /\.ya?ml$/u.test(path))
      .flatMap((path) => {
        const workflow = workflowDocument(`.github/workflows/${path}`)
        return Object.values(asRecord(workflow.jobs, `${path} jobs`)).flatMap((jobValue) => {
          const job = asRecord(jobValue, `${path} job`)
          if (!Array.isArray(job.steps)) return []
          return job.steps.map(step => renderStepField(asRecord(step, `${path} step`).run))
        })
      })

    expect(Math.max(...runs.map(run => run.length))).toBeLessThanOrEqual(21_000)
    expect(renderStepField(reconcile.run)).toBe('bash scripts/upstream-adoption/controller-reconcile.sh')
    expect(asRecord(reconcile.env, 'controller reconcile environment')).toMatchObject({
      CONTROLLER_APP_ID: '${{ vars.MINT_CONTROLLER_APP_ID }}',
      CONTROLLER_APP_SLUG: '${{ vars.MINT_CONTROLLER_APP_SLUG }}',
    })
  })

  it('executes candidate code without App or Apple credentials and signs only in the protected signing job', () => {
    const workflow = workflowDocument('.github/workflows/upstream-adoption-validation.yml')
    const bindAttempt = workflowJob(workflow, 'bind-attempt')
    const prepare = workflowJob(workflow, 'prepare')
    const candidate = workflowJob(workflow, 'candidate-checks')
    const packaging = workflowJob(workflow, 'package-candidate')
    const authorize = workflowJob(workflow, 'authorize-signing')
    const sign = workflowJob(workflow, 'sign')
    const assemble = workflowJob(workflow, 'assemble-stable')
    const attest = workflowJob(workflow, 'attest')
    const candidateText = commands(candidate)
    const prepareText = commands(prepare)
    const packagingText = commands(packaging)
    const authorizeText = commands(authorize)
    const signText = commands(sign)
    const assembleText = commands(assemble)
    const attestText = commands(attest)
    const bindAttemptText = commands(bindAttempt)
    if (!Array.isArray(attest.steps)) throw new Error('attest job has no steps')
    const attestCheckout = asRecord(attest.steps[0], 'attest checkout')
    const secrets = [...signText.matchAll(/secrets\.([A-Z0-9_]+)/g)].map(match => match[1]).sort()

    expect(bindAttemptText).toContain('validation-attempt-context')
    expect(bindAttemptText).toContain('runAttempt')
    expect(bindAttemptText).not.toContain('actions/checkout')
    expect(bindAttemptText).not.toContain('pnpm install')
    expect(prepareText).toContain('test "$GITHUB_SHA" = "$trusted_main"')
    expect(prepareText).toContain('test "$GITHUB_REF" = refs/heads/main')
    expect(prepareText).toContain('workflow_commit="$trusted_main"')
    expect(candidateText).toContain('pnpm run test:desktop')
    expect(candidateText).toContain('pnpm run doc-sync')
    expect(candidateText).not.toContain('secrets.')
    expect(packagingText).toContain('CSC_IDENTITY_AUTO_DISCOVERY')
    expect(packagingText).toContain('unsigned-app-${{ matrix.arch }}.manifest.json')
    expect(packagingText).toContain('git show "$TRUSTED_WORKFLOW_COMMIT:scripts/upstream-adoption/signing_payload.py"')
    expect(packagingText).toContain('signing_payload.py" create')
    expect(packagingText).not.toContain('secrets.')
    expect(authorize.environment).toBe('mint-finalizer')
    expect(authorizeText).toContain('verify-policy')
    expect(authorizeText).toContain('MINT_FINALIZER_APP_PRIVATE_KEY')
    expect(authorizeText).not.toContain('APPLE_API_KEY')
    expect(sign.environment).toBe('mint-signing')
    expect(secrets).toEqual(['APPLE_API_ISSUER', 'APPLE_API_KEY_ID', 'APPLE_API_KEY_P8_BASE64', 'MACOS_CERTIFICATE_P12_BASE64', 'MACOS_CERTIFICATE_PASSWORD'])
    expect(signText).not.toContain('pnpm install')
    expect(signText).not.toContain('electron-builder')
    expect(signText).not.toContain('--dsh-package-smoke')
    expect(signText).toContain('"ref":"${{ needs.prepare.outputs.workflow_commit }}"')
    expect(signText).toContain('signing_payload.py verify-extract')
    expect(signText).not.toContain('tar -xzf')
    expect(signText).toContain('--entitlements "$entitlements"')
    expect(signText).toContain('codesign --verify')
    expect(signText).toContain('xcrun notarytool submit')
    expect(assemble.environment).toBeUndefined()
    expect(assembleText).toContain('--prepackaged "$app"')
    expect(assembleText).toContain('--mac zip')
    expect(assembleText).toContain('.zip.blockmap')
    expect(assembleText).toContain('latest-mac-${{ matrix.arch }}.yml')
    expect(assembleText).not.toContain('secrets.')
    expect(attest.permissions).toEqual({ actions: 'read', contents: 'read' })
    expect(asRecord(attestCheckout.with, 'attest checkout inputs').ref).toBe('${{ needs.prepare.outputs.workflow_commit }}')
    expect(attestText).toContain('merge-desktop-update-metadata.ts')
    expect(attestText).toContain('expected-assets')
    expect(attestText).toContain('SHA256SUMS.txt",sha256:$checksum_digest')
    expect(attestText).toContain('validation-receipt')
    expect(String(attest.if)).toContain("needs.prepare.outputs.mode == 'signed-stable'")
    const observer = workflowDocument('.github/workflows/upstream-adoption-observer.yml')
    expect(commands(workflowJob(observer, 'finalize-success'))).toContain('upstream-adoption-finalize')
    expect(attestText).not.toContain('upstream-adoption-finalize')
  })

  it('requires policy verification before the Finalizer App atomically advances source, tag, and state', () => {
    const workflow = workflowDocument('.github/workflows/upstream-adoption-finalizer.yml')
    const finalize = workflowJob(workflow, 'finalize')
    const complete = workflowJob(workflow, 'complete-publication')
    const text = commands(finalize)
    const completionText = commands(complete)
    const policyIndex = text.indexOf('verify-policy')
    const pushIndex = text.indexOf('git push --atomic')

    expect(finalize.environment).toBe('mint-finalizer')
    expect(policyIndex).toBeGreaterThan(-1)
    expect(pushIndex).toBeGreaterThan(policyIndex)
    expect(text).toContain('policy-state')
    expect(text).toContain('.policy=$policy[0]')
    expect(text).toContain('validate-receipt')
    expect(text).toContain('state-validated')
    expect(text).toContain('state-artifacts')
    expect(text).toContain('$candidate_head:refs/heads/main')
    expect(text).toContain('refs/tags/$desktop_tag:refs/tags/$desktop_tag')
    expect(text).toContain('$state_commit:refs/heads/automation/upstream-adoption-state')
    expect(text).not.toContain('git push --force')
    expect(completionText).toContain('.github/workflows/desktop-release.yml')
    expect(completionText).toContain('gh release download')
    expect(completionText).toContain('verify-release')
    expect(completionText).toContain('publication-evidence.json')
  })

  it('publishes only a qualified bundle through a verified draft and then requests cursor advancement', () => {
    const workflow = workflowDocument('.github/workflows/desktop-release.yml')
    const bindAttempt = workflowJob(workflow, 'bind-attempt')
    const verify = workflowJob(workflow, 'verify-bundle')
    const publish = workflowJob(workflow, 'publish')
    const observer = workflowDocument('.github/workflows/upstream-adoption-observer.yml')
    const verifyText = commands(verify)
    const publishText = commands(publish)
    const bindAttemptText = commands(bindAttempt)
    const completionText = commands(workflowJob(observer, 'finalize-publication-success'))

    expect(bindAttemptText).toContain('publication-attempt-context')
    expect(bindAttemptText).toContain('runAttempt')
    expect(bindAttemptText).not.toContain('actions/checkout')
    expect(bindAttemptText).not.toContain('pnpm install')
    expect(verifyText).toContain('gh run download')
    expect(verifyText).toContain('desktop-bundle')
    expect(verifyText).toContain('validation-receipt')
    expect(verifyText).toContain('.github/workflows/upstream-adoption-validation.yml')
    expect(verifyText).toContain('expected_event=workflow_dispatch')
    expect(verifyText).toContain('artifact-manifest.json')
    expect(verifyText).not.toContain('electron-builder')
    expect(publish.environment).toBe('mint-publication')
    expect(String(publish.if)).toContain("github.ref == 'refs/heads/main'")
    expect(commands(workflowJob(workflow, 'prepare'))).toContain('test "$GITHUB_SHA" = "$trusted_main"')
    expect(commands(workflowJob(workflow, 'prepare'))).toContain('test "$GITHUB_REF" = refs/heads/main')
    expect(publishText).toContain('test "$GITHUB_REF" = refs/heads/main')
    expect(publishText).toContain('test "$GITHUB_SHA" =')
    expect(publishText).toContain('${{ needs.prepare.outputs.workflow_commit }}')
    expect(publishText.indexOf('verify-policy')).toBeLessThan(publishText.indexOf('gh release create'))
    expect(publishText).toContain('--draft')
    expect(publishText).toContain('gh release upload')
    expect(publishText).toContain('--draft=false')
    expect(publishText).toContain('verify-release')
    expect(publishText).toContain('gh release download')
    expect(completionText).toContain('gh run download')
    expect(completionText).toContain('artifact-manifest.json')
    expect(completionText).toContain('upstream-adoption-publication-verified')
    expect(completionText).toContain('.github/workflows/desktop-release.yml')
    expect(publishText).not.toContain('pnpm run desktop:stage')
  })

  it('persists failed stages once and opens a circuit breaker when protected failure state cannot advance', () => {
    const observer = workflowDocument('.github/workflows/upstream-adoption-observer.yml')
    const controller = workflowDocument('.github/workflows/upstream-adoption-controller.yml')
    const record = workflowJob(observer, 'record-failure')
    const project = workflowJob(controller, 'project-failure')
    const success = workflowJob(controller, 'project-success')
    const manualForce = workflowStep(controller, 'reconcile', 'Reject incomplete manual force')
    const reconcileText = `${commands(workflowJob(controller, 'reconcile'))}\n${controllerReconcileScript()}`
    const recordText = commands(record)
    const projectText = commands(project)
    const successText = commands(success)
    const manualForceText = renderStepField(manualForce.run)
    const reconcilePhaseText = controllerReconcileScript()

    expect(record.environment).toBe('mint-finalizer')
    expect(recordText).toContain('failure-fingerprint')
    expect(recordText).toContain('validate-transition')
    expect(recordText.indexOf('verify-policy')).toBeLessThan(recordText.indexOf('git push origin'))
    expect(recordText).toContain('upstream-adoption-project-failure')
    expect(recordText).toContain('Exceptional manual validation or publication runs do not project blocker state')
    expect(recordText).toContain('current candidate branch head')
    expect(recordText).toContain('.runAttempt == $attempt')
    expect(projectText).toContain('gh issue create')
    expect(projectText).toContain('Scheduled reconciliations are successful no-ops')
    expect(projectText).toContain('issues?state=$issue_state&per_page=100')
    expect(projectText).not.toContain('gh issue comment')
    expect(projectText).not.toContain('gh variable set')
    expect(projectText).not.toContain('gh issue list --state open --limit 100')
    expect(reconcileText).toContain('(del(.runId,.runAttempt))')
    expect(reconcileText).toContain('.display_title')
    expect(reconcileText).toContain('open_context_circuit')
    expect(reconcileText).toContain('retry_completed_cleanup')
    expect(reconcileText).toContain('next scheduled reconcile will retry')
    expect(manualForceText).toContain('"$RESUME" == true')
    expect(manualForceText).not.toContain('force_retry=')
    expect(reconcilePhaseText).toContain('force_retry=false')
    expect(reconcilePhaseText).toContain('.activeDelivery.upstream.tag // "idle"')
    expect(reconcilePhaseText.indexOf('Manual force must target authoritative queue head')).toBeLessThan(reconcilePhaseText.indexOf('gh issue close "$circuit_issue"'))
    expect(reconcilePhaseText).not.toContain('--title "Delivered: DeepSeek Harness')
    expect(successText).toContain('gh issue close')
    expect(successText).toContain('gh release view')
    expect(successText).toContain('git/refs/heads/$candidate_branch')
    expect(successText).not.toContain('--title "Delivered: DeepSeek Harness')
  })

  it('declares exactly three runtime Apps without Administration or Environments permission', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, '.github/upstream-adoption/apps.json'), 'utf8')) as Record<string, unknown>
    const apps = asRecord(manifest.apps, 'apps')
    expect(Object.keys(apps).sort()).toEqual(['controller', 'finalizer', 'publisher'])
    for (const value of Object.values(apps)) {
      const permissions = asRecord(asRecord(value, 'app').permissions, 'permissions')
      expect(permissions).not.toHaveProperty('administration')
      expect(permissions).not.toHaveProperty('environments')
    }
  })

  it('reads runtime installation facts with the same trusted App credentials that mint each token', () => {
    const paths = [
      '.github/workflows/desktop-release.yml',
      '.github/workflows/upstream-adoption-finalizer.yml',
      '.github/workflows/upstream-adoption-observer.yml',
      '.github/workflows/upstream-adoption-preflight.yml',
      '.github/workflows/upstream-adoption-validation.yml',
    ]
    const runtimeSteps = paths.flatMap((path) => {
      const workflow = workflowDocument(path)
      return Object.values(asRecord(workflow.jobs, `${path} jobs`)).flatMap((jobValue) => {
        const job = asRecord(jobValue, `${path} job`)
        if (!Array.isArray(job.steps)) return []
        return job.steps
          .map(step => asRecord(step, `${path} step`))
          .filter(step => renderStepField(step.run).includes('runtime-facts.ts'))
      })
    })

    expect(runtimeSteps).toHaveLength(6)
    for (const step of runtimeSteps) {
      const env = asRecord(step.env, 'runtime policy environment')
      const appId = String(env.GITHUB_APP_ID)
      const privateKey = String(env.GITHUB_APP_PRIVATE_KEY)
      const role = /^\$\{\{ vars\.MINT_(FINALIZER|PUBLISHER)_APP_ID \}\}$/u.exec(appId)?.[1]
      expect(String(env.GH_TOKEN)).toContain('outputs.token')
      expect(role).toBeDefined()
      expect(privateKey).toBe(`\${{ secrets.MINT_${String(role)}_APP_PRIVATE_KEY }}`)
    }
  })

  it('protects main and state with attributed exact-head review while preserving only the Finalizer state bypass', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, '.github/upstream-adoption/rulesets.json'), 'utf8')) as Record<string, unknown>
    const rulesets = manifest.rulesets
    if (!Array.isArray(rulesets)) throw new Error('ruleset manifest requires rulesets')
    const records = rulesets.map(value => asRecord(value, 'ruleset'))
    const main = records.find(value => value.name === 'Mint main finalization')
    const state = records.find(value => value.name === 'Mint adoption state')
    if (state === undefined || !Array.isArray(state.rules) || !Array.isArray(state.bypass)) throw new Error('state ruleset is incomplete')
    if (main === undefined || !Array.isArray(main.rules)) throw new Error('main ruleset is incomplete')
    for (const ruleset of [main, state]) {
      const rules = ruleset.rules
      if (!Array.isArray(rules)) throw new Error('reviewed ruleset has no rules')
      const pullRequest = rules.map(value => asRecord(value, 'rule')).find(value => value.type === 'pull_request')
      expect(asRecord(pullRequest, 'pull request rule').parameters).toMatchObject({
        dismiss_stale_reviews_on_push: true,
        require_extra_approval_for_unattributed_changes: true,
        require_last_push_approval: true,
        required_approving_review_count: 1,
        required_reviewers: [],
      })
    }
    expect(state.bypass).toEqual([{ actor: 'Mint State Finalizer', mode: 'always' }])
  })

  it('ships the owner-authenticated production activation', () => {
    const activation = asRecord(
      JSON.parse(readFileSync(resolve(root, '.github/release-policy/activation.json'), 'utf8')) as unknown,
      'release policy activation',
    )
    const repository = asRecord(activation.repository, 'activation repository')
    const owner = asRecord(repository.owner, 'activation owner')
    const signer = asRecord(activation.signer, 'activation signer')

    expect(activation).toMatchObject({ schemaVersion: 1, status: 'active', rotationOrdinal: 1 })
    expect(Number(activation.authorizationPr)).toBeGreaterThan(0)
    expect(repository.name).toBe('dsh-desktop')
    expect(owner).toEqual({ login: 'mintgao', type: 'User' })
    expect(String(signer.publicKey)).toMatch(/^ssh-ed25519 /u)
    expect(String(signer.fingerprint)).toMatch(/^SHA256:/u)
  })

  it('keeps exceptional manual tags receipt-bound and draft-only', () => {
    const validation = workflowDocument('.github/workflows/upstream-adoption-validation.yml')
    const publication = workflowDocument('.github/workflows/desktop-release.yml')
    const validationTriggers = asRecord(validation.on, 'validation triggers')
    const publicationTriggers = asRecord(publication.on, 'publication triggers')
    const validationInputs = asRecord(asRecord(validationTriggers.workflow_dispatch, 'validation manual trigger').inputs, 'validation inputs')
    const publicationInputs = asRecord(asRecord(publicationTriggers.workflow_dispatch, 'publication manual trigger').inputs, 'publication inputs')

    expect(validationInputs).toHaveProperty('release_tag')
    expect(publicationInputs).toHaveProperty('release_tag')
    expect(publicationInputs).toHaveProperty('validation_run')
    expect(commands(workflowJob(publication, 'publish'))).toContain('if [[ "$AUTOMATIC" == true')
  })
})

describe('desktop release withdrawal workflow', () => {
  it('withdraws without deleting recovery data and restores the previous stable release', () => {
    const workflow = workflowDocument('.github/workflows/desktop-release-withdraw.yml')
    const withdraw = workflowJob(workflow, 'withdraw')
    const text = commands(withdraw)

    expect(workflow.permissions).toEqual({ contents: 'write', issues: 'write' })
    expect(withdraw.if).toBe("github.repository == 'mintgao/dsh-desktop'")
    expect(text).toContain('gh release edit "$RELEASE_TAG"')
    expect(text).toContain('--draft')
    expect(text).toContain('gh issue create')
    expect(text).not.toContain('gh release delete')
    expect(text).not.toContain('git push --delete')
  })
})

function workflowDocument(path: string): Record<string, unknown> {
  return asRecord(load(readFileSync(resolve(root, path), 'utf8')), path)
}

function controllerReconcileScript(): string {
  return readFileSync(resolve(root, 'scripts/upstream-adoption/controller-reconcile.sh'), 'utf8')
}

function workflowJob(workflow: Record<string, unknown>, name: string): Record<string, unknown> {
  return asRecord(asRecord(workflow.jobs, 'workflow jobs')[name], `workflow job ${name}`)
}

function workflowStep(workflow: Record<string, unknown>, jobName: string, stepName: string): Record<string, unknown> {
  const job = workflowJob(workflow, jobName)
  if (!Array.isArray(job.steps)) throw new Error(`workflow job ${jobName} has no steps`)
  const steps: unknown[] = job.steps
  const step: unknown = steps.find(value => asRecord(value, 'workflow step').name === stepName)
  return asRecord(step, `workflow step ${stepName}`)
}

function commands(job: Record<string, unknown>): string {
  if (!Array.isArray(job.steps)) throw new Error('workflow job has no steps')
  return job.steps.map((step) => {
    const value = asRecord(step, 'workflow step')
    return `${renderStepField(value.uses)}\n${JSON.stringify(value.env ?? {})}\n${JSON.stringify(value.with ?? {})}\n${renderStepField(value.run)}`
  }).join('\n')
}

function renderStepField(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value ?? '')
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${context} must be a mapping`)
  return value as Record<string, unknown>
}
