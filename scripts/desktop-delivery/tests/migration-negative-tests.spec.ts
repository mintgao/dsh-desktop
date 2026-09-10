/** A summary cannot replace missing, skipped or duplicated source assertions. */
import { expect, it } from 'vitest'
import { migrationNegativeObservations } from '../migration-negative-tests.ts'

function reports() {
  const owner = '/candidate/packages/session/session-persistence-jsonl/tests/'
  const rows = {
    'generation.spec.ts': [
      'leaves a crash-style staging file inert',
      'removes an exclusively created stage when writing or syncing it fails',
      'fails publication without rerunning migration when the source changes',
    ],
    'multi-edge-publication.spec.ts': [0, 1, 2, 3].map(id => `re-prepares populated history after source drift rejects stale publication (${id})`),
    'migration-refusal.spec.ts': [0, 1, 2, 3].map(id => `refuses native V3 malformed highest (${id})`),
    'jsonl.spec.ts': ['selects the highest opposite-encoding generation for its refusal'],
    'lease.two-process.e2e.ts': ['excludes a live holder process and takes over immediately after its crash'],
  }
  return [{ success: true, numFailedTests: 0, numPendingTests: 0, testResults: Object.entries(rows).map(([file, names]) => ({
    name: owner + file, status: 'passed', assertionResults: names.map(fullName => ({ fullName, status: 'passed' })),
  })).concat([{ name: '/candidate/scripts/desktop-delivery/tests/migration-data.spec.ts', status: 'passed', assertionResults: [{
    fullName: 'preserves the exact packaged runtime link and rejects damage before creating a restore root', status: 'passed',
  }] }]) }]
}

it('requires concrete passing assertions for all five fixed negative scenarios', () => {
  expect(Object.keys(migrationNegativeObservations(reports()))).toHaveLength(5)
  const missing = reports()
  missing[0]?.testResults.pop()
  expect(() => migrationNegativeObservations(missing)).toThrow('restore-integrity-refusal')
})

it('refuses skipped and duplicated evidence despite a successful report summary', () => {
  const skipped = reports()
  const first = skipped[0]?.testResults[0]?.assertionResults[0]
  if (first === undefined) throw new Error('Missing test fixture assertion')
  first.status = 'pending'
  expect(() => migrationNegativeObservations(skipped)).toThrow('did not execute')
  const duplicate = reports()
  const suite = duplicate[0]?.testResults[1]
  if (suite === undefined || suite.assertionResults[0] === undefined) throw new Error('Missing test fixture suite')
  suite.assertionResults.fill(suite.assertionResults[0])
  expect(() => migrationNegativeObservations(duplicate)).toThrow('Duplicate')
})
