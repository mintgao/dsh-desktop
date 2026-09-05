import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
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
    const configurePairingDriverIndex = text.indexOf('configure_translation_pairing_merge_driver "$current_main"')
    const prepareVersionAlignerIndex = text.indexOf('prepare_trusted_version_aligner "$current_main"')
    const baseRefreshMergeIndex = text.indexOf('git merge --no-ff origin/main')
    const upstreamMergeIndex = text.indexOf('git merge --no-ff "$upstream_commit"')
    expect(text).toContain("git config --local merge.dsh-translation-pairing.name 'DeepSeek Harness bilingual pairing records'")
    expect(text).toContain('git config --local merge.dsh-translation-pairing.driver "$driver_command"')
    expect(text).toContain('git show "$trusted_main:scripts/$driver_file"')
    expect(configurePairingDriverIndex).toBeGreaterThan(-1)
    expect(prepareVersionAlignerIndex).toBeGreaterThan(-1)
    expect(baseRefreshMergeIndex).toBeGreaterThan(configurePairingDriverIndex)
    expect(upstreamMergeIndex).toBeGreaterThan(configurePairingDriverIndex)
    expect(baseRefreshMergeIndex).toBeGreaterThan(prepareVersionAlignerIndex)
    expect(upstreamMergeIndex).toBeGreaterThan(prepareVersionAlignerIndex)
    expect(text).toContain('git show "$trusted_main:scripts/upstream-adoption/align-downstream-package-versions.mjs" > "$trusted_version_aligner"')
    expect(text).toContain('env -u CONTROLLER_TOKEN -u GH_TOKEN -u GITHUB_TOKEN \\\n    node "$trusted_version_aligner"')
    expect(text).toContain('git add -- "$changed_path"')
    expect(text).toContain('git commit -m "chore(release): align downstream packages with $queue_head"')
    expect(text).not.toContain('node scripts/upstream-adoption/align-downstream-package-versions.mjs')
    expect(text).not.toContain('< <(env -u CONTROLLER_TOKEN')
    expect(text).toContain('else\n      if git merge-base --is-ancestor "$upstream_commit" HEAD; then')
    expect(text).toMatch(/if ! git merge --no-ff "\$upstream_commit"[^]*?else\n\s+align_downstream_package_versions\n\s+fi/u)
    const baseAlignmentIndex = text.indexOf('align_downstream_package_versions', baseRefreshMergeIndex)
    const baseUpstreamGuardIndex = text.indexOf('git merge-base --is-ancestor "$upstream_commit" HEAD', baseRefreshMergeIndex)
    const upstreamAlignmentIndex = text.indexOf('align_downstream_package_versions', upstreamMergeIndex)
    const firstCandidatePushIndex = text.indexOf('git push origin "$candidate_branch:refs/heads/$candidate_branch"', baseRefreshMergeIndex)
    const secondCandidatePushIndex = text.indexOf('git push origin "$candidate_branch:refs/heads/$candidate_branch"', upstreamMergeIndex)
    expect(baseAlignmentIndex).toBeGreaterThan(baseRefreshMergeIndex)
    expect(baseUpstreamGuardIndex).toBeGreaterThan(baseRefreshMergeIndex)
    expect(baseAlignmentIndex).toBeGreaterThan(baseUpstreamGuardIndex)
    expect(baseAlignmentIndex).toBeLessThan(firstCandidatePushIndex)
    expect(upstreamAlignmentIndex).toBeGreaterThan(upstreamMergeIndex)
    expect(upstreamAlignmentIndex).toBeLessThan(secondCandidatePushIndex)
    expect(text).toContain('--slurpfile conflictPaths')
    expect(text).not.toContain('--argjson conflictPaths')
    expect(text).not.toContain('--allow-unrelated-histories')
    expect(text).toContain('.github/upstream-adoption-requests/')
    expect(text).toContain('gh api --method POST "repos/$GITHUB_REPOSITORY/pulls"')
    expect(text).not.toContain('gh pr create')
    expect(text.indexOf('statuses/$candidate_head')).toBeLessThan(text.indexOf('repos/$GITHUB_REPOSITORY/pulls"'))
    expect(text).toContain('git push origin "$candidate_branch:refs/heads/$candidate_branch"\n    controller_wrote=true')
    expect(text).toContain('gh issue create')
    const repositoryScopedCommands = text.match(/\bgh (?:issue|pr|run) [^\n]+/g) ?? []
    expect(repositoryScopedCommands.length).toBeGreaterThan(0)
    for (const command of repositoryScopedCommands) {
      expect(command).toContain('--repo "$GITHUB_REPOSITORY"')
    }
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
    expect(bindAttemptText).not.toContain('candidate.requestPath')
    expect(prepareText).toContain('test "$GITHUB_SHA" = "$trusted_main"')
    expect(prepareText).toContain('test "$GITHUB_REF" = refs/heads/main')
    expect(prepareText).toContain('workflow_commit="$trusted_main"')
    expect(prepareText).toContain('git cat-file -e "$candidate:$request_path"')
    expect(candidateText).toContain('pnpm run verify-package-dependencies')
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
    expect(attestText).toContain('find downloaded -type f')
    expect(attestText).toContain('name="$(basename "$asset")"')
    expect(attestText).toContain('test ! -e "bundle/$name"')
    expect(attestText).toContain('mv "$asset" "bundle/$name"')
    expect(attestText).toContain('Actual release assets:')
    expect(attestText).toContain('expected-assets')
    expect(attestText).toContain('SHA256SUMS.txt",sha256:$checksum_digest')
    expect(attestText).toContain('validation-receipt')
    expect(String(attest.if)).toContain("needs.prepare.outputs.mode == 'signed-stable'")
    const observer = workflowDocument('.github/workflows/upstream-adoption-observer.yml')
    const observerFinalize = workflowJob(observer, 'finalize-success')
    const observerFinalizeIf = String(observerFinalize.if)
    const observerFinalizeText = commands(observerFinalize)
    expect(observerFinalizeIf).toContain("github.repository == 'mintgao/dsh-desktop'")
    expect(observerFinalizeIf).toContain("workflow_run.path == '.github/workflows/upstream-adoption-validation.yml'")
    expect(observerFinalizeIf).toContain("workflow_run.event == 'repository_dispatch'")
    expect(observerFinalizeIf).toContain("workflow_run.conclusion == 'success'")
    expect(observerFinalizeIf).not.toContain('workflow_run.name')
    expect(observerFinalizeText).toContain('.repository.id == $repository')
    expect(observerFinalizeText).toContain('.path == ".github/workflows/upstream-adoption-validation.yml"')
    expect(observerFinalizeText).toContain('.event == "repository_dispatch"')
    expect(observerFinalizeText).toContain('.conclusion == "success"')
    expect(observerFinalizeText).toContain('upstream-adoption-finalize')
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
    expect(text).toContain("protected_json=\"$(printf '%s\\n' \"${protected[@]}\" | sed '/^$/d' | jq -R . | jq -cs .)\"")
    expect(text).not.toContain('| jq -s .)')
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
    const completionIf = String(workflowJob(observer, 'finalize-publication-success').if)

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
    expect(publishText).toContain('publication-attempt-context')
    expect(publishText).toContain('git show "${state_ref_commit}:state/upstream-adoption.json" > "$RUNNER_TEMP/state.json"')
    expect(publishText).toContain('validate-state "$RUNNER_TEMP/state.json"')
    expect(publishText.indexOf('git show "${state_ref_commit}:state/upstream-adoption.json"')).toBeLessThan(publishText.indexOf('verify-release'))
    expect(publishText).toContain('verify-release')
    expect(publishText).toContain('gh release download')
    expect(completionText).toContain('gh run download')
    expect(completionText).toContain('artifact-manifest.json')
    expect(completionText).toContain('upstream-adoption-publication-verified')
    expect(completionText).toContain('.github/workflows/desktop-release.yml')
    expect(completionIf).toContain("workflow_run.path == '.github/workflows/desktop-release.yml'")
    expect(completionIf).toContain("workflow_run.event == 'repository_dispatch'")
    expect(completionIf).toContain("workflow_run.conclusion == 'success'")
    expect(completionIf).not.toContain('workflow_run.name')
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
    expect(recordText).not.toContain('activeDelivery.candidate.requestPath // empty')
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

    const bootstrapAuthorizationSteps = runtimeSteps.filter(step => renderStepField(step.run).includes('bootstrap-authorization'))
    const appRuntimeSteps = runtimeSteps.filter(step => !renderStepField(step.run).includes('bootstrap-authorization'))

    expect(bootstrapAuthorizationSteps).toHaveLength(1)
    expect(asRecord(bootstrapAuthorizationSteps[0]!.env, 'bootstrap authorization environment')).toEqual({
      GH_TOKEN: '${{ github.token }}',
    })
    expect(appRuntimeSteps).toHaveLength(7)
    for (const step of appRuntimeSteps) {
      const env = asRecord(step.env, 'runtime policy environment')
      const appId = String(env.GITHUB_APP_ID)
      const privateKey = String(env.GITHUB_APP_PRIVATE_KEY)
      const role = /^\$\{\{ vars\.MINT_(FINALIZER|PUBLISHER)_APP_ID \}\}$/u.exec(appId)?.[1]
      expect(String(env.GH_TOKEN)).toContain('outputs.token')
      expect(role).toBeDefined()
      expect(privateKey).toBe(`\${{ secrets.MINT_${String(role)}_APP_PRIVATE_KEY }}`)
    }
  })

  it('bootstraps sequence-one policy only after secret-free owner authorization', () => {
    const workflow = workflowDocument('.github/workflows/upstream-adoption-preflight.yml')
    const bootstrap = workflowJob(workflow, 'bootstrap-initial-policy')
    if (!Array.isArray(bootstrap.steps)) throw new Error('bootstrap job has no steps')
    const steps = bootstrap.steps.map(step => asRecord(step, 'bootstrap step'))
    const authorizationIndex = steps.findIndex(step => step.name === 'Prove exact owner authorization before exposing Finalizer credentials')
    const historicalInstallIndex = steps.findIndex(step => step.name === 'Install the exact historical verifier without credentials')
    const tokenIndex = steps.findIndex(step => renderStepField(step.uses).includes('actions/create-github-app-token'))
    const beforeAuthorization = JSON.stringify(steps.slice(0, authorizationIndex + 1))
    const beforeToken = JSON.stringify(steps.slice(0, tokenIndex))
    const text = commands(bootstrap)

    expect(workflow.concurrency).toEqual({ group: 'upstream-adoption-finalizer', 'cancel-in-progress': false })
    expect(bootstrap.environment).toBe('mint-finalizer')
    expect(authorizationIndex).toBeGreaterThan(-1)
    expect(historicalInstallIndex).toBeGreaterThan(authorizationIndex)
    expect(historicalInstallIndex).toBeLessThan(tokenIndex)
    expect(tokenIndex).toBeGreaterThan(authorizationIndex)
    expect(beforeAuthorization).not.toContain('MINT_FINALIZER_APP_PRIVATE_KEY')
    expect(beforeAuthorization).not.toContain('steps.finalizer-token.outputs.token')
    expect(beforeToken).not.toContain('MINT_FINALIZER_APP_PRIVATE_KEY')
    expect(beforeToken).not.toContain('steps.finalizer-token.outputs.token')
    expect(beforeAuthorization).toContain('bootstrap-authorization')
    expect(text).toContain('cmp ".github/release-policy/$path"')
    expect(text).toContain('pnpm --dir "$history" install --frozen-lockfile --ignore-scripts')
    expect(text).toContain('policy-state')
    expect(text).toContain('bootstrap-policy-state')
    expect(text).toContain('validate-policy-bootstrap-transition')
    expect(text).toContain('git push origin "$successor:refs/heads/automation/upstream-adoption-state"')
    expect(text).not.toContain('git push --force')
    expect(text).not.toContain('gh api --method POST')
    expect(text).not.toContain('gh release')
    expect(text).not.toContain('refs/heads/main:')
    expect(text).not.toContain('refs/tags/')
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

describe('upstream adoption package version alignment', () => {
  it('aligns the current downstream packages and a future Mint package', () => {
    const upstream = baseDshManifests()
    const main = {
      ...upstream,
      'packages/bundle/desktop-mint/package.json': manifest('@deepseek-ai/dsh-desktop-mint', '1.2.2'),
      'packages/client/ui-session-notifications/package.json': manifest('@deepseek-ai/dsh-client-ui-session-notifications', '1.2.2'),
      'packages/mint/future/package.json': manifest('@deepseek-ai/dsh-mint-future', '1.2.2'),
    }
    const fixture = versionFixture(upstream, main, main)
    try {
      const result = runVersionAligner(fixture, 'dsh-v1.2.3')
      const changed = result.stdout.trim().split('\n')

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(changed).toEqual([
        'packages/bundle/desktop-mint/package.json',
        'packages/client/ui-session-notifications/package.json',
        'packages/mint/future/package.json',
      ])
      for (const path of changed) {
        expect(readManifestVersion(fixture.root, path)).toBe('1.2.3')
      }
    } finally {
      fixture.cleanup()
    }
  })

  it('rejects an upstream-owned mismatch without writing any manifest', () => {
    const upstream = baseDshManifests()
    const main = {
      ...upstream,
      'packages/mint/downstream/package.json': manifest('@deepseek-ai/dsh-mint-downstream', '1.2.2'),
    }
    const candidate = {
      ...main,
      'packages/core/upstream/package.json': manifest('@deepseek-ai/dsh-upstream', '1.2.2'),
    }
    const fixture = versionFixture(upstream, main, candidate)
    try {
      const before = candidateManifestContents(fixture.root)
      const result = runVersionAligner(fixture, 'dsh-v1.2.3')

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('candidate packages/core/upstream/package.json has version 1.2.2; expected 1.2.3')
      expect(candidateManifestContents(fixture.root)).toEqual(before)
    } finally {
      fixture.cleanup()
    }
  })

  it('does not resurrect a deleted package and leaves aligned manifests unchanged', () => {
    const upstream = baseDshManifests()
    const main = {
      ...upstream,
      'packages/mint/deleted/package.json': manifest('@deepseek-ai/dsh-mint-deleted', '1.2.2'),
      'packages/mint/present/package.json': manifest('@deepseek-ai/dsh-mint-present', '1.2.2'),
    }
    const candidate = {
      ...upstream,
      'packages/mint/present/package.json': manifest('@deepseek-ai/dsh-mint-present', '1.2.3'),
    }
    const fixture = versionFixture(upstream, main, candidate)
    try {
      const result = runVersionAligner(fixture, 'dsh-v1.2.3')

      expect(result.status).toBe(0)
      expect(result.stdout).toBe('')
      expect(existsSync(resolve(fixture.root, 'packages/mint/deleted/package.json'))).toBe(false)
      expect(readManifestVersion(fixture.root, 'packages/mint/present/package.json')).toBe('1.2.3')
    } finally {
      fixture.cleanup()
    }
  })

  it('rejects a malformed tag before writing any manifest', () => {
    const upstream = baseDshManifests()
    const main = {
      ...upstream,
      'packages/mint/one/package.json': manifest('@deepseek-ai/dsh-mint-one', '1.2.2'),
      'packages/mint/two/package.json': manifest('@deepseek-ai/dsh-mint-two', '1.2.2'),
    }
    const fixture = versionFixture(upstream, main, main)
    try {
      const before = candidateManifestContents(fixture.root)
      const result = runVersionAligner(fixture, 'desktop-v1.2.3')

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('invalid DSH release tag')
      expect(candidateManifestContents(fixture.root)).toEqual(before)
    } finally {
      fixture.cleanup()
    }
  })

  it('accepts authoritative release tags with build metadata', () => {
    const targetVersion = '1.2.3+build.7'
    const upstream = baseDshManifests(targetVersion)
    const main = {
      ...upstream,
      'packages/mint/build/package.json': manifest('@deepseek-ai/dsh-mint-build', '1.2.2'),
    }
    const fixture = versionFixture(upstream, main, main)
    try {
      const result = runVersionAligner(fixture, `dsh-v${targetVersion}`)

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toBe('packages/mint/build/package.json\n')
      expect(readManifestVersion(fixture.root, 'packages/mint/build/package.json')).toBe(targetVersion)
    } finally {
      fixture.cleanup()
    }
  })

  it.each(['package.json', 'apps/cli/package.json'])('requires pinned upstream to contain %s', (requiredPath) => {
    const upstream = Object.fromEntries(Object.entries(baseDshManifests()).filter(([path]) => path !== requiredPath))
    const main = {
      ...baseDshManifests(),
      'packages/mint/downstream/package.json': manifest('@deepseek-ai/dsh-mint-downstream', '1.2.2'),
    }
    const fixture = versionFixture(upstream, main, main)
    try {
      const before = candidateManifestContents(fixture.root)
      const result = runVersionAligner(fixture, 'dsh-v1.2.3')

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain(`pinned upstream is missing required ${requiredPath}`)
      expect(candidateManifestContents(fixture.root)).toEqual(before)
    } finally {
      fixture.cleanup()
    }
  })

  it.each([
    {
      requiredPath: 'package.json',
      upstreamManifest: manifest('@deepseek-ai/dsh-other-root', '1.2.3'),
      error: 'package.json does not match its pinned upstream package ownership',
    },
    {
      requiredPath: 'apps/cli/package.json',
      upstreamManifest: manifest('@deepseek-ai/dsh', '1.2.2'),
      error: 'pinned upstream apps/cli/package.json has version 1.2.2; expected 1.2.3',
    },
  ])('validates pinned upstream $requiredPath identity and target version', ({ requiredPath, upstreamManifest, error }) => {
    const upstream = { ...baseDshManifests(), [requiredPath]: upstreamManifest }
    const main = {
      ...baseDshManifests(),
      'packages/mint/downstream/package.json': manifest('@deepseek-ai/dsh-mint-downstream', '1.2.2'),
    }
    const fixture = versionFixture(upstream, main, main)
    try {
      const before = candidateManifestContents(fixture.root)
      const result = runVersionAligner(fixture, 'dsh-v1.2.3')

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain(error)
      expect(candidateManifestContents(fixture.root)).toEqual(before)
    } finally {
      fixture.cleanup()
    }
  })

  it('validates every manifest and its ownership before writing', () => {
    const upstream = baseDshManifests()
    const main = {
      ...upstream,
      'packages/mint/one/package.json': manifest('@deepseek-ai/dsh-mint-one', '1.2.2'),
    }
    const candidate = {
      ...main,
      'packages/zzz/broken/package.json': '{',
    }
    const fixture = versionFixture(upstream, main, candidate)
    try {
      const before = candidateManifestContents(fixture.root)
      const malformed = runVersionAligner(fixture, 'dsh-v1.2.3')

      expect(malformed.status).toBe(1)
      expect(malformed.stdout).toBe('')
      expect(malformed.stderr).toContain('packages/zzz/broken/package.json is not valid JSON')
      expect(candidateManifestContents(fixture.root)).toEqual(before)

      rmSync(resolve(fixture.root, 'packages/zzz'), { recursive: true, force: true })
      const unknownPath = resolve(fixture.root, 'packages/mint/unknown/package.json')
      mkdirSync(resolve(unknownPath, '..'), { recursive: true })
      writeFileSync(unknownPath, `${JSON.stringify(manifest('@deepseek-ai/dsh-mint-unknown', '1.2.2'), null, 2)}\n`)
      const unknown = runVersionAligner(fixture, 'dsh-v1.2.3')
      expect(unknown.status).toBe(1)
      expect(unknown.stdout).toBe('')
      expect(unknown.stderr).toContain('packages/mint/unknown/package.json has no known owner')
      expect(readManifestVersion(fixture.root, 'packages/mint/one/package.json')).toBe('1.2.2')
    } finally {
      fixture.cleanup()
    }
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

function baseDshManifests(version = '1.2.3'): Record<string, Record<string, string>> {
  return {
    'package.json': manifest('@deepseek-ai/dsh-root', version),
    'apps/cli/package.json': manifest('@deepseek-ai/dsh', version),
    'packages/core/upstream/package.json': manifest('@deepseek-ai/dsh-upstream', version),
  }
}

function manifest(name: string, version: string): Record<string, string> {
  return { name, version }
}

interface VersionFixture {
  root: string
  currentMain: string
  pinnedUpstream: string
  cleanup(): void
}

function versionFixture(
  upstream: Record<string, Record<string, string> | string>,
  main: Record<string, Record<string, string> | string>,
  candidate: Record<string, Record<string, string> | string>,
): VersionFixture {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-version-alignment-'))
  gitFixture(fixtureRoot, ['init', '--quiet'])
  gitFixture(fixtureRoot, ['config', 'user.name', 'DSH Test'])
  gitFixture(fixtureRoot, ['config', 'user.email', 'dsh-test@example.invalid'])
  writeFixtureTree(fixtureRoot, upstream)
  gitFixture(fixtureRoot, ['add', '--all'])
  gitFixture(fixtureRoot, ['commit', '--quiet', '-m', 'pinned upstream'])
  const pinnedUpstream = gitFixture(fixtureRoot, ['rev-parse', 'HEAD']).trim()
  writeFixtureTree(fixtureRoot, main)
  gitFixture(fixtureRoot, ['add', '--all'])
  gitFixture(fixtureRoot, ['commit', '--quiet', '--allow-empty', '-m', 'current main'])
  const currentMain = gitFixture(fixtureRoot, ['rev-parse', 'HEAD']).trim()
  writeFixtureTree(fixtureRoot, candidate)
  return {
    root: fixtureRoot,
    currentMain,
    pinnedUpstream,
    cleanup: () => {
      rmSync(fixtureRoot, { recursive: true, force: true })
    },
  }
}

function writeFixtureTree(rootPath: string, files: Record<string, Record<string, string> | string>): void {
  rmSync(resolve(rootPath, 'apps'), { recursive: true, force: true })
  rmSync(resolve(rootPath, 'packages'), { recursive: true, force: true })
  rmSync(resolve(rootPath, 'package.json'), { force: true })
  for (const [path, value] of Object.entries(files)) {
    const absolutePath = resolve(rootPath, path)
    mkdirSync(resolve(absolutePath, '..'), { recursive: true })
    writeFileSync(absolutePath, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`)
  }
}

function gitFixture(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function runVersionAligner(fixture: VersionFixture, tag: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, 'scripts/upstream-adoption/align-downstream-package-versions.mjs'),
      tag,
      fixture.currentMain,
      fixture.pinnedUpstream,
    ],
    { cwd: fixture.root, encoding: 'utf8' },
  )
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function candidateManifestContents(rootPath: string): Record<string, string> {
  const result: Record<string, string> = {}
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.name === 'package.json') result[path.slice(rootPath.length + 1)] = readFileSync(path, 'utf8')
    }
  }
  visit(rootPath)
  return result
}

function readManifestVersion(rootPath: string, path: string): string {
  return (JSON.parse(readFileSync(resolve(rootPath, path), 'utf8')) as { version: string }).version
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
