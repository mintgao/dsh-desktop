import { describe, expect, it } from 'vitest'
import { externalWebUrl, isAllowedAppNavigation } from '../src/navigation.ts'

describe('isAllowedAppNavigation', () => {
  const applicationUrl = 'http://127.0.0.1:43123/'

  it('allows paths on the ready backend origin', () => {
    expect(isAllowedAppNavigation('http://127.0.0.1:43123/session/one', applicationUrl)).toBe(true)
  })

  it('rejects another host, port, or protocol', () => {
    expect(isAllowedAppNavigation('https://127.0.0.1:43123/', applicationUrl)).toBe(false)
    expect(isAllowedAppNavigation('http://127.0.0.1:43124/', applicationUrl)).toBe(false)
    expect(isAllowedAppNavigation('http://localhost:43123/', applicationUrl)).toBe(false)
  })
})

describe('externalWebUrl', () => {
  it('accepts only absolute HTTP and HTTPS destinations', () => {
    expect(externalWebUrl('https://example.com/docs')).toBe('https://example.com/docs')
    expect(externalWebUrl('mailto:hello@example.com')).toBeUndefined()
    expect(externalWebUrl('/relative')).toBeUndefined()
  })
})
