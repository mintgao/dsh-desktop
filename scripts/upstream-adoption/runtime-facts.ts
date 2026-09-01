/** Collect GitHub facts for runtime policy verification or secret-free bootstrap authorization. */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { githubAppJwtFromPrivateKey } from './github-app-auth.ts'
import {
  assertInitialPolicyBootstrapAuthorization,
  byteDigest,
  canonicalPolicyTimestamp,
  parsePolicyActivation,
  parsePolicyReceipt,
  receiptBundleDigest,
  type AuthorizationFile,
  type PolicyRepositoryIdentity,
  type ReceiptRuleset,
  type RuntimePolicyFacts,
  type SquashAuthorizationFacts,
} from './policy.ts'
import { assertAdoptionState } from './state.ts'

const [activationPath, receiptPath, role, outputPath] = process.argv.slice(2)
if (activationPath === undefined || receiptPath === undefined || outputPath === undefined) {
  throw new Error('Usage: runtime-facts <activation> <receipt> <role> <output>')
}
if (role !== 'controller' && role !== 'finalizer' && role !== 'publisher' && role !== 'bootstrap-authorization') {
  throw new Error('Runtime fact role must be controller, finalizer, publisher, or bootstrap-authorization.')
}
const token = process.env.GH_TOKEN
const repositoryName = process.env.GITHUB_REPOSITORY
if (token === undefined || repositoryName === undefined) throw new Error('GH_TOKEN and GITHUB_REPOSITORY are required.')

const activationBytes = readFileSync(activationPath)
const activation = parsePolicyActivation(JSON.parse(activationBytes.toString('utf8')) as unknown)
if (activation.status !== 'active') throw new Error('Release policy is unconfigured.')
const receiptBytes = readFileSync(receiptPath)
const receipt = parsePolicyReceipt(JSON.parse(receiptBytes.toString('utf8')) as unknown)
const signatureBytes = readFileSync(`${receiptPath}.sig`)
const repositoryValue = object(await api(`/repos/${repositoryName}`), 'repository')
const repository = repositoryIdentity(repositoryValue)
const mainRef = object(await api(`/repos/${repositoryName}/git/ref/heads/main`), 'main ref')
const mainCommit = string(object(mainRef.object, 'main ref object').sha, 'main ref sha')
const activationAuthorization = await authorizationFacts(activation.authorizationPr, mainCommit)
const stateRef = await protectedStateRef()

if (role === 'bootstrap-authorization') {
  const result = assertInitialPolicyBootstrapAuthorization(
    activation,
    activationBytes,
    receipt,
    receiptBytes,
    signatureBytes,
    { repository, authorization: activationAuthorization, stateRef },
  )
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
} else {
  const appIdValue = process.env.GITHUB_APP_ID
  const appPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (appIdValue === undefined || appPrivateKey === undefined) {
    throw new Error('GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required for runtime App facts.')
  }
  const appId = positiveIntegerString(appIdValue, 'GITHUB_APP_ID')
  const appToken = githubAppJwtFromPrivateKey(appId, appPrivateKey)
  const installation = object(
    await api(`/repos/${repositoryName}/installation`, appToken),
    'repository installation',
  )
  const installedAppId = integer(installation.app_id, 'installation.app_id')
  if (installedAppId !== appId) throw new Error('Configured GitHub App ID does not own the repository installation.')
  const receiptAuthorization = receipt.authorizationPr === activation.authorizationPr
    ? activationAuthorization
    : await authorizationFacts(receipt.authorizationPr, mainCommit)

  const rulesets: Omit<ReceiptRuleset, 'bypassActors'>[] = []
  for (const expected of receipt.rulesets) {
    const value = object(
      await api(`/repos/${repositoryName}/rulesets/${String(expected.id)}`),
      `ruleset ${String(expected.id)}`,
    )
    rulesets.push({
      id: integer(value.id, 'ruleset.id'),
      name: string(value.name, 'ruleset.name'),
      target: string(value.target, 'ruleset.target'),
      enforcement: string(value.enforcement, 'ruleset.enforcement'),
      conditions: value.conditions,
      rules: value.rules,
      updatedAt: canonicalPolicyTimestamp(
        string(value.updated_at, 'ruleset.updated_at'),
        'ruleset.updated_at',
      ),
    })
  }

  const workflowDigests: Record<string, string> = {}
  for (const path of Object.keys(receipt.workflowDigests)) {
    workflowDigests[path] = createHash('sha256').update(readFileSync(resolve(path))).digest('hex')
  }

  const facts: RuntimePolicyFacts = {
    repository,
    activationAuthorization,
    receiptAuthorization,
    executingApp: {
      role,
      slug: string(installation.app_slug, 'installation.app_slug'),
      id: installedAppId,
      installationId: integer(installation.id, 'installation.id'),
      permissions: stringMap(installation.permissions, 'installation.permissions'),
    },
    stateRef,
    rulesets,
    workflowDigests,
  }
  writeFileSync(outputPath, `${JSON.stringify(facts, null, 2)}\n`)
}

async function protectedStateRef(): Promise<RuntimePolicyFacts['stateRef']> {
  const response = await request(`/repos/${repositoryName}/git/ref/heads/automation/upstream-adoption-state`)
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`GitHub API ${String(response.status)} while reading protected state ref.`)
  }
  const ref = object(await json(response), 'state ref')
  const commit = string(object(ref.object, 'state ref object').sha, 'state ref commit')
  const stateBytes = await repositoryFile('state/upstream-adoption.json', commit)
  const state = JSON.parse(stateBytes.toString('utf8')) as unknown
  assertAdoptionState(state)
  return {
    ref: 'refs/heads/automation/upstream-adoption-state',
    commit,
    policy: state.policy,
  }
}

async function authorizationFacts(
  prNumber: number,
  mainCommit: string,
): Promise<SquashAuthorizationFacts> {
  const pr = object(await publicApi(`/repos/${repositoryName}/pulls/${String(prNumber)}`), `pull request ${String(prNumber)}`)
  const base = object(pr.base, 'pull request base')
  const head = object(pr.head, 'pull request head')
  const baseRepository = object(base.repo, 'pull request base repository')
  const headRepository = object(head.repo, 'pull request head repository')
  const mergedBy = object(pr.merged_by, 'pull request merged_by')
  const mergeSha = string(pr.merge_commit_sha, 'pull request merge_commit_sha')
  const headSha = string(head.sha, 'pull request head sha')
  const prFiles = await paginatedFiles(`/repos/${repositoryName}/pulls/${String(prNumber)}/files`)
  const mergeCommit = object(await api(`/repos/${repositoryName}/commits/${mergeSha}`), 'merge commit')
  const headCommit = object(await api(`/repos/${repositoryName}/commits/${headSha}`), 'head commit')
  const commit = object(mergeCommit.commit, 'merge commit payload')
  const verification = object(commit.verification, 'merge commit verification')
  const compare = object(await api(`/repos/${repositoryName}/compare/${mergeSha}...${mainCommit}`), 'authorization ancestry')
  const parentDiffFiles = files(mergeCommit.files, 'merge commit files')
  const remoteActivation = await repositoryFile('.github/release-policy/activation.json', mergeSha)
  const remoteReceipt = await repositoryFile('.github/release-policy/receipt.json', mergeSha)
  const remoteSignature = await repositoryFile('.github/release-policy/receipt.json.sig', mergeSha)
  return {
    pr: integer(pr.number, 'pull request number'),
    baseRef: string(base.ref, 'pull request base ref'),
    baseRepositoryId: integer(baseRepository.id, 'pull request base repository id'),
    headRepositoryId: integer(headRepository.id, 'pull request head repository id'),
    headSha,
    headTreeSha: string(object(object(headCommit.commit, 'head commit payload').tree, 'head tree').sha, 'head tree sha'),
    mergeSha,
    merged: pr.merged === true,
    mergedBy: {
      login: string(mergedBy.login, 'pull request merged_by login'),
      type: string(mergedBy.type, 'pull request merged_by type'),
    },
    changedFileCount: integer(pr.changed_files, 'pull request changed_files'),
    prFiles,
    mergeCommit: {
      sha: string(mergeCommit.sha, 'merge commit sha'),
      verificationVerified: verification.verified === true,
      verificationReason: string(verification.reason, 'merge commit verification reason'),
      committerLogin: string(object(mergeCommit.committer, 'merge commit committer').login, 'merge commit committer login'),
      parents: array(mergeCommit.parents, 'merge commit parents')
        .map((parent, index) => string(object(parent, `merge parent ${String(index)}`).sha, 'merge parent sha')),
      treeSha: string(object(commit.tree, 'merge commit tree').sha, 'merge commit tree sha'),
      parentDiffFiles,
    },
    reachableFromMain: ['ahead', 'identical'].includes(string(compare.status, 'authorization ancestry status')),
    activationDigest: byteDigest(remoteActivation),
    receiptBundleDigest: receiptBundleDigest(remoteReceipt, remoteSignature),
  }
}

async function paginatedFiles(path: string): Promise<readonly AuthorizationFile[]> {
  const result: AuthorizationFile[] = []
  for (let page = 1; ; page += 1) {
    const batch = array(await publicApi(`${path}?per_page=100&page=${String(page)}`), 'pull request files')
    result.push(...files(batch, 'pull request files'))
    if (batch.length < 100) return result
  }
}

async function repositoryFile(path: string, ref: string): Promise<Buffer> {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const value = object(
    await api(`/repos/${repositoryName}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`),
    `repository file ${path}`,
  )
  if (value.type !== 'file' || value.encoding !== 'base64') throw new Error(`Repository path ${path} is not a base64 file.`)
  return Buffer.from(string(value.content, `repository file ${path} content`).replaceAll('\n', ''), 'base64')
}

async function api(path: string, authorization = token as string): Promise<unknown> {
  const response = await request(path, authorization)
  if (!response.ok) throw new Error(`GitHub API ${String(response.status)} for ${path}.`)
  return await json(response)
}

async function publicApi(path: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, { headers: publicHeaders() })
  if (!response.ok) throw new Error(`Public GitHub API ${String(response.status)} for ${path}.`)
  return await json(response)
}

async function request(path: string, authorization = token as string): Promise<Response> {
  return await fetch(`https://api.github.com${path}`, { headers: headers(authorization) })
}

async function json(response: Response): Promise<unknown> {
  return await response.json() as unknown
}

function headers(value: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${value}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function publicHeaders(): Record<string, string> {
  return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
}

function repositoryIdentity(value: Record<string, unknown>): PolicyRepositoryIdentity {
  const owner = object(value.owner, 'repository.owner')
  const ownerType = string(owner.type, 'repository.owner.type')
  if (ownerType !== 'User') throw new Error('Repository owner must remain a personal User account; use break-glass after transfer.')
  return {
    id: integer(value.id, 'repository.id'),
    name: string(value.name, 'repository.name'),
    owner: { login: string(owner.login, 'repository.owner.login'), type: ownerType },
  }
}

function files(value: unknown, name: string): readonly AuthorizationFile[] {
  return array(value, name).map((entry, index) => {
    const file = object(entry, `${name}[${String(index)}]`)
    return {
      path: string(file.filename, `${name}.filename`),
      status: string(file.status, `${name}.status`),
      previousPath: file.previous_filename === undefined
        ? null
        : string(file.previous_filename, `${name}.previous_filename`),
    }
  })
}

function array(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`)
  return value
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${name} must be a string.`)
  return value
}

function integer(value: unknown, name: string): number {
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`)
  return Number(value)
}

function positiveIntegerString(value: string, name: string): number {
  if (!/^[1-9]\d*$/u.test(value)) throw new Error(`${name} must be a positive integer.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a safe positive integer.`)
  return parsed
}

function stringMap(value: unknown, name: string): Readonly<Record<string, string>> {
  const result = object(value, name)
  if (Object.values(result).some(entry => typeof entry !== 'string')) throw new Error(`${name} values must be strings.`)
  return result as Readonly<Record<string, string>>
}
