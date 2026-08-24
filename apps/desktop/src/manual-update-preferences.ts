/** Persist manual desktop update reminders as a replace-only local JSON document. */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { validate } from 'compare-versions'
import type {
  ManualDesktopReleaseInfo,
  ManualUpdatePreferences,
  ManualUpdatePreferencesStore,
} from './manual-updates.ts'

const FORMAT_VERSION = 1

interface StoredManualUpdatePreferences extends ManualUpdatePreferences {
  readonly formatVersion: typeof FORMAT_VERSION
}

/** Diagnostic sink for recoverable preference failures. */
export type ManualUpdatePreferencesLog = (message: string) => void

/** File-backed reminder store that resets corrupt data and writes atomically. */
export class FileManualUpdatePreferencesStore implements ManualUpdatePreferencesStore {
  private readonly path: string
  private readonly log: ManualUpdatePreferencesLog

  /** Create a store at an application-owned user-data path. */
  constructor(path: string, log: ManualUpdatePreferencesLog) {
    this.path = path
    this.log = log
  }

  /** Load one validated document; absent or invalid files start with defaults. */
  async load(): Promise<ManualUpdatePreferences> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return {}
      this.log(`could not read ${this.path}: ${asError(error).message}`)
      return {}
    }
    try {
      return parsePreferences(JSON.parse(text))
    } catch (error) {
      this.log(`ignored invalid ${this.path}: ${asError(error).message}`)
      return {}
    }
  }

  /** Replace the document atomically; write failures are logged and remain non-fatal. */
  async save(preferences: ManualUpdatePreferences): Promise<void> {
    const temporaryPath = `${this.path}.${String(process.pid)}.${randomUUID()}.tmp`
    try {
      await mkdir(dirname(this.path), { recursive: true })
      const document: StoredManualUpdatePreferences = { formatVersion: FORMAT_VERSION, ...preferences }
      await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.path)
    } catch (error) {
      this.log(`could not write ${this.path}: ${asError(error).message}`)
      try {
        await unlink(temporaryPath)
      } catch (cleanupError) {
        if (!isNodeError(cleanupError, 'ENOENT')) {
          this.log(`could not remove temporary update preferences: ${asError(cleanupError).message}`)
        }
      }
    }
  }
}

/** Validate the complete durable document before exposing preferences. */
export function parsePreferences(value: unknown): ManualUpdatePreferences {
  if (!isRecord(value) || value.formatVersion !== FORMAT_VERSION) {
    throw new Error(`expected update preference format ${String(FORMAT_VERSION)}`)
  }
  const etag = optionalString(value, 'etag')
  const lastNotifiedVersion = optionalString(value, 'lastNotifiedVersion')
  const remindAfterMs = optionalNumber(value, 'remindAfterMs')
  const skippedVersion = optionalString(value, 'skippedVersion')
  const preferences: ManualUpdatePreferences = {
    ...(etag === undefined ? {} : { etag }),
    ...(lastNotifiedVersion === undefined ? {} : { lastNotifiedVersion }),
    ...(remindAfterMs === undefined ? {} : { remindAfterMs }),
    ...(skippedVersion === undefined ? {} : { skippedVersion }),
  }
  if ('cachedRelease' in value) {
    return { ...preferences, cachedRelease: value.cachedRelease === null ? null : parseRelease(value.cachedRelease) }
  }
  return preferences
}

/** Validate cached release fields written by the GitHub reader. */
function parseRelease(value: unknown): ManualDesktopReleaseInfo {
  if (!isRecord(value)) throw new Error('cached release must be an object')
  const version = requiredString(value, 'version')
  const tagName = requiredString(value, 'tagName')
  const title = requiredString(value, 'title')
  const url = requiredString(value, 'url')
  const recommendedAssetName = requiredString(value, 'recommendedAssetName')
  if (typeof value.prerelease !== 'boolean') throw new Error('cached release prerelease must be boolean')
  const publishedAt = optionalString(value, 'publishedAt')
  if (!validate(version)) throw new Error('cached release version must be semantic')
  if (tagName !== `desktop-v${version}`) throw new Error('cached release tagName does not match version')
  const expectedUrl = `https://github.com/mintgao/dsh-desktop/releases/tag/${encodeURIComponent(tagName)}`
  if (url !== expectedUrl) throw new Error('cached release URL does not match tagName')
  const expectedAssetPrefix = `DSH-Desktop-Mint-${version}-`
  if (recommendedAssetName !== `${expectedAssetPrefix}arm64.dmg`
    && recommendedAssetName !== `${expectedAssetPrefix}x64.dmg`) {
    throw new Error('cached release asset does not match a supported architecture')
  }
  return {
    version,
    tagName,
    title,
    url,
    prerelease: value.prerelease,
    recommendedAssetName,
    ...(publishedAt === undefined ? {} : { publishedAt }),
  }
}

/** Read a required non-empty string field. */
function requiredString(value: Record<string, unknown>, field: string): string {
  const result = value[field]
  if (typeof result !== 'string' || result === '') throw new Error(`${field} must be a non-empty string`)
  return result
}

/** Read an optional string while rejecting present values of another type. */
function optionalString(value: Record<string, unknown>, field: string): string | undefined {
  const result = value[field]
  if (result === undefined) return undefined
  if (typeof result !== 'string') throw new Error(`${field} must be a string`)
  return result
}

/** Read an optional finite number while rejecting present values of another type. */
function optionalNumber(value: Record<string, unknown>, field: string): number | undefined {
  const result = value[field]
  if (result === undefined) return undefined
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error(`${field} must be a finite number`)
  return result
}

/** Narrow parsed JSON values to records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Match one expected filesystem error code without swallowing unrelated failures. */
function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

/** Preserve thrown preference failures as Error instances for diagnostics. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
