/** Pure state, retry, receipt, and publication rules for upstream adoption. */

import { createHash } from 'node:crypto'
import type { ProtectedPolicyState } from './policy.ts'

/** Durable phases for one queue-head delivery. */
export type AdoptionPhase = 'detected' | 'candidate-open' | 'candidate-stale' | 'adoption-blocked' | 'candidate-validated' | 'artifacts-validated' | 'release-pending' | 'publication-blocked'

/** Desktop artifact trust modes. */
export type ReleaseMode = 'unsigned-preview' | 'signed-preview' | 'signed-stable'

/** Immutable public upstream Release identity. */
export interface UpstreamIdentity {
  readonly tag: string
  readonly commit: string
  readonly publishedAt: string
}

/** Last publicly verified release cursor. */
export interface PublishedCursor extends UpstreamIdentity {
  readonly desktopTag: string
  readonly desktopCommit: string
  readonly publicationReceipt: string
}

/** Candidate integration facts bound to validation. */
export interface CandidateState {
  readonly branch: string
  readonly pr: number
  readonly baseCommit: string
  readonly headCommit: string
  readonly humanEdited: boolean
  readonly protectedPathsChanged: readonly string[]
  readonly approvedHead: string | null
  readonly requestPath: string | null
}

/** Single-use validation nonce state. */
export interface ValidationState {
  readonly nonce: string
  readonly consumed: boolean
  readonly runId: number | null
  readonly runAttempt: number | null
  readonly receiptArtifact: string | null
  readonly receiptDigest: string | null
}

/** Artifact bundle qualified before tag creation. */
export interface ArtifactBundleState {
  readonly artifactName: string
  readonly manifestDigest: string
  readonly sourceCommit: string
  readonly workflowCommit: string
  readonly runId: number
  readonly runAttempt: number
  readonly expiresAt: string
}

/** Normalized current failure. */
export interface FailureState {
  readonly kind: 'deterministic' | 'transient'
  readonly stage: string
  readonly failureClass: string
  readonly fingerprint: string
  readonly retryCount: number
  readonly nextRetryAt: string | null
}

/** One claimed attempt. */
export interface AttemptState {
  readonly ordinal: number
  readonly inputKey: string
  readonly trigger: 'scheduled' | 'authoritative-change' | 'manual-force'
  readonly forceReason: string | null
}

/** Active delivery stored on the protected state ref. */
export interface ActiveDelivery {
  readonly upstream: UpstreamIdentity
  readonly desktopTag: string
  readonly mode: ReleaseMode
  readonly phase: AdoptionPhase
  readonly candidate: CandidateState | null
  readonly validation: ValidationState | null
  readonly artifacts: ArtifactBundleState | null
  readonly attempt: AttemptState
  readonly failure: FailureState | null
  readonly publicationRun: number | null
  readonly paused: boolean
}

/** Schema-v2 state on `automation/upstream-adoption-state`. */
export interface AdoptionState {
  readonly schemaVersion: 2
  readonly revision: number
  readonly upstreamRepository: string
  readonly lastPublishedRelease: PublishedCursor
  readonly activeDelivery: ActiveDelivery | null
  readonly policy: ProtectedPolicyState | null
  readonly updatedAt: string
  readonly updatedBy: string
  readonly updateRunId: number
}

/** Bootstrap facts used once to migrate the legacy publication cursor. */
export interface BootstrapFacts {
  readonly upstream: UpstreamIdentity
  readonly desktopTag: string
  readonly desktopCommit: string
  readonly publicationReceipt: string
  readonly updatedAt: string
  readonly updatedBy: string
  readonly updateRunId: number
}

/** Immutable successful candidate-validation receipt. */
export interface ValidationReceipt {
  readonly schemaVersion: 1
  readonly nonce: string
  readonly stateRefCommit: string
  readonly stateRevision: number
  readonly inputKey: string
  readonly candidateCommit: string
  readonly baseCommit: string
  readonly upstreamCommit: string
  readonly desktopTag: string
  readonly mode: ReleaseMode
  readonly workflowCommit: string
  readonly runId: number
  readonly runAttempt: number
  readonly conclusion: 'success'
  readonly artifactName: string
  readonly manifestDigest: string
  readonly sourceCommit: string
}

/** Live facts re-derived by the trusted finalizer. */
export interface FinalizationFacts {
  readonly stateRefCommit: string
  readonly currentMain: string
  readonly candidateHead: string
  readonly upstreamTagCommit: string
  readonly workflowCommit: string
  readonly receiptArtifactDigest: string
  readonly requestFileExists: boolean
  readonly upstreamIsAncestor: boolean
}

/** Qualified release asset. */
export interface ReleaseAsset {
  readonly name: string
  readonly sha256: string
}

/** GitHub draft or public Release facts. */
export interface ReleaseObject {
  readonly tag: string
  readonly targetCommit: string
  readonly draft: boolean
  readonly prerelease: boolean
  readonly latest: boolean
  readonly notes: string
  readonly assets: readonly ReleaseAsset[]
}

const transientDelayMs = [30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000] as const
const allowed: Readonly<Record<AdoptionPhase, ReadonlySet<AdoptionPhase>>> = {
  detected: new Set(['candidate-open', 'adoption-blocked']),
  'candidate-open': new Set(['candidate-open', 'candidate-stale', 'candidate-validated', 'adoption-blocked']),
  'candidate-stale': new Set(['candidate-open', 'adoption-blocked']),
  'adoption-blocked': new Set(['adoption-blocked', 'candidate-open', 'candidate-stale']),
  'candidate-validated': new Set(['candidate-open', 'artifacts-validated', 'adoption-blocked']),
  'artifacts-validated': new Set(['candidate-open', 'release-pending', 'adoption-blocked']),
  'release-pending': new Set(['release-pending', 'publication-blocked']),
  'publication-blocked': new Set(['release-pending', 'publication-blocked']),
}

/** Serialize a JSON-compatible value with recursively sorted mapping keys. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

/** Return a SHA-256 digest of canonical JSON. */
export function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

/** Build the initial protected state from an independently verified public baseline. */
export function bootstrapAdoptionState(facts: BootstrapFacts): AdoptionState {
  const value: AdoptionState = {
    schemaVersion: 2,
    revision: 0,
    upstreamRepository: 'deepseek-ai/deepseek-harness',
    lastPublishedRelease: {
      ...facts.upstream,
      desktopTag: facts.desktopTag,
      desktopCommit: facts.desktopCommit,
      publicationReceipt: facts.publicationReceipt,
    },
    activeDelivery: null,
    policy: null,
    updatedAt: facts.updatedAt,
    updatedBy: facts.updatedBy,
    updateRunId: facts.updateRunId,
  }
  assertAdoptionState(value)
  return value
}

/** Resolve the immutable desktop tag and mode for one upstream tag. */
export function resolveDesktopRelease(tag: string, signing: 'unsigned-preview' | 'signed'): { desktopTag: string; mode: ReleaseMode } {
  if (!/^dsh-v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag)) throw new Error(`Unsupported upstream release tag: ${tag}`)
  const version = tag.slice(5)
  if (signing === 'unsigned-preview') {
    const mapped = version.includes('-') ? `${version}.unsigned.1` : `${version}-unsigned.1`
    return { desktopTag: `desktop-v${mapped}`, mode: 'unsigned-preview' }
  }
  return { desktopTag: `desktop-v${version}`, mode: version.includes('-') ? 'signed-preview' : 'signed-stable' }
}

/** Derive the attempt identity from authoritative phase inputs. */
export function attemptInputKey(state: AdoptionState, currentMain: string): string {
  const delivery = requireDelivery(state)
  const identity: Record<string, unknown> = {
    phase: delivery.phase,
    upstream: delivery.upstream,
    desktopTag: delivery.desktopTag,
    mode: delivery.mode,
  }
  if (delivery.phase === 'detected') {
    identity.main = currentMain
  } else if (['candidate-open', 'candidate-stale', 'adoption-blocked'].includes(delivery.phase)) {
    identity.main = currentMain
    identity.candidate = requireCandidate(delivery)
  } else if (['candidate-validated', 'artifacts-validated'].includes(delivery.phase)) {
    identity.candidateHead = requireCandidate(delivery).headCommit
    identity.validation = delivery.validation
  }
  else identity.sourceCommit = requireArtifacts(delivery).sourceCommit
  return digest(identity)
}

/** Derive a stable failure fingerprint without run-specific data. */
export function failureFingerprint(input: {
  phase: AdoptionPhase
  stage: string
  failureClass: string
  failedChecks?: readonly string[]
  conflictPaths?: readonly string[]
}): string {
  return digest({
    phase: input.phase,
    stage: input.stage,
    failureClass: input.failureClass,
    failedChecks: unique(input.failedChecks),
    conflictPaths: unique(input.conflictPaths),
  })
}

/** Decide whether a trigger executes or becomes a successful no-op. */
export function decideAttempt(delivery: ActiveDelivery, inputKey: string, now: Date, force?: { queueHead: string; reason: string }): { action: 'execute' | 'noop'; reason: string } {
  if (delivery.paused) return { action: 'noop', reason: 'delivery-paused' }
  if (force !== undefined) {
    if (force.queueHead !== delivery.upstream.tag || force.reason.trim() === '') throw new Error('Manual force requires the exact queue-head tag and a reason.')
    return { action: 'execute', reason: 'manual-force' }
  }
  if (delivery.failure === null) return { action: 'execute', reason: 'no-current-failure' }
  if (delivery.attempt.inputKey !== inputKey) return { action: 'execute', reason: 'authoritative-input-changed' }
  if (delivery.failure.kind === 'deterministic') return { action: 'noop', reason: 'unchanged-deterministic-blocker' }
  if (delivery.failure.retryCount >= transientDelayMs.length) return { action: 'noop', reason: 'transient-retries-exhausted' }
  if (delivery.failure.nextRetryAt === null || now.getTime() < Date.parse(delivery.failure.nextRetryAt)) return { action: 'noop', reason: 'transient-backoff' }
  return { action: 'execute', reason: 'transient-retry-due' }
}

/** Return the next bounded transient retry time, or null after exhaustion. */
export function nextTransientRetry(observedAt: Date, completedRetries: number): string | null {
  const delay = transientDelayMs[completedRetries]
  return delay === undefined ? null : new Date(observedAt.getTime() + delay).toISOString()
}

/** Validate and narrow parsed schema-v2 state. */
export function assertAdoptionState(value: unknown): asserts value is AdoptionState {
  const state = record(value, 'state')
  exactKeys(state, ['schemaVersion', 'revision', 'upstreamRepository', 'lastPublishedRelease', 'activeDelivery', 'policy', 'updatedAt', 'updatedBy', 'updateRunId'], 'state')
  if (state.schemaVersion !== 2 || !Number.isInteger(state.revision) || Number(state.revision) < 0) throw new Error('Invalid adoption state schema or revision.')
  if (state.upstreamRepository !== 'deepseek-ai/deepseek-harness') throw new Error('State requires the pinned upstream repository.')
  assertCursor(record(state.lastPublishedRelease, 'lastPublishedRelease'))
  if (state.activeDelivery !== null) assertDelivery(record(state.activeDelivery, 'activeDelivery'))
  if (state.policy !== null) assertPolicyState(record(state.policy, 'policy'))
  if (typeof state.updatedAt !== 'string' || !Number.isFinite(Date.parse(state.updatedAt))) throw new Error('State requires updatedAt.')
  if (typeof state.updatedBy !== 'string' || state.updatedBy === '' || !positiveInteger(state.updateRunId)) throw new Error('State requires update provenance.')
}

/** Validate a requested state transition before the finalizer writes it. */
export function assertTransition(previous: AdoptionState, next: AdoptionState): void {
  assertAdoptionState(previous)
  assertAdoptionState(next)
  if (next.revision !== previous.revision + 1 || next.upstreamRepository !== previous.upstreamRepository) throw new Error('Transition must increment revision once without changing upstream repository.')
  if (Date.parse(next.updatedAt) <= Date.parse(previous.updatedAt) || next.updatedBy === '' || next.updateRunId <= 0) throw new Error('Transition requires fresh update provenance.')
  assertPolicyTransition(previous.policy, next.policy)
  const before = previous.activeDelivery
  const after = next.activeDelivery
  if (before === null) {
    if (after === null || after.phase !== 'detected') throw new Error('Idle state may only detect one queue head.')
    if (canonicalJson(next.lastPublishedRelease) !== canonicalJson(previous.lastPublishedRelease)) throw new Error('Detection cannot advance published cursor.')
    return
  }
  if (after === null) {
    if (!['release-pending', 'publication-blocked'].includes(before.phase)) throw new Error('Only publication may complete delivery.')
    if (!sameUpstream(next.lastPublishedRelease, before.upstream) || next.lastPublishedRelease.desktopTag !== before.desktopTag || next.lastPublishedRelease.desktopCommit !== requireArtifacts(before).sourceCommit) throw new Error('Completion cursor does not match active delivery.')
    return
  }
  if (!sameUpstream(before.upstream, after.upstream) || before.desktopTag !== after.desktopTag || before.mode !== after.mode) throw new Error('Active delivery cannot be retargeted.')
  if (!allowed[before.phase].has(after.phase)) throw new Error(`Invalid phase transition: ${before.phase} -> ${after.phase}`)
  if (canonicalJson(next.lastPublishedRelease) !== canonicalJson(previous.lastPublishedRelease)) throw new Error('Published cursor advances only when delivery completes.')
  if (after.attempt.ordinal < before.attempt.ordinal || after.attempt.ordinal > before.attempt.ordinal + 1) throw new Error('Attempt ordinal may increase by at most one.')
  if (
    ['candidate-validated', 'artifacts-validated', 'release-pending', 'publication-blocked'].includes(before.phase)
    && canonicalJson(requireCandidate(before)) !== canonicalJson(requireCandidate(after))
  ) {
    throw new Error('Qualified candidate identity cannot change.')
  }
  if (
    ['candidate-validated', 'artifacts-validated', 'release-pending', 'publication-blocked'].includes(before.phase)
    && canonicalJson(before.validation) !== canonicalJson(after.validation)
  ) {
    throw new Error('Qualified validation identity cannot change.')
  }
  if (
    ['artifacts-validated', 'release-pending', 'publication-blocked'].includes(before.phase)
    && canonicalJson(requireArtifacts(before)) !== canonicalJson(requireArtifacts(after))
  ) {
    throw new Error('Qualified artifact identity cannot change.')
  }
  if (
    before.validation?.consumed
    && after.validation !== null
    && after.validation.nonce === before.validation.nonce
    && !after.validation.consumed
  ) {
    throw new Error('Consumed nonce cannot be replayed.')
  }
}

/**
 * Build the only state successor allowed to materialize initial protected policy.
 *
 * @param previous - Exact protected state read before verification.
 * @param policy - Sequence-one policy target returned by the historical verifier.
 * @param updatedAt - Fresh state-update timestamp.
 * @param updatedBy - Finalizer App identity recording the update.
 * @param updateRunId - Workflow run that owns the update.
 * @returns One field-limited protected-state successor.
 */
export function bootstrapProtectedPolicyState(
  previous: AdoptionState,
  policy: ProtectedPolicyState,
  updatedAt: string,
  updatedBy: string,
  updateRunId: number,
): AdoptionState {
  const next: AdoptionState = {
    ...previous,
    revision: previous.revision + 1,
    policy,
    updatedAt,
    updatedBy,
    updateRunId,
  }
  assertPolicyBootstrapTransition(previous, next)
  return next
}

/**
 * Validate the field-limited, one-time initial protected-policy transition.
 *
 * @param previous - Exact protected state parent.
 * @param next - Proposed bootstrap successor.
 */
export function assertPolicyBootstrapTransition(previous: AdoptionState, next: AdoptionState): void {
  assertAdoptionState(previous)
  assertAdoptionState(next)
  if (previous.policy !== null || next.policy === null) {
    throw new Error('Initial protected-policy bootstrap requires null to non-null policy state.')
  }
  if (next.revision !== previous.revision + 1) {
    throw new Error('Initial protected-policy bootstrap must increment revision exactly once.')
  }
  if (
    Date.parse(next.updatedAt) <= Date.parse(previous.updatedAt)
    || next.updatedBy === ''
    || next.updateRunId <= 0
  ) {
    throw new Error('Initial protected-policy bootstrap requires fresh update provenance.')
  }
  if (canonicalJson(policyBootstrapStableFields(next)) !== canonicalJson(policyBootstrapStableFields(previous))) {
    throw new Error('Initial protected-policy bootstrap may change only policy, revision, and update provenance.')
  }
}

/** Validate an immutable receipt against protected state and live GitHub facts. */
export function assertValidationReceipt(state: AdoptionState, receipt: ValidationReceipt, facts: FinalizationFacts): void {
  const delivery = requireDelivery(state)
  const candidate = requireCandidate(delivery)
  const validation = delivery.validation
  if (validation === null || validation.consumed) throw new Error('Finalization requires one unconsumed validation receipt.')
  const expected = { schemaVersion: 1, nonce: validation.nonce, stateRefCommit: facts.stateRefCommit, stateRevision: state.revision, inputKey: delivery.attempt.inputKey, candidateCommit: candidate.headCommit, baseCommit: candidate.baseCommit, upstreamCommit: delivery.upstream.commit, desktopTag: delivery.desktopTag, mode: delivery.mode, workflowCommit: facts.workflowCommit, sourceCommit: candidate.headCommit, conclusion: 'success' }
  for (const [key, value] of Object.entries(expected)) if (receipt[key as keyof ValidationReceipt] !== value) throw new Error(`Validation receipt mismatch: ${key}`)
  if (candidate.baseCommit !== facts.currentMain || candidate.headCommit !== facts.candidateHead) throw new Error('Candidate base or head changed after validation.')
  if (delivery.upstream.commit !== facts.upstreamTagCommit) throw new Error('Pinned upstream tag moved or disappeared.')
  if (facts.requestFileExists || !facts.upstreamIsAncestor) throw new Error('Candidate has not completed the pinned merge.')
  if (validation.runId !== null && validation.runId !== receipt.runId) throw new Error('Validation run ID changed.')
  if (validation.runAttempt !== null && validation.runAttempt !== receipt.runAttempt) throw new Error('Validation run attempt changed.')
  if (validation.receiptDigest !== null && validation.receiptDigest !== facts.receiptArtifactDigest) throw new Error('Receipt artifact digest changed.')
  if ((candidate.humanEdited || candidate.protectedPathsChanged.length > 0) && candidate.approvedHead !== candidate.headCommit) throw new Error('Exact validated head lacks maintainer approval.')
}

/** Return the exact expected GitHub Release asset names. */
export function expectedReleaseAssetNames(version: string, mode: ReleaseMode): readonly string[] {
  const names = [`DSH-Desktop-Mint-${version}-arm64.dmg`, `DSH-Desktop-Mint-${version}-x64.dmg`, 'SHA256SUMS.txt']
  if (mode === 'signed-stable') names.push(`DSH-Desktop-Mint-${version}-arm64.zip`, `DSH-Desktop-Mint-${version}-x64.zip`, `DSH-Desktop-Mint-${version}-arm64.zip.blockmap`, `DSH-Desktop-Mint-${version}-x64.zip.blockmap`, 'latest-mac.yml')
  return names.sort()
}

/** Verify a draft or public Release against its qualified bundle. */
export function assertReleaseObject(release: ReleaseObject, delivery: ActiveDelivery, assets: readonly ReleaseAsset[], visibility: 'draft' | 'public'): void {
  const bundle = requireArtifacts(delivery)
  if (release.tag !== delivery.desktopTag || release.targetCommit !== bundle.sourceCommit) throw new Error('Release source does not match finalization state.')
  if ((visibility === 'draft') !== release.draft) throw new Error(`Release must be ${visibility}.`)
  if (delivery.mode === 'signed-stable') {
    if (release.prerelease || (visibility === 'public' && !release.latest)) throw new Error('Stable public Release must be Latest.')
  } else if (!release.prerelease || release.latest) throw new Error('Preview Release must be prerelease and not Latest.')
  for (const fact of [delivery.upstream.tag, delivery.upstream.commit, bundle.sourceCommit, delivery.mode]) if (!release.notes.includes(fact)) throw new Error(`Release notes omit ${fact}.`)
  if (canonicalJson(sortAssets(release.assets)) !== canonicalJson(sortAssets(assets))) throw new Error('Release assets or downloaded checksums differ from the bundle.')
}

function assertCursor(value: Record<string, unknown>): void {
  exactKeys(value, ['tag', 'commit', 'publishedAt', 'desktopTag', 'desktopCommit', 'publicationReceipt'], 'lastPublishedRelease')
  assertUpstream(value)
  if (!desktopTag(value.desktopTag) || !sha40(value.desktopCommit) || !sha256(value.publicationReceipt)) throw new Error('Invalid published cursor.')
}

function assertDelivery(value: Record<string, unknown>): void {
  exactKeys(value, ['upstream', 'desktopTag', 'mode', 'phase', 'candidate', 'validation', 'artifacts', 'attempt', 'failure', 'publicationRun', 'paused'], 'activeDelivery')
  const upstream = record(value.upstream, 'upstream')
  exactKeys(upstream, ['tag', 'commit', 'publishedAt'], 'activeDelivery.upstream')
  assertUpstream(upstream)
  const phase = value.phase
  const mode = value.mode
  if (!adoptionPhase(phase) || !releaseMode(mode) || !desktopTag(value.desktopTag)) throw new Error('Invalid active delivery identity.')
  const expected = resolveDesktopRelease(String(record(value.upstream, 'upstream').tag), mode === 'unsigned-preview' ? 'unsigned-preview' : 'signed')
  if (expected.desktopTag !== value.desktopTag || expected.mode !== mode) throw new Error('Desktop release identity does not match the pinned upstream Release.')
  const candidate = value.candidate === null ? null : record(value.candidate, 'candidate')
  const validation = value.validation === null ? null : record(value.validation, 'validation')
  const artifacts = value.artifacts === null ? null : record(value.artifacts, 'artifacts')
  if (candidate !== null) assertCandidate(candidate)
  if (validation !== null) assertValidation(validation)
  if (artifacts !== null) assertArtifacts(artifacts)
  if (phase === 'detected' && (candidate !== null || validation !== null || artifacts !== null)) throw new Error('Detected delivery cannot carry candidate evidence.')
  if (['candidate-open', 'candidate-stale', 'candidate-validated', 'artifacts-validated', 'release-pending', 'publication-blocked'].includes(phase) && candidate === null) throw new Error(`Phase ${phase} requires a candidate.`)
  if (['candidate-open', 'candidate-validated', 'artifacts-validated', 'release-pending', 'publication-blocked'].includes(phase) && validation === null) throw new Error(`Phase ${phase} requires validation state.`)
  if (['artifacts-validated', 'release-pending', 'publication-blocked'].includes(phase) && artifacts === null) throw new Error(`Phase ${phase} requires qualified artifacts.`)
  if (value.failure !== null) assertFailure(record(value.failure, 'failure'))
  if (['adoption-blocked', 'candidate-stale', 'publication-blocked'].includes(phase) && value.failure === null) throw new Error(`Phase ${phase} requires a failure.`)
  assertAttempt(record(value.attempt, 'attempt'))
  if (!nullablePositiveInteger(value.publicationRun)) throw new Error('Invalid publication run identifier.')
  if (value.publicationRun !== null && phase !== 'publication-blocked') throw new Error('Only publication-blocked state records a publication run.')
  if (typeof value.paused !== 'boolean') throw new Error('Invalid delivery pause state.')
}

function assertUpstream(value: Record<string, unknown>): void {
  if (!upstreamTag(value.tag) || !sha40(value.commit) || typeof value.publishedAt !== 'string' || !Number.isFinite(Date.parse(value.publishedAt))) throw new Error('Invalid upstream identity.')
}

function assertCandidate(value: Record<string, unknown>): void {
  exactKeys(value, ['branch', 'pr', 'baseCommit', 'headCommit', 'humanEdited', 'protectedPathsChanged', 'approvedHead', 'requestPath'], 'candidate')
  if (
    typeof value.branch !== 'string'
    || !value.branch.startsWith('automation/adopt/dsh-v')
    || !positiveInteger(value.pr)
    || !sha40(value.baseCommit)
    || !sha40(value.headCommit)
    || typeof value.humanEdited !== 'boolean'
    || !Array.isArray(value.protectedPathsChanged)
    || value.protectedPathsChanged.some(path => typeof path !== 'string' || path === '')
    || new Set(value.protectedPathsChanged).size !== value.protectedPathsChanged.length
    || (value.approvedHead !== null && !sha40(value.approvedHead))
    || (value.requestPath !== null && (typeof value.requestPath !== 'string' || !value.requestPath.startsWith('.github/upstream-adoption-requests/dsh-v')))
  ) {
    throw new Error('Invalid candidate state.')
  }
}

function assertValidation(value: Record<string, unknown>): void {
  exactKeys(value, ['nonce', 'consumed', 'runId', 'runAttempt', 'receiptArtifact', 'receiptDigest'], 'validation')
  if (
    typeof value.nonce !== 'string'
    || value.nonce === ''
    || typeof value.consumed !== 'boolean'
    || !nullablePositiveInteger(value.runId)
    || !nullablePositiveInteger(value.runAttempt)
    || (value.receiptArtifact !== null && (typeof value.receiptArtifact !== 'string' || value.receiptArtifact === ''))
    || (value.receiptDigest !== null && !sha256(value.receiptDigest))
  ) {
    throw new Error('Invalid validation state.')
  }
}

function assertArtifacts(value: Record<string, unknown>): void {
  exactKeys(value, ['artifactName', 'manifestDigest', 'sourceCommit', 'workflowCommit', 'runId', 'runAttempt', 'expiresAt'], 'artifacts')
  if (
    typeof value.artifactName !== 'string'
    || value.artifactName === ''
    || !sha256(value.manifestDigest)
    || !sha40(value.sourceCommit)
    || !sha40(value.workflowCommit)
    || !positiveInteger(value.runId)
    || !positiveInteger(value.runAttempt)
    || typeof value.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(value.expiresAt))
  ) {
    throw new Error('Invalid artifact bundle state.')
  }
}

function assertFailure(value: Record<string, unknown>): void {
  exactKeys(value, ['kind', 'stage', 'failureClass', 'fingerprint', 'retryCount', 'nextRetryAt'], 'failure')
  if (
    !['deterministic', 'transient'].includes(String(value.kind))
    || typeof value.stage !== 'string'
    || value.stage === ''
    || typeof value.failureClass !== 'string'
    || value.failureClass === ''
    || !sha256(value.fingerprint)
    || !Number.isInteger(value.retryCount)
    || Number(value.retryCount) < 0
    || (value.nextRetryAt !== null && (typeof value.nextRetryAt !== 'string' || !Number.isFinite(Date.parse(value.nextRetryAt))))
  ) {
    throw new Error('Invalid failure state.')
  }
  if (value.kind === 'deterministic' && value.nextRetryAt !== null) throw new Error('Deterministic failure cannot schedule a retry.')
}

function assertAttempt(value: Record<string, unknown>): void {
  exactKeys(value, ['ordinal', 'inputKey', 'trigger', 'forceReason'], 'attempt')
  if (
    !positiveInteger(value.ordinal)
    || !sha256(value.inputKey)
    || !['scheduled', 'authoritative-change', 'manual-force'].includes(String(value.trigger))
    || (value.forceReason !== null && (typeof value.forceReason !== 'string' || value.forceReason.trim() === ''))
    || (value.trigger === 'manual-force') !== (value.forceReason !== null)
  ) {
    throw new Error('Invalid attempt state.')
  }
}

function assertPolicyState(value: Record<string, unknown>): void {
  exactKeys(value, ['activation', 'receipt'], 'policy')
  const activation = record(value.activation, 'policy.activation')
  const receipt = record(value.receipt, 'policy.receipt')
  exactKeys(activation, ['rotationOrdinal', 'authorizationPr', 'authorizationCommit', 'digest', 'signerFingerprint'], 'policy.activation')
  exactKeys(receipt, ['sequence', 'id', 'bundleDigest', 'authorizationPr', 'authorizationCommit', 'expiresAt'], 'policy.receipt')
  if (
    !Number.isInteger(activation.rotationOrdinal)
    || !Number.isInteger(activation.authorizationPr)
    || !sha40(activation.authorizationCommit)
    || !sha256(activation.digest)
    || typeof activation.signerFingerprint !== 'string'
  ) {
    throw new Error('Invalid protected activation state.')
  }
  if (
    !Number.isInteger(receipt.sequence)
    || !Number.isInteger(receipt.authorizationPr)
    || typeof receipt.id !== 'string'
    || !sha256(receipt.bundleDigest)
    || !sha40(receipt.authorizationCommit)
    || typeof receipt.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(receipt.expiresAt))
  ) {
    throw new Error('Invalid protected receipt state.')
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], name: string): void {
  const actual = Object.keys(value).sort()
  const required = [...expected].sort()
  if (canonicalJson(actual) !== canonicalJson(required)) throw new Error(`${name} has unknown or missing fields.`)
}

function policyBootstrapStableFields(state: AdoptionState): object {
  return {
    schemaVersion: state.schemaVersion,
    upstreamRepository: state.upstreamRepository,
    lastPublishedRelease: state.lastPublishedRelease,
    activeDelivery: state.activeDelivery,
  }
}

function assertPolicyTransition(
  previous: ProtectedPolicyState | null,
  next: ProtectedPolicyState | null,
): void {
  if (previous === null) return
  if (next === null) throw new Error('Protected policy state cannot be removed.')
  if (canonicalJson(previous.activation) !== canonicalJson(next.activation)) {
    if (next.activation.rotationOrdinal !== previous.activation.rotationOrdinal + 1) {
      throw new Error('Protected activation rotation must advance exactly once.')
    }
    if (
      next.activation.authorizationPr !== next.receipt.authorizationPr
      || next.activation.authorizationCommit !== next.receipt.authorizationCommit
    ) {
      throw new Error('Protected signer rotation must share one authorization with its receipt.')
    }
    if (next.activation.signerFingerprint === previous.activation.signerFingerprint) {
      throw new Error('Protected signer rotation must introduce a new signer fingerprint.')
    }
    if (next.receipt.sequence !== previous.receipt.sequence + 1) {
      throw new Error('Protected signer rotation must advance the receipt sequence exactly once.')
    }
    return
  }
  if (next.receipt.sequence === previous.receipt.sequence) {
    if (canonicalJson(previous.receipt) !== canonicalJson(next.receipt)) {
      throw new Error('Protected receipt cannot be replaced at the same sequence.')
    }
    return
  }
  if (next.receipt.sequence !== previous.receipt.sequence + 1) {
    throw new Error('Protected receipt sequence must advance exactly once.')
  }
}

function requireDelivery(state: AdoptionState): ActiveDelivery {
  if (state.activeDelivery === null) throw new Error('No active queue head.')
  return state.activeDelivery
}

function requireCandidate(delivery: ActiveDelivery): CandidateState {
  if (delivery.candidate === null) throw new Error('Active delivery has no candidate.')
  return delivery.candidate
}

function requireArtifacts(delivery: ActiveDelivery): ArtifactBundleState {
  if (delivery.artifacts === null) throw new Error('Active delivery has no artifact bundle.')
  return delivery.artifacts
}

function sameUpstream(left: UpstreamIdentity, right: UpstreamIdentity): boolean {
  return canonicalJson(left) === canonicalJson(right)
}

function adoptionPhase(value: unknown): value is AdoptionPhase {
  return typeof value === 'string' && Object.hasOwn(allowed, value)
}

function releaseMode(value: unknown): value is ReleaseMode {
  return value === 'unsigned-preview' || value === 'signed-preview' || value === 'signed-stable'
}

function upstreamTag(value: unknown): value is string {
  return typeof value === 'string' && /^dsh-v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)
}

function desktopTag(value: unknown): value is string {
  return typeof value === 'string' && /^desktop-v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)
}

function sha40(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

function sha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function positiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) > 0
}

function nullablePositiveInteger(value: unknown): boolean {
  return value === null || positiveInteger(value)
}

function unique(values: readonly string[] | undefined): readonly string[] {
  return [...new Set(values ?? [])].sort()
}

function sortAssets(values: readonly ReleaseAsset[]): readonly ReleaseAsset[] {
  return [...values].sort((left, right) => left.name.localeCompare(right.name))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} must be an object.`)
  return value
}
