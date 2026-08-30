import {
  decryptYandexMailCredential,
  encryptYandexMailCredential,
  yandexMailCredentialsReady,
} from './yandex-mail-credentials'
import type {
  YandexMailAccount,
  YandexMailAccountRow,
  PublicYandexMailAccount,
} from './yandex-mail-types'
import type { Env } from '../../app/types'

export class YandexMailStoreError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function credentialContext(userId: string, accountId: string): string {
  return `${userId}:${accountId}:yandex-app-password`
}

export function publicYandexMailAccount(account: YandexMailAccount): PublicYandexMailAccount {
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

type PublicRow = Omit<YandexMailAccountRow, 'user_id' | 'app_password_cipher'>

function publicRow(row: PublicRow): PublicYandexMailAccount {
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

async function accountFromRow(env: Env, row: YandexMailAccountRow): Promise<YandexMailAccount> {
  let appPassword = ''
  try {
    appPassword = await decryptYandexMailCredential(
      env,
      row.app_password_cipher,
      credentialContext(row.user_id, row.id),
    )
  } catch {
    throw new YandexMailStoreError(500, 'Yandex 邮箱凭据已损坏。')
  }
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    yandexLogin: row.yandex_login,
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

export async function yandexMailAccountForSync(
  env: Env,
  accountId: string,
): Promise<YandexMailAccount | null> {
  if (!yandexMailCredentialsReady(env)) {
    throw new YandexMailStoreError(503, 'Yandex 邮箱凭据加密密钥不可用。')
  }
  const row = await env.DB.prepare(
    'SELECT * FROM yandex_mail_accounts WHERE id = ? LIMIT 1',
  ).bind(accountId).first<YandexMailAccountRow>()
  return row ? accountFromRow(env, row) : null
}

export class YandexMailAccountStore {
  constructor(
    private readonly env: Env,
    private readonly userId: string,
  ) {
    if (!yandexMailCredentialsReady(env)) {
      throw new YandexMailStoreError(
        503,
        'Yandex 邮箱功能尚未配置 YANDEX_MAIL_CREDENTIALS_KEY。',
      )
    }
  }

  async list(): Promise<PublicYandexMailAccount[]> {
    const { results } = await this.env.DB.prepare(
      `SELECT id, name, email, yandex_login, status, uid_validity, uid_next,
              last_seen_uid, last_synced_at, next_sync_at, last_error_code,
              last_error_at, sync_lease_id, sync_lease_until,
              last_manual_sync_at, created_at, updated_at
         FROM yandex_mail_accounts WHERE user_id = ? ORDER BY created_at, id`,
    ).bind(this.userId).all<PublicRow>()
    return results.map(publicRow)
  }

  async publicAccount(accountId: string): Promise<PublicYandexMailAccount | null> {
    const row = await this.env.DB.prepare(
      `SELECT id, name, email, yandex_login, status, uid_validity, uid_next,
              last_seen_uid, last_synced_at, next_sync_at, last_error_code,
              last_error_at, sync_lease_id, sync_lease_until,
              last_manual_sync_at, created_at, updated_at
         FROM yandex_mail_accounts
        WHERE id = ? AND user_id = ? LIMIT 1`,
    ).bind(accountId, this.userId).first<PublicRow>()
    return row ? publicRow(row) : null
  }

  async get(accountId: string): Promise<YandexMailAccount> {
    const row = await this.env.DB.prepare(
      'SELECT * FROM yandex_mail_accounts WHERE id = ? AND user_id = ? LIMIT 1',
    ).bind(accountId, this.userId).first<YandexMailAccountRow>()
    if (!row) throw new YandexMailStoreError(404, 'Yandex 邮箱账号不存在。')
    return accountFromRow(this.env, row)
  }

  async insert(account: YandexMailAccount): Promise<void> {
    const cipher = await encryptYandexMailCredential(
      this.env,
      account.appPassword,
      credentialContext(this.userId, account.id),
    )
    try {
      await this.env.DB.prepare(
        `INSERT INTO yandex_mail_accounts (
          id, user_id, name, email, yandex_login, app_password_cipher, status,
          uid_validity, uid_next, last_seen_uid, last_synced_at, next_sync_at,
          last_error_code, last_error_at, sync_lease_id, sync_lease_until,
          last_manual_sync_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        account.id,
        this.userId,
        account.name,
        account.email,
        account.yandexLogin,
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
        throw new YandexMailStoreError(409, '这个 Yandex 邮箱账号已经连接。')
      }
      throw error
    }
  }

  async rename(accountId: string, name: string, now: number): Promise<PublicYandexMailAccount> {
    const result = await this.env.DB.prepare(
      'UPDATE yandex_mail_accounts SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?',
    ).bind(name, now, accountId, this.userId).run()
    if (!result.meta.changes) throw new YandexMailStoreError(404, 'Yandex 邮箱账号不存在。')
    const account = await this.publicAccount(accountId)
    if (!account) throw new YandexMailStoreError(404, 'Yandex 邮箱账号不存在。')
    return account
  }

  async replaceAppPassword(accountId: string, appPassword: string, now: number): Promise<void> {
    const cipher = await encryptYandexMailCredential(
      this.env,
      appPassword,
      credentialContext(this.userId, accountId),
    )
    const result = await this.env.DB.prepare(
      `UPDATE yandex_mail_accounts
          SET app_password_cipher = ?, status = 'active', last_error_code = '',
              last_error_at = NULL, next_sync_at = 0, sync_lease_id = NULL,
              sync_lease_until = NULL, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).bind(cipher, now, accountId, this.userId).run()
    if (!result.meta.changes) throw new YandexMailStoreError(404, 'Yandex 邮箱账号不存在。')
  }

  async remove(accountId: string): Promise<PublicYandexMailAccount> {
    const account = await this.publicAccount(accountId)
    if (!account) throw new YandexMailStoreError(404, 'Yandex 邮箱账号不存在。')
    await this.env.DB.prepare(
      'DELETE FROM yandex_mail_accounts WHERE id = ? AND user_id = ?',
    ).bind(accountId, this.userId).run()
    return account
  }
}
