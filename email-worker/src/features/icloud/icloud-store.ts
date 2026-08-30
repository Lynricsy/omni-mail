import {
  decryptICloudCredential,
  encryptICloudCredential,
  iCloudCredentialsReady,
} from './icloud-credentials'
import type {
  ICloudAccount,
  ICloudAccountRow,
  PublicICloudAccount,
} from './icloud-types'
import type { Env } from '../../app/types'

const MAX_COOKIE_COUNT = 64
const MAX_COOKIE_NAME_LENGTH = 128
const MAX_COOKIE_VALUE_BYTES = 8 * 1024
const MAX_COOKIE_HEADER_BYTES = 32 * 1024
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const COOKIE_VALUE = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]+$/

type PublicICloudAccountRow = Omit<
  ICloudAccountRow,
  'user_id' | 'cookies_cipher' | 'app_password_cipher' | 'updated_at'
> & {
  has_cookies: number
  has_app_password: number
}

export class ICloudStoreError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function validatedCookies(entries: Array<[string, string]>): Record<string, string> {
  if (!entries.length) throw new ICloudStoreError(400, 'Cookie 中没有可用值。')
  if (entries.length > MAX_COOKIE_COUNT) {
    throw new ICloudStoreError(400, `Cookie 数量不能超过 ${MAX_COOKIE_COUNT} 个。`)
  }
  const encoder = new TextEncoder()
  let totalBytes = 0
  const result: Record<string, string> = {}
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim()
    const trimmedValue = rawValue.trim()
    const value = trimmedValue.startsWith('"') && trimmedValue.endsWith('"')
      ? trimmedValue.slice(1, -1)
      : trimmedValue
    const valueBytes = encoder.encode(value).byteLength
    if (
      !name
      || name.length > MAX_COOKIE_NAME_LENGTH
      || !COOKIE_NAME.test(name)
      || !value
      || valueBytes > MAX_COOKIE_VALUE_BYTES
      || !COOKIE_VALUE.test(value)
    ) throw new ICloudStoreError(400, 'Cookie 包含无效名称或值。')
    // Includes `=`, quotes, and the `; ` separator used by the outbound header.
    totalBytes += encoder.encode(name).byteLength + valueBytes + 5
    result[name] = value
  }
  if (totalBytes > MAX_COOKIE_HEADER_BYTES) {
    throw new ICloudStoreError(400, 'Cookie 总大小不能超过 32 KiB。')
  }
  return result
}

export function parseICloudCookies(raw: unknown): Record<string, string> {
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    const entries = Object.entries(raw)
    if (!entries.every((entry): entry is [string, string] => typeof entry[1] === 'string')) {
      throw new ICloudStoreError(400, 'Cookie 包含无效名称或值。')
    }
    return validatedCookies(entries)
  }
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) throw new ICloudStoreError(400, '请填写 iCloud Cookie。')
  if (new TextEncoder().encode(value).byteLength > MAX_COOKIE_HEADER_BYTES) {
    throw new ICloudStoreError(400, 'Cookie 总大小不能超过 32 KiB。')
  }
  if (value.startsWith('{')) {
    try {
      return parseICloudCookies(JSON.parse(value) as unknown)
    } catch (error) {
      if (error instanceof ICloudStoreError) throw error
      throw new ICloudStoreError(400, 'Cookie JSON 格式无效。')
    }
  }
  const entries = value.split(';').flatMap((item): Array<[string, string]> => {
    const separator = item.indexOf('=')
    if (separator < 1) return []
    const name = item.slice(0, separator).trim()
    const cookieValue = item.slice(separator + 1).trim()
    return name && cookieValue ? [[name, cookieValue]] : []
  })
  if (!entries.length) throw new ICloudStoreError(400, '无法解析 iCloud Cookie。')
  return validatedCookies(entries)
}

export function publicICloudAccount(account: ICloudAccount): PublicICloudAccount {
  const { cookies, appPassword, userId: _userId, ...safe } = account
  return {
    ...safe,
    hasCookies: Object.keys(cookies).length > 0,
    hasAppPassword: Boolean(appPassword),
  }
}

function publicICloudAccountRow(row: PublicICloudAccountRow): PublicICloudAccount {
  return {
    id: row.id,
    name: row.name,
    realEmail: row.real_email,
    icloudEmail: row.icloud_email,
    host: row.host,
    status: row.status,
    aliasTotal: Number(row.alias_total),
    aliasActive: Number(row.alias_active),
    lastValidated: row.last_validated,
    lastError: row.last_error,
    createdAt: row.created_at,
    hasCookies: Boolean(row.has_cookies),
    hasAppPassword: Boolean(row.has_app_password),
  }
}

export class ICloudAccountStore {
  constructor(
    private readonly env: Env,
    private readonly userId: string,
  ) {
    if (!iCloudCredentialsReady(env)) {
      throw new ICloudStoreError(
        503,
        'iCloud 功能尚未配置 ICLOUD_CREDENTIALS_KEY。',
      )
    }
  }

  private context(accountId: string, field: 'cookies' | 'app-password'): string {
    return `${this.userId}:${accountId}:${field}`
  }

  private async fromRow(row: ICloudAccountRow): Promise<ICloudAccount> {
    if (row.user_id !== this.userId) throw new ICloudStoreError(404, 'iCloud 账号不存在。')
    const [cookiesText, appPassword] = await Promise.all([
      decryptICloudCredential(
        this.env,
        row.cookies_cipher,
        this.context(row.id, 'cookies'),
      ),
      decryptICloudCredential(
        this.env,
        row.app_password_cipher,
        this.context(row.id, 'app-password'),
      ),
    ])
    let cookies: Record<string, string> = {}
    try {
      cookies = cookiesText ? JSON.parse(cookiesText) as Record<string, string> : {}
    } catch {
      throw new ICloudStoreError(500, 'iCloud 账号凭据已损坏。')
    }
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      realEmail: row.real_email,
      icloudEmail: row.icloud_email,
      cookies,
      host: row.host,
      appPassword,
      status: row.status,
      aliasTotal: Number(row.alias_total),
      aliasActive: Number(row.alias_active),
      lastValidated: row.last_validated,
      lastError: row.last_error,
      createdAt: row.created_at,
    }
  }

  async list(): Promise<PublicICloudAccount[]> {
    const { results } = await this.env.DB.prepare(
      `SELECT id, name, real_email, icloud_email, host, status,
              alias_total, alias_active, last_validated, last_error, created_at,
              CASE WHEN cookies_cipher <> '' THEN 1 ELSE 0 END AS has_cookies,
              CASE WHEN app_password_cipher <> '' THEN 1 ELSE 0 END AS has_app_password
       FROM icloud_accounts WHERE user_id = ?
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
                created_at`,
    ).bind(this.userId).all<PublicICloudAccountRow>()
    return results.map(publicICloudAccountRow)
  }

  async get(id: string): Promise<ICloudAccount> {
    const row = await this.env.DB.prepare(
      'SELECT * FROM icloud_accounts WHERE id = ? AND user_id = ?',
    ).bind(id, this.userId).first<ICloudAccountRow>()
    if (!row) throw new ICloudStoreError(404, 'iCloud 账号不存在。')
    return this.fromRow(row)
  }

  async getName(id: string): Promise<string> {
    const row = await this.env.DB.prepare(
      'SELECT name FROM icloud_accounts WHERE id = ? AND user_id = ?',
    ).bind(id, this.userId).first<{ name: string }>()
    if (!row) throw new ICloudStoreError(404, 'iCloud 账号不存在。')
    return row.name
  }

  async insert(account: ICloudAccount): Promise<void> {
    const now = new Date().toISOString()
    const [cookiesCipher, passwordCipher] = await Promise.all([
      encryptICloudCredential(
        this.env,
        JSON.stringify(account.cookies),
        this.context(account.id, 'cookies'),
      ),
      encryptICloudCredential(
        this.env,
        account.appPassword,
        this.context(account.id, 'app-password'),
      ),
    ])
    await this.env.DB.prepare(
      `INSERT INTO icloud_accounts (
        id, user_id, name, real_email, icloud_email, cookies_cipher, host,
        app_password_cipher, status, alias_total, alias_active,
        last_validated, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      account.id,
      this.userId,
      account.name,
      account.realEmail,
      account.icloudEmail,
      cookiesCipher,
      account.host,
      passwordCipher,
      account.status,
      account.aliasTotal,
      account.aliasActive,
      account.lastValidated,
      account.lastError,
      account.createdAt,
      now,
    ).run()
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.env.DB.prepare(
      'DELETE FROM icloud_accounts WHERE id = ? AND user_id = ?',
    ).bind(id, this.userId).run()
    return Boolean(result.meta.changes)
  }

  async saveName(id: string, name: string): Promise<void> {
    const result = await this.env.DB.prepare(
      `UPDATE icloud_accounts SET name = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).bind(name, new Date().toISOString(), id, this.userId).run()
    if (!result.meta.changes) throw new ICloudStoreError(404, 'iCloud 账号不存在。')
  }

  async saveCookies(account: ICloudAccount): Promise<void> {
    const cipher = await encryptICloudCredential(
      this.env,
      JSON.stringify(account.cookies),
      this.context(account.id, 'cookies'),
    )
    await this.env.DB.prepare(
      `UPDATE icloud_accounts SET
        cookies_cipher = ?, real_email = ?, icloud_email = ?, status = ?,
        alias_total = ?, alias_active = ?, last_validated = ?, last_error = ?,
        updated_at = ? WHERE id = ? AND user_id = ?`,
    ).bind(
      cipher,
      account.realEmail,
      account.icloudEmail,
      account.status,
      account.aliasTotal,
      account.aliasActive,
      account.lastValidated,
      account.lastError,
      new Date().toISOString(),
      account.id,
      this.userId,
    ).run()
  }

  async saveAppPassword(id: string, icloudEmail: string, password: string): Promise<void> {
    const cipher = await encryptICloudCredential(
      this.env,
      password,
      this.context(id, 'app-password'),
    )
    const result = await this.env.DB.prepare(
      `UPDATE icloud_accounts SET icloud_email = ?, app_password_cipher = ?,
       status = 'active', last_error = '', last_error_code = '', last_error_at = NULL,
       next_sync_at = 0, sync_lease_id = NULL, sync_lease_until = NULL,
       updated_at = ? WHERE id = ? AND user_id = ?`,
    ).bind(icloudEmail, cipher, new Date().toISOString(), id, this.userId).run()
    if (!result.meta.changes) throw new ICloudStoreError(404, 'iCloud 账号不存在。')
  }
}
