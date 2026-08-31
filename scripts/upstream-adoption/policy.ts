/** Owner-authorized activation and monotonic signed-receipt verification. */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { canonicalJson } from './state.ts'

const receiptNamespace = 'dsh-mint-release-policy-v1'
const rotationApprovalNamespace = 'dsh-mint-release-policy-rotation-v1'
const receiptBundleDomain = Buffer.from('dsh-mint-release-policy-receipt-bundle\0', 'ascii')
const receiptPath = '.github/release-policy/receipt.json'
const signaturePath = '.github/release-policy/receipt.json.sig'
const activationPath = '.github/release-policy/activation.json'
const maximumReceiptLifetime = 30 * 24 * 60 * 60_000
/** Protected workflows whose exact bytes are authenticated by every receipt. */
export const policyWorkflowPaths = [
  '.github/workflows/desktop-release.yml',
  '.github/workflows/upstream-adoption-controller.yml',
  '.github/workflows/upstream-adoption-finalizer.yml',
  '.github/workflows/upstream-adoption-observer.yml',
  '.github/workflows/upstream-adoption-preflight.yml',
  '.github/workflows/upstream-adoption-validation.yml',
] as const
const requiredProtectedPaths = [
  '.github/release-policy/**',
  '.github/upstream-adoption/**',
  '.github/workflows/desktop-release.yml',
  '.github/workflows/upstream-adoption-*.yml',
  '.github/workflows/upstream-sync.yml',
  'scripts/desktop-workflows.spec.ts',
  'scripts/upstream-adoption/**',
] as const

/** Repository identity bound by the personal owner activation. */
export interface PolicyRepositoryIdentity {
  readonly id: number
  readonly name: string
  readonly owner: { readonly login: string; readonly type: 'User' }
}

/** Unconfigured policy blocks irreversible work while discovery remains quiet. */
export interface UnconfiguredActivation {
  readonly schemaVersion: 1
  readonly status: 'unconfigured'
}

/** Immutable signer activation introduced by one owner-merged squash PR. */
export interface ActiveActivation {
  readonly schemaVersion: 1
  readonly status: 'active'
  readonly repository: PolicyRepositoryIdentity
  readonly authorizationPr: number
  readonly rotationOrdinal: number
  readonly signer: {
    readonly identity: string
    readonly publicKey: string
    readonly fingerprint: string
  }
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
}

/** Persisted activation record. */
export type PolicyActivation = UnconfiguredActivation | ActiveActivation

/** Administrator-observed GitHub App configuration. */
export interface ReceiptApp {
  readonly role: 'controller' | 'finalizer' | 'publisher'
  readonly slug: string
  readonly id: number
  readonly installationId: number
  readonly permissions: Readonly<Record<string, string>>
}

/** Administrator-observed protected environment configuration. */
export interface ReceiptEnvironment {
  readonly id: number
  readonly name: 'mint-finalizer' | 'mint-publication' | 'mint-signing'
  readonly protection: unknown
  readonly secretNames: readonly string[]
}

/** Administrator-observed ruleset including hidden bypass actors. */
export interface ReceiptRuleset {
  readonly id: number
  readonly name: string
  readonly target: string
  readonly enforcement: string
  readonly conditions: unknown
  readonly rules: unknown
  readonly updatedAt: string
  readonly bypassActors: readonly unknown[]
}

/** Exact policy receipt whose bytes are signed for at most 30 days. */
export interface PolicyReceipt {
  readonly schemaVersion: 1
  readonly receiptId: string
  readonly sequence: number
  readonly authorizationPr: number
  readonly predecessor: {
    readonly receiptId: string
    readonly bundleDigest: string
  } | null
  readonly repository: PolicyRepositoryIdentity
  readonly issuedAt: string
  readonly expiresAt: string
  readonly issuer: { readonly login: string; readonly fingerprint: string }
  readonly rotationOrdinal: number
  readonly stateRef: string
  readonly apps: readonly ReceiptApp[]
  readonly environments: readonly ReceiptEnvironment[]
  readonly rulesets: readonly ReceiptRuleset[]
  readonly workflowDigests: Readonly<Record<string, string>>
  readonly generatorVersion: string
}

/** One changed file returned from the complete paginated PR file list. */
export interface AuthorizationFile {
  readonly path: string
  readonly status: string
  readonly previousPath: string | null
}

/** GitHub-derived evidence for one owner-authorized squash PR. */
export interface SquashAuthorizationFacts {
  readonly pr: number
  readonly baseRef: string
  readonly baseRepositoryId: number
  readonly headRepositoryId: number
  readonly headSha: string
  readonly headTreeSha: string
  readonly mergeSha: string
  readonly merged: boolean
  readonly mergedBy: { readonly login: string; readonly type: string }
  readonly changedFileCount: number
  readonly prFiles: readonly AuthorizationFile[]
  readonly mergeCommit: {
    readonly sha: string
    readonly verificationVerified: boolean
    readonly verificationReason: string
    readonly committerLogin: string
    readonly parents: readonly string[]
    readonly treeSha: string
    readonly parentDiffFiles: readonly AuthorizationFile[]
  }
  readonly reachableFromMain: boolean
  readonly activationDigest: string
  readonly receiptBundleDigest: string
}

/** Monotonic policy authorization stored only on the protected state ref. */
export interface ProtectedPolicyState {
  readonly activation: {
    readonly rotationOrdinal: number
    readonly authorizationPr: number
    readonly authorizationCommit: string
    readonly digest: string
    readonly signerFingerprint: string
  }
  readonly receipt: {
    readonly sequence: number
    readonly id: string
    readonly bundleDigest: string
    readonly authorizationPr: number
    readonly authorizationCommit: string
    readonly expiresAt: string
  }
}

/** Runtime-visible repository, authorization, App, ruleset, and state facts. */
export interface RuntimePolicyFacts {
  readonly repository: PolicyRepositoryIdentity
  readonly activationAuthorization: SquashAuthorizationFacts
  readonly receiptAuthorization: SquashAuthorizationFacts
  readonly executingApp: ReceiptApp
  readonly stateRef: {
    readonly ref: string
    readonly commit: string
    readonly policy: ProtectedPolicyState | null
  } | null
  readonly rulesets: readonly Omit<ReceiptRuleset, 'bypassActors'>[]
  readonly workflowDigests: Readonly<Record<string, string>>
}

/** Error with a stable blocker class suitable for state and Issue projection. */
export class PolicyError extends Error {
  /** Stable deterministic failure class. */
  readonly failureClass: 'policy-unconfigured' | 'policy-drift' | 'policy-expired' | 'policy-signature'

  /** Create one fail-closed policy error. */
  constructor(failureClass: PolicyError['failureClass'], message: string) {
    super(message)
    this.name = 'PolicyError'
    this.failureClass = failureClass
  }
}

/** Return the SHA-256 digest of exact bytes. */
export function byteDigest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Digest the exact domain-separated, length-framed receipt and signature bundle. */
export function receiptBundleDigest(receiptBytes: Uint8Array, signatureBytes: Uint8Array): string {
  const version = Buffer.alloc(4)
  version.writeUInt32BE(1)
  const framed = [receiptBundleDomain, version]
  for (const [path, bytes] of [[receiptPath, receiptBytes], [signaturePath, signatureBytes]] as const) {
    const pathBytes = Buffer.from(path, 'utf8')
    const pathLength = Buffer.alloc(4)
    pathLength.writeUInt32BE(pathBytes.length)
    const contentLength = Buffer.alloc(8)
    contentLength.writeBigUInt64BE(BigInt(bytes.byteLength))
    framed.push(pathLength, pathBytes, contentLength, Buffer.from(bytes))
  }
  return byteDigest(Buffer.concat(framed))
}

/** Verify the detached SSH signature and activation-pinned signer fingerprint. */
export function verifyReceiptSignature(
  receiptBytes: Uint8Array,
  signature: Uint8Array,
  activation: ActiveActivation,
): void {
  verifySshSignature(
    receiptBytes,
    signature,
    activation.signer.identity,
    activation.signer.publicKey,
    activation.signer.fingerprint,
    receiptNamespace,
    'Release policy receipt signature is invalid.',
  )
}

function verifySshSignature(
  bytes: Uint8Array,
  signature: Uint8Array,
  identity: string,
  publicKey: string,
  expectedFingerprint: string,
  namespace: string,
  invalidMessage: string,
): void {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-release-policy-'))
  try {
    const allowedSigners = join(directory, 'allowed_signers')
    const publicKeyPath = join(directory, 'signer.pub')
    const detachedSignature = join(directory, 'receipt.sig')
    writeFileSync(allowedSigners, `${identity} ${publicKey}\n`, { mode: 0o600 })
    writeFileSync(publicKeyPath, `${publicKey}\n`, { mode: 0o600 })
    writeFileSync(detachedSignature, signature, { mode: 0o600 })
    const fingerprint = spawnSync('ssh-keygen', ['-lf', publicKeyPath, '-E', 'sha256'], { encoding: 'utf8' })
    const reportedFingerprint = fingerprint.stdout.match(/\bSHA256:[A-Za-z0-9+/]+\b/u)?.[0]
    if (fingerprint.status !== 0 || reportedFingerprint !== expectedFingerprint) {
      throw new PolicyError('policy-signature', 'Release policy signer fingerprint does not match activation.')
    }
    const verification = spawnSync(
      'ssh-keygen',
      [
        '-Y', 'verify', '-f', allowedSigners, '-I', identity,
        '-n', namespace, '-s', detachedSignature,
      ],
      { input: bytes, encoding: 'utf8' },
    )
    if (verification.status !== 0) {
      throw new PolicyError('policy-signature', invalidMessage)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/** Verify policy authorization and return the exact next protected policy state. */
export function assertPolicy(
  activation: PolicyActivation,
  activationBytes: Uint8Array,
  receipt: PolicyReceipt,
  receiptBytes: Uint8Array,
  signatureBytes: Uint8Array,
  facts: RuntimePolicyFacts,
  now: Date,
): ProtectedPolicyState {
  if (activation.status === 'unconfigured') {
    throw new PolicyError('policy-unconfigured', 'Release policy is not activated; irreversible automation is disabled.')
  }
  assertOwnerIdentity(activation, receipt, facts)
  assertControlPlaneManifests(receipt)
  assertReceiptLifetime(receipt, now)
  if (receipt.rotationOrdinal !== activation.rotationOrdinal) {
    throw new PolicyError('policy-drift', 'Receipt rotation does not match immutable signer activation.')
  }
  if (
    receipt.issuer.login !== activation.repository.owner.login
    || receipt.issuer.fingerprint !== activation.signer.fingerprint
  ) {
    throw new PolicyError('policy-drift', 'Receipt signer identity does not match activation.')
  }
  const activationDigest = byteDigest(activationBytes)
  const bundleDigest = receiptBundleDigest(receiptBytes, signatureBytes)
  const current = facts.stateRef?.policy ?? null
  const rotating = current !== null && activation.rotationOrdinal === current.activation.rotationOrdinal + 1
  assertSquashAuthorization(
    facts.activationAuthorization,
    activation.repository,
    activation.authorizationPr,
    [activationPath, receiptPath, signaturePath],
  )
  if (facts.activationAuthorization.activationDigest !== activationDigest) {
    throw new PolicyError('policy-drift', 'Current activation bytes differ from the owner-authorized squash commit.')
  }
  if (receipt.authorizationPr !== facts.receiptAuthorization.pr) {
    throw new PolicyError('policy-drift', 'Receipt authorization PR does not match the signed receipt.')
  }
  const initial = current === null
  assertSquashAuthorization(
    facts.receiptAuthorization,
    activation.repository,
    receipt.authorizationPr,
    initial || rotating ? [activationPath, receiptPath, signaturePath] : [receiptPath, signaturePath],
  )
  if (facts.receiptAuthorization.receiptBundleDigest !== bundleDigest) {
    throw new PolicyError('policy-drift', 'Current receipt bytes differ from their owner-authorized squash commit.')
  }
  if (facts.stateRef === null || facts.stateRef.ref !== receipt.stateRef) {
    throw new PolicyError('policy-drift', 'Protected state ref is missing or changed.')
  }
  const target = policyState(activation, receipt, facts, activationDigest, bundleDigest)
  assertMonotonicReceipt(current, target, receipt, facts, activation)
  const recordedApp = receipt.apps.find(app => app.role === facts.executingApp.role)
  if (recordedApp === undefined || canonicalJson(recordedApp) !== canonicalJson(facts.executingApp)) {
    throw new PolicyError('policy-drift', 'Executing GitHub App identity or permissions changed.')
  }
  const visibleRulesets = receipt.rulesets.map(({ bypassActors: _bypassActors, ...visible }) => visible)
  if (canonicalJson(visibleRulesets) !== canonicalJson(facts.rulesets)) {
    throw new PolicyError('policy-drift', 'Runtime-visible ruleset configuration changed.')
  }
  if (canonicalJson(receipt.workflowDigests) !== canonicalJson(facts.workflowDigests)) {
    throw new PolicyError('policy-drift', 'Protected workflow digest changed.')
  }
  return target
}

/** Assert that one receipt contains exactly one record for every runtime App role. */
export function assertReceiptAppRoles(receipt: PolicyReceipt): void {
  const roles = receipt.apps.map(app => app.role).sort()
  if (canonicalJson(roles) !== canonicalJson(['controller', 'finalizer', 'publisher'])) {
    throw new PolicyError('policy-drift', 'Receipt must contain exactly the three runtime App roles.')
  }
}

/** Assert the fixed signed and unsigned workflow secret boundary. */
export function assertEnvironmentSecrets(receipt: PolicyReceipt): void {
  const environmentNames = receipt.environments.map(environment => environment.name).sort()
  if (canonicalJson(environmentNames) !== canonicalJson(['mint-finalizer', 'mint-publication', 'mint-signing'])) {
    throw new PolicyError('policy-drift', 'Receipt must contain exactly the three protected environments.')
  }
  const fixedSecrets: Readonly<Record<Exclude<ReceiptEnvironment['name'], 'mint-signing'>, readonly string[]>> = {
    'mint-finalizer': ['MINT_FINALIZER_APP_PRIVATE_KEY'],
    'mint-publication': ['MINT_PUBLISHER_APP_PRIVATE_KEY'],
  }
  const signingSecrets = new Set(['APPLE_API_ISSUER', 'APPLE_API_KEY_ID', 'APPLE_API_KEY_P8_BASE64', 'MACOS_CERTIFICATE_P12_BASE64', 'MACOS_CERTIFICATE_PASSWORD'])
  for (const environment of receipt.environments) {
    const names = [...environment.secretNames]
    const validSecrets = environment.name === 'mint-signing'
      ? new Set(names).size === names.length && names.every(name => signingSecrets.has(name))
      : canonicalJson(names.sort()) === canonicalJson([...fixedSecrets[environment.name]].sort())
    if (!validSecrets) {
      throw new PolicyError('policy-drift', `${environment.name} secret names do not match the fixed credential boundary.`)
    }
    const protection = record(environment.protection, `${environment.name}.protection`)
    const branchPolicy = record(protection.deploymentBranchPolicy, `${environment.name}.protection.deploymentBranchPolicy`)
    if (branchPolicy.protectedBranches !== true || branchPolicy.customBranchPolicies !== false) {
      throw new PolicyError('policy-drift', `${environment.name} must allow only protected branches.`)
    }
  }
}

/** Assert signed administrator-only facts against the immutable checked-in policy manifests. */
export function assertControlPlaneManifests(receipt: PolicyReceipt): void {
  const appsManifest = record(readManifest('.github/upstream-adoption/apps.json'), 'apps manifest')
  const expectedApps = record(appsManifest.apps, 'apps manifest.apps')
  if (canonicalJson(Object.keys(expectedApps).sort()) !== canonicalJson(['controller', 'finalizer', 'publisher'])) {
    throw new PolicyError('policy-drift', 'App manifest must declare exactly the three runtime roles.')
  }
  for (const [role, rawExpected] of Object.entries(expectedApps)) {
    const expected = record(rawExpected, `apps manifest.${role}`)
    const actual = receipt.apps.find(app => app.role === role)
    if (actual === undefined || canonicalJson(actual.permissions) !== canonicalJson(stringMap(expected.permissions, `apps manifest.${role}.permissions`))) {
      throw new PolicyError('policy-drift', `Receipt App permissions differ from the ${role} manifest.`)
    }
    const expectedEnvironment = expected.environment === undefined ? undefined : nonemptyString(expected.environment, `apps manifest.${role}.environment`)
    if (expectedEnvironment !== undefined && !receipt.environments.some(environment => environment.name === expectedEnvironment)) {
      throw new PolicyError('policy-drift', `Receipt omits the ${expectedEnvironment} App environment.`)
    }
  }

  const rulesetManifest = record(readManifest('.github/upstream-adoption/rulesets.json'), 'ruleset manifest')
  if (rulesetManifest.stateRef !== receipt.stateRef || !Array.isArray(rulesetManifest.rulesets)) {
    throw new PolicyError('policy-drift', 'Ruleset manifest state ref or ruleset list is invalid.')
  }
  if (receipt.rulesets.length !== rulesetManifest.rulesets.length) {
    throw new PolicyError('policy-drift', 'Receipt ruleset count differs from the manifest.')
  }
  for (const rawExpected of rulesetManifest.rulesets) {
    const expected = record(rawExpected, 'ruleset manifest entry')
    const name = nonemptyString(expected.name, 'ruleset manifest.name')
    const actual = receipt.rulesets.find(ruleset => ruleset.name === name)
    if (actual === undefined || actual.target !== expected.target || actual.enforcement !== 'active') {
      throw new PolicyError('policy-drift', `Receipt ruleset ${name} identity or enforcement differs from the manifest.`)
    }
    const expectedInclude = stringArray(expected.include, `ruleset manifest ${name}.include`)
    const conditions = record(actual.conditions, `receipt ruleset ${name}.conditions`)
    const refName = record(conditions.ref_name, `receipt ruleset ${name}.conditions.ref_name`)
    if (
      canonicalJson(stringArray(refName.include, `receipt ruleset ${name}.include`)) !== canonicalJson(expectedInclude)
      || canonicalJson(stringArray(refName.exclude, `receipt ruleset ${name}.exclude`)) !== canonicalJson([])
    ) {
      throw new PolicyError('policy-drift', `Receipt ruleset ${name} ref conditions differ from the manifest.`)
    }
    const actualRules = [...unknownArray(actual.rules, `receipt ruleset ${name}.rules`)].sort(compareRules)
    const expectedRules = [...unknownArray(expected.rules, `ruleset manifest ${name}.rules`)].sort(compareRules)
    for (const rule of [...actualRules, ...expectedRules]) nonemptyString(record(rule, `ruleset ${name}.rule`).type, `ruleset ${name}.rule.type`)
    if (canonicalJson(actualRules) !== canonicalJson(expectedRules)) {
      throw new PolicyError('policy-drift', `Receipt ruleset ${name} rules differ from the manifest.`)
    }
    const expectedBypass = Array.isArray(expected.bypass) ? expected.bypass.map((entry) => {
      const actor = record(entry, `ruleset manifest ${name}.bypass`)
      const encodedActor = nonemptyString(actor.actor, 'bypass.actor')
      const repositoryRole = encodedActor.startsWith('RepositoryRole:')
      return {
        actorType: repositoryRole ? 'RepositoryRole' : 'Integration',
        displayName: repositoryRole ? encodedActor.slice('RepositoryRole:'.length) : encodedActor,
        bypassMode: nonemptyString(actor.mode, 'bypass.mode'),
      }
    }).sort(compareByDisplayName) : []
    const actualBypass = actual.bypassActors.map((entry) => {
      const actor = record(entry, `receipt ruleset ${name}.bypassActors`)
      return {
        actorType: nonemptyString(actor.actorType, 'bypass.actorType'),
        displayName: nonemptyString(actor.displayName, 'bypass.displayName'),
        bypassMode: nonemptyString(actor.bypassMode, 'bypass.bypassMode'),
      }
    }).sort(compareByDisplayName)
    if (canonicalJson(actualBypass) !== canonicalJson(expectedBypass)) {
      throw new PolicyError('policy-drift', `Receipt ruleset ${name} hidden bypass actors differ from the manifest.`)
    }
  }

  const protectedManifest = record(readManifest('.github/upstream-adoption/protected-paths.json'), 'protected paths manifest')
  if (canonicalJson(stringArray(protectedManifest.paths, 'protected paths manifest.paths')) !== canonicalJson(requiredProtectedPaths)) {
    throw new PolicyError('policy-drift', 'Protected path manifest differs from the enforced control-plane boundary.')
  }
  const workflowPaths = Object.keys(receipt.workflowDigests).sort()
  if (
    canonicalJson(workflowPaths) !== canonicalJson([...policyWorkflowPaths].sort())
    || Object.values(receipt.workflowDigests).some(digest => !/^[0-9a-f]{64}$/u.test(digest))
  ) {
    throw new PolicyError('policy-drift', 'Receipt workflow digests do not cover the exact protected workflow set.')
  }
}

function compareRules(left: unknown, right: unknown): number {
  return String(record(left, 'ruleset rule').type).localeCompare(String(record(right, 'ruleset rule').type))
}

/** Parse and validate an activation record from a durable JSON boundary. */
export function parsePolicyActivation(value: unknown): PolicyActivation {
  const activation = record(value, 'activation')
  exactKeys(activation, ['schemaVersion', 'status', ...(activation.status === 'active' ? ['repository', 'authorizationPr', 'rotationOrdinal', 'signer', 'previousActivation'] : [])], 'activation')
  if (activation.schemaVersion !== 1) throw new PolicyError('policy-drift', 'Unsupported activation schema.')
  if (activation.status === 'unconfigured') return { schemaVersion: 1, status: 'unconfigured' }
  if (activation.status !== 'active') throw new PolicyError('policy-drift', 'Activation status is invalid.')
  const signer = record(activation.signer, 'activation.signer')
  exactKeys(signer, ['identity', 'publicKey', 'fingerprint'], 'activation.signer')
  const rotationOrdinal = positiveInteger(activation.rotationOrdinal, 'activation.rotationOrdinal')
  const previous = activation.previousActivation === null
    ? null
    : parsePreviousActivation(activation.previousActivation)
  if ((rotationOrdinal === 1) !== (previous === null)) {
    throw new PolicyError('policy-drift', 'Initial activation has no predecessor; every rotation requires one.')
  }
  if (previous !== null && previous.rotationOrdinal !== rotationOrdinal - 1) {
    throw new PolicyError('policy-drift', 'Activation rotation ordinal does not directly follow its predecessor.')
  }
  return {
    schemaVersion: 1,
    status: 'active',
    repository: parseRepository(activation.repository, 'activation.repository'),
    authorizationPr: positiveInteger(activation.authorizationPr, 'activation.authorizationPr'),
    rotationOrdinal,
    signer: {
      identity: nonemptyString(signer.identity, 'activation.signer.identity'),
      publicKey: nonemptyString(signer.publicKey, 'activation.signer.publicKey'),
      fingerprint: nonemptyString(signer.fingerprint, 'activation.signer.fingerprint'),
    },
    previousActivation: previous,
  }
}

function parsePreviousActivation(value: unknown): NonNullable<ActiveActivation['previousActivation']> {
  const previous = record(value, 'activation.previousActivation')
  exactKeys(previous, [
    'rotationOrdinal', 'authorizationPr', 'digest', 'signerFingerprint', 'signerIdentity', 'signerPublicKey',
    'receiptSequence', 'receiptId', 'receiptBundleDigest', 'approvalSignature',
  ], 'activation.previousActivation')
  return {
    rotationOrdinal: positiveInteger(previous.rotationOrdinal, 'activation.previousActivation.rotationOrdinal'),
    authorizationPr: positiveInteger(previous.authorizationPr, 'activation.previousActivation.authorizationPr'),
    digest: digestString(previous.digest, 'activation.previousActivation.digest'),
    signerFingerprint: nonemptyString(previous.signerFingerprint, 'activation.previousActivation.signerFingerprint'),
    signerIdentity: nonemptyString(previous.signerIdentity, 'activation.previousActivation.signerIdentity'),
    signerPublicKey: nonemptyString(previous.signerPublicKey, 'activation.previousActivation.signerPublicKey'),
    receiptSequence: positiveInteger(previous.receiptSequence, 'activation.previousActivation.receiptSequence'),
    receiptId: nonemptyString(previous.receiptId, 'activation.previousActivation.receiptId'),
    receiptBundleDigest: digestString(previous.receiptBundleDigest, 'activation.previousActivation.receiptBundleDigest'),
    approvalSignature: nonemptyString(previous.approvalSignature, 'activation.previousActivation.approvalSignature'),
  }
}

/** Parse the receipt fields needed at the signed durable boundary. */
export function parsePolicyReceipt(value: unknown): PolicyReceipt {
  const receipt = record(value, 'receipt')
  if (receipt.schemaVersion !== 1) throw new PolicyError('policy-drift', 'Unsupported receipt schema.')
  const predecessor = receipt.predecessor === null ? null : record(receipt.predecessor, 'receipt.predecessor')
  const issuer = record(receipt.issuer, 'receipt.issuer')
  return {
    schemaVersion: 1,
    receiptId: nonemptyString(receipt.receiptId, 'receipt.receiptId'),
    sequence: positiveInteger(receipt.sequence, 'receipt.sequence'),
    authorizationPr: positiveInteger(receipt.authorizationPr, 'receipt.authorizationPr'),
    predecessor: predecessor === null ? null : {
      receiptId: nonemptyString(predecessor.receiptId, 'receipt.predecessor.receiptId'),
      bundleDigest: digestString(predecessor.bundleDigest, 'receipt.predecessor.bundleDigest'),
    },
    repository: parseRepository(receipt.repository, 'receipt.repository'),
    issuedAt: nonemptyString(receipt.issuedAt, 'receipt.issuedAt'),
    expiresAt: nonemptyString(receipt.expiresAt, 'receipt.expiresAt'),
    issuer: {
      login: nonemptyString(issuer.login, 'receipt.issuer.login'),
      fingerprint: nonemptyString(issuer.fingerprint, 'receipt.issuer.fingerprint'),
    },
    rotationOrdinal: positiveInteger(receipt.rotationOrdinal, 'receipt.rotationOrdinal'),
    stateRef: nonemptyString(receipt.stateRef, 'receipt.stateRef'),
    apps: parseApps(receipt.apps),
    environments: parseEnvironments(receipt.environments),
    rulesets: parseRulesets(receipt.rulesets),
    workflowDigests: stringMap(receipt.workflowDigests, 'receipt.workflowDigests'),
    generatorVersion: nonemptyString(receipt.generatorVersion, 'receipt.generatorVersion'),
  }
}

/** Parse protected monotonic policy state from the state-ref document. */
export function parseProtectedPolicyState(value: unknown): ProtectedPolicyState | null {
  if (value === null) return null
  const policy = record(value, 'state.policy')
  const activation = record(policy.activation, 'state.policy.activation')
  const receipt = record(policy.receipt, 'state.policy.receipt')
  return {
    activation: {
      rotationOrdinal: positiveInteger(activation.rotationOrdinal, 'state.policy.activation.rotationOrdinal'),
      authorizationPr: positiveInteger(activation.authorizationPr, 'state.policy.activation.authorizationPr'),
      authorizationCommit: commitString(
        activation.authorizationCommit,
        'state.policy.activation.authorizationCommit',
      ),
      digest: digestString(activation.digest, 'state.policy.activation.digest'),
      signerFingerprint: nonemptyString(
        activation.signerFingerprint,
        'state.policy.activation.signerFingerprint',
      ),
    },
    receipt: {
      sequence: positiveInteger(receipt.sequence, 'state.policy.receipt.sequence'),
      id: nonemptyString(receipt.id, 'state.policy.receipt.id'),
      bundleDigest: digestString(receipt.bundleDigest, 'state.policy.receipt.bundleDigest'),
      authorizationPr: positiveInteger(receipt.authorizationPr, 'state.policy.receipt.authorizationPr'),
      authorizationCommit: commitString(
        receipt.authorizationCommit,
        'state.policy.receipt.authorizationCommit',
      ),
      expiresAt: nonemptyString(receipt.expiresAt, 'state.policy.receipt.expiresAt'),
    },
  }
}

function assertOwnerIdentity(
  activation: ActiveActivation,
  receipt: PolicyReceipt,
  facts: RuntimePolicyFacts,
): void {
  if (canonicalJson(activation.repository) !== canonicalJson(facts.repository)) {
    throw new PolicyError(
      'policy-drift',
      'Repository ownership changed; activation is invalid and recovery requires a reviewed break-glass amendment.',
    )
  }
  if (canonicalJson(receipt.repository) !== canonicalJson(facts.repository)) {
    throw new PolicyError('policy-drift', 'Receipt repository identity does not match this repository.')
  }
}

function assertReceiptLifetime(receipt: PolicyReceipt, now: Date): void {
  const issuedAt = Date.parse(receipt.issuedAt)
  const expiresAt = Date.parse(receipt.expiresAt)
  if (
    !Number.isFinite(issuedAt)
    || !Number.isFinite(expiresAt)
    || expiresAt <= issuedAt
    || expiresAt - issuedAt > maximumReceiptLifetime
  ) {
    throw new PolicyError('policy-drift', 'Receipt lifetime must be positive and at most 30 days.')
  }
  if (now.getTime() < issuedAt || now.getTime() >= expiresAt) {
    throw new PolicyError('policy-expired', 'Release policy receipt is not currently valid.')
  }
}

function assertSquashAuthorization(
  facts: SquashAuthorizationFacts,
  repository: PolicyRepositoryIdentity,
  expectedPr: number,
  expectedPaths: readonly string[],
): void {
  const expected = [...expectedPaths].sort()
  const prPaths = facts.prFiles.map(file => file.path).sort()
  const diffPaths = facts.mergeCommit.parentDiffFiles.map(file => file.path).sort()
  const invalidFile = [...facts.prFiles, ...facts.mergeCommit.parentDiffFiles]
    .some(file => !['added', 'modified'].includes(file.status) || file.previousPath !== null)
  if (
    facts.pr !== expectedPr
    || facts.baseRef !== 'main'
    || facts.baseRepositoryId !== repository.id
    || facts.headRepositoryId !== repository.id
    || !facts.merged
    || facts.mergedBy.login !== repository.owner.login
    || facts.mergedBy.type !== repository.owner.type
    || facts.mergeSha === facts.headSha
    || facts.mergeCommit.sha !== facts.mergeSha
    || !facts.mergeCommit.verificationVerified
    || facts.mergeCommit.verificationReason !== 'valid'
    || facts.mergeCommit.committerLogin !== 'web-flow'
    || facts.mergeCommit.parents.length !== 1
    || facts.mergeCommit.treeSha !== facts.headTreeSha
    || !facts.reachableFromMain
    || facts.changedFileCount !== facts.prFiles.length
    || canonicalJson(prPaths) !== canonicalJson(expected)
    || canonicalJson(diffPaths) !== canonicalJson(expected)
    || invalidFile
  ) {
    throw new PolicyError('policy-drift', `Policy PR #${String(expectedPr)} is not an exact owner-merged squash authorization.`)
  }
}

function policyState(
  activation: ActiveActivation,
  receipt: PolicyReceipt,
  facts: RuntimePolicyFacts,
  activationDigest: string,
  bundleDigest: string,
): ProtectedPolicyState {
  return {
    activation: {
      rotationOrdinal: activation.rotationOrdinal,
      authorizationPr: activation.authorizationPr,
      authorizationCommit: facts.activationAuthorization.mergeSha,
      digest: activationDigest,
      signerFingerprint: activation.signer.fingerprint,
    },
    receipt: {
      sequence: receipt.sequence,
      id: receipt.receiptId,
      bundleDigest,
      authorizationPr: receipt.authorizationPr,
      authorizationCommit: facts.receiptAuthorization.mergeSha,
      expiresAt: receipt.expiresAt,
    },
  }
}

function assertMonotonicReceipt(
  current: ProtectedPolicyState | null,
  target: ProtectedPolicyState,
  receipt: PolicyReceipt,
  facts: RuntimePolicyFacts,
  activation: ActiveActivation,
): void {
  if (current === null) {
    if (
      receipt.sequence !== 1
      || receipt.predecessor !== null
      || receipt.authorizationPr !== target.activation.authorizationPr
      || facts.receiptAuthorization.mergeSha !== facts.activationAuthorization.mergeSha
    ) {
      throw new PolicyError('policy-drift', 'Initial activation requires receipt sequence one in the same squash PR.')
    }
    return
  }
  const rotation = target.activation.rotationOrdinal === current.activation.rotationOrdinal + 1
  if (!rotation && canonicalJson(current.activation) !== canonicalJson(target.activation)) {
    throw new PolicyError('policy-drift', 'Signer activation may change only through the next verified rotation.')
  }
  if (rotation) verifyRotationApproval(current, target, receipt, facts, activation)
  if (receipt.sequence === current.receipt.sequence) {
    if (canonicalJson(current.receipt) !== canonicalJson(target.receipt)) {
      throw new PolicyError('policy-drift', 'Same-sequence receipt replacement is forbidden.')
    }
    return
  }
  if (receipt.sequence !== current.receipt.sequence + 1) {
    throw new PolicyError('policy-drift', 'Receipt sequence must advance exactly once from protected state.')
  }
  if (
    receipt.predecessor?.receiptId !== current.receipt.id
    || receipt.predecessor.bundleDigest !== current.receipt.bundleDigest
  ) {
    throw new PolicyError('policy-drift', 'Receipt predecessor does not match protected state.')
  }
}

/** Return the exact prior-key approval bytes for one signer rotation. */
export function rotationApprovalStatement(activation: ActiveActivation): Uint8Array {
  const previous = activation.previousActivation
  if (previous === null) throw new PolicyError('policy-drift', 'Initial activation has no rotation approval statement.')
  return Buffer.from(canonicalJson({
    domain: 'dsh-mint-release-policy-rotation-approval-v1',
    repository: activation.repository,
    rotationOrdinal: activation.rotationOrdinal,
    signer: activation.signer,
    previousActivation: {
      rotationOrdinal: previous.rotationOrdinal,
      authorizationPr: previous.authorizationPr,
      digest: previous.digest,
      signerFingerprint: previous.signerFingerprint,
      signerIdentity: previous.signerIdentity,
      signerPublicKey: previous.signerPublicKey,
      receiptSequence: previous.receiptSequence,
      receiptId: previous.receiptId,
      receiptBundleDigest: previous.receiptBundleDigest,
    },
  }), 'utf8')
}

function verifyRotationApproval(
  current: ProtectedPolicyState,
  target: ProtectedPolicyState,
  receipt: PolicyReceipt,
  facts: RuntimePolicyFacts,
  activation: ActiveActivation,
): void {
  if (activation.previousActivation === null) {
    throw new PolicyError('policy-drift', 'Signer rotation is missing its prior activation approval.')
  }
  const previous = activation.previousActivation
  const expectedPrevious = {
    rotationOrdinal: current.activation.rotationOrdinal,
    authorizationPr: current.activation.authorizationPr,
    digest: current.activation.digest,
    signerFingerprint: current.activation.signerFingerprint,
    receiptSequence: current.receipt.sequence,
    receiptId: current.receipt.id,
    receiptBundleDigest: current.receipt.bundleDigest,
  }
  const actualPrevious = {
    rotationOrdinal: previous.rotationOrdinal,
    authorizationPr: previous.authorizationPr,
    digest: previous.digest,
    signerFingerprint: previous.signerFingerprint,
    receiptSequence: previous.receiptSequence,
    receiptId: previous.receiptId,
    receiptBundleDigest: previous.receiptBundleDigest,
  }
  if (
    canonicalJson(actualPrevious) !== canonicalJson(expectedPrevious)
    || receipt.rotationOrdinal !== target.activation.rotationOrdinal
    || receipt.authorizationPr !== activation.authorizationPr
    || facts.receiptAuthorization.mergeSha !== facts.activationAuthorization.mergeSha
  ) {
    throw new PolicyError('policy-drift', 'Signer rotation does not directly link the protected activation and receipt state.')
  }
  verifySshSignature(
    rotationApprovalStatement(activation),
    Buffer.from(previous.approvalSignature, 'utf8'),
    previous.signerIdentity,
    previous.signerPublicKey,
    previous.signerFingerprint,
    rotationApprovalNamespace,
    'Prior signer did not approve this rotation.',
  )
}

function parseRepository(value: unknown, name: string): PolicyRepositoryIdentity {
  const repository = record(value, name)
  const owner = record(repository.owner, `${name}.owner`)
  const ownerType = nonemptyString(owner.type, `${name}.owner.type`)
  if (ownerType !== 'User') {
    throw new PolicyError('policy-drift', `${name}.owner.type must be User.`)
  }
  return {
    id: positiveInteger(repository.id, `${name}.id`),
    name: nonemptyString(repository.name, `${name}.name`),
    owner: { login: nonemptyString(owner.login, `${name}.owner.login`), type: ownerType },
  }
}

function parseApps(value: unknown): readonly ReceiptApp[] {
  if (!Array.isArray(value)) throw new PolicyError('policy-drift', 'receipt.apps must be an array.')
  return value.map((entry, index) => {
    const app = record(entry, `receipt.apps[${String(index)}]`)
    const role = nonemptyString(app.role, 'receipt.apps.role')
    if (role !== 'controller' && role !== 'finalizer' && role !== 'publisher') {
      throw new PolicyError('policy-drift', 'Receipt App role is invalid.')
    }
    return {
      role,
      slug: nonemptyString(app.slug, 'receipt.apps.slug'),
      id: positiveInteger(app.id, 'receipt.apps.id'),
      installationId: positiveInteger(app.installationId, 'receipt.apps.installationId'),
      permissions: stringMap(app.permissions, 'receipt.apps.permissions'),
    }
  })
}

function parseEnvironments(value: unknown): readonly ReceiptEnvironment[] {
  if (!Array.isArray(value)) throw new PolicyError('policy-drift', 'receipt.environments must be an array.')
  return value.map((entry, index) => {
    const environment = record(entry, `receipt.environments[${String(index)}]`)
    const name = nonemptyString(environment.name, 'receipt.environments.name')
    if (name !== 'mint-finalizer' && name !== 'mint-publication' && name !== 'mint-signing') {
      throw new PolicyError('policy-drift', 'Receipt environment name is invalid.')
    }
    return {
      id: positiveInteger(environment.id, 'receipt.environments.id'),
      name,
      protection: environment.protection,
      secretNames: stringArray(environment.secretNames, 'receipt.environments.secretNames'),
    }
  })
}

function parseRulesets(value: unknown): readonly ReceiptRuleset[] {
  if (!Array.isArray(value)) throw new PolicyError('policy-drift', 'receipt.rulesets must be an array.')
  return value.map((entry, index) => {
    const ruleset = record(entry, `receipt.rulesets[${String(index)}]`)
    if (!Array.isArray(ruleset.bypassActors)) {
      throw new PolicyError('policy-drift', 'receipt.rulesets.bypassActors must be an array.')
    }
    return {
      id: positiveInteger(ruleset.id, 'receipt.rulesets.id'),
      name: nonemptyString(ruleset.name, 'receipt.rulesets.name'),
      target: nonemptyString(ruleset.target, 'receipt.rulesets.target'),
      enforcement: nonemptyString(ruleset.enforcement, 'receipt.rulesets.enforcement'),
      conditions: ruleset.conditions,
      rules: ruleset.rules,
      updatedAt: nonemptyString(ruleset.updatedAt, 'receipt.rulesets.updatedAt'),
      bypassActors: ruleset.bypassActors,
    }
  })
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PolicyError('policy-drift', `${name} must be an object.`)
  }
  return value as Record<string, unknown>
}

function nonemptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new PolicyError('policy-drift', `${name} must be a string.`)
  return value
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], name: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    throw new PolicyError('policy-drift', `${name} fields are invalid.`)
  }
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new PolicyError('policy-drift', `${name} must be a positive integer.`)
  }
  return Number(value)
}

function digestString(value: unknown, name: string): string {
  const result = nonemptyString(value, name)
  if (!/^[0-9a-f]{64}$/u.test(result)) throw new PolicyError('policy-drift', `${name} must be a SHA-256 digest.`)
  return result
}

function commitString(value: unknown, name: string): string {
  const result = nonemptyString(value, name)
  if (!/^[0-9a-f]{40}$/u.test(result)) throw new PolicyError('policy-drift', `${name} must be a commit SHA.`)
  return result
}

function stringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')) {
    throw new PolicyError('policy-drift', `${name} must be a string array.`)
  }
  return value as readonly string[]
}

function unknownArray(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new PolicyError('policy-drift', `${name} must be an array.`)
  return value as readonly unknown[]
}

function stringMap(value: unknown, name: string): Readonly<Record<string, string>> {
  const mapping = record(value, name)
  if (Object.values(mapping).some(entry => typeof entry !== 'string')) {
    throw new PolicyError('policy-drift', `${name} values must be strings.`)
  }
  return mapping as Readonly<Record<string, string>>
}

function readManifest(path: string): unknown {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown
  } catch (error) {
    throw new PolicyError('policy-drift', `Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function compareByDisplayName(left: { displayName: string }, right: { displayName: string }): number {
  return left.displayName.localeCompare(right.displayName)
}
