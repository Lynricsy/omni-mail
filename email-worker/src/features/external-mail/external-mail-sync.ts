import { ImapConnectionError } from '../../platform/imap/imap-errors'
import {
  DEFAULT_MAIL_SYNC_LIMIT,
  RECENT_MESSAGE_REFRESH_LIMIT,
} from '../../platform/imap/sync-limit'
import type { IndexedImapMetadata } from '../../platform/imap/imap-index'
import { ICloudAccountStore } from '../icloud/icloud-store'
import { iCloudCredentialsReady } from '../icloud/icloud-credentials'
import { LinuxDoMailAccountStore } from '../linux-do-mail/linux-do-mail-store'
import { linuxDoMailCredentialsReady } from '../linux-do-mail/linux-do-mail-credentials'
import type { Env, MailQueueJob, MailSyncLimit } from '../../app/types'

const INDEX_MESSAGE_LIMIT = 200
const SYNC_INTERVAL_SECONDS = 5 * 60
const LEASE_SECONDS = 6 * 60
const SCHEDULE_BATCH = 50

type ExternalSource = 'icloud' | 'linuxdo'
type SyncResult = { status: 'synced' | 'skipped'; retryable: boolean }
type ExternalAccount = {
  id: string
  userId: string
  email: string
  password: string
  uidValidity: number | null
  lastSeenUid: number
}

function table(source: ExternalSource, suffix: 'accounts' | 'messages'): string {
  return source === 'icloud'
    ? `icloud_${suffix === 'accounts' ? 'accounts' : 'imap_messages'}`
    : `linux_do_mail_${suffix === 'accounts' ? 'accounts' : 'messages'}`
}

function credentialError(error: unknown): boolean {
  if (error instanceof ImapConnectionError) return error.status === 400 || error.status === 401
  const status = typeof error === 'object' && error
    && 'status' in error ? Number(error.status) : 0
  return status === 400 || status === 401 || status === 503
    || error instanceof Error && /credential|凭据|应用专用密码|密码/.test(error.message)
}

function errorCode(error: unknown): string {
  if (error instanceof ImapConnectionError) {
    if (error.status === 400 || error.status === 401) return 'authentication_failed'
    if (error.status === 504) return 'timeout'
    if (/超过.*上限/.test(error.message)) return 'response_too_large'
    return 'connection_failed'
  }
  const status = typeof error === 'object' && error
    && 'status' in error ? Number(error.status) : 0
  if (status === 400 || status === 401) return 'authentication_failed'
  if (status === 503) return 'credential_key_unavailable'
  if (error instanceof Error && /凭据.*损坏|credential.*decrypt/i.test(error.message)) {
    return 'credential_decryption_failed'
  }
  return 'sync_failed'
}

async function loadAccount(env: Env, source: ExternalSource, accountId: string): Promise<ExternalAccount | null> {
  const accounts = table(source, 'accounts')
  const row = await env.DB.prepare(
    `SELECT id, user_id, uid_validity, last_seen_uid FROM ${accounts} WHERE id = ? LIMIT 1`,
  ).bind(accountId).first<{
    id: string; user_id: string; uid_validity: number | null; last_seen_uid: number
  }>()
  if (!row) return null
  if (source === 'icloud') {
    const account = await new ICloudAccountStore(env, row.user_id).get(accountId)
    if (!account.appPassword || !account.icloudEmail) return null
    return {
      id: account.id, userId: account.userId, email: account.icloudEmail,
      password: account.appPassword, uidValidity: row.uid_validity,
      lastSeenUid: row.last_seen_uid,
    }
  }
  const account = await new LinuxDoMailAccountStore(env, row.user_id).get()
  if (account.id !== accountId || !account.password) return null
  return {
    id: account.id, userId: account.userId, email: account.username,
    password: account.password, uidValidity: row.uid_validity,
    lastSeenUid: row.last_seen_uid,
  }
}

async function createClient(source: ExternalSource, account: ExternalAccount) {
  if (source === 'icloud') {
    const { ICloudImapClient } = await import('../icloud/icloud-imap')
    return new ICloudImapClient(account.email, account.password)
  }
  const { LinuxDoMailImapClient } = await import('../linux-do-mail/linux-do-mail-imap')
  return new LinuxDoMailImapClient(account.email, account.password)
}

async function claimLease(env: Env, source: ExternalSource, accountId: string, leaseId: string, now: number): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE ${table(source, 'accounts')}
        SET sync_lease_id = ?, sync_lease_until = ?,
            status = CASE WHEN status = 'error' THEN status ELSE 'active' END,
            updated_at = ?
      WHERE id = ? AND (sync_lease_until IS NULL OR sync_lease_until <= ?)`
  ).bind(leaseId, now + LEASE_SECONDS, now, accountId, now).run()
  return Boolean(result.meta.changes)
}

async function localUids(env: Env, source: ExternalSource, accountId: string, uidValidity: number): Promise<number[]> {
  const { results } = await env.DB.prepare(
    `SELECT imap_uid FROM ${table(source, 'messages')}
      WHERE account_id = ? AND uid_validity = ?
      ORDER BY internal_date DESC, id DESC LIMIT ?`,
  ).bind(accountId, uidValidity, RECENT_MESSAGE_REFRESH_LIMIT).all<{ imap_uid: number }>()
  return results.map(({ imap_uid }) => imap_uid)
}

function messageStatement(
  env: Env,
  source: ExternalSource,
  accountId: string,
  uidValidity: number,
  message: IndexedImapMetadata,
  now: number,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO ${table(source, 'messages')} (
      id, account_id, imap_uid, uid_validity, message_id_header, sender_name,
      sender_address, recipients_json, subject, preview, internal_date,
      size_bytes, flags_json, is_read, has_attachments, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, uid_validity, imap_uid) DO UPDATE SET
      message_id_header = excluded.message_id_header,
      sender_name = excluded.sender_name,
      sender_address = excluded.sender_address,
      recipients_json = excluded.recipients_json,
      subject = excluded.subject,
      preview = excluded.preview,
      internal_date = excluded.internal_date,
      size_bytes = excluded.size_bytes,
      flags_json = excluded.flags_json,
      is_read = excluded.is_read,
      has_attachments = excluded.has_attachments,
      updated_at = excluded.updated_at`,
  ).bind(
    `${source}_msg_${crypto.randomUUID().replaceAll('-', '')}`,
    accountId,
    message.imapUid,
    uidValidity,
    message.messageIdHeader,
    message.senderName,
    message.senderAddress,
    JSON.stringify(message.recipients),
    message.subject,
    '',
    message.internalDate || now,
    message.sizeBytes,
    JSON.stringify(message.flags),
    Number(message.isRead),
    Number(message.hasAttachments),
    now,
    now,
  )
}

async function recordFailure(
  env: Env,
  source: ExternalSource,
  accountId: string,
  leaseId: string,
  error: unknown,
  now: number,
): Promise<string> {
  const code = errorCode(error)
  const credential = credentialError(error)
  await env.DB.prepare(
    `UPDATE ${table(source, 'accounts')}
        SET status = 'error', last_error = ?, last_error_code = ?, last_error_at = ?,
            next_sync_at = ?, sync_lease_id = NULL, sync_lease_until = NULL,
            updated_at = ?
      WHERE id = ? AND sync_lease_id = ?`,
  ).bind(
    credential ? '后台邮件索引认证失败，请更新邮箱凭据。' : '后台邮件索引同步失败，请稍后重试。',
    code,
    now,
    now + (credential ? 24 * 60 * 60 : SYNC_INTERVAL_SECONDS),
    now,
    accountId,
    leaseId,
  ).run()
  return code
}

export async function syncExternalMailAccount(
  env: Env,
  source: ExternalSource,
  accountId: string,
  now = Math.floor(Date.now() / 1000),
  messageLimit: MailSyncLimit = DEFAULT_MAIL_SYNC_LIMIT,
): Promise<SyncResult> {
  const leaseId = crypto.randomUUID()
  if (!await claimLease(env, source, accountId, leaseId, now)) {
    return { status: 'skipped', retryable: false }
  }
  let client: Awaited<ReturnType<typeof createClient>> | undefined
  try {
    const account = await loadAccount(env, source, accountId)
    if (!account) {
      await env.DB.prepare(
        `UPDATE ${table(source, 'accounts')} SET next_sync_at = ?, sync_lease_id = NULL,
         sync_lease_until = NULL, updated_at = ? WHERE id = ? AND sync_lease_id = ?`,
      ).bind(now + 24 * 60 * 60, now, accountId, leaseId).run()
      return { status: 'skipped', retryable: false }
    }
    client = await createClient(source, account)
    await client.open()
    const mailbox = await client.examineInbox()
    const reset = account.uidValidity !== mailbox.uidValidity
    const existing = reset ? [] : await localUids(env, source, accountId, mailbox.uidValidity)
    const discovery = reset
      ? { uids: await client.searchLatestUids(mailbox.uidNext, messageLimit), scannedThrough: 0 }
      : await client.searchAfter(account.lastSeenUid, mailbox.uidNext, messageLimit)
    const fetchUids = [...new Set([
      ...existing.slice(0, RECENT_MESSAGE_REFRESH_LIMIT),
      ...discovery.uids.slice(0, messageLimit),
    ])].sort((left, right) => left - right)
    const metadata = await client.fetchMetadata(fetchUids)
    const fetched = new Set(metadata.map(({ imapUid }) => imapUid))
    const missing = reset ? [] : existing.filter((uid) => !fetched.has(uid))
    const statements: D1PreparedStatement[] = []
    if (reset) statements.push(env.DB.prepare(
      `DELETE FROM ${table(source, 'messages')} WHERE account_id = ?`,
    ).bind(accountId))
    statements.push(...metadata.map((message) => (
      messageStatement(env, source, accountId, mailbox.uidValidity, message, now)
    )))
    statements.push(...missing.map((uid) => env.DB.prepare(
      `DELETE FROM ${table(source, 'messages')} WHERE account_id = ? AND uid_validity = ? AND imap_uid = ?`,
    ).bind(accountId, mailbox.uidValidity, uid)))
    statements.push(env.DB.prepare(
      `DELETE FROM ${table(source, 'messages')}
        WHERE account_id = ? AND id NOT IN (
          SELECT id FROM ${table(source, 'messages')} WHERE account_id = ?
          ORDER BY internal_date DESC, id DESC LIMIT ?
        )`,
    ).bind(accountId, accountId, INDEX_MESSAGE_LIMIT))
    statements.push(env.DB.prepare(
      `UPDATE ${table(source, 'accounts')}
          SET status = 'active', last_error = '', uid_validity = ?, last_seen_uid = ?,
              last_synced_at = ?, next_sync_at = ?, last_error_code = '',
              last_error_at = NULL, sync_lease_id = NULL, sync_lease_until = NULL,
              updated_at = ?
        WHERE id = ? AND sync_lease_id = ?`,
    ).bind(
      mailbox.uidValidity,
      reset ? Math.max(0, ...discovery.uids, ...metadata.map(({ imapUid }) => imapUid))
        : Math.max(account.lastSeenUid, discovery.scannedThrough),
      now,
      now + SYNC_INTERVAL_SECONDS,
      now,
      accountId,
      leaseId,
    ))
    await env.DB.batch(statements)
    return { status: 'synced', retryable: false }
  } catch (error) {
    const code = await recordFailure(env, source, accountId, leaseId, error, now)
    console.error(`${source} mail synchronization failed`, { accountId, code })
    return {
      status: 'skipped',
      retryable: ![
        'authentication_failed', 'credential_decryption_failed',
        'credential_key_unavailable', 'response_too_large',
      ].includes(code),
    }
  } finally {
    await client?.close()
  }
}

export async function consumeExternalMailSyncJob(
  message: Message<MailQueueJob>,
  env: Env,
): Promise<void> {
  if (message.body.kind !== 'icloud-sync' && message.body.kind !== 'linuxdo-mail-sync') return
  const result = await syncExternalMailAccount(
    env,
    message.body.kind === 'icloud-sync' ? 'icloud' : 'linuxdo',
    message.body.accountId,
    Math.floor(Date.now() / 1000),
    message.body.limit ?? DEFAULT_MAIL_SYNC_LIMIT,
  )
  if (result.retryable && message.attempts < 3) message.retry({
    delaySeconds: 30 * 2 ** Math.max(0, message.attempts - 1),
  })
  else message.ack()
}

async function enqueueDue(
  env: Env,
  source: ExternalSource,
  now: number,
): Promise<number> {
  if (source === 'icloud' && !iCloudCredentialsReady(env)) return 0
  if (source === 'linuxdo' && !linuxDoMailCredentialsReady(env)) return 0
  const accounts = table(source, 'accounts')
  const condition = source === 'icloud' ? "AND app_password_cipher <> ''" : ''
  const { results } = await env.DB.prepare(
    `SELECT id FROM ${accounts}
      WHERE status IN ('active', 'error') AND next_sync_at <= ?
        ${condition}
        AND (sync_lease_until IS NULL OR sync_lease_until <= ?)
      ORDER BY next_sync_at, id LIMIT ?`,
  ).bind(now, now, SCHEDULE_BATCH).all<{ id: string }>()
  let queued = 0
  for (const account of results) {
    const claimed = await env.DB.prepare(
      `UPDATE ${accounts}
          SET next_sync_at = ?, sync_lease_id = NULL, sync_lease_until = NULL,
              updated_at = ?
        WHERE id = ? AND status IN ('active', 'error')
          AND next_sync_at <= ?
          AND (sync_lease_until IS NULL OR sync_lease_until <= ?)`,
    ).bind(now + SYNC_INTERVAL_SECONDS, now, account.id, now, now).run()
    if (!claimed.meta.changes) continue
    try {
      await env.MAIL_QUEUE.send({
        kind: source === 'icloud' ? 'icloud-sync' : 'linuxdo-mail-sync',
        accountId: account.id,
        reason: 'scheduled',
      })
      queued += 1
    } catch (error) {
      await env.DB.prepare(`UPDATE ${accounts} SET next_sync_at = ? WHERE id = ?`)
        .bind(now, account.id).run()
      throw error
    }
  }
  return queued
}

export function enqueueDueICloudSyncs(env: Env, now = Math.floor(Date.now() / 1000)) {
  return enqueueDue(env, 'icloud', now)
}

export function enqueueDueLinuxDoMailSyncs(env: Env, now = Math.floor(Date.now() / 1000)) {
  return enqueueDue(env, 'linuxdo', now)
}
