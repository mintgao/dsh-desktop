/** Exact millisecond normalization for GitHub ruleset observation timestamps. */

/** Normalize an explicit RFC 3339 timestamp without discarding precision.
 * @param value - remote ruleset timestamp with at most three fractional digits.
 * @returns Calendar-validated UTC timestamp with exactly three fractional digits.
 */
export function rulesetTime(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Ruleset timestamp must be explicit RFC 3339 text')
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value)
  if (match === null || match[8] === '-00:00') throw new Error('Ruleset timestamp has unsupported syntax or precision')
  const [, year, month, day, hour, minute, second, fraction, zone, sign, offsetHour, offsetMinute] = match
  const date = new Date(0)
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day))
  date.setUTCHours(Number(hour), Number(minute), Number(second), Number((fraction ?? '').padEnd(3, '0')))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)
    || date.getUTCHours() !== Number(hour) || date.getUTCMinutes() !== Number(minute) || date.getUTCSeconds() !== Number(second)) throw new Error('Ruleset timestamp calendar components are invalid')
  if (zone !== 'Z') {
    if (Number(offsetHour) > 23 || Number(offsetMinute) > 59) throw new Error('Ruleset timestamp offset is invalid')
    date.setTime(date.getTime() - (sign === '+' ? 1 : -1) * (Number(offsetHour) * 60 + Number(offsetMinute)) * 60_000)
  }
  if (date.getUTCFullYear() < 0 || date.getUTCFullYear() > 9999) throw new Error('Ruleset timestamp UTC year is unsupported')
  return date.toISOString()
}
