/** Short-lived GitHub App authentication for offline release-policy generation. */

import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * Create a short-lived GitHub App JWT from an operator-held private key.
 *
 * @param appId GitHub App identifier used as the JWT issuer.
 * @param privateKeyPath Path to an RSA private key outside the repository.
 * @param now Current time used to bound the token lifetime.
 * @returns A signed JWT accepted by GitHub App endpoints.
 */
export function githubAppJwt(appId: number, privateKeyPath: string, now = new Date()): string {
  if (!Number.isInteger(appId) || appId <= 0) throw new Error('GitHub App ID must be a positive integer.')
  if (privateKeyPath === '') throw new Error('GitHub App private-key path must not be empty.')
  const issuedAt = Math.floor(now.getTime() / 1000)
  if (!Number.isFinite(issuedAt)) throw new Error('GitHub App JWT time must be valid.')
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iat: issuedAt - 60, exp: issuedAt + 540, iss: appId }))
  const input = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(input)
  signer.end()
  return `${input}.${signer.sign(readFileSync(privateKeyPath)).toString('base64url')}`
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url')
}
