import { ImapConnectionError } from '../../platform/imap/imap-errors'
import {
  DEFAULT_MAIL_SYNC_LIMIT,
  parseMailSyncLimit,
  RECENT_MESSAGE_REFRESH_LIMIT,
} from '../../platform/imap/sync-limit'
import { gmailImapEnabled } from './gmail-credentials'
import type { GmailImapClient } from './gmail-imap'
import { gmailAccountForSync, GmailStoreError } from './gmail-store'
import type { GmailMessageMetadata } from './gmail-types'
import type { Env, GmailSyncJob, MailQueueJob, MailSyncLimit } from '../../app/types'

const INDEX_MESSAGE_LIMIT = 500
const SYNC_INTERVAL_SECONDS = 5 * 60
const LEASE_SECONDS = 6 * 60
const SCHEDULE_BATCH = 50

export type GmailSyncResult = { status: 'synced' | 'skipped'; retryable: boolean }

async function gmailClient(email: string, appPassword: string): Promise<GmailImapClient> {
  const { GmailImapClient } = await import('./gmail-imap')
  return new GmailImapClient(email, appPassword)
}

export function gmailSyncErrorCode(error: unknown): string {
  if (error instanceof GmailStoreError) {
    if (error.status === 503) return 'credential_key_unavailable'
    return 'credential_decryption_failed'
  }
  if (error instanceof ImapConnectionError) {
    if (error.status === 400 || error.status === 401) return 'authentication_failed'
    if (error.status === 504) return 'timeout'
    if (/超过.*上限/.test(error.message)) return 'response_too_large'
    if (/扩展/.test(error.message)) return 'extension_unavailable'
    return 'connection_failed'
  }
  return 'sync_failed'
}

export function missingGmailUids(localUids: number[], fetched: GmailMessageMetadata[]): number[] {
  const present = new Set(fetched.map(({ imapUid }) => imapUid))
  return localUids.filter((uid) => !present.has(uid))
}

async function claimLease(env: Env, accountId: string, leaseId: string, now: number): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE gmail_imap_accounts
        SET sync_lease_id = ?, sync_lease_until = ?, status = 'syncing', updated_at = ?
      WHERE id = ? AND status != 'credential_error'
        AND (sync_lease_until IS NULL OR sync_lease_until <= ?)`,
  ).bind(leaseId, now + LEASE_SECONDS, now, accountId, now).run()
  return Boolean(result.meta.changes)
}

async function localUids(env: Env, accountId: string, uidValidity: number): Promise<number[]> {
  const { results } = await env.DB.prepare(
    `SELECT imap_uid FROM gmail_imap_messages
      WHERE account_id = ? AND uid_validity = ?
      ORDER BY internal_date DESC, id DESC LIMIT ?`,
  ).bind(accountId, uidValidity, RECENT_MESSAGE_REFRESH_LIMIT).all<{ imap_uid: number }>()
  return results.map(({ imap_uid }) => imap_uid)
}

export function selectGmailFetchUids(
  recentUids: number[],
  discoveredUids: number[],
  limit: MailSyncLimit = DEFAULT_MAIL_SYNC_LIMIT,
): number[] {
  return [...new Set([
    ...recentUids.slice(0, RECENT_MESSAGE_REFRESH_LIMIT),
    ...discoveredUids.slice(0, limit),
  ])].sort((left, right) => left - right)
}

function messageStatement(
  env: Env,
  accountId: string,
  uidValidity: number,
  message: GmailMessageMetadata,
  now: number,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO gmail_imap_messages (
      id, account_id, gmail_message_id, gmail_thread_id, imap_uid, uid_validity,
      message_id_header, sender_name, sender_address, recipients_json, cc_json,
      subject, preview, internal_date, size_bytes, flags_json, labels_json,
      is_read, is_starred, has_attachments, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, gmail_message_id) DO UPDATE SET
      gmail_thread_id = excluded.gmail_thread_id,
      imap_uid = excluded.imap_uid,
      uid_validity = excluded.uid_validity,
      message_id_header = excluded.message_id_header,
      sender_name = excluded.sender_name,
      sender_address = excluded.sender_address,
      recipients_json = excluded.recipients_json,
      cc_json = excluded.cc_json,
      subject = excluded.subject,
      preview = excluded.preview,
      internal_date = excluded.internal_date,
      size_bytes = excluded.size_bytes,
      flags_json = excluded.flags_json,
      labels_json = excluded.labels_json,
      is_read = excluded.is_read,
      is_starred = excluded.is_starred,
      has_attachments = excluded.has_attachments,
      updated_at = excluded.updated_at`,
  ).bind(
    `gmail_msg_${crypto.randomUUID().replaceAll('-', '')}`,
    accountId,
    message.gmailMessageId,
    message.gmailThreadId,
    message.imapUid,
    uidValidity,
    message.messageIdHeader,
    message.senderName,
    message.senderAddress,
    JSON.stringify(message.recipients),
    JSON.stringify(message.cc),
    message.subject,
    message.preview,
    message.internalDate || now,
    message.sizeBytes,
    JSON.stringify(message.flags),
    JSON.stringify(message.labels),
    Number(message.isRead),
    Number(message.isStarred),
    Number(message.hasAttachments),
    now,
    now,
  )
}

async function recordFailure(
  env: Env,
  accountId: string,
  leaseId: string,
  error: unknown,
  now: number,
): Promise<string> {
  const code = gmailSyncErrorCode(error)
  const credentialError = [
    'authentication_failed',
    'credential_decryption_failed',
    'credential_key_unavailable',
  ].includes(code)
  await env.DB.prepare(
    `UPDATE gmail_imap_accounts
        SET status = ?, last_error_code = ?, last_error_at = ?,
            next_sync_at = ?, sync_lease_id = NULL, sync_lease_until = NULL,
            updated_at = ?
      WHERE id = ? AND sync_lease_id = ?`,
  ).bind(
    credentialError ? 'credential_error' : 'error',
    code,
    now,
    now + (credentialError ? 24 * 60 * 60 : SYNC_INTERVAL_SECONDS),
    now,
    accountId,
    leaseId,
  ).run()
  return code
}

export async function syncGmailAccount(
  env: Env,
  accountId: string,
  now = Math.floor(Date.now() / 1000),
  messageLimit: MailSyncLimit = DEFAULT_MAIL_SYNC_LIMIT,
): Promise<GmailSyncResult> {
  const leaseId = crypto.randomUUID()
  if (!await claimLease(env, accountId, leaseId, now)) {
    return { status: 'skipped', retryable: false }
  }
  let client: GmailImapClient | undefined
  try {
    const account = await gmailAccountForSync(env, accountId)
    if (!account) throw new Error('credential_key_unavailable')
    client = await gmailClient(account.email, account.appPassword)
    await client.open()
    const mailbox = await client.examineInbox()
    const reset = account.uidValidity !== mailbox.uidValidity
    const existingUids = reset ? [] : await localUids(env, accountId, mailbox.uidValidity)
    const discovery = reset
      ? { uids: await client.searchLatestUids(mailbox.uidNext, messageLimit), scannedThrough: 0 }
      : await client.searchAfter(account.lastSeenUid, mailbox.uidNext, messageLimit)
    const fetchUids = selectGmailFetchUids(existingUids, discovery.uids, messageLimit)
    const metadata = await client.fetchMetadata(fetchUids)
    const missing = reset ? [] : missingGmailUids(existingUids, metadata)
    const highestUid = Math.max(
      account.lastSeenUid,
      discovery.scannedThrough,
      ...discovery.uids,
    )
    const statements: D1PreparedStatement[] = []
    if (reset) {
      statements.push(env.DB.prepare(
        'DELETE FROM gmail_imap_messages WHERE account_id = ?',
      ).bind(accountId))
    }
    statements.push(...metadata.map((message) => (
      messageStatement(env, accountId, mailbox.uidValidity, message, now)
    )))
    statements.push(...missing.map((uid) => env.DB.prepare(
      'DELETE FROM gmail_imap_messages WHERE account_id = ? AND uid_validity = ? AND imap_uid = ?',
    ).bind(accountId, mailbox.uidValidity, uid)))
    statements.push(env.DB.prepare(
      `DELETE FROM gmail_imap_messages
        WHERE account_id = ? AND id NOT IN (
          SELECT id FROM gmail_imap_messages WHERE account_id = ?
          ORDER BY internal_date DESC, id DESC LIMIT ?
        )`,
    ).bind(accountId, accountId, INDEX_MESSAGE_LIMIT))
    statements.push(env.DB.prepare(
      `UPDATE gmail_imap_accounts
          SET status = 'active', uid_validity = ?, last_seen_uid = ?,
              last_synced_at = ?, next_sync_at = ?, last_error_code = '',
              last_error_at = NULL, sync_lease_id = NULL, sync_lease_until = NULL,
              updated_at = ?
        WHERE id = ? AND sync_lease_id = ?`,
    ).bind(
      mailbox.uidValidity,
      reset ? Math.max(0, ...discovery.uids) : highestUid,
      now,
      now + SYNC_INTERVAL_SECONDS,
      now,
      accountId,
      leaseId,
    ))
    await env.DB.batch(statements)
    return { status: 'synced', retryable: false }
  } catch (error) {
    const code = await recordFailure(env, accountId, leaseId, error, now)
    console.error('Gmail synchronization failed', { accountId, code })
    return {
      status: 'skipped',
      retryable: ![
        'authentication_failed',
        'credential_decryption_failed',
        'credential_key_unavailable',
        'extension_unavailable',
        'response_too_large',
      ]
        .includes(code),
    }
  } finally {
    await client?.close()
  }
}

export async function consumeGmailSyncJob(
  message: Message<MailQueueJob>,
  env: Env,
): Promise<void> {
  if (message.body.kind !== 'gmail-sync') return
  const limit = parseMailSyncLimit(message.body.limit) ?? DEFAULT_MAIL_SYNC_LIMIT
  const result = await syncGmailAccount(
    env,
    message.body.accountId,
    Math.floor(Date.now() / 1000),
    limit,
  )
  if (result.retryable && message.attempts < 3) {
    message.retry({ delaySeconds: 30 * 2 ** Math.max(0, message.attempts - 1) })
  } else {
    message.ack()
  }
}

export async function enqueueDueGmailSyncs(
  env: Env,
  now = Math.floor(Date.now() / 1000),
): Promise<number> {
  if (!gmailImapEnabled(env)) return 0
  const { results } = await env.DB.prepare(
    `SELECT id FROM gmail_imap_accounts
      WHERE ((status IN ('active', 'error') AND next_sync_at <= ?)
          OR status = 'syncing')
        AND (sync_lease_until IS NULL OR sync_lease_until <= ?)
      ORDER BY next_sync_at, id LIMIT ?`,
  ).bind(now, now, SCHEDULE_BATCH).all<{ id: string }>()
  let queued = 0
  for (const account of results) {
    const claimed = await env.DB.prepare(
      `UPDATE gmail_imap_accounts
          SET next_sync_at = ?, updated_at = ?,
              status = CASE WHEN status = 'syncing' THEN 'error' ELSE status END,
              last_error_code = CASE
                WHEN status = 'syncing' THEN 'stale_lease' ELSE last_error_code END,
              last_error_at = CASE WHEN status = 'syncing' THEN ? ELSE last_error_at END,
              sync_lease_id = CASE WHEN status = 'syncing' THEN NULL ELSE sync_lease_id END,
              sync_lease_until = CASE WHEN status = 'syncing' THEN NULL ELSE sync_lease_until END
        WHERE id = ? AND (sync_lease_until IS NULL OR sync_lease_until <= ?)
          AND ((status IN ('active', 'error') AND next_sync_at <= ?)
            OR status = 'syncing')`,
    ).bind(now + SYNC_INTERVAL_SECONDS, now, now, account.id, now, now).run()
    if (!claimed.meta.changes) continue
    try {
      const job: GmailSyncJob = { kind: 'gmail-sync', accountId: account.id, reason: 'scheduled' }
      await env.MAIL_QUEUE.send(job)
      queued += 1
    } catch (error) {
      await env.DB.prepare(
        'UPDATE gmail_imap_accounts SET next_sync_at = ? WHERE id = ?',
      ).bind(now, account.id).run()
      throw error
    }
  }
  return queued
}
