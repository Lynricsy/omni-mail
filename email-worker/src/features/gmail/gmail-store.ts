import {
  decryptGmailCredential,
  encryptGmailCredential,
  gmailCredentialsReady,
} from './gmail-credentials'
import type {
  GmailAccount,
  GmailAccountRow,
  PublicGmailAccount,
} from './gmail-types'
import type { Env } from '../../app/types'

export class GmailStoreError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function context(userId: string, accountId: string): string {
  return `${userId}:${accountId}:app-password`
}

export function publicGmailAccount(account: GmailAccount): PublicGmailAccount {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    status: account.status,
    lastSyncedAt: account.lastSyncedAt,
    nextSyncAt: account.nextSyncAt,
    lastErrorCode: account.lastErrorCode,
    lastErrorAt: account.lastErrorAt,
    createdAt: account.createdAt,
    hasAppPassword: true,
  }
}

function publicRow(row: Omit<GmailAccountRow, 'user_id' | 'app_password_cipher'>): PublicGmailAccount {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    nextSyncAt: row.next_sync_at,
    lastErrorCode: row.last_error_code,
    lastErrorAt: row.last_error_at,
    createdAt: row.created_at,
    hasAppPassword: true,
  }
}

async function accountFromRow(env: Env, row: GmailAccountRow): Promise<GmailAccount> {
  let appPassword = ''
  try {
    appPassword = await decryptGmailCredential(
      env,
      row.app_password_cipher,
      context(row.user_id, row.id),
    )
  } catch {
    throw new GmailStoreError(500, 'Gmail 凭据已损坏。')
  }
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    appPassword,
    status: row.status,
    uidValidity: row.uid_validity,
    lastSeenUid: row.last_seen_uid,
    lastSyncedAt: row.last_synced_at,
    nextSyncAt: row.next_sync_at,
    lastErrorCode: row.last_error_code,
    lastErrorAt: row.last_error_at,
    syncLeaseId: row.sync_lease_id,
    syncLeaseUntil: row.sync_lease_until,
    lastManualSyncAt: row.last_manual_sync_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function gmailAccountForSync(env: Env, accountId: string): Promise<GmailAccount | null> {
  if (!gmailCredentialsReady(env)) {
    throw new GmailStoreError(503, 'Gmail 凭据加密密钥不可用。')
  }
  const row = await env.DB.prepare(
    'SELECT * FROM gmail_imap_accounts WHERE id = ? LIMIT 1',
  ).bind(accountId).first<GmailAccountRow>()
  return row ? accountFromRow(env, row) : null
}

export class GmailAccountStore {
  constructor(
    private readonly env: Env,
    private readonly userId: string,
  ) {
    if (!gmailCredentialsReady(env)) {
      throw new GmailStoreError(503, 'Gmail 功能尚未配置 GMAIL_CREDENTIALS_KEY。')
    }
  }

  async list(): Promise<PublicGmailAccount[]> {
    const { results } = await this.env.DB.prepare(
      `SELECT id, name, email, status, uid_validity, last_seen_uid, last_synced_at,
              next_sync_at, last_error_code, last_error_at, sync_lease_id,
              sync_lease_until, last_manual_sync_at, created_at, updated_at
         FROM gmail_imap_accounts WHERE user_id = ? ORDER BY created_at, id`,
    ).bind(this.userId).all<Omit<GmailAccountRow, 'user_id' | 'app_password_cipher'>>()
    return results.map(publicRow)
  }

  async publicAccount(accountId: string): Promise<PublicGmailAccount | null> {
    const row = await this.env.DB.prepare(
      `SELECT id, name, email, status, uid_validity, last_seen_uid, last_synced_at,
              next_sync_at, last_error_code, last_error_at, sync_lease_id,
              sync_lease_until, last_manual_sync_at, created_at, updated_at
         FROM gmail_imap_accounts WHERE id = ? AND user_id = ? LIMIT 1`,
    ).bind(accountId, this.userId)
      .first<Omit<GmailAccountRow, 'user_id' | 'app_password_cipher'>>()
    return row ? publicRow(row) : null
  }

  async get(accountId: string): Promise<GmailAccount> {
    const row = await this.env.DB.prepare(
      'SELECT * FROM gmail_imap_accounts WHERE id = ? AND user_id = ? LIMIT 1',
    ).bind(accountId, this.userId).first<GmailAccountRow>()
    if (!row) throw new GmailStoreError(404, 'Gmail 账号不存在。')
    return accountFromRow(this.env, row)
  }

  async insert(account: GmailAccount): Promise<void> {
    const cipher = await encryptGmailCredential(
      this.env,
      account.appPassword,
      context(this.userId, account.id),
    )
    try {
      await this.env.DB.prepare(
        `INSERT INTO gmail_imap_accounts (
          id, user_id, name, email, app_password_cipher, status, uid_validity,
          last_seen_uid, last_synced_at, next_sync_at, last_error_code,
          last_error_at, sync_lease_id, sync_lease_until, last_manual_sync_at,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        account.id,
        this.userId,
        account.name,
        account.email,
        cipher,
        account.status,
        account.uidValidity,
        account.lastSeenUid,
        account.lastSyncedAt,
        account.nextSyncAt,
        account.lastErrorCode,
        account.lastErrorAt,
        account.syncLeaseId,
        account.syncLeaseUntil,
        account.lastManualSyncAt,
        account.createdAt,
        account.updatedAt,
      ).run()
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/UNIQUE|constraint/i.test(message)) {
        throw new GmailStoreError(409, '这个 Gmail 账号已经连接。')
      }
      throw error
    }
  }

  async rename(accountId: string, name: string, now: number): Promise<PublicGmailAccount> {
    const result = await this.env.DB.prepare(
      'UPDATE gmail_imap_accounts SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    ).bind(name, now, accountId, this.userId).run()
    if (!result.meta.changes) throw new GmailStoreError(404, 'Gmail 账号不存在。')
    const account = await this.publicAccount(accountId)
    if (!account) throw new GmailStoreError(404, 'Gmail 账号不存在。')
    return account
  }

  async replaceAppPassword(accountId: string, password: string, now: number): Promise<void> {
    const cipher = await encryptGmailCredential(
      this.env,
      password,
      context(this.userId, accountId),
    )
    const result = await this.env.DB.prepare(
      `UPDATE gmail_imap_accounts SET app_password_cipher = ?, status = 'active',
              last_error_code = '', last_error_at = NULL, next_sync_at = 0,
              sync_lease_id = NULL, sync_lease_until = NULL, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).bind(cipher, now, accountId, this.userId).run()
    if (!result.meta.changes) throw new GmailStoreError(404, 'Gmail 账号不存在。')
  }

  async remove(accountId: string): Promise<PublicGmailAccount> {
    const account = await this.publicAccount(accountId)
    if (!account) throw new GmailStoreError(404, 'Gmail 账号不存在。')
    const result = await this.env.DB.prepare(
      'DELETE FROM gmail_imap_accounts WHERE id = ? AND user_id = ?',
    ).bind(accountId, this.userId).run()
    if (!result.meta.changes) throw new GmailStoreError(404, 'Gmail 账号不存在。')
    return account
  }
}
