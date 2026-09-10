/** The target's immutable source assessment admits preparation without certifying publication. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
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
  const compatibility = object(JSON.parse(readFileSync('.github/desktop-delivery/data-compatibility.json', 'utf8')) as unknown)
  expect(compatibility.persistedFormatsChanged).toBe(true)
  expect(object(compatibility.migrationPolicy).sha256).toBe(digest(readFileSync('.github/desktop-delivery/migration-policy.json')))
})
