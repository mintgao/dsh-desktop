/** Offset presentation does not alter the instant bound by protection evidence. */
import { expect, it } from 'vitest'
import { rulesetTime } from '../ruleset-time.ts'

it('normalizes offsets and fractional padding without losing milliseconds', () => {
  expect(rulesetTime('2026-09-08T21:55:00+08:00')).toBe(rulesetTime('2026-09-08T13:55:00Z'))
  expect(rulesetTime('2026-01-01T00:30:00.1+01:00')).toBe('2025-12-31T23:30:00.100Z')
  expect(rulesetTime('2026-12-31T23:30:00.12-01:00')).toBe('2027-01-01T00:30:00.120Z')
  expect(rulesetTime('2024-02-29T00:00:00.001+00:00')).toBe('2024-02-29T00:00:00.001Z')
  expect(rulesetTime('2024-02-29T00:00:00.001Z')).not.toBe(rulesetTime('2024-02-29T00:00:00Z'))
})

it('rejects invalid calendars, leap seconds, offsets and excess precision', () => {
  for (const value of [null, '2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-00-01T00:00:00Z', '2026-01-00T00:00:00Z',
    '2026-01-01T24:00:00Z', '2026-01-01T00:60:00Z', '2026-01-01T00:00:60Z', '2026-01-01T00:00:00-00:00',
    '2026-01-01T00:00:00+24:00', '2026-01-01T00:00:00+00:60', '2026-01-01T00:00:00+0800', '2026-01-01T00:00:00',
    '2026-01-01T00:00:00.0000Z', '2026-01-01T00:00:00.Z', '2026-01-01T00:00:00Z trailing']) expect(() => rulesetTime(value)).toThrow()
})
