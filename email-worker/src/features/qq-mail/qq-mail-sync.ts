import { ImapConnectionError } from '../../platform/imap/imap-errors'
import {
  DEFAULT_MAIL_SYNC_LIMIT,
  parseMailSyncLimit,
  RECENT_MESSAGE_REFRESH_LIMIT,
} from '../../platform/imap/sync-limit'
import { qqMailImapEnabled } from './qq-mail-credentials'
import {
  errorLogFields,
  logWorkerError,
  logWorkerInfo,
} from '../../shared/observability/structured-log'
import { writeAudit } from '../../shared/audit/audit'
import type { QqMailImapClient } from './qq-mail-imap'
import { qqMailAccountForSync, QqMailStoreError } from './qq-mail-store'
import type { QqMailAccount, QqMailMessageMetadata } from './qq-mail-types'
import type { Env, MailQueueJob, MailSyncLimit, QqMailSyncJob } from '../../app/types'

const INDEX_MESSAGE_LIMIT = 500
const SYNC_INTERVAL_SECONDS = 5 * 60
const LEASE_SECONDS = 6 * 60
const SCHEDULE_BATCH = 50

export type QqMailSyncResult = { status: 'synced' | 'skipped'; retryable: boolean }
type QqMailSyncStage = 'claim' | 'load_account' | 'connect' | 'examine' | 'read_index'
  | 'search' | 'fetch_metadata' | 'prepare' | 'persist'
type QqMailSyncDiagnostics = {
  reason?: QqMailSyncJob['reason']
  attempt?: number
}

function maskedEmail(email: string): string {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}***@${domain}`
}

async function writeSyncAudit(
  env: Env,
  account: QqMailAccount,
  action: 'qq_mail.sync.success' | 'qq_mail.sync.failed',
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await writeAudit(env, account.userId, action, account.id, 'queue', {
      accountName: account.name,
      email: maskedEmail(account.email),
      ...detail,
    })
  } catch (error) {
    logWorkerError('qq_mail_sync_audit_failed', {
      account_id: account.id,
      audit_action: action,
    }, error)
  }
}

async function qqMailClient(email: string, authorizationCode: string): Promise<QqMailImapClient> {
  const { QqMailImapClient } = await import('./qq-mail-imap')
  return new QqMailImapClient(email, authorizationCode)
}

export function qqMailSyncErrorCode(error: unknown): string {
  if (error instanceof QqMailStoreError) {
    if (error.status === 503) return 'credential_key_unavailable'
    return 'credential_decryption_failed'
  }
  if (error instanceof ImapConnectionError) {
    if (error.status === 400 || error.status === 401) return 'authentication_failed'
    if (error.status === 504) return 'timeout'
    if (/超过.*上限/.test(error.message)) return 'response_too_large'
    return 'connection_failed'
  }
  return 'sync_failed'
}

export function qqMailSyncAuditErrorFields(error: unknown): Record<string, unknown> {
  const fields = errorLogFields(error)
  return {
    errorType: error instanceof ImapConnectionError
      ? 'ImapConnectionError'
      : error instanceof QqMailStoreError
        ? 'QqMailStoreError'
        : fields.error_type,
    errorMessage: fields.error_message,
    errorStatus: fields.error_status,
  }
}

export function missingQqMailUids(
  localUids: number[],
  fetched: QqMailMessageMetadata[],
): number[] {
  const present = new Set(fetched.map(({ imapUid }) => imapUid))
  return localUids.filter((uid) => !present.has(uid))
}

async function claimLease(env: Env, accountId: string, leaseId: string, now: number): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE qq_mail_accounts
        SET sync_lease_id = ?, sync_lease_until = ?, status = 'syncing', updated_at = ?
      WHERE id = ? AND status != 'credential_error'
        AND (sync_lease_until IS NULL OR sync_lease_until <= ?)`,
  ).bind(leaseId, now + LEASE_SECONDS, now, accountId, now).run()
  return Boolean(result.meta.changes)
}

async function localUids(env: Env, accountId: string, uidValidity: number): Promise<number[]> {
  const { results } = await env.DB.prepare(
    `SELECT imap_uid FROM qq_mail_messages
      WHERE account_id = ? AND uid_validity = ?
      ORDER BY internal_date DESC, id DESC LIMIT ?`,
  ).bind(accountId, uidValidity, RECENT_MESSAGE_REFRESH_LIMIT).all<{ imap_uid: number }>()
  return results.map(({ imap_uid }) => imap_uid)
}

export function selectQqMailFetchUids(
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
  message: QqMailMessageMetadata,
  now: number,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO qq_mail_messages (
      id, account_id, imap_uid, uid_validity, message_id_header, sender_name,
      sender_address, recipients_json, cc_json, subject, preview, internal_date,
      size_bytes, flags_json, is_read, is_starred, has_attachments, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, uid_validity, imap_uid) DO UPDATE SET
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
      is_read = excluded.is_read,
      is_starred = excluded.is_starred,
      has_attachments = excluded.has_attachments,
      updated_at = excluded.updated_at`,
  ).bind(
    `qq_msg_${crypto.randomUUID().replaceAll('-', '')}`,
    accountId,
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
  const code = qqMailSyncErrorCode(error)
  const credentialError = [
    'authentication_failed',
    'credential_decryption_failed',
    'credential_key_unavailable',
  ].includes(code)
  await env.DB.prepare(
    `UPDATE qq_mail_accounts
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

export async function syncQqMailAccount(
  env: Env,
  accountId: string,
  now = Math.floor(Date.now() / 1000),
  messageLimit: MailSyncLimit = DEFAULT_MAIL_SYNC_LIMIT,
  diagnostics: QqMailSyncDiagnostics = {},
): Promise<QqMailSyncResult> {
  const startedAt = Date.now()
  let stage: QqMailSyncStage = 'claim'
  const leaseId = crypto.randomUUID()
  let claimed = false
  try {
    claimed = await claimLease(env, accountId, leaseId, now)
  } catch (error) {
    logWorkerError('qq_mail_sync_claim_failed', {
      account_id: accountId,
      reason: diagnostics.reason,
      attempt: diagnostics.attempt,
      stage,
      duration_ms: Date.now() - startedAt,
    }, error)
    throw error
  }
  if (!claimed) {
    if (diagnostics.reason && diagnostics.reason !== 'scheduled') {
      logWorkerInfo('qq_mail_sync_skipped', {
        account_id: accountId,
        reason: diagnostics.reason,
        attempt: diagnostics.attempt,
        stage,
        duration_ms: Date.now() - startedAt,
      })
    }
    return { status: 'skipped', retryable: false }
  }
  let client: QqMailImapClient | undefined
  let account: QqMailAccount | null = null
  try {
    stage = 'load_account'
    account = await qqMailAccountForSync(env, accountId)
    if (!account) throw new Error('credential_key_unavailable')
    stage = 'connect'
    client = await qqMailClient(account.email, account.authorizationCode)
    await client.open()
    stage = 'examine'
    const mailbox = await client.examineInbox()
    const reset = account.uidValidity !== mailbox.uidValidity
    stage = 'read_index'
    const existingUids = reset ? [] : await localUids(env, accountId, mailbox.uidValidity)
    stage = 'search'
    const discovery = reset
      ? { uids: await client.searchLatestUids(mailbox.uidNext, messageLimit), scannedThrough: 0 }
      : await client.searchAfter(account.lastSeenUid, mailbox.uidNext, messageLimit)
    const fetchUids = selectQqMailFetchUids(existingUids, discovery.uids, messageLimit)
    stage = 'fetch_metadata'
    const metadata = await client.fetchMetadata(fetchUids)
    const missing = reset ? [] : missingQqMailUids(existingUids, metadata)
    const highestUid = reset
      ? Math.max(0, ...discovery.uids, ...metadata.map(({ imapUid }) => imapUid))
      : Math.max(account.lastSeenUid, discovery.scannedThrough)
    stage = 'prepare'
    const statements: D1PreparedStatement[] = []
    if (reset) {
      statements.push(env.DB.prepare(
        'DELETE FROM qq_mail_messages WHERE account_id = ?',
      ).bind(accountId))
    }
    statements.push(...metadata.map((message) => (
      messageStatement(env, accountId, mailbox.uidValidity, message, now)
    )))
    statements.push(...missing.map((uid) => env.DB.prepare(
      'DELETE FROM qq_mail_messages WHERE account_id = ? AND uid_validity = ? AND imap_uid = ?',
    ).bind(accountId, mailbox.uidValidity, uid)))
    statements.push(env.DB.prepare(
      `DELETE FROM qq_mail_messages
        WHERE account_id = ? AND id NOT IN (
          SELECT id FROM qq_mail_messages WHERE account_id = ?
          ORDER BY internal_date DESC, id DESC LIMIT ?
        )`,
    ).bind(accountId, accountId, INDEX_MESSAGE_LIMIT))
    statements.push(env.DB.prepare(
      `UPDATE qq_mail_accounts
          SET status = 'active', uid_validity = ?, uid_next = ?, last_seen_uid = ?,
              last_synced_at = ?, next_sync_at = ?, last_error_code = '',
              last_error_at = NULL, sync_lease_id = NULL, sync_lease_until = NULL,
              updated_at = ?
        WHERE id = ? AND sync_lease_id = ?`,
    ).bind(
      mailbox.uidValidity,
      mailbox.uidNext,
      highestUid,
      now,
      now + SYNC_INTERVAL_SECONDS,
      now,
      accountId,
      leaseId,
    ))
    stage = 'persist'
    await env.DB.batch(statements)
    if (diagnostics.reason && diagnostics.reason !== 'scheduled') {
      logWorkerInfo('qq_mail_sync_completed', {
        account_id: accountId,
        reason: diagnostics.reason,
        attempt: diagnostics.attempt,
        message_limit: messageLimit,
        reset_mailbox: reset,
        discovered_count: discovery.uids.length,
        fetched_count: metadata.length,
        missing_count: missing.length,
        duration_ms: Date.now() - startedAt,
      })
      await writeSyncAudit(env, account, 'qq_mail.sync.success', {
        reason: diagnostics.reason,
        attempt: diagnostics.attempt,
        limit: messageLimit,
        reset,
        discoveredCount: discovery.uids.length,
        fetchedCount: metadata.length,
        missingCount: missing.length,
        durationMs: Date.now() - startedAt,
      })
    }
    return { status: 'synced', retryable: false }
  } catch (error) {
    let code = qqMailSyncErrorCode(error)
    try {
      code = await recordFailure(env, accountId, leaseId, error, now)
    } catch (recordError) {
      logWorkerError('qq_mail_sync_failure_record_failed', {
        account_id: accountId,
        failed_stage: stage,
        original_error_code: code,
        reason: diagnostics.reason,
        attempt: diagnostics.attempt,
        duration_ms: Date.now() - startedAt,
      }, recordError)
      throw recordError
    }
    const retryable = ![
        'authentication_failed',
        'credential_decryption_failed',
        'credential_key_unavailable',
        'response_too_large',
      ].includes(code)
    logWorkerError('qq_mail_sync_failed', {
      account_id: accountId,
      stage,
      error_code: code,
      reason: diagnostics.reason,
      attempt: diagnostics.attempt,
      message_limit: messageLimit,
      retryable,
      duration_ms: Date.now() - startedAt,
    }, error)
    if (account && (diagnostics.reason !== 'scheduled' || account.lastErrorCode !== code)) {
      await writeSyncAudit(env, account, 'qq_mail.sync.failed', {
        reason: diagnostics.reason,
        attempt: diagnostics.attempt,
        limit: messageLimit,
        stage,
        errorCode: code,
        ...qqMailSyncAuditErrorFields(error),
        retryable,
        willRetry: retryable && (diagnostics.attempt ?? 1) < 3,
        durationMs: Date.now() - startedAt,
      })
    }
    return { status: 'skipped', retryable }
  } finally {
    await client?.close()
  }
}

export async function consumeQqMailSyncJob(
  message: Message<MailQueueJob>,
  env: Env,
): Promise<void> {
  if (message.body.kind !== 'qq-mail-sync') return
  const limit = parseMailSyncLimit(message.body.limit) ?? DEFAULT_MAIL_SYNC_LIMIT
  const result = await syncQqMailAccount(
    env,
    message.body.accountId,
    Math.floor(Date.now() / 1000),
    limit,
    { reason: message.body.reason, attempt: message.attempts },
  )
  if (result.retryable && message.attempts < 3) {
    message.retry({ delaySeconds: 30 * 2 ** Math.max(0, message.attempts - 1) })
  } else {
    message.ack()
  }
}

export async function enqueueDueQqMailSyncs(
  env: Env,
  now = Math.floor(Date.now() / 1000),
): Promise<number> {
  if (!qqMailImapEnabled(env)) return 0
  const { results } = await env.DB.prepare(
    `SELECT id FROM qq_mail_accounts
      WHERE ((status IN ('active', 'error') AND next_sync_at <= ?)
          OR status = 'syncing')
        AND (sync_lease_until IS NULL OR sync_lease_until <= ?)
      ORDER BY next_sync_at, id LIMIT ?`,
  ).bind(now, now, SCHEDULE_BATCH).all<{ id: string }>()
  let queued = 0
  for (const account of results) {
    const claimed = await env.DB.prepare(
      `UPDATE qq_mail_accounts
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
      const job: QqMailSyncJob = {
        kind: 'qq-mail-sync', accountId: account.id, reason: 'scheduled',
      }
      await env.MAIL_QUEUE.send(job)
      queued += 1
    } catch (error) {
      await env.DB.prepare(
        'UPDATE qq_mail_accounts SET next_sync_at = ? WHERE id = ?',
      ).bind(now, account.id).run()
      throw error
    }
  }
  return queued
}
