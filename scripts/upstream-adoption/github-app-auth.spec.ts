import { generateKeyPairSync, verify } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { githubAppJwt } from './github-app-auth.ts'

describe('GitHub App JWT generation', () => {
  it('binds the App ID and a ten-minute window to an RSA signature', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const directory = mkdtempSync(join(tmpdir(), 'dsh-github-app-jwt-'))
    const privateKeyPath = join(directory, 'app.pem')
    writeFileSync(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }))
    const now = new Date('2026-09-01T00:00:00.000Z')

    const jwt = githubAppJwt(4782984, privateKeyPath, now)
    const [header, payload, signature] = jwt.split('.')
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString('utf8'))).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))).toEqual({
      iat: Math.floor(now.getTime() / 1000) - 60,
      exp: Math.floor(now.getTime() / 1000) + 540,
      iss: 4782984,
    })
    expect(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature!, 'base64url'))).toBe(true)
  })
})
