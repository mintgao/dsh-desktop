/** The target's immutable source assessment admits preparation without certifying publication. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { compatibilityKind } from '../compatibility-evidence.ts'
import { assessmentReferences } from '../catch-up.ts'
import { catchUpEvidence, digest, object } from '../evidence.ts'

it('binds all seven source edges truthfully and rejects qualification from source flags alone', () => {
  const path = '.github/desktop-delivery/catch-up-assessment.json'
  const bytes = readFileSync(path)
  const assessment = object(JSON.parse(bytes.toString()) as unknown)
  const range = catchUpEvidence({ ...assessment, assessment: { path, sha256: digest(bytes) } })
  const references = assessmentReferences(range, bytes, '.github/desktop-delivery/source-lock.json', false)
  expect(range.releases).toHaveLength(7)
  expect(object(assessment.directUpgrade)).toMatchObject({ status: 'unverified', persistedFormatsChanged: true })
  for (const reference of references) expect(digest(readFileSync(reference.path))).toBe(reference.sha256)
  expect(() => assessmentReferences(range, bytes, '.github/desktop-delivery/source-lock.json', true)).toThrow('unverified')
  const historicalBytes = readFileSync('.github/desktop-delivery/history/20260910-data-compatibility.json')
  expect(digest(historicalBytes)).toBe('d50bdb348a9341f274932a622bd3cec8f7b9aa8b00a359e23d886a769b510666')
  const compatibility = object(JSON.parse(historicalBytes.toString()) as unknown)
  expect(compatibilityKind(compatibility)).toBe('legacy')
  expect(compatibility.persistedFormatsChanged).toBe(true)
  expect(object(compatibility.migrationPolicy).sha256).toBe(digest(readFileSync('.github/desktop-delivery/migration-policy.json')))
})

it('binds the retained forward policy without changing the historical format assessment', () => {
  const compatibility = object(JSON.parse(readFileSync('.github/desktop-delivery/history/20260913-alpha2-data-compatibility.json', 'utf8')) as unknown)
  expect(compatibilityKind(compatibility)).toBe('forward')
  expect(compatibility.persistedFormatsChanged).toBe(true)
  const policy = object(compatibility.forwardPolicy)
  expect(policy.path).toBe('.github/desktop-delivery/forward-update-policy.json')
  expect(policy.sha256).toBe(digest(readFileSync(String(policy.path))))
  expect(compatibility.evidenceReferences).toContain('.github/desktop-delivery/catch-up-assessment.json')
})


it('binds the published alpha2 to RC2 range separately from historical format changes', () => {
  const compatibility = object(JSON.parse(readFileSync('.github/desktop-delivery/data-compatibility.json', 'utf8')) as unknown)
  expect(compatibilityKind(compatibility)).toBe('legacy')
  expect(compatibility.persistedFormatsChanged).toBe(false)
  const path = '.github/desktop-delivery/rc2-catch-up-assessment.json'
  const bytes = readFileSync(path)
  const assessment = object(JSON.parse(bytes.toString()) as unknown)
  const range = catchUpEvidence({ ...assessment, assessment: { path, sha256: digest(bytes) } })
  expect(range.from.tag).toBe('dsh-v0.1.5-alpha.2')
  expect(range.to.tag).toBe('dsh-v0.1.5-rc.2')
  expect(range.releases).toHaveLength(2)
  const references = assessmentReferences(range, bytes, '.github/desktop-delivery/source-lock.json', true)
  for (const reference of references) expect(digest(readFileSync(reference.path))).toBe(reference.sha256)
  expect(object(assessment.directUpgrade)).toMatchObject({ status: 'verified', persistedFormatsChanged: false })
  object(assessment.directUpgrade).persistedFormatsChanged = true
  const changed = Buffer.from(JSON.stringify(assessment))
  expect(() => assessmentReferences({ ...range, assessment: { path, sha256: digest(changed) } }, changed, '.github/desktop-delivery/source-lock.json', true)).toThrow('migration qualification')
})
