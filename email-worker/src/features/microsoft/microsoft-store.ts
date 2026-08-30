import type { Env } from '../../app/types'
import {
  decryptMicrosoftCredential,
  encryptMicrosoftCredential,
  microsoftCredentialContext,
  microsoftCredentialsReady,
} from './microsoft-credentials'
import type {
  MicrosoftAccount,
  MicrosoftAccountRow,
  MicrosoftFolder,
  MicrosoftFolderRow,
  PublicMicrosoftAccount,
} from './microsoft-types'

export class MicrosoftStoreError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
  }
}

function maskedClientId(clientId: string): string {
  return clientId ? `${clientId.slice(0, 4)}••••${clientId.slice(-4)}` : ''
}

export function publicMicrosoftAccount(account: MicrosoftAccount): PublicMicrosoftAccount {
  return {
    id: account.id,
    name: account.name,
    email: account.normalizedEmail,
    authMode: account.authMode,
    clientIdMasked: maskedClientId(account.clientId),
    authority: account.authority,
    status: account.status,
    lastSyncedAt: account.lastSyncedAt,
    nextSyncAt: account.nextSyncAt,
    lastErrorCode: account.lastErrorCode,
    lastErrorAt: account.lastErrorAt,
    createdAt: account.createdAt,
    hasCredential: true,
  }
}

function publicRow(row: MicrosoftAccountRow): PublicMicrosoftAccount {
  return {
    id: row.id,
    name: row.name,
    email: row.normalized_email,
    authMode: row.auth_mode,
    clientIdMasked: maskedClientId(row.client_id),
    authority: row.authority,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    nextSyncAt: row.next_sync_at,
    lastErrorCode: row.last_error_code,
    lastErrorAt: row.last_error_at,
    createdAt: row.created_at,
    hasCredential: true,
  }
}

async function accountFromRow(env: Env, row: MicrosoftAccountRow): Promise<MicrosoftAccount> {
  let refreshToken = ''
  let accessToken = ''
  let password = ''
  try {
    if (row.auth_mode === 'oauth2') {
      refreshToken = await decryptMicrosoftCredential(
        env,
        row.refresh_token_cipher,
        microsoftCredentialContext(row.user_id, row.id, 'refresh-token'),
      )
      if (row.access_token_cipher) {
        accessToken = await decryptMicrosoftCredential(
          env,
          row.access_token_cipher,
          microsoftCredentialContext(row.user_id, row.id, 'access-token'),
        )
      }
    } else {
      password = await decryptMicrosoftCredential(
        env,
        row.password_cipher,
        microsoftCredentialContext(row.user_id, row.id, 'password'),
      )
    }
  } catch {
    throw new MicrosoftStoreError(500, 'credential_decryption_failed', 'Microsoft 凭据已损坏。')
  }
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    providedEmail: row.provided_email,
    normalizedEmail: row.normalized_email,
    authMode: row.auth_mode,
    clientId: row.client_id,
    authority: row.authority,
    refreshToken,
    accessToken,
    accessTokenExpiresAt: row.access_token_expires_at,
    password,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    nextSyncAt: row.next_sync_at,
    lastErrorCode: row.last_error_code,
    lastErrorAt: row.last_error_at,
    syncLeaseId: row.sync_lease_id,
    syncLeaseUntil: row.sync_lease_until,
    tokenLeaseId: row.token_lease_id,
    tokenLeaseUntil: row.token_lease_until,
    lastManualSyncAt: row.last_manual_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function microsoftAccountForSync(
  env: Env,
  accountId: string,
): Promise<MicrosoftAccount | null> {
  if (!microsoftCredentialsReady(env)) {
    throw new MicrosoftStoreError(503, 'credential_key_unavailable', 'Microsoft 凭据加密密钥不可用。')
  }
  const row = await env.DB.prepare(
    'SELECT * FROM microsoft_imap_accounts WHERE id = ? LIMIT 1',
  ).bind(accountId).first<MicrosoftAccountRow>()
  return row ? accountFromRow(env, row) : null
}

export class MicrosoftAccountStore {
  constructor(
    private readonly env: Env,
    private readonly userId: string,
  ) {
    if (!microsoftCredentialsReady(env)) {
      throw new MicrosoftStoreError(
        503,
        'credential_key_unavailable',
        'Microsoft 功能尚未配置 MICROSOFT_CREDENTIALS_KEY。',
      )
    }
  }

  async list(): Promise<PublicMicrosoftAccount[]> {
    const { results } = await this.env.DB.prepare(
      `SELECT * FROM microsoft_imap_accounts
        WHERE user_id = ? ORDER BY created_at, id`,
    ).bind(this.userId).all<MicrosoftAccountRow>()
    return results.map(publicRow)
  }

  async publicAccount(accountId: string): Promise<PublicMicrosoftAccount | null> {
    const row = await this.env.DB.prepare(
      'SELECT * FROM microsoft_imap_accounts WHERE id = ? AND user_id = ? LIMIT 1',
    ).bind(accountId, this.userId).first<MicrosoftAccountRow>()
    return row ? publicRow(row) : null
  }

  async get(accountId: string): Promise<MicrosoftAccount> {
    const row = await this.env.DB.prepare(
      'SELECT * FROM microsoft_imap_accounts WHERE id = ? AND user_id = ? LIMIT 1',
    ).bind(accountId, this.userId).first<MicrosoftAccountRow>()
    if (!row) throw new MicrosoftStoreError(404, 'account_not_found', 'Microsoft 账号不存在。')
    return accountFromRow(this.env, row)
  }

  async insert(account: MicrosoftAccount, combinationPassword = ''): Promise<void> {
    const refreshCipher = account.refreshToken
      ? await encryptMicrosoftCredential(
        this.env,
        account.refreshToken,
        microsoftCredentialContext(this.userId, account.id, 'refresh-token'),
      ) : ''
    const accessCipher = account.accessToken
      ? await encryptMicrosoftCredential(
        this.env,
        account.accessToken,
        microsoftCredentialContext(this.userId, account.id, 'access-token'),
      ) : ''
    const passwordCipher = account.password
      ? await encryptMicrosoftCredential(
        this.env,
        account.password,
        microsoftCredentialContext(this.userId, account.id, 'password'),
      ) : ''
    const combinationPasswordCipher = combinationPassword
      ? await encryptMicrosoftCredential(
        this.env,
        combinationPassword,
        microsoftCredentialContext(this.userId, account.id, 'combination-password'),
      ) : ''
    try {
      await this.env.DB.prepare(
        `INSERT INTO microsoft_imap_accounts (
          id, user_id, name, provided_email, normalized_email, auth_mode,
          client_id, authority, refresh_token_cipher, access_token_cipher,
          access_token_expires_at, password_cipher, combination_password_cipher,
          status, last_synced_at,
          next_sync_at, last_error_code, last_error_at, sync_lease_id,
          sync_lease_until, token_lease_id, token_lease_until,
          last_manual_sync_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        account.id,
        this.userId,
        account.name,
        account.providedEmail,
        account.normalizedEmail,
        account.authMode,
        account.clientId,
        account.authority,
        refreshCipher,
        accessCipher,
        account.accessTokenExpiresAt,
        passwordCipher,
        combinationPasswordCipher,
        account.status,
        account.lastSyncedAt,
        account.nextSyncAt,
        account.lastErrorCode,
        account.lastErrorAt,
        account.syncLeaseId,
        account.syncLeaseUntil,
        account.tokenLeaseId,
        account.tokenLeaseUntil,
        account.lastManualSyncAt,
        account.createdAt,
        account.updatedAt,
      ).run()
    } catch (error) {
      if (/UNIQUE|constraint/i.test(error instanceof Error ? error.message : '')) {
        throw new MicrosoftStoreError(409, 'duplicate', '这个 Microsoft 账号已经连接。')
      }
      throw error
    }
  }

  async rename(accountId: string, name: string, now: number): Promise<PublicMicrosoftAccount> {
    const result = await this.env.DB.prepare(
      'UPDATE microsoft_imap_accounts SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    ).bind(name, now, accountId, this.userId).run()
    if (!result.meta.changes) {
      throw new MicrosoftStoreError(404, 'account_not_found', 'Microsoft 账号不存在。')
    }
    const account = await this.publicAccount(accountId)
    if (!account) throw new MicrosoftStoreError(404, 'account_not_found', 'Microsoft 账号不存在。')
    return account
  }

  async replaceOAuthCredential(account: MicrosoftAccount, now: number): Promise<void> {
    const refreshCipher = await encryptMicrosoftCredential(
      this.env,
      account.refreshToken,
      microsoftCredentialContext(this.userId, account.id, 'refresh-token'),
    )
    const accessCipher = await encryptMicrosoftCredential(
      this.env,
      account.accessToken,
      microsoftCredentialContext(this.userId, account.id, 'access-token'),
    )
    const result = await this.env.DB.prepare(
      `UPDATE microsoft_imap_accounts
          SET client_id = ?, authority = ?, refresh_token_cipher = ?,
              access_token_cipher = ?, access_token_expires_at = ?,
              status = 'active', last_error_code = '', last_error_at = NULL,
              next_sync_at = 0, token_lease_id = NULL, token_lease_until = NULL,
              sync_lease_id = NULL, sync_lease_until = NULL, updated_at = ?
        WHERE id = ? AND user_id = ? AND auth_mode = 'oauth2'`,
    ).bind(
      account.clientId,
      account.authority,
      refreshCipher,
      accessCipher,
      account.accessTokenExpiresAt,
      now,
      account.id,
      this.userId,
    ).run()
    if (!result.meta.changes) {
      throw new MicrosoftStoreError(404, 'account_not_found', 'Microsoft OAuth2 账号不存在。')
    }
  }

  async replacePassword(accountId: string, password: string, now: number): Promise<void> {
    const cipher = await encryptMicrosoftCredential(
      this.env,
      password,
      microsoftCredentialContext(this.userId, accountId, 'password'),
    )
    const result = await this.env.DB.prepare(
      `UPDATE microsoft_imap_accounts
          SET password_cipher = ?, status = 'active', last_error_code = '',
              last_error_at = NULL, next_sync_at = 0, sync_lease_id = NULL,
              sync_lease_until = NULL, updated_at = ?
        WHERE id = ? AND user_id = ? AND auth_mode = 'password'`,
    ).bind(cipher, now, accountId, this.userId).run()
    if (!result.meta.changes) {
      throw new MicrosoftStoreError(404, 'account_not_found', 'Microsoft 密码账号不存在。')
    }
  }

  async remove(accountId: string): Promise<PublicMicrosoftAccount> {
    const account = await this.publicAccount(accountId)
    if (!account) throw new MicrosoftStoreError(404, 'account_not_found', 'Microsoft 账号不存在。')
    const result = await this.env.DB.prepare(
      'DELETE FROM microsoft_imap_accounts WHERE id = ? AND user_id = ?',
    ).bind(accountId, this.userId).run()
    if (!result.meta.changes) {
      throw new MicrosoftStoreError(404, 'account_not_found', 'Microsoft 账号不存在。')
    }
    return account
  }

  async folders(accountId: string): Promise<MicrosoftFolder[]> {
    if (!await this.publicAccount(accountId)) {
      throw new MicrosoftStoreError(404, 'account_not_found', 'Microsoft 账号不存在。')
    }
    const { results } = await this.env.DB.prepare(
      `SELECT * FROM microsoft_imap_folders
        WHERE account_id = ? ORDER BY
          CASE WHEN upper(path) = 'INBOX' THEN 0 ELSE 1 END, display_name, path`,
    ).bind(accountId).all<MicrosoftFolderRow>()
    return results.map((row) => ({
      path: row.path,
      displayName: row.display_name,
      flags: safeFlags(row.flags_json),
      specialUse: row.special_use,
      uidValidity: row.uid_validity,
      lastUid: row.last_uid,
    }))
  }

  async folder(accountId: string, path: string): Promise<MicrosoftFolder | null> {
    if (!await this.publicAccount(accountId)) return null
    const row = await this.env.DB.prepare(
      'SELECT * FROM microsoft_imap_folders WHERE account_id = ? AND path = ? LIMIT 1',
    ).bind(accountId, path).first<MicrosoftFolderRow>()
    return row ? {
      path: row.path,
      displayName: row.display_name,
      flags: safeFlags(row.flags_json),
      specialUse: row.special_use,
      uidValidity: row.uid_validity,
      lastUid: row.last_uid,
    } : null
  }
}

function safeFlags(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export async function saveMicrosoftFolders(
  env: Env,
  accountId: string,
  folders: MicrosoftFolder[],
  now: number,
): Promise<void> {
  if (!folders.length) return
  await env.DB.batch(folders.map((folder) => env.DB.prepare(
    `INSERT INTO microsoft_imap_folders (
      account_id, path, display_name, flags_json, special_use,
      uid_validity, last_uid, last_listed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, path) DO UPDATE SET
      display_name = excluded.display_name,
      flags_json = excluded.flags_json,
      special_use = excluded.special_use,
      last_listed_at = excluded.last_listed_at`,
  ).bind(
    accountId,
    folder.path,
    folder.displayName,
    JSON.stringify(folder.flags),
    folder.specialUse,
    folder.uidValidity,
    folder.lastUid,
    now,
  )))
}
