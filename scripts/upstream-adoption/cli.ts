/** Trusted command-line entry points for release automation validation. */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { assertAdoptionState, assertPolicyBootstrapTransition, assertReleaseObject, assertTransition, assertValidationReceipt, attemptInputKey, bootstrapAdoptionState, bootstrapProtectedPolicyState, decideAttempt, expectedReleaseAssetNames, failureFingerprint, nextTransientRetry, resolveDesktopRelease, type AdoptionState, type BootstrapFacts, type FinalizationFacts, type ReleaseAsset, type ReleaseObject, type ValidationReceipt } from './state.ts'
import { assertEnvironmentSecrets, assertPolicy, assertReceiptAppRoles, parsePolicyActivation, parsePolicyReceipt, rotationApprovalStatement, type RuntimePolicyFacts, verifyReceiptSignature } from './policy.ts'

const [command, ...arguments_] = process.argv.slice(2)

await run()

async function run(): Promise<void> {
  switch (command) {
    case 'validate-state': {
      const state = json(arguments_[0], 'state')
      assertAdoptionState(state)
      break
    }
    case 'validate-transition': {
      const previous = state(arguments_[0])
      const next = state(arguments_[1])
      assertTransition(previous, next)
      break
    }
    case 'validate-policy-bootstrap-transition': {
      const previous = state(arguments_[0])
      const next = state(arguments_[1])
      assertPolicyBootstrapTransition(previous, next)
      break
    }
    case 'validate-receipt': {
      const current = state(arguments_[0])
      const receipt = json(arguments_[1], 'validation receipt') as ValidationReceipt
      const facts = json(arguments_[2], 'finalization facts') as FinalizationFacts
      assertValidationReceipt(current, receipt, facts)
      break
    }
    case 'verify-policy': {
      const activationBytes = readFile(arguments_[0])
      const activation = parsePolicyActivation(JSON.parse(activationBytes.toString('utf8')) as unknown)
      if (activation.status === 'unconfigured') throw new Error('Release policy is unconfigured.')
      const receiptBytes = readFile(arguments_[1])
      const receipt = parsePolicyReceipt(JSON.parse(receiptBytes.toString('utf8')) as unknown)
      const signature = readFile(arguments_[2])
      const facts = json(arguments_[3], 'runtime policy facts') as RuntimePolicyFacts
      verifyReceiptSignature(receiptBytes, signature, activation)
      assertReceiptAppRoles(receipt)
      assertEnvironmentSecrets(receipt)
      assertPolicy(activation, activationBytes, receipt, receiptBytes, signature, facts, new Date())
      break
    }
    case 'policy-state': {
      const activationBytes = readFile(arguments_[0])
      const activation = parsePolicyActivation(JSON.parse(activationBytes.toString('utf8')) as unknown)
      if (activation.status === 'unconfigured') throw new Error('Release policy is unconfigured.')
      const receiptBytes = readFile(arguments_[1])
      const receipt = parsePolicyReceipt(JSON.parse(receiptBytes.toString('utf8')) as unknown)
      const signature = readFile(arguments_[2])
      const facts = json(arguments_[3], 'runtime policy facts') as RuntimePolicyFacts
      verifyReceiptSignature(receiptBytes, signature, activation)
      assertReceiptAppRoles(receipt)
      assertEnvironmentSecrets(receipt)
      process.stdout.write(
        `${JSON.stringify(assertPolicy(activation, activationBytes, receipt, receiptBytes, signature, facts, new Date()))}\n`,
      )
      break
    }
    case 'bootstrap-policy-state': {
      const current = state(arguments_[0])
      const policy = json(arguments_[1], 'protected policy state') as Parameters<typeof bootstrapProtectedPolicyState>[1]
      const updatedAt = required(arguments_[2], 'updated time')
      const updatedBy = required(arguments_[3], 'updated by')
      const updateRunId = Number(required(arguments_[4], 'update run ID'))
      process.stdout.write(
        `${JSON.stringify(bootstrapProtectedPolicyState(current, policy, updatedAt, updatedBy, updateRunId), null, 2)}\n`,
      )
      break
    }
    case 'rotation-statement': {
      const activation = parsePolicyActivation(json(arguments_[0], 'rotation activation'))
      if (activation.status !== 'active') throw new Error('Rotation statement requires an active activation.')
      writeFileSync(required(arguments_[1], 'output'), rotationApprovalStatement(activation))
      break
    }
    case 'verify-release': {
      const current = state(arguments_[0])
      if (current.activeDelivery === null) throw new Error('No active release to verify.')
      const release = json(arguments_[1], 'release') as ReleaseObject
      const assets = json(arguments_[2], 'assets') as ReleaseAsset[]
      const visibility = arguments_[3]
      if (visibility !== 'draft' && visibility !== 'public') throw new Error('Visibility must be draft or public.')
      assertReleaseObject(release, current.activeDelivery, assets, visibility)
      break
    }
    case 'expected-assets': {
      const version = required(arguments_[0], 'version')
      const mode = required(arguments_[1], 'mode')
      if (mode !== 'unsigned-preview' && mode !== 'signed-preview' && mode !== 'signed-stable') throw new Error('Unsupported release mode.')
      process.stdout.write(`${JSON.stringify(expectedReleaseAssetNames(version, mode))}\n`)
      break
    }
    case 'resolve-release': {
      const tag = required(arguments_[0], 'upstream tag')
      const signing = required(arguments_[1], 'signing mode')
      if (signing !== 'unsigned-preview' && signing !== 'signed') throw new Error('Signing mode must be unsigned-preview or signed.')
      process.stdout.write(`${JSON.stringify(resolveDesktopRelease(tag, signing))}\n`)
      break
    }
    case 'input-key': {
      const projection = arguments_[2] === undefined ? undefined : inputKeyProjection(json(arguments_[2], 'candidate projection'))
      process.stdout.write(`${attemptInputKey(projectInputKeyState(state(arguments_[0]), projection), required(arguments_[1], 'current main'))}\n`)
      break
    }
    case 'attempt-decision': {
      const current = state(arguments_[0])
      if (current.activeDelivery === null) throw new Error('No active queue head.')
      const inputKey = required(arguments_[1], 'input key')
      const queueHead = arguments_[2]
      const reason = arguments_[3]
      const force = queueHead === undefined && reason === undefined ? undefined : { queueHead: required(queueHead, 'queue head'), reason: required(reason, 'reason') }
      process.stdout.write(`${JSON.stringify(decideAttempt(current.activeDelivery, inputKey, new Date(), force))}\n`)
      break
    }
    case 'failure-fingerprint': {
      const input = json(arguments_[0], 'failure fingerprint input') as {
        phase: Parameters<typeof failureFingerprint>[0]['phase']
        stage: string
        failureClass: string
        failedChecks?: readonly string[]
        conflictPaths?: readonly string[]
      }
      process.stdout.write(`${failureFingerprint(input)}\n`)
      break
    }
    case 'next-retry': {
      const observedAt = new Date(required(arguments_[0], 'observed time'))
      const completedRetries = Number(required(arguments_[1], 'completed retries'))
      if (!Number.isInteger(completedRetries) || completedRetries < 0) throw new Error('Completed retries must be a non-negative integer.')
      process.stdout.write(`${JSON.stringify(nextTransientRetry(observedAt, completedRetries))}\n`)
      break
    }
    case 'seed-state': {
      const facts = json(arguments_[0], 'bootstrap facts') as BootstrapFacts
      writeFileSync(required(arguments_[1], 'output'), `${JSON.stringify(bootstrapAdoptionState(await verifyBootstrapFacts(facts)), null, 2)}\n`)
      break
    }
    case 'write-canonical': {
      const input = json(arguments_[0], 'input')
      writeFileSync(required(arguments_[1], 'output'), `${JSON.stringify(input, null, 2)}\n`)
      break
    }
    default:
      throw new Error(`Unknown upstream-adoption command: ${String(command)}`)
  }
}

function state(path: string | undefined): AdoptionState {
  const value = json(path, 'state')
  assertAdoptionState(value)
  return value
}

function json(path: string | undefined, name: string): unknown {
  return JSON.parse(readFile(required(path, name)).toString('utf8')) as unknown
}

function inputKeyProjection(value: unknown): { headCommit?: string; approvedHead?: string | null } {
  const projection = record(value, 'candidate projection')
  if (
    Object.keys(projection).some(key => key !== 'headCommit' && key !== 'approvedHead')
    || (projection.headCommit !== undefined && !sha40(projection.headCommit))
    || (projection.approvedHead !== undefined && projection.approvedHead !== null && !sha40(projection.approvedHead))
  ) {
    throw new Error('Candidate projection may contain only headCommit and approvedHead.')
  }
  return projection
}

function projectInputKeyState(
  current: AdoptionState,
  projection: { headCommit?: string; approvedHead?: string | null } | undefined,
): AdoptionState {
  if (projection === undefined) return current
  if (current.activeDelivery?.candidate === null || current.activeDelivery === null) {
    throw new Error('Candidate projection requires an active candidate state.')
  }
  return {
    ...current,
    activeDelivery: {
      ...current.activeDelivery,
      candidate: {
        ...current.activeDelivery.candidate,
        headCommit: projection.headCommit ?? current.activeDelivery.candidate.headCommit,
        approvedHead: projection.approvedHead === undefined ? current.activeDelivery.candidate.approvedHead : projection.approvedHead,
      },
    },
  }
}

async function verifyBootstrapFacts(facts: BootstrapFacts): Promise<BootstrapFacts> {
  const repositoryName = process.env.GITHUB_REPOSITORY
  const token = process.env.GH_TOKEN
  if (repositoryName === undefined || repositoryName === '') throw new Error('seed-state requires GITHUB_REPOSITORY.')
  if (token === undefined || token === '') throw new Error('seed-state requires GH_TOKEN.')
  const upstreamRelease = record(await api(`/repos/deepseek-ai/deepseek-harness/releases/tags/${encodeURIComponent(facts.upstream.tag)}`, token), 'upstream release')
  if (string(upstreamRelease.tag_name, 'upstream release tag') !== facts.upstream.tag) throw new Error('Bootstrap upstream release tag drifted.')
  if (string(upstreamRelease.published_at, 'upstream release published_at') !== facts.upstream.publishedAt) {
    throw new Error('Bootstrap upstream release published timestamp drifted.')
  }
  if (await resolveTagCommit('deepseek-ai/deepseek-harness', facts.upstream.tag, token) !== facts.upstream.commit) {
    throw new Error('Bootstrap upstream tag no longer resolves to the claimed commit.')
  }
  if (await resolveTagCommit(repositoryName, facts.desktopTag, token) !== facts.desktopCommit) {
    throw new Error('Bootstrap desktop tag no longer resolves to the claimed commit.')
  }
  const publicRelease = record(await api(`/repos/${repositoryName}/releases/tags/${encodeURIComponent(facts.desktopTag)}`, token), 'public release')
  if (publicRelease.draft !== false || string(publicRelease.tag_name, 'public release tag') !== facts.desktopTag) {
    throw new Error('Bootstrap desktop release must already be public at the claimed tag.')
  }
  const releaseAssets = array(publicRelease.assets, 'public release assets').map((value, index) => {
    const asset = record(value, `public release asset ${String(index)}`)
    return {
      name: string(asset.name, 'release asset name'),
      url: string(asset.url, 'release asset url'),
    }
  }).sort((left, right) => left.name.localeCompare(right.name))
  const assetManifest = []
  for (const asset of releaseAssets) {
    const bytes = await downloadAsset(asset.url, token)
    assetManifest.push({ name: asset.name, sha256: sha256(bytes) })
  }
  const latest = publicRelease.prerelease === true
    ? false
    : string(record(await api(`/repos/${repositoryName}/releases/latest`, token), 'latest release').tag_name, 'latest release tag') === facts.desktopTag
  const publicationEvidence = {
    release: {
      tag: facts.desktopTag,
      targetCommit: facts.desktopCommit,
      draft: false,
      prerelease: publicRelease.prerelease === true,
      latest,
      notes: typeof publicRelease.body === 'string' ? publicRelease.body : '',
      assets: assetManifest,
    },
    assets: assetManifest,
  }
  if (sha256(Buffer.from(`${JSON.stringify(publicationEvidence, null, 2)}\n`)) !== facts.publicationReceipt) {
    throw new Error('Bootstrap publication receipt digest does not match the current public release evidence.')
  }
  return facts
}

async function resolveTagCommit(repository: string, tag: string, token: string): Promise<string> {
  const ref = record(await api(`/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`, token), `tag ref ${tag}`)
  const objectValue = record(ref.object, `tag ref ${tag} object`)
  if (string(objectValue.type, `tag ref ${tag} type`) === 'commit') return string(objectValue.sha, `tag ref ${tag} sha`)
  if (string(objectValue.type, `tag ref ${tag} type`) !== 'tag') throw new Error(`Unsupported tag object type for ${tag}.`)
  const tagObject = record(await api(`/repos/${repository}/git/tags/${string(objectValue.sha, `tag ref ${tag} sha`)}`, token), `annotated tag ${tag}`)
  return string(record(tagObject.object, `annotated tag ${tag} object`).sha, `annotated tag ${tag} commit`)
}

async function downloadAsset(url: string, token: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok) throw new Error(`GitHub asset download ${String(response.status)} for ${url}.`)
  return Buffer.from(await response.arrayBuffer())
}

async function api(path: string, token: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!response.ok) throw new Error(`GitHub API ${String(response.status)} for ${path}.`)
  return await response.json() as unknown
}

function readFile(path: string | undefined): Buffer {
  return readFileSync(required(path, 'path'))
}

function sha40(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value)
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function array(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`)
  return value
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`)
  return value as Record<string, unknown>
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${name} must be a string.`)
  return value
}

function required(value: string | undefined, name: string): string {
  if (value === undefined || value === '') throw new Error(`Missing ${name}.`)
  return value
}
