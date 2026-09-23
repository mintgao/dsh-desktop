/**
 * Account identities of the WeChat channel. One WeChat account is one connected
 * identity, and the stable key is the platform's own user identity: every scan
 * mints a fresh bot, so the bot identity is the account's display fact while
 * the scanning account's identity names the registration, the credential
 * record, and the token lock.
 * @module @deepseek-ai/dsh-channel-weixin/src/accounts
 */

import { ChannelId } from '@deepseek-ai/dsh-channel'
import { credentialKey, credentialKeyId, credentialKeyScope } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey, CredentialProvider, CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { WeixinLoginGrant } from './types.ts'

/** The credential-store scope this package owns; every account record lives under it. */
export const WEIXIN_CREDENTIAL_SCOPE = 'channel-weixin'

/** Id-segment prefix of one account's credential record. */
const ACCOUNT_ID_PREFIX = 'account-'

/** One stored account: the identity it is keyed on and the login it holds. */
export interface WeixinStoredAccount {
  /** Slug derived from {@link identity}; names the registration and both keys. */
  readonly slug: string
  /** Platform identity of the WeChat account, verbatim as the login reported it. */
  readonly identity: string
  /** The login product one confirmed scan wrote. */
  readonly grant: WeixinLoginGrant
}

/**
 * One record the enumeration found. A record whose payload this build cannot
 * read still yields its slug, because the slug comes from the key: the account
 * is registered as unavailable rather than dropped.
 */
export interface WeixinStoredAccountEntry {
  /** Slug from the record's key. */
  readonly slug: string
  /** The account, absent when the payload could not be read. */
  readonly account?: WeixinStoredAccount | undefined
}

/**
 * Derive one account's slug from the WeChat account identity. The result
 * satisfies the credential id grammar (`^[a-z][a-z0-9-]*$`) and the registry's
 * non-empty rule; the transform is lossy, which is why a caller that meets an
 * occupied slug compares the raw identities before refusing.
 * @param identity - platform identity of the WeChat account.
 * @returns the lowered, hyphenated slug.
 */
export function accountSlug(identity: string): string {
  const lowered = identity.toLowerCase().replace(/[^a-z0-9]/g, '-')
  return /^[a-z]/.test(lowered) ? lowered : `a-${lowered}`
}

/**
 * The channel identity one account registers under, from its identity.
 * @param identity - platform identity of the WeChat account.
 * @returns the registration identity `weixin:<slug>`.
 */
export function accountChannelId(identity: string): ChannelId {
  return channelIdForSlug(accountSlug(identity))
}

/**
 * The registration identity of one account slug. A record this build cannot
 * read still yields its slug, so an account can register without one.
 * @param slug - the account's slug.
 * @returns the registration identity.
 */
export function channelIdForSlug(slug: string): ChannelId {
  return ChannelId(`weixin:${slug}`)
}

/**
 * The credential record one account's login lives in, from its identity.
 * @param identity - platform identity of the WeChat account.
 * @returns the record key.
 */
export function accountRecordKey(identity: string): CredentialKey {
  return recordKeyForSlug(accountSlug(identity))
}

/**
 * The credential record of one account slug.
 * @param slug - the account's slug.
 * @returns the record key.
 */
export function recordKeyForSlug(slug: string): CredentialKey {
  return credentialKey(WEIXIN_CREDENTIAL_SCOPE, `${ACCOUNT_ID_PREFIX}${slug}`)
}

/**
 * The token-lock file name of one account, from its identity.
 * @param identity - platform identity of the WeChat account.
 * @returns the file name inside the configured lock directory.
 */
export function accountLockFileName(identity: string): string {
  return lockFileNameForSlug(accountSlug(identity))
}

/**
 * The token-lock file name of one account slug.
 * @param slug - the account's slug.
 * @returns the file name inside the configured lock directory.
 */
export function lockFileNameForSlug(slug: string): string {
  return `weixin-${slug}.lock`
}

/**
 * Whether one record key belongs to an account of this package. The replaced
 * single-identity layout used a fixed id, so it is not an account and is never
 * admitted.
 * @param key - one credential key.
 * @returns true when the key addresses an account record.
 */
export function isAccountRecordKey(key: CredentialKey): boolean {
  return credentialKeyScope(key) === WEIXIN_CREDENTIAL_SCOPE
    && credentialKeyId(key).startsWith(ACCOUNT_ID_PREFIX)
}

/**
 * Read one account out of a stored record. The slug comes from the key and the
 * identity from the payload; a record whose payload is unreadable, whose
 * identity is empty, or whose key and payload disagree about the slug yields
 * only the slug, so its account registers as unavailable.
 * @param key - the record's key.
 * @param record - the stored record, when the store has one.
 * @returns the entry the enumeration reports.
 */
export function readAccountEntry(key: CredentialKey, record: CredentialRecord | undefined): WeixinStoredAccountEntry {
  const slug = credentialKeyId(key).slice(ACCOUNT_ID_PREFIX.length)
  if (record === undefined) return { slug }
  const account = parseAccount(slug, record)
  return account === undefined ? { slug } : { slug, account }
}

/** Read the grant and the identity one record's payload carries, or nothing. */
function parseAccount(slug: string, record: CredentialRecord): WeixinStoredAccount | undefined {
  if (record.kind !== 'grant') return undefined
  const payload: unknown = record.payload
  if (typeof payload !== 'object' || payload === null) return undefined
  const fields = payload as Record<string, unknown>
  const identity = fields['userId']
  const accountId = fields['accountId']
  const token = fields['token']
  const baseUrl = fields['baseUrl']
  if (typeof identity !== 'string' || identity === '') return undefined
  if (typeof accountId !== 'string' || accountId === '') return undefined
  if (typeof token !== 'string' || token === '') return undefined
  if (typeof baseUrl !== 'string' || baseUrl === '') return undefined
  if (accountSlug(identity) !== slug) return undefined
  return { slug, identity, grant: { accountId, token, baseUrl, userId: identity } }
}

/**
 * Enumerate the accounts this package holds. Keys outside this package's scope
 * and keys of the replaced single-identity layout are not accounts: they are
 * neither admitted nor deleted.
 * @param credentials - the credential store to read.
 * @returns one entry per admitted account record, unreadable ones included.
 */
export async function listStoredAccounts(credentials: CredentialProvider): Promise<readonly WeixinStoredAccountEntry[]> {
  const entries = await credentials.listRecords()
  const admitted = entries.filter(entry => isAccountRecordKey(entry.key))
  const read = await Promise.all(admitted.map(async entry => readAccountEntry(entry.key, await credentials.readRecord(entry.key))))
  // Keys are unique, so the order is total without an equality case.
  return read.sort((left, right) => left.slug < right.slug ? -1 : 1)
}
