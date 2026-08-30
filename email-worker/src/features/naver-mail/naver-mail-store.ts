import {
  decryptNaverMailCredential,
  encryptNaverMailCredential,
  naverMailCredentialsReady,
} from './naver-mail-credentials'
import type {
  NaverMailAccount,
  NaverMailAccountRow,
  PublicNaverMailAccount,
} from './naver-mail-types'
import type { Env } from '../../app/types'

export class NaverMailStoreError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function credentialContext(userId: string, accountId: string): string {
  return `${userId}:${accountId}:naver-app-password`
}

export function publicNaverMailAccount(account: NaverMailAccount): PublicNaverMailAccount {
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

type PublicRow = Omit<NaverMailAccountRow, 'user_id' | 'app_password_cipher'>

function publicRow(row: PublicRow): PublicNaverMailAccount {
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

async function accountFromRow(env: Env, row: NaverMailAccountRow): Promise<NaverMailAccount> {
  let appPassword = ''
  try {
    appPassword = await decryptNaverMailCredential(
      env,
      row.app_password_cipher,
      credentialContext(row.user_id, row.id),
    )
  } catch {
    throw new NaverMailStoreError(500, 'NAVER 邮箱凭据已损坏。')
  }
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    naverId: row.naver_id,
    appPassword,
    status: row.status,
    uidValidity: row.uid_validity,
    uidNext: row.uid_next,
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

export async function naverMailAccountForSync(
  env: Env,
  accountId: string,
): Promise<NaverMailAccount | null> {
  if (!naverMailCredentialsReady(env)) {
    throw new NaverMailStoreError(503, 'NAVER 邮箱凭据加密密钥不可用。')
  }
  const row = await env.DB.prepare(
    'SELECT * FROM naver_mail_accounts WHERE id = ? LIMIT 1',
  ).bind(accountId).first<NaverMailAccountRow>()
  return row ? accountFromRow(env, row) : null
}

export class NaverMailAccountStore {
  constructor(
    private readonly env: Env,
    private readonly userId: string,
  ) {
    if (!naverMailCredentialsReady(env)) {
      throw new NaverMailStoreError(
        503,
        'NAVER 邮箱功能尚未配置 NAVER_MAIL_CREDENTIALS_KEY。',
      )
    }
  }

  async list(): Promise<PublicNaverMailAccount[]> {
    const { results } = await this.env.DB.prepare(
      `SELECT id, name, email, naver_id, status, uid_validity, uid_next,
              last_seen_uid, last_synced_at, next_sync_at, last_error_code,
              last_error_at, sync_lease_id, sync_lease_until,
              last_manual_sync_at, created_at, updated_at
         FROM naver_mail_accounts WHERE user_id = ? ORDER BY created_at, id`,
    ).bind(this.userId).all<PublicRow>()
    return results.map(publicRow)
  }

  async publicAccount(accountId: string): Promise<PublicNaverMailAccount | null> {
    const row = await this.env.DB.prepare(
      `SELECT id, name, email, naver_id, status, uid_validity, uid_next,
              last_seen_uid, last_synced_at, next_sync_at, last_error_code,
              last_error_at, sync_lease_id, sync_lease_until,
              last_manual_sync_at, created_at, updated_at
         FROM naver_mail_accounts
        WHERE id = ? AND user_id = ? LIMIT 1`,
    ).bind(accountId, this.userId).first<PublicRow>()
    return row ? publicRow(row) : null
  }

  async get(accountId: string): Promise<NaverMailAccount> {
    const row = await this.env.DB.prepare(
      'SELECT * FROM naver_mail_accounts WHERE id = ? AND user_id = ? LIMIT 1',
    ).bind(accountId, this.userId).first<NaverMailAccountRow>()
    if (!row) throw new NaverMailStoreError(404, 'NAVER 邮箱账号不存在。')
    return accountFromRow(this.env, row)
  }

  async insert(account: NaverMailAccount): Promise<void> {
    const cipher = await encryptNaverMailCredential(
      this.env,
      account.appPassword,
      credentialContext(this.userId, account.id),
    )
    try {
      await this.env.DB.prepare(
        `INSERT INTO naver_mail_accounts (
          id, user_id, name, email, naver_id, app_password_cipher, status,
          uid_validity, uid_next, last_seen_uid, last_synced_at, next_sync_at,
          last_error_code, last_error_at, sync_lease_id, sync_lease_until,
          last_manual_sync_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        account.id,
        this.userId,
        account.name,
        account.email,
        account.naverId,
        cipher,
        account.status,
        account.uidValidity,
        account.uidNext,
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
      if (/UNIQUE|constraint/i.test(error instanceof Error ? error.message : '')) {
        throw new NaverMailStoreError(409, '这个 NAVER 邮箱账号已经连接。')
      }
      throw error
    }
  }

  async rename(accountId: string, name: string, now: number): Promise<PublicNaverMailAccount> {
    const result = await this.env.DB.prepare(
      'UPDATE naver_mail_accounts SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    ).bind(name, now, accountId, this.userId).run()
    if (!result.meta.changes) throw new NaverMailStoreError(404, 'NAVER 邮箱账号不存在。')
    const account = await this.publicAccount(accountId)
    if (!account) throw new NaverMailStoreError(404, 'NAVER 邮箱账号不存在。')
    return account
  }

  async replaceAppPassword(accountId: string, appPassword: string, now: number): Promise<void> {
    const cipher = await encryptNaverMailCredential(
      this.env,
      appPassword,
      credentialContext(this.userId, accountId),
    )
    const result = await this.env.DB.prepare(
      `UPDATE naver_mail_accounts
          SET app_password_cipher = ?, status = 'active', last_error_code = '',
              last_error_at = NULL, next_sync_at = 0, sync_lease_id = NULL,
              sync_lease_until = NULL, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).bind(cipher, now, accountId, this.userId).run()
    if (!result.meta.changes) throw new NaverMailStoreError(404, 'NAVER 邮箱账号不存在。')
  }

  async remove(accountId: string): Promise<PublicNaverMailAccount> {
    const account = await this.publicAccount(accountId)
    if (!account) throw new NaverMailStoreError(404, 'NAVER 邮箱账号不存在。')
    await this.env.DB.prepare(
      'DELETE FROM naver_mail_accounts WHERE id = ? AND user_id = ?',
    ).bind(accountId, this.userId).run()
    return account
  }
}
