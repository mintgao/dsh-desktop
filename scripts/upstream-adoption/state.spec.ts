import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertControlPlaneManifests,
  assertEnvironmentSecrets,
  assertInitialPolicyBootstrapAuthorization,
  assertPolicy,
  assertReceiptAppRoles,
  byteDigest,
  parsePolicyReceipt,
  receiptBundleDigest,
  rotationApprovalStatement,
  verifyReceiptSignature,
  type ActiveActivation,
  type PolicyReceipt,
  type ProtectedPolicyState,
  type RuntimePolicyFacts,
  type SquashAuthorizationFacts,
} from './policy.ts'
import {
  assertAdoptionState,
  assertPolicyBootstrapTransition,
  assertReleaseObject,
  assertTransition,
  assertValidationReceipt,
  attemptInputKey,
  bootstrapAdoptionState,
  bootstrapProtectedPolicyState,
  decideAttempt,
  expectedReleaseAssetNames,
  failureFingerprint,
  nextTransientRetry,
  resolveDesktopRelease,
  type ActiveDelivery,
  type AdoptionState,
  type ValidationReceipt,
} from './state.ts'

const root = resolve(import.meta.dirname, '..', '..')
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('upstream adoption state machine', () => {
  it('maps unsigned and signed upstream releases without retargeting versions', () => {
    expect(resolveDesktopRelease('dsh-v0.1.2', 'unsigned-preview')).toEqual({
      desktopTag: 'desktop-v0.1.2-unsigned.1',
      mode: 'unsigned-preview',
    })
    expect(resolveDesktopRelease('dsh-v0.1.2-alpha.1', 'unsigned-preview')).toEqual({
      desktopTag: 'desktop-v0.1.2-alpha.1.unsigned.1',
      mode: 'unsigned-preview',
    })
    expect(resolveDesktopRelease('dsh-v0.1.2-alpha.1', 'signed')).toEqual({
      desktopTag: 'desktop-v0.1.2-alpha.1',
      mode: 'signed-preview',
    })
  })

  it('turns unchanged deterministic blockers into successful no-ops', () => {
    const delivery = activeDelivery({
      failure: {
        kind: 'deterministic',
        stage: 'merge',
        failureClass: 'conflict',
        fingerprint: 'f'.repeat(64),
        retryCount: 0,
        nextRetryAt: null,
      },
    })

    expect(decideAttempt(delivery, delivery.attempt.inputKey, new Date('2026-08-31T00:00:00Z'))).toEqual({
      action: 'noop',
      reason: 'unchanged-deterministic-blocker',
    })
    expect(decideAttempt(delivery, '2'.repeat(64), new Date('2026-08-31T00:00:00Z'))).toEqual({
      action: 'execute',
      reason: 'authoritative-input-changed',
    })
  })

  it('bounds transient retries and validates exact manual force', () => {
    expect(nextTransientRetry(new Date('2026-08-31T00:00:00Z'), 0)).toBe('2026-08-31T00:30:00.000Z')
    expect(nextTransientRetry(new Date('2026-08-31T00:00:00Z'), 3)).toBeNull()

    const delivery = activeDelivery({
      failure: {
        kind: 'transient',
        stage: 'api',
        failureClass: 'github-api',
        fingerprint: 'f'.repeat(64),
        retryCount: 1,
        nextRetryAt: '2026-08-31T02:00:00Z',
      },
    })

    expect(decideAttempt(delivery, delivery.attempt.inputKey, new Date('2026-08-31T01:59:00Z')).reason).toBe(
      'transient-backoff',
    )
    expect(() => {
      decideAttempt(delivery, delivery.attempt.inputKey, new Date(), { queueHead: 'dsh-v9.9.9', reason: 'retry' })
    }).toThrow('exact queue-head')
  })

  it('rejects queue retargeting, protected receipt rollback, and nonce replay', () => {
    const before = state(activeDelivery(), 1, protectedPolicyState())
    const retargeted = state(
      activeDelivery({
        upstream: { ...before.activeDelivery!.upstream, tag: 'dsh-v0.1.2-alpha.2' },
        desktopTag: 'desktop-v0.1.2-alpha.2.unsigned.1',
      }),
      2,
      protectedPolicyState(),
    )
    expect(() => {
      assertTransition(before, retargeted)
    }).toThrow('retargeted')

    const replay = state(activeDelivery({ validation: { ...before.activeDelivery!.validation!, consumed: false } }), 2)
    const consumed = state(activeDelivery({ validation: { ...before.activeDelivery!.validation!, consumed: true } }))
    expect(() => {
      assertTransition(consumed, replay)
    }).toThrow('replayed')

    const replacedReceipt = state(
      activeDelivery(),
      2,
      {
        ...protectedPolicyState(),
        receipt: { ...protectedPolicyState().receipt, bundleDigest: 'd'.repeat(64) },
      },
    )
    expect(() => {
      assertTransition(before, replacedReceipt)
    }).toThrow('same sequence')
  })

  it('persists only the next owner-authorized signer rotation', () => {
    const currentPolicy = protectedPolicyState()
    const before = state(activeDelivery(), 1, currentPolicy)
    const rotatedPolicy: ProtectedPolicyState = {
      activation: {
        rotationOrdinal: 2,
        authorizationPr: 18,
        authorizationCommit: 'e'.repeat(40),
        digest: 'f'.repeat(64),
        signerFingerprint: 'SHA256:next-fixture',
      },
      receipt: {
        sequence: 2,
        id: 'receipt-2',
        bundleDigest: '1'.repeat(64),
        authorizationPr: 18,
        authorizationCommit: 'e'.repeat(40),
        expiresAt: '2026-10-20T00:00:00Z',
      },
    }

    expect(() => {
      assertTransition(before, state(activeDelivery(), 2, rotatedPolicy))
    }).not.toThrow()
    expect(() => {
      assertTransition(before, state(activeDelivery(), 2, {
        ...rotatedPolicy,
        activation: { ...rotatedPolicy.activation, rotationOrdinal: 3 },
      }))
    }).toThrow('rotation must advance exactly once')
    expect(() => {
      assertTransition(before, state(activeDelivery(), 2, {
        ...rotatedPolicy,
        receipt: { ...rotatedPolicy.receipt, authorizationCommit: '2'.repeat(40) },
      }))
    }).toThrow('must share one authorization')
    expect(() => {
      assertTransition(before, state(activeDelivery(), 2, {
        ...rotatedPolicy,
        activation: {
          ...rotatedPolicy.activation,
          signerFingerprint: currentPolicy.activation.signerFingerprint,
        },
      }))
    }).toThrow('new signer fingerprint')
  })

  it('materializes initial policy without changing delivery or cursor state', () => {
    const before = state(activeDelivery(), 1, null)
    const policy = protectedPolicyState()
    const next = bootstrapProtectedPolicyState(
      before,
      policy,
      '2026-08-31T00:02:00Z',
      'mint-state-finalizer',
      42,
    )

    expect(next).toEqual({
      ...before,
      revision: 2,
      policy,
      updatedAt: '2026-08-31T00:02:00Z',
      updatedBy: 'mint-state-finalizer',
      updateRunId: 42,
    })
    expect(() => {
      assertPolicyBootstrapTransition(before, next)
    }).not.toThrow()
    expect(() => {
      assertPolicyBootstrapTransition(before, {
        ...next,
        activeDelivery: activeDelivery({ paused: true }),
      })
    }).toThrow('may change only policy')
    expect(() => {
      assertPolicyBootstrapTransition(before, {
        ...next,
        lastPublishedRelease: { ...next.lastPublishedRelease, publicationReceipt: 'e'.repeat(64) },
      })
    }).toThrow('may change only policy')
    expect(() => {
      bootstrapProtectedPolicyState(next, policy, '2026-08-31T00:03:00Z', 'mint-state-finalizer', 43)
    }).toThrow('null to non-null')
  })

  it('pins qualified candidate, validation, and artifact identities once protected state advances', () => {
    const before = state(activeDelivery({ phase: 'artifacts-validated' }), 1, protectedPolicyState())

    expect(() => {
      assertTransition(before, state(activeDelivery({
        phase: 'release-pending',
        candidate: { ...before.activeDelivery!.candidate!, headCommit: 'e'.repeat(40) },
      }), 2, protectedPolicyState()))
    }).toThrow('Qualified candidate identity')

    expect(() => {
      assertTransition(before, state(activeDelivery({
        phase: 'release-pending',
        validation: { ...before.activeDelivery!.validation!, receiptDigest: 'f'.repeat(64) },
      }), 2, protectedPolicyState()))
    }).toThrow('Qualified validation identity')

    expect(() => {
      assertTransition(before, state(activeDelivery({
        phase: 'release-pending',
        artifacts: { ...before.activeDelivery!.artifacts!, manifestDigest: '1'.repeat(64) },
      }), 2, protectedPolicyState()))
    }).toThrow('Qualified artifact identity')
  })

  it('binds validation receipts to state, candidate, workflow, and exact-head approval', () => {
    const current = state(activeDelivery({ phase: 'artifacts-validated' }))
    const delivery = current.activeDelivery!
    const receipt = validationReceipt(current)
    const facts = {
      stateRefCommit: 'd'.repeat(40),
      currentMain: delivery.candidate!.baseCommit,
      candidateHead: delivery.candidate!.headCommit,
      upstreamTagCommit: delivery.upstream.commit,
      workflowCommit: delivery.artifacts!.workflowCommit,
      receiptArtifactDigest: delivery.validation!.receiptDigest!,
      requestFileExists: false,
      upstreamIsAncestor: true,
    }

    expect(() => {
      assertValidationReceipt(current, receipt, facts)
    }).not.toThrow()
    expect(() => {
      assertValidationReceipt(current, receipt, { ...facts, candidateHead: '9'.repeat(40) })
    }).toThrow(
      'changed after validation',
    )
    expect(() => {
      assertValidationReceipt(current, receipt, { ...facts, requestFileExists: true })
    }).toThrow(
      'completed the pinned merge',
    )
  })

  it('requires exact assets, checksums, provenance, and visibility', () => {
    const delivery = activeDelivery({ phase: 'release-pending' })
    const version = delivery.desktopTag.slice('desktop-v'.length)
    const assets = expectedReleaseAssetNames(version, delivery.mode)
      .map(name => ({ name, sha256: 'a'.repeat(64) }))
    const release = {
      tag: delivery.desktopTag,
      targetCommit: delivery.artifacts!.sourceCommit,
      draft: false,
      prerelease: true,
      latest: false,
      notes: `${delivery.upstream.tag} ${delivery.upstream.commit} ${delivery.artifacts!.sourceCommit} ${delivery.mode}`,
      assets,
    }

    expect(() => {
      assertReleaseObject(release, delivery, assets, 'public')
    }).not.toThrow()
    expect(() => {
      assertReleaseObject({ ...release, assets: assets.slice(1) }, delivery, assets, 'public')
    }).toThrow(
      'differ',
    )
  })

  it('validates state shape and stable identities', () => {
    const current = state(activeDelivery())
    expect(() => {
      assertAdoptionState(current)
    }).not.toThrow()
    expect(attemptInputKey(current, 'b'.repeat(40))).toHaveLength(64)
    expect(
      attemptInputKey(
        state(activeDelivery({
          candidate: {
            ...current.activeDelivery!.candidate!,
            approvedHead: current.activeDelivery!.candidate!.headCommit,
          },
        })),
        '5'.repeat(40),
      ),
    ).not.toBe(attemptInputKey(current, '5'.repeat(40)))
    expect(
      attemptInputKey(
        state(activeDelivery({ candidate: { ...current.activeDelivery!.candidate!, headCommit: 'a'.repeat(40) } })),
        '5'.repeat(40),
      ),
    ).not.toBe(attemptInputKey(current, '5'.repeat(40)))
    expect(
      failureFingerprint({
        phase: 'candidate-open',
        stage: 'merge',
        failureClass: 'conflict',
        conflictPaths: ['b', 'a', 'a'],
      }),
    ).toHaveLength(64)

    expect(() => {
      assertAdoptionState({
        ...current,
        activeDelivery: {
          ...current.activeDelivery!,
          phase: 'published',
          mode: 'root',
          candidate: null,
          validation: null,
          artifacts: null,
        },
      })
    }).toThrow('Invalid active delivery identity')
  })

  it('seeds only a fully verified legacy publication baseline', () => {
    const seeded = bootstrapAdoptionState({
      upstream: {
        tag: 'dsh-v0.1.1-rc.2',
        commit: 'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
        publishedAt: '2026-08-21T12:35:08Z',
      },
      desktopTag: 'desktop-v0.1.0-preview.5',
      desktopCommit: 'a'.repeat(40),
      publicationReceipt: 'b'.repeat(64),
      updatedAt: '2026-08-31T00:00:00Z',
      updatedBy: 'mintgao-bootstrap',
      updateRunId: 1,
    })

    expect(seeded).toMatchObject({ schemaVersion: 2, revision: 0, activeDelivery: null, policy: null })
    expect(() => {
      bootstrapAdoptionState({
        ...seeded.lastPublishedRelease,
        upstream: {
          tag: 'not-a-release',
          commit: seeded.lastPublishedRelease.commit,
          publishedAt: seeded.lastPublishedRelease.publishedAt,
        },
        desktopCommit: seeded.lastPublishedRelease.desktopCommit,
        publicationReceipt: seeded.lastPublishedRelease.publicationReceipt,
        updatedAt: seeded.updatedAt,
        updatedBy: seeded.updatedBy,
        updateRunId: seeded.updateRunId,
      })
    }).toThrow('Invalid upstream identity')
  })
})

describe('owner-authenticated release policy', () => {
  it('frames the signed receipt bundle with the exact domain and big-endian lengths', () => {
    const receiptBytes = Buffer.from('receipt-bytes', 'utf8')
    const signatureBytes = Buffer.from('signature-bytes', 'utf8')
    const version = Buffer.alloc(4)
    version.writeUInt32BE(1)
    const expected = byteDigest(
      Buffer.concat([
        Buffer.from('dsh-mint-release-policy-receipt-bundle\0', 'ascii'),
        version,
        framedEntry('.github/release-policy/receipt.json', receiptBytes),
        framedEntry('.github/release-policy/receipt.json.sig', signatureBytes),
      ]),
    )

    expect(receiptBundleDigest(receiptBytes, signatureBytes)).toBe(expected)
  })

  it('verifies exact receipt bytes with an SSH fixture key and returns the next protected state', () => {
    const signer = signingIdentity()
    const receiptValue = receipt({ issuer: { login: 'mintgao', fingerprint: signer.fingerprint } })
    const receiptBytes = Buffer.from(JSON.stringify(receiptValue, null, 2) + '\n')
    const signature = signReceipt(receiptBytes, signer.privateKeyPath)
    const activation = activeActivation(signer.publicKey, signer.fingerprint)
    const activationBytes = Buffer.from(JSON.stringify(activation, null, 2) + '\n')
    const facts = runtimeFacts(receiptValue, activationBytes, receiptBytes, signature, null)

    expect(() => {
      verifyReceiptSignature(receiptBytes, signature, activation)
    }).not.toThrow()
    expect(assertPolicy(activation, activationBytes, receiptValue, receiptBytes, signature, facts, new Date('2026-09-01T00:00:00Z'))).toEqual(
      {
        activation: {
          rotationOrdinal: 1,
          authorizationPr: activation.authorizationPr,
          authorizationCommit: facts.activationAuthorization.mergeSha,
          digest: byteDigest(activationBytes),
          signerFingerprint: signer.fingerprint,
        },
        receipt: {
          sequence: receiptValue.sequence,
          id: receiptValue.receiptId,
          bundleDigest: receiptBundleDigest(receiptBytes, signature),
          authorizationPr: receiptValue.authorizationPr,
          authorizationCommit: facts.receiptAuthorization.mergeSha,
          expiresAt: receiptValue.expiresAt,
        },
      },
    )
  })

  it('authorizes initial bootstrap only for the exact sequence-one squash and null state', () => {
    const signer = signingIdentity()
    const receiptValue = receipt({ issuer: { login: 'mintgao', fingerprint: signer.fingerprint } })
    const receiptBytes = Buffer.from(JSON.stringify(receiptValue, null, 2) + '\n')
    const signature = signReceipt(receiptBytes, signer.privateKeyPath)
    const activation = activeActivation(signer.publicKey, signer.fingerprint)
    const activationBytes = Buffer.from(JSON.stringify(activation, null, 2) + '\n')
    const authorization = authorizationFacts(
      activation.authorizationPr,
      ['.github/release-policy/activation.json', '.github/release-policy/receipt.json', '.github/release-policy/receipt.json.sig'],
      byteDigest(activationBytes),
      receiptBundleDigest(receiptBytes, signature),
    )
    const facts = {
      repository: receiptValue.repository,
      authorization,
      stateRef: {
        ref: receiptValue.stateRef,
        commit: 'f'.repeat(40),
        policy: null,
      },
    }

    expect(assertInitialPolicyBootstrapAuthorization(
      activation,
      activationBytes,
      receiptValue,
      receiptBytes,
      signature,
      facts,
    )).toEqual({ authorizationCommit: authorization.mergeSha, stateRefCommit: 'f'.repeat(40) })
    expect(() => {
      assertInitialPolicyBootstrapAuthorization(
        activation,
        activationBytes,
        { ...receiptValue, sequence: 2 },
        receiptBytes,
        signature,
        facts,
      )
    }).toThrow('shared sequence-one authorization')
    expect(() => {
      assertInitialPolicyBootstrapAuthorization(
        activation,
        activationBytes,
        { ...receiptValue, predecessor: { receiptId: 'older', bundleDigest: '1'.repeat(64) } },
        receiptBytes,
        signature,
        facts,
      )
    }).toThrow('shared sequence-one authorization')
    expect(() => {
      assertInitialPolicyBootstrapAuthorization(
        activation,
        activationBytes,
        receiptValue,
        Buffer.concat([receiptBytes, Buffer.from(' ')]),
        signature,
        facts,
      )
    }).toThrow('bytes differ')
    expect(() => {
      assertInitialPolicyBootstrapAuthorization(
        activation,
        activationBytes,
        receiptValue,
        receiptBytes,
        signature,
        { ...facts, authorization: { ...authorization, mergeSha: authorization.headSha } },
      )
    }).toThrow('exact owner-merged squash authorization')
    expect(() => {
      assertInitialPolicyBootstrapAuthorization(
        activation,
        activationBytes,
        receiptValue,
        receiptBytes,
        signature,
        { ...facts, stateRef: null },
      )
    }).toThrow('state ref is missing')
    expect(() => {
      assertInitialPolicyBootstrapAuthorization(
        activation,
        activationBytes,
        receiptValue,
        receiptBytes,
        signature,
        { ...facts, stateRef: { ...facts.stateRef, policy: protectedPolicyState() } },
      )
    }).toThrow('permanently unavailable')
  })

  it('compares equivalent ruleset timestamp offsets as the same instant', () => {
    const signer = signingIdentity()
    const source = receipt({ issuer: { login: 'mintgao', fingerprint: signer.fingerprint } })
    const rawReceipt = {
      ...source,
      rulesets: source.rulesets.map((ruleset, index) => index === 0
        ? { ...ruleset, updatedAt: '2026-09-01T01:12:18.665+08:00' }
        : ruleset),
    }
    const receiptBytes = Buffer.from(JSON.stringify(rawReceipt, null, 2) + '\n')
    const receiptValue = parsePolicyReceipt(rawReceipt)
    const signature = signReceipt(receiptBytes, signer.privateKeyPath)
    const activation = activeActivation(signer.publicKey, signer.fingerprint)
    const activationBytes = Buffer.from(JSON.stringify(activation, null, 2) + '\n')
    const facts = runtimeFacts(receiptValue, activationBytes, receiptBytes, signature, null)

    expect(receiptValue.rulesets[0]?.updatedAt).toBe('2026-08-31T17:12:18.665Z')
    expect(() => {
      assertPolicy(
        activation,
        activationBytes,
        receiptValue,
        receiptBytes,
        signature,
        facts,
        new Date('2026-09-01T00:00:00Z'),
      )
    }).not.toThrow()
    expect(() => {
      assertPolicy(
        activation,
        activationBytes,
        receiptValue,
        receiptBytes,
        signature,
        {
          ...facts,
          rulesets: facts.rulesets.map((ruleset, index) => index === 0
            ? { ...ruleset, updatedAt: '2026-08-31T17:12:19.665Z' }
            : ruleset),
        },
        new Date('2026-09-01T00:00:00Z'),
      )
    }).toThrow('Runtime-visible ruleset configuration changed')
  })

  it('rejects ambiguous squash authorization and old-receipt rollback after the protected state advances', () => {
    const signer = signingIdentity()
    const initialReceipt = receipt({ issuer: { login: 'mintgao', fingerprint: signer.fingerprint } })
    const initialBytes = Buffer.from(JSON.stringify(initialReceipt, null, 2) + '\n')
    const initialSignature = signReceipt(initialBytes, signer.privateKeyPath)
    const activation = activeActivation(signer.publicKey, signer.fingerprint)
    const activationBytes = Buffer.from(JSON.stringify(activation, null, 2) + '\n')
    const currentPolicy = assertPolicy(
      activation,
      activationBytes,
      initialReceipt,
      initialBytes,
      initialSignature,
      runtimeFacts(initialReceipt, activationBytes, initialBytes, initialSignature, null),
      new Date('2026-09-01T00:00:00Z'),
    )

    const renewal = receipt({
      receiptId: 'receipt-2',
      sequence: 2,
      authorizationPr: 18,
      issuer: { login: 'mintgao', fingerprint: signer.fingerprint },
      predecessor: {
        receiptId: initialReceipt.receiptId,
        bundleDigest: receiptBundleDigest(initialBytes, initialSignature),
      },
    })
    const renewalBytes = Buffer.from(JSON.stringify(renewal, null, 2) + '\n')
    const renewalSignature = signReceipt(renewalBytes, signer.privateKeyPath)
    const renewalFacts = runtimeFacts(renewal, activationBytes, renewalBytes, renewalSignature, currentPolicy, {
      receiptAuthorization: authorizationFacts(
        renewal.authorizationPr,
        ['.github/release-policy/receipt.json', '.github/release-policy/receipt.json.sig'],
        byteDigest(activationBytes),
        receiptBundleDigest(renewalBytes, renewalSignature),
        { mergeSha: 'd'.repeat(40), headSha: 'e'.repeat(40) },
      ),
    })
    expect(() => {
      assertPolicy(activation, activationBytes, renewal, renewalBytes, renewalSignature, renewalFacts, new Date('2026-09-02T00:00:00Z'))
    }).not.toThrow()

    const ambiguousFacts = runtimeFacts(initialReceipt, activationBytes, initialBytes, initialSignature, null, {
      activationAuthorization: authorizationFacts(
        activation.authorizationPr,
        ['.github/release-policy/activation.json', '.github/release-policy/receipt.json', '.github/release-policy/receipt.json.sig'],
        byteDigest(activationBytes),
        receiptBundleDigest(initialBytes, initialSignature),
        { mergeSha: 'f'.repeat(40), headSha: 'f'.repeat(40) },
      ),
      receiptAuthorization: authorizationFacts(
        initialReceipt.authorizationPr,
        ['.github/release-policy/activation.json', '.github/release-policy/receipt.json', '.github/release-policy/receipt.json.sig'],
        byteDigest(activationBytes),
        receiptBundleDigest(initialBytes, initialSignature),
        { mergeSha: 'f'.repeat(40), headSha: 'f'.repeat(40) },
      ),
    })
    expect(() => {
      assertPolicy(activation, activationBytes, initialReceipt, initialBytes, initialSignature, ambiguousFacts, new Date('2026-09-01T00:00:00Z'))
    }).toThrow('exact owner-merged squash authorization')

    const renewalPolicy = assertPolicy(
      activation,
      activationBytes,
      renewal,
      renewalBytes,
      renewalSignature,
      renewalFacts,
      new Date('2026-09-02T00:00:00Z'),
    )

    const nextRenewal = receipt({
      receiptId: 'receipt-3',
      sequence: 3,
      authorizationPr: 19,
      issuer: { login: 'mintgao', fingerprint: signer.fingerprint },
      predecessor: {
        receiptId: renewal.receiptId,
        bundleDigest: receiptBundleDigest(renewalBytes, renewalSignature),
      },
    })
    const nextRenewalBytes = Buffer.from(JSON.stringify(nextRenewal, null, 2) + '\n')
    const nextRenewalSignature = signReceipt(nextRenewalBytes, signer.privateKeyPath)
    const nextRenewalFacts = runtimeFacts(
      nextRenewal,
      activationBytes,
      nextRenewalBytes,
      nextRenewalSignature,
      renewalPolicy,
      {
        receiptAuthorization: authorizationFacts(
          nextRenewal.authorizationPr,
          ['.github/release-policy/receipt.json', '.github/release-policy/receipt.json.sig'],
          byteDigest(activationBytes),
          receiptBundleDigest(nextRenewalBytes, nextRenewalSignature),
          { mergeSha: '1'.repeat(40), headSha: '2'.repeat(40) },
        ),
      },
    )
    const nextPolicy = assertPolicy(
      activation,
      activationBytes,
      nextRenewal,
      nextRenewalBytes,
      nextRenewalSignature,
      nextRenewalFacts,
      new Date('2026-09-03T00:00:00Z'),
    )

    const rollbackFacts = runtimeFacts(renewal, activationBytes, renewalBytes, renewalSignature, nextPolicy, {
      receiptAuthorization: authorizationFacts(
        renewal.authorizationPr,
        ['.github/release-policy/receipt.json', '.github/release-policy/receipt.json.sig'],
        byteDigest(activationBytes),
        receiptBundleDigest(renewalBytes, renewalSignature),
        { mergeSha: 'd'.repeat(40), headSha: 'e'.repeat(40) },
      ),
    })
    expect(() => {
      assertPolicy(activation, activationBytes, renewal, renewalBytes, renewalSignature, rollbackFacts, new Date('2026-09-03T00:00:00Z'))
    }).toThrow('advance exactly once from protected state')
  })

  it('accepts only a directly linked signer rotation approved by the prior key', () => {
    const previousSigner = signingIdentity()
    const previousReceipt = receipt({ issuer: { login: 'mintgao', fingerprint: previousSigner.fingerprint } })
    const previousReceiptBytes = Buffer.from(JSON.stringify(previousReceipt, null, 2) + '\n')
    const previousReceiptSignature = signReceipt(previousReceiptBytes, previousSigner.privateKeyPath)
    const previousActivation = activeActivation(previousSigner.publicKey, previousSigner.fingerprint)
    const previousActivationBytes = Buffer.from(JSON.stringify(previousActivation, null, 2) + '\n')
    const current = assertPolicy(
      previousActivation,
      previousActivationBytes,
      previousReceipt,
      previousReceiptBytes,
      previousReceiptSignature,
      runtimeFacts(previousReceipt, previousActivationBytes, previousReceiptBytes, previousReceiptSignature, null),
      new Date('2026-09-01T00:00:00Z'),
    )

    const nextSigner = signingIdentity()
    const pendingActivation: ActiveActivation = {
      ...previousActivation,
      authorizationPr: 20,
      rotationOrdinal: 2,
      signer: { identity: 'mintgao', publicKey: nextSigner.publicKey, fingerprint: nextSigner.fingerprint },
      previousActivation: {
        rotationOrdinal: current.activation.rotationOrdinal,
        authorizationPr: current.activation.authorizationPr,
        digest: current.activation.digest,
        signerFingerprint: current.activation.signerFingerprint,
        signerIdentity: previousActivation.signer.identity,
        signerPublicKey: previousActivation.signer.publicKey,
        receiptSequence: current.receipt.sequence,
        receiptId: current.receipt.id,
        receiptBundleDigest: current.receipt.bundleDigest,
        approvalSignature: 'pending',
      },
    }
    const approval = Buffer.from(signBytes(
      rotationApprovalStatement(pendingActivation),
      previousSigner.privateKeyPath,
      'dsh-mint-release-policy-rotation-v1',
    )).toString('utf8')
    const activation: ActiveActivation = {
      ...pendingActivation,
      previousActivation: { ...pendingActivation.previousActivation!, approvalSignature: approval },
    }
    const activationBytes = Buffer.from(JSON.stringify(activation, null, 2) + '\n')
    const rotationReceipt = receipt({
      receiptId: 'receipt-2',
      sequence: 2,
      authorizationPr: activation.authorizationPr,
      predecessor: { receiptId: current.receipt.id, bundleDigest: current.receipt.bundleDigest },
      issuer: { login: 'mintgao', fingerprint: nextSigner.fingerprint },
      rotationOrdinal: activation.rotationOrdinal,
    })
    const receiptBytes = Buffer.from(JSON.stringify(rotationReceipt, null, 2) + '\n')
    const signature = signReceipt(receiptBytes, nextSigner.privateKeyPath)
    const authorization = authorizationFacts(
      activation.authorizationPr,
      ['.github/release-policy/activation.json', '.github/release-policy/receipt.json', '.github/release-policy/receipt.json.sig'],
      byteDigest(activationBytes),
      receiptBundleDigest(receiptBytes, signature),
      { mergeSha: '7'.repeat(40), headSha: '8'.repeat(40) },
    )
    const facts = runtimeFacts(rotationReceipt, activationBytes, receiptBytes, signature, current, {
      activationAuthorization: authorization,
      receiptAuthorization: authorization,
    })

    expect(assertPolicy(activation, activationBytes, rotationReceipt, receiptBytes, signature, facts, new Date('2026-09-02T00:00:00Z')))
      .toMatchObject({ activation: { rotationOrdinal: 2 }, receipt: { sequence: 2 } })
    expect(() => {
      const tampered = {
        ...activation,
        previousActivation: { ...activation.previousActivation!, approvalSignature: approval.replace('A', 'B') },
      }
      assertPolicy(
        tampered,
        Buffer.from(JSON.stringify(tampered, null, 2) + '\n'),
        rotationReceipt,
        receiptBytes,
        signature,
        facts,
        new Date('2026-09-02T00:00:00Z'),
      )
    }).toThrow()
  })

  it('fails closed when activation is unconfigured, receipt expires, or visible rules drift', () => {
    const signer = signingIdentity()
    const receiptValue = receipt({ issuer: { login: 'mintgao', fingerprint: signer.fingerprint } })
    const receiptBytes = Buffer.from(JSON.stringify(receiptValue, null, 2) + '\n')
    const signature = signReceipt(receiptBytes, signer.privateKeyPath)
    const activation = activeActivation(signer.publicKey, signer.fingerprint)
    const activationBytes = Buffer.from(JSON.stringify(activation, null, 2) + '\n')
    const facts = runtimeFacts(receiptValue, activationBytes, receiptBytes, signature, null)

    expect(() => {
      assertPolicy(
        { schemaVersion: 1, status: 'unconfigured' },
        Buffer.from(JSON.stringify({ schemaVersion: 1, status: 'unconfigured' }) + '\n'),
        receiptValue,
        receiptBytes,
        signature,
        facts,
        new Date('2026-09-01T00:00:00Z'),
      )
    }).toThrow('not activated')
    expect(() => {
      assertPolicy(activation, activationBytes, receiptValue, receiptBytes, signature, facts, new Date('2026-10-01T00:00:00Z'))
    }).toThrow('not currently valid')
    expect(() => {
      assertPolicy(
        activation,
        activationBytes,
        receiptValue,
        receiptBytes,
        signature,
        { ...facts, stateRef: null },
        new Date('2026-09-01T00:00:00Z'),
      )
    }).toThrow('state ref')

    const protectedPolicy = assertPolicy(
      activation,
      activationBytes,
      receiptValue,
      receiptBytes,
      signature,
      facts,
      new Date('2026-09-01T00:00:00Z'),
    )
    expect(() => {
      assertPolicy(
        activation,
        activationBytes,
        receiptValue,
        receiptBytes,
        signature,
        {
          ...facts,
          stateRef: { ...facts.stateRef!, policy: protectedPolicy },
          workflowDigests: { ...facts.workflowDigests, '.github/workflows/upstream-adoption-observer.yml': '0'.repeat(64) },
        },
        new Date('2026-09-01T00:00:00Z'),
      )
    }).toThrow('Protected workflow digest changed')
    expect(() => {
      assertPolicy(
        activation,
        activationBytes,
        receiptValue,
        receiptBytes,
        signature,
        {
          ...facts,
          executingApp: { ...facts.executingApp, permissions: { ...facts.executingApp.permissions, contents: 'read' } },
        },
        new Date('2026-09-01T00:00:00Z'),
      )
    }).toThrow('Executing GitHub App identity or permissions changed')
  })

  it('keeps the example receipt aligned with the current runtime schema and secret boundary', () => {
    const value = parsePolicyReceipt(
      JSON.parse(readFileSync(resolve(root, '.github/release-policy/receipt.example.json'), 'utf8')) as unknown,
    )

    expect(value.sequence).toBe(1)
    expect(value.authorizationPr).toBe(1)
    expect(value.predecessor).toBeNull()
    expect(() => {
      assertReceiptAppRoles(value)
    }).not.toThrow()
    expect(() => {
      assertEnvironmentSecrets(value)
    }).not.toThrow()
    expect(() => {
      assertEnvironmentSecrets({
        ...value,
        environments: value.environments.map(environment => environment.name === 'mint-signing'
          ? { ...environment, secretNames: [] }
          : environment),
      })
    }).not.toThrow()
    expect(() => {
      assertControlPlaneManifests(value)
    }).not.toThrow()
    expect(() => {
      assertControlPlaneManifests({ ...value, rulesets: value.rulesets.slice(0, 1) })
    }).toThrow('ruleset count')
  })
})

function state(
  delivery: ActiveDelivery | null,
  revision = 1,
  policy: ProtectedPolicyState | null = null,
): AdoptionState {
  return {
    schemaVersion: 2,
    revision,
    upstreamRepository: 'deepseek-ai/deepseek-harness',
    lastPublishedRelease: {
      tag: 'dsh-v0.1.1-rc.2',
      commit: '1'.repeat(40),
      publishedAt: '2026-08-21T12:35:08Z',
      desktopTag: 'desktop-v0.1.0-preview.5',
      desktopCommit: '2'.repeat(40),
      publicationReceipt: '3'.repeat(64),
    },
    activeDelivery: delivery,
    policy,
    updatedAt: revision === 1 ? '2026-08-31T00:00:00Z' : '2026-08-31T00:01:00Z',
    updatedBy: 'fixture',
    updateRunId: revision,
  }
}

function activeDelivery(overrides: Partial<ActiveDelivery> = {}): ActiveDelivery {
  return {
    upstream: {
      tag: 'dsh-v0.1.2-alpha.1',
      commit: '4'.repeat(40),
      publishedAt: '2026-08-27T00:00:00Z',
    },
    desktopTag: 'desktop-v0.1.2-alpha.1.unsigned.1',
    mode: 'unsigned-preview',
    phase: 'candidate-open',
    candidate: {
      branch: 'automation/adopt/dsh-v0.1.2-alpha.1',
      pr: 25,
      baseCommit: '5'.repeat(40),
      headCommit: '6'.repeat(40),
      humanEdited: false,
      protectedPathsChanged: [],
      approvedHead: null,
      requestPath: null,
    },
    validation: {
      nonce: 'nonce',
      consumed: false,
      runId: 10,
      runAttempt: 1,
      receiptArtifact: 'validation-receipt',
      receiptDigest: '7'.repeat(64),
    },
    artifacts: {
      artifactName: 'desktop-bundle',
      manifestDigest: '8'.repeat(64),
      sourceCommit: '6'.repeat(40),
      workflowCommit: '5'.repeat(40),
      runId: 10,
      runAttempt: 1,
      expiresAt: '2026-09-10T00:00:00Z',
    },
    attempt: {
      ordinal: 1,
      inputKey: '9'.repeat(64),
      trigger: 'scheduled',
      forceReason: null,
    },
    failure: null,
    publicationRun: null,
    paused: false,
    ...overrides,
  }
}

function validationReceipt(current: AdoptionState): ValidationReceipt {
  const delivery = current.activeDelivery!
  return {
    schemaVersion: 1,
    nonce: delivery.validation!.nonce,
    stateRefCommit: 'd'.repeat(40),
    stateRevision: current.revision,
    inputKey: delivery.attempt.inputKey,
    candidateCommit: delivery.candidate!.headCommit,
    baseCommit: delivery.candidate!.baseCommit,
    upstreamCommit: delivery.upstream.commit,
    desktopTag: delivery.desktopTag,
    mode: delivery.mode,
    workflowCommit: delivery.artifacts!.workflowCommit,
    runId: 10,
    runAttempt: 1,
    conclusion: 'success',
    artifactName: delivery.artifacts!.artifactName,
    manifestDigest: delivery.artifacts!.manifestDigest,
    sourceCommit: delivery.candidate!.headCommit,
  }
}

function receipt(overrides: Partial<PolicyReceipt> = {}): PolicyReceipt {
  const example = parsePolicyReceipt(
    JSON.parse(readFileSync(resolve(root, '.github/release-policy/receipt.example.json'), 'utf8')) as unknown,
  )
  return {
    ...example,
    receiptId: 'receipt-1',
    sequence: 1,
    authorizationPr: 17,
    predecessor: null,
    repository: {
      id: 1,
      name: 'dsh-desktop',
      owner: { login: 'mintgao', type: 'User' },
    },
    issuedAt: '2026-08-31T00:00:00Z',
    expiresAt: '2026-09-29T00:00:00Z',
    issuer: { login: 'mintgao', fingerprint: 'SHA256:fixture' },
    rotationOrdinal: 1,
    stateRef: 'refs/heads/automation/upstream-adoption-state',
    apps: [
      {
        role: 'controller',
        slug: 'mint-controller',
        id: 1,
        installationId: 11,
        permissions: {
          actions: 'write',
          contents: 'write',
          issues: 'write',
          metadata: 'read',
          pull_requests: 'write',
          statuses: 'write',
          workflows: 'write',
        },
      },
      {
        role: 'finalizer',
        slug: 'mint-finalizer',
        id: 2,
        installationId: 12,
        permissions: { actions: 'write', contents: 'write', metadata: 'read', workflows: 'write' },
      },
      {
        role: 'publisher',
        slug: 'mint-publisher',
        id: 3,
        installationId: 13,
        permissions: { contents: 'write', metadata: 'read' },
      },
    ],
    ...overrides,
  }
}

function activeActivation(publicKey: string, fingerprint: string): ActiveActivation {
  return {
    schemaVersion: 1,
    status: 'active',
    repository: {
      id: 1,
      name: 'dsh-desktop',
      owner: { login: 'mintgao', type: 'User' },
    },
    authorizationPr: 17,
    rotationOrdinal: 1,
    signer: { identity: 'mintgao', publicKey, fingerprint },
    previousActivation: null,
  }
}

function protectedPolicyState(): ProtectedPolicyState {
  return {
    activation: {
      rotationOrdinal: 1,
      authorizationPr: 17,
      authorizationCommit: 'a'.repeat(40),
      digest: 'b'.repeat(64),
      signerFingerprint: 'SHA256:fixture',
    },
    receipt: {
      sequence: 1,
      id: 'receipt-1',
      bundleDigest: 'c'.repeat(64),
      authorizationPr: 17,
      authorizationCommit: 'd'.repeat(40),
      expiresAt: '2026-09-29T00:00:00Z',
    },
  }
}

function runtimeFacts(
  receiptValue: PolicyReceipt,
  activationBytes: Uint8Array,
  receiptBytes: Uint8Array,
  signature: Uint8Array,
  policy: ProtectedPolicyState | null,
  overrides: Partial<RuntimePolicyFacts> = {},
): RuntimePolicyFacts {
  const activationDigest = byteDigest(activationBytes)
  const bundleDigest = receiptBundleDigest(receiptBytes, signature)
  const activationAuthorization = authorizationFacts(
    17,
    ['.github/release-policy/activation.json', '.github/release-policy/receipt.json', '.github/release-policy/receipt.json.sig'],
    activationDigest,
    bundleDigest,
  )
  const receiptAuthorization = authorizationFacts(
    receiptValue.authorizationPr,
    receiptValue.authorizationPr === 17
      ? ['.github/release-policy/activation.json', '.github/release-policy/receipt.json', '.github/release-policy/receipt.json.sig']
      : ['.github/release-policy/receipt.json', '.github/release-policy/receipt.json.sig'],
    activationDigest,
    bundleDigest,
    { mergeSha: receiptValue.authorizationPr === 17 ? 'a'.repeat(40) : 'd'.repeat(40), headSha: receiptValue.authorizationPr === 17 ? 'b'.repeat(40) : 'e'.repeat(40) },
  )

  return {
    repository: receiptValue.repository,
    activationAuthorization,
    receiptAuthorization,
    executingApp: receiptValue.apps.find(app => app.role === 'finalizer')!,
    stateRef: {
      ref: receiptValue.stateRef,
      commit: 'f'.repeat(40),
      policy,
    },
    rulesets: receiptValue.rulesets.map(({ bypassActors: _bypassActors, ...ruleset }) => ruleset),
    workflowDigests: receiptValue.workflowDigests,
    ...overrides,
  }
}

function authorizationFacts(
  pr: number,
  paths: readonly string[],
  activationDigest: string,
  receiptDigest: string,
  overrides: Partial<SquashAuthorizationFacts> = {},
): SquashAuthorizationFacts {
  const prFiles = paths.map(path => ({ path, status: 'modified', previousPath: null }))
  const mergeSha = overrides.mergeSha ?? 'a'.repeat(40)
  const headSha = overrides.headSha ?? 'b'.repeat(40)

  return {
    pr,
    baseRef: 'main',
    baseRepositoryId: 1,
    headRepositoryId: 1,
    headSha,
    headTreeSha: 'c'.repeat(40),
    mergeSha,
    merged: true,
    mergedBy: { login: 'mintgao', type: 'User' },
    changedFileCount: prFiles.length,
    prFiles,
    mergeCommit: {
      sha: mergeSha,
      verificationVerified: true,
      verificationReason: 'valid',
      committerLogin: 'web-flow',
      parents: ['d'.repeat(40)],
      treeSha: 'c'.repeat(40),
      parentDiffFiles: prFiles,
    },
    reachableFromMain: true,
    activationDigest,
    receiptBundleDigest: receiptDigest,
    ...overrides,
  }
}

function signingIdentity(): { publicKey: string; fingerprint: string; privateKeyPath: string } {
  const directory = fixtureDirectory()
  const key = join(directory, 'fixture')
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key])
  const publicKey = readFileSync(`${key}.pub`, 'utf8').trim()
  const fingerprintOutput = execFileSync('ssh-keygen', ['-lf', `${key}.pub`, '-E', 'sha256'], { encoding: 'utf8' })
  const fingerprint = fingerprintOutput.match(/\bSHA256:[A-Za-z0-9+/]+\b/u)?.[0]
  if (fingerprint === undefined) throw new Error('Fixture key fingerprint missing.')
  return { publicKey, fingerprint, privateKeyPath: key }
}

function signReceipt(receiptBytes: Uint8Array, privateKeyPath: string): Uint8Array {
  return signBytes(receiptBytes, privateKeyPath, 'dsh-mint-release-policy-v1')
}

function signBytes(bytes: Uint8Array, privateKeyPath: string, namespace: string): Uint8Array {
  const directory = fixtureDirectory()
  const receiptPath = join(directory, 'receipt.json')
  writeFileSync(receiptPath, bytes)
  execFileSync('ssh-keygen', ['-Y', 'sign', '-f', privateKeyPath, '-n', namespace, receiptPath])
  return readFileSync(`${receiptPath}.sig`)
}

function framedEntry(path: string, bytes: Uint8Array): Buffer {
  const pathBytes = Buffer.from(path, 'utf8')
  const pathLength = Buffer.alloc(4)
  pathLength.writeUInt32BE(pathBytes.length)
  const contentLength = Buffer.alloc(8)
  contentLength.writeBigUInt64BE(BigInt(bytes.byteLength))
  return Buffer.concat([pathLength, pathBytes, contentLength, Buffer.from(bytes)])
}

function fixtureDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-policy-fixture-'))
  temporaryDirectories.push(directory)
  return directory
}
