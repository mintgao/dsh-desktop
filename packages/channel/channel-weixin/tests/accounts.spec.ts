/**
 * Account identity and enumeration: the slug's grammar, the keys derived from
 * it, the collision-relevant mismatch rule, and what the enumeration admits.
 */

import { describe, expect, it } from 'vitest'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider, CredentialRecord, CredentialRecordEntry } from '@deepseek-ai/dsh-credentials'
import {
  accountChannelId,
  accountLockFileName,
  accountRecordKey,
  accountSlug,
  isAccountRecordKey,
  listStoredAccounts,
  readAccountEntry,
} from '../src/accounts.ts'

/** The WeChat account identity the platform reports for the owner's scan. */
const IDENTITY = 'o9cq805fLDX0Z7bdqo3DCpheCC88@im.wechat'

/** A grant whose payload matches {@link IDENTITY}. */
function grantPayload(identity: string = IDENTITY): Record<string, unknown> {
  return { accountId: 'a4c0a9d31015@im.bot', token: 'token-1', baseUrl: 'https://shard.example', userId: identity }
}

/** The stored record shape the credential seam admits. */
function record(payload: unknown): CredentialRecord {
  return { kind: 'grant', payload }
}

/** A credential store serving exactly the given records. */
function store(entries: readonly CredentialRecordEntry[], records: ReadonlyMap<string, CredentialRecord>): CredentialProvider {
  return {
    async listRecords() { return entries },
    async readRecord(key: string) { return records.get(key) },
  } as unknown as CredentialProvider
}

describe('accountSlug', () => {
  it('lowers the identity and hyphens everything outside the id grammar', () => {
    expect(accountSlug(IDENTITY)).toBe('o9cq805fldx0z7bdqo3dcphecc88-im-wechat')
  })

  it('keeps the slug inside the credential id grammar when the identity starts outside it', () => {
    expect(accountSlug('9abc@im.wechat')).toBe('a-9abc-im-wechat')
  })
})

describe('derived keys', () => {
  it('names the registration, the record, and the lock file after the same slug', () => {
    expect(accountChannelId(IDENTITY)).toBe('weixin:o9cq805fldx0z7bdqo3dcphecc88-im-wechat')
    expect(accountRecordKey(IDENTITY)).toBe('channel-weixin/account-o9cq805fldx0z7bdqo3dcphecc88-im-wechat')
    expect(accountLockFileName(IDENTITY)).toBe('weixin-o9cq805fldx0z7bdqo3dcphecc88-im-wechat.lock')
  })

  it('produces a record key the credential grammar accepts', () => {
    expect(() => credentialKey('channel-weixin', 'account-a-9abc-im-wechat')).not.toThrow()
    expect(accountRecordKey('9abc@im.wechat')).toBe('channel-weixin/account-a-9abc-im-wechat')
  })
})

describe('isAccountRecordKey', () => {
  it('admits this package\'s account records only', () => {
    expect(isAccountRecordKey(credentialKey('channel-weixin', 'account-one'))).toBe(true)
    expect(isAccountRecordKey(credentialKey('channel-weixin', 'login'))).toBe(false)
    expect(isAccountRecordKey(credentialKey('llm-pi-ai', 'account-one'))).toBe(false)
  })
})

describe('readAccountEntry', () => {
  const key = credentialKey('channel-weixin', 'account-o9cq805fldx0z7bdqo3dcphecc88-im-wechat')

  it('reads the account and its identity out of a matching record', () => {
    expect(readAccountEntry(key, record(grantPayload()))).toEqual({
      slug: 'o9cq805fldx0z7bdqo3dcphecc88-im-wechat',
      account: {
        slug: 'o9cq805fldx0z7bdqo3dcphecc88-im-wechat',
        identity: IDENTITY,
        grant: { accountId: 'a4c0a9d31015@im.bot', token: 'token-1', baseUrl: 'https://shard.example', userId: IDENTITY },
      },
    })
  })

  it('keeps the slug and drops the account when the store has no record', () => {
    expect(readAccountEntry(key, undefined)).toEqual({ slug: 'o9cq805fldx0z7bdqo3dcphecc88-im-wechat' })
  })

  it('treats a payload this build cannot read as an unreadable account', () => {
    for (const payload of [
      'not-an-object',
      { ...grantPayload(), userId: '' },
      { ...grantPayload(), accountId: '' },
      { ...grantPayload(), token: undefined },
      { ...grantPayload(), baseUrl: 7 },
    ]) {
      expect(readAccountEntry(key, record(payload))).toEqual({ slug: 'o9cq805fldx0z7bdqo3dcphecc88-im-wechat' })
    }
  })

  it('treats a record of another kind as an unreadable account', () => {
    expect(readAccountEntry(key, { kind: 'api-key', value: 'sk-1' } as unknown as CredentialRecord)).toEqual({
      slug: 'o9cq805fldx0z7bdqo3dcphecc88-im-wechat',
    })
  })

  it('refuses a record whose key and payload disagree about the slug', () => {
    expect(readAccountEntry(key, record(grantPayload('another@im.wechat')))).toEqual({
      slug: 'o9cq805fldx0z7bdqo3dcphecc88-im-wechat',
    })
  })
})

describe('listStoredAccounts', () => {
  const accountKey = credentialKey('channel-weixin', 'account-o9cq805fldx0z7bdqo3dcphecc88-im-wechat')
  const otherAccountKey = credentialKey('channel-weixin', 'account-a-9abc-im-wechat')
  const replacedKey = credentialKey('channel-weixin', 'login')
  const foreignKey = credentialKey('llm-pi-ai', 'account-one')

  it('admits account records only, reports unreadable ones, and sorts by slug', async () => {
    const records = new Map<string, CredentialRecord>([
      [accountKey, record(grantPayload())],
      [otherAccountKey, record({ grant: 'stale' })],
      [replacedKey, record(grantPayload())],
      [foreignKey, record(grantPayload())],
    ])
    const entries = await listStoredAccounts(store([
      { key: accountKey, kind: 'grant' },
      { key: otherAccountKey, kind: 'grant' },
      { key: replacedKey, kind: 'grant' },
      { key: foreignKey, kind: 'grant' },
    ], records))

    expect(entries.map(entry => entry.slug)).toEqual(['a-9abc-im-wechat', 'o9cq805fldx0z7bdqo3dcphecc88-im-wechat'])
    expect(entries[0]?.account).toBeUndefined()
    expect(entries[1]?.account?.identity).toBe(IDENTITY)
  })

  it('reports an admitted record the store answers with nothing for', async () => {
    const entries = await listStoredAccounts(store([{ key: accountKey, kind: 'grant' }], new Map()))
    expect(entries).toEqual([{ slug: 'o9cq805fldx0z7bdqo3dcphecc88-im-wechat' }])
  })

  it('keeps an enumeration whose records already arrive in slug order', async () => {
    const records = new Map<string, CredentialRecord>([
      [accountKey, record(grantPayload())],
      [otherAccountKey, record(grantPayload('9abc@im.wechat'))],
    ])
    const entries = await listStoredAccounts(store([
      { key: otherAccountKey, kind: 'grant' },
      { key: accountKey, kind: 'grant' },
    ], records))
    expect(entries.map(entry => entry.slug)).toEqual(['a-9abc-im-wechat', 'o9cq805fldx0z7bdqo3dcphecc88-im-wechat'])
  })
})
