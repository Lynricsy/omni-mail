import {
  decryptLinuxDoMailCredential,
  encryptLinuxDoMailCredential,
  linuxDoMailCredentialsReady,
} from './linux-do-mail-credentials'
import type {
  LinuxDoMailAccount,
  LinuxDoMailAccountRow,
  PublicLinuxDoMailAccount,
} from './linux-do-mail-types'
import type { Env } from '../../app/types'

export class LinuxDoMailStoreError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export function publicLinuxDoMailAccount(
  account: LinuxDoMailAccount,
): PublicLinuxDoMailAccount {
  const { userId: _userId, password, ...safe } = account
  return { ...safe, hasPassword: Boolean(password) }
}

function publicRow(
  row: Omit<LinuxDoMailAccountRow, 'user_id' | 'password_cipher'>,
): PublicLinuxDoMailAccount {
  return {
    id: row.id,
    username: row.username,
    status: row.status,
    lastValidated: row.last_validated,
    lastError: row.last_error,
    createdAt: row.created_at,
    hasPassword: true,
  }
}

export class LinuxDoMailAccountStore {
  constructor(
    private readonly env: Env,
    private readonly userId: string,
  ) {
    if (!linuxDoMailCredentialsReady(env)) {
      throw new LinuxDoMailStoreError(
        503,
        'Linux DO Mail 功能尚未配置 LINUX_DO_MAIL_CREDENTIALS_KEY。',
      )
    }
  }

  private context(accountId: string): string {
    return `${this.userId}:${accountId}:password`
  }

  async publicAccount(): Promise<PublicLinuxDoMailAccount | null> {
    const row = await this.env.DB.prepare(
      `SELECT id, username, status, last_validated, last_error, created_at
       FROM linux_do_mail_accounts WHERE user_id = ? LIMIT 1`,
    ).bind(this.userId).first<Omit<LinuxDoMailAccountRow, 'user_id' | 'password_cipher'>>()
    return row ? publicRow(row) : null
  }

  async get(): Promise<LinuxDoMailAccount> {
    const row = await this.env.DB.prepare(
      'SELECT * FROM linux_do_mail_accounts WHERE user_id = ? LIMIT 1',
    ).bind(this.userId).first<LinuxDoMailAccountRow>()
    if (!row) throw new LinuxDoMailStoreError(404, '尚未连接 Linux DO Mail 账号。')
    let password = ''
    try {
      password = await decryptLinuxDoMailCredential(
        this.env,
        row.password_cipher,
        this.context(row.id),
      )
    } catch {
      throw new LinuxDoMailStoreError(500, 'Linux DO Mail 凭据已损坏。')
    }
    return {
      id: row.id,
      userId: row.user_id,
      username: row.username,
      password,
      status: row.status,
      lastValidated: row.last_validated,
      lastError: row.last_error,
      createdAt: row.created_at,
    }
  }

  async insert(account: LinuxDoMailAccount): Promise<void> {
    const passwordCipher = await encryptLinuxDoMailCredential(
      this.env,
      account.password,
      this.context(account.id),
    )
    const mailbox = await this.env.DB.prepare(
      'SELECT user_id, is_hidden FROM mailboxes WHERE address = ? LIMIT 1',
    ).bind(account.username).first<{ user_id: string; is_hidden: number }>()
    if (mailbox && (mailbox.user_id !== this.userId || !mailbox.is_hidden)) {
      throw new LinuxDoMailStoreError(409, '这个 Linux DO Mail 账号已被其他账户使用。')
    }
    try {
      const accountStatement = this.env.DB.prepare(
        `INSERT INTO linux_do_mail_accounts (
          id, user_id, username, password_cipher, status, last_validated,
          last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        account.id,
        this.userId,
        account.username,
        passwordCipher,
        account.status,
        account.lastValidated,
        account.lastError,
        account.createdAt,
        account.createdAt,
      )
      const mailboxStatement = mailbox
        ? this.env.DB.prepare(
          `UPDATE mailboxes SET is_active = 1
           WHERE address = ? AND user_id = ? AND is_hidden = 1`,
        ).bind(account.username, this.userId)
        : this.env.DB.prepare(
          `INSERT INTO mailboxes (
            address, user_id, is_primary, is_active, created_at, is_hidden
          ) VALUES (?, ?, 0, 1, unixepoch(), 1)`,
        ).bind(account.username, this.userId)
      await this.env.DB.batch([accountStatement, mailboxStatement])
    } catch (error) {
      if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) {
        throw new LinuxDoMailStoreError(409, '每个用户只能连接一个 Linux DO Mail 账号。')
      }
      throw error
    }
  }

  async replacePassword(
    accountId: string,
    password: string,
    validatedAt: string,
  ): Promise<void> {
    const passwordCipher = await encryptLinuxDoMailCredential(
      this.env,
      password,
      this.context(accountId),
    )
    const result = await this.env.DB.prepare(
      `UPDATE linux_do_mail_accounts SET password_cipher = ?, status = 'active',
       last_validated = ?, last_error = '', last_error_code = '', last_error_at = NULL,
       next_sync_at = 0, sync_lease_id = NULL, sync_lease_until = NULL, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).bind(passwordCipher, validatedAt, validatedAt, accountId, this.userId).run()
    if (!result.meta.changes) {
      throw new LinuxDoMailStoreError(404, '尚未连接 Linux DO Mail 账号。')
    }
  }

  async remove(): Promise<PublicLinuxDoMailAccount> {
    const account = await this.publicAccount()
    if (!account) throw new LinuxDoMailStoreError(404, '尚未连接 Linux DO Mail 账号。')
    const result = await this.env.DB.prepare(
      'DELETE FROM linux_do_mail_accounts WHERE id = ? AND user_id = ?',
    ).bind(account.id, this.userId).run()
    if (!result.meta.changes) throw new LinuxDoMailStoreError(404, '尚未连接 Linux DO Mail 账号。')
    return account
  }

  async recordValidation(accountId: string, error = ''): Promise<void> {
    await this.env.DB.prepare(
      `UPDATE linux_do_mail_accounts SET status = ?, last_validated = ?,
       last_error = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    ).bind(
      error ? 'error' : 'active',
      new Date().toISOString(),
      error.slice(0, 300),
      new Date().toISOString(),
      accountId,
      this.userId,
    ).run()
  }
}
