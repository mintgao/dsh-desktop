/** Generate owner-reviewable activation and receipt bytes from live administrator facts. */

import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { githubAppJwt } from './github-app-auth.ts'
import { canonicalPolicyTimestamp, policyWorkflowPaths } from './policy.ts'

interface GeneratorConfig {
  readonly repository: string
  readonly activationAuthorizationPr: number
  readonly receiptAuthorizationPr: number
  readonly receiptId: string
  readonly sequence: number
  readonly predecessor: { readonly receiptId: string; readonly bundleDigest: string } | null
  readonly issuedAt: string
  readonly expiresAt: string
  readonly rotationOrdinal: number
  readonly signer: { readonly identity: string; readonly publicKey: string; readonly fingerprint: string }
  readonly previousActivation: {
    readonly rotationOrdinal: number
    readonly authorizationPr: number
    readonly digest: string
    readonly signerFingerprint: string
    readonly signerIdentity: string
    readonly signerPublicKey: string
    readonly receiptSequence: number
    readonly receiptId: string
    readonly receiptBundleDigest: string
    readonly approvalSignature: string
  } | null
  readonly apps: readonly {
    readonly role: 'controller' | 'finalizer' | 'publisher'
    readonly slug: string
    readonly id: number
    readonly installationId: number
    readonly displayName: string
    readonly privateKeyPath: string
  }[]
  readonly repositoryRoles: Readonly<Record<string, string>>
}

const [configPath, activationPath, receiptPath] = process.argv.slice(2)
if (configPath === undefined || activationPath === undefined || receiptPath === undefined) {
  throw new Error('Usage: generate-policy-bundle <config> <activation-output> <receipt-output>')
}
const token = process.env.GH_TOKEN
if (token === undefined || token === '') throw new Error('GH_TOKEN with repository administration access is required.')
const config = JSON.parse(readFileSync(configPath, 'utf8')) as GeneratorConfig
if (!/^[^/]+\/[^/]+$/u.test(config.repository)) throw new Error('Generator repository must be owner/name.')
if (!Number.isInteger(config.activationAuthorizationPr) || config.activationAuthorizationPr <= 0) throw new Error('Generator activationAuthorizationPr must be a positive integer.')
if (!Number.isInteger(config.receiptAuthorizationPr) || config.receiptAuthorizationPr <= 0) throw new Error('Generator receiptAuthorizationPr must be a positive integer.')
if (!Number.isInteger(config.rotationOrdinal) || config.rotationOrdinal <= 0) throw new Error('Generator rotationOrdinal must be a positive integer.')
if (config.rotationOrdinal === 1 && config.previousActivation !== null) throw new Error('Initial activation cannot carry previousActivation.')
if (config.rotationOrdinal > 1 && config.previousActivation === null) throw new Error('Rotated activation requires previousActivation.')
if (!Number.isInteger(config.sequence) || config.sequence <= 0) throw new Error('Generator sequence must be a positive integer.')
if (config.sequence === 1 && (config.predecessor !== null || config.activationAuthorizationPr !== config.receiptAuthorizationPr)) {
  throw new Error('Initial activation requires sequence one and one shared authorization PR.')
}
if (config.sequence > 1 && config.predecessor === null) throw new Error('Receipt renewal or rotation requires its predecessor.')
if (config.previousActivation !== null) {
  if (
    config.previousActivation.rotationOrdinal !== config.rotationOrdinal - 1
    || config.previousActivation.receiptSequence !== config.sequence - 1
    || config.predecessor === null
    || config.predecessor.receiptId !== config.previousActivation.receiptId
    || config.predecessor.bundleDigest !== config.previousActivation.receiptBundleDigest
    || config.activationAuthorizationPr !== config.receiptAuthorizationPr
    || config.previousActivation.approvalSignature === ''
  ) {
    throw new Error('Signer rotation must directly link and receive prior-key approval for the protected predecessor.')
  }
}
const repository = object(await api(`/repos/${config.repository}`), 'repository')
const owner = object(repository.owner, 'repository.owner')
if (owner.type !== 'User') throw new Error('Activation supports only a personal repository owner.')

const apps = []
const appNames = new Map<number, string>()
const repositoryRoot = realpathSync(resolve('.'))
for (const expected of config.apps) {
  const privateKeyPath = realpathSync(resolve(string(expected.privateKeyPath, `${expected.role} private-key path`)))
  if (privateKeyPath === repositoryRoot || privateKeyPath.startsWith(`${repositoryRoot}/`)) {
    throw new Error(`${expected.role} private key must remain outside the repository.`)
  }
  const appToken = githubAppJwt(expected.id, privateKeyPath)
  const installation = object(
    await api(`/app/installations/${String(expected.installationId)}`, appToken),
    `${expected.role} installation`,
  )
  if (installation.id !== expected.installationId || installation.app_id !== expected.id || installation.app_slug !== expected.slug) {
    throw new Error(`${expected.role} installation identity changed.`)
  }
  const repositoryInstallation = object(
    await api(`/repos/${config.repository}/installation`, appToken),
    `${expected.role} repository installation`,
  )
  if (repositoryInstallation.id !== expected.installationId) {
    throw new Error(`${expected.role} installation does not include ${config.repository}.`)
  }
  appNames.set(expected.id, expected.displayName)
  apps.push({
    role: expected.role,
    slug: expected.slug,
    id: expected.id,
    installationId: expected.installationId,
    permissions: stringMap(installation.permissions, `${expected.role} permissions`),
  })
}

const environmentNames = ['mint-finalizer', 'mint-publication', 'mint-signing'] as const
const environments = []
for (const name of environmentNames) {
  const environment = object(await api(`/repos/${config.repository}/environments/${name}`), `environment ${name}`)
  const secretResponse = object(await api(`/repos/${config.repository}/environments/${name}/secrets?per_page=100`), `${name} secrets`)
  const secrets = array(secretResponse.secrets, `${name} secrets`).map(value => string(object(value, `${name} secret`).name, 'secret.name')).sort()
  environments.push({
    id: integer(environment.id, `${name}.id`),
    name,
    protection: {
      protectionRules: environment.protection_rules ?? [],
      deploymentBranchPolicy: camelBranchPolicy(environment.deployment_branch_policy),
    },
    secretNames: secrets,
  })
}

const rulesetManifest = object(JSON.parse(readFileSync('.github/upstream-adoption/rulesets.json', 'utf8')) as unknown, 'ruleset manifest')
const expectedRulesets = array(rulesetManifest.rulesets, 'ruleset manifest.rulesets')
const summaries = array(await api(`/repos/${config.repository}/rulesets?includes_parents=false`), 'ruleset summaries')
const rulesets = []
for (const expectedValue of expectedRulesets) {
  const expected = object(expectedValue, 'ruleset manifest entry')
  const name = string(expected.name, 'ruleset manifest name')
  const summary = summaries.map(value => object(value, 'ruleset summary')).find(value => value.name === name)
  if (summary === undefined) throw new Error(`Missing ruleset ${name}.`)
  const ruleset = object(await api(`/repos/${config.repository}/rulesets/${String(integer(summary.id, `${name}.id`))}`), `ruleset ${name}`)
  rulesets.push({
    id: integer(ruleset.id, `${name}.id`),
    name,
    target: string(ruleset.target, `${name}.target`),
    enforcement: string(ruleset.enforcement, `${name}.enforcement`),
    conditions: ruleset.conditions,
    rules: ruleset.rules,
    updatedAt: canonicalPolicyTimestamp(
      string(ruleset.updated_at, `${name}.updated_at`),
      `${name}.updated_at`,
    ),
    bypassActors: array(ruleset.bypass_actors, `${name}.bypass_actors`).map((value) => {
      const actor = object(value, `${name}.bypass_actor`)
      const actorType = string(actor.actor_type, 'bypass actor type')
      const actorId = integer(actor.actor_id, 'bypass actor id')
      const displayName = actorType === 'Integration' ? appNames.get(actorId) : config.repositoryRoles[String(actorId)]
      if (displayName === undefined) throw new Error(`Unknown ${actorType} bypass actor ${String(actorId)} in ${name}.`)
      return { actorType, displayName, bypassMode: string(actor.bypass_mode, 'bypass mode') }
    }),
  })
}

const workflowDigests: Record<string, string> = {}
for (const path of policyWorkflowPaths) {
  workflowDigests[path] = createHash('sha256').update(readFileSync(resolve(path))).digest('hex')
}
const identity = {
  id: integer(repository.id, 'repository.id'),
  name: string(repository.name, 'repository.name'),
  owner: { login: string(owner.login, 'repository.owner.login'), type: 'User' as const },
}
const activation = {
  schemaVersion: 1,
  status: 'active',
  repository: identity,
  authorizationPr: config.activationAuthorizationPr,
  rotationOrdinal: config.rotationOrdinal,
  signer: config.signer,
  previousActivation: config.previousActivation,
}
const receipt = {
  schemaVersion: 1,
  receiptId: config.receiptId,
  sequence: config.sequence,
  authorizationPr: config.receiptAuthorizationPr,
  predecessor: config.predecessor,
  repository: identity,
  issuedAt: config.issuedAt,
  expiresAt: config.expiresAt,
  issuer: { login: identity.owner.login, fingerprint: config.signer.fingerprint },
  rotationOrdinal: config.rotationOrdinal,
  stateRef: 'refs/heads/automation/upstream-adoption-state',
  apps,
  environments,
  rulesets,
  workflowDigests,
  generatorVersion: 'dsh-release-policy-v1',
}
writeFileSync(activationPath, `${JSON.stringify(activation, null, 2)}\n`)
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`)

async function api(path: string, authorization = token): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${authorization}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok) throw new Error(`GitHub API ${String(response.status)} for ${path}.`)
  return await response.json() as unknown
}

function camelBranchPolicy(value: unknown): { protectedBranches: boolean; customBranchPolicies: boolean } {
  const policy = object(value, 'deployment branch policy')
  return {
    protectedBranches: policy.protected_branches === true,
    customBranchPolicies: policy.custom_branch_policies === true,
  }
}

function array(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`)
  return value
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`)
  return value as Record<string, unknown>
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${name} must be a string.`)
  return value
}

function integer(value: unknown, name: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${name} must be a positive integer.`)
  return Number(value)
}

function stringMap(value: unknown, name: string): Readonly<Record<string, string>> {
  const map = object(value, name)
  if (Object.values(map).some(entry => typeof entry !== 'string')) throw new Error(`${name} values must be strings.`)
  return map as Readonly<Record<string, string>>
}
