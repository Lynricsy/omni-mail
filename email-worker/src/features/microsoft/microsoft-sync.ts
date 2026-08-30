import type { Env, MailQueueJob, MicrosoftSyncJob } from '../../app/types'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import { microsoftMailEnabled } from './microsoft-credentials'
import type { MicrosoftImapClient } from './microsoft-imap'
import { openMicrosoftClient } from './microsoft-session'
import {
  microsoftAccountForSync,
  MicrosoftStoreError,
  saveMicrosoftFolders,
} from './microsoft-store'
import { MicrosoftTokenError } from './microsoft-token'
import type {
  MicrosoftAccount,
  MicrosoftFolder,
  MicrosoftMessageMetadata,
} from './microsoft-types'

const INITIAL_MESSAGE_LIMIT = 100
const INDEX_MESSAGE_LIMIT = 500
const SYNC_INTERVAL_SECONDS = 5 * 60
const LEASE_SECONDS = 6 * 60
const SCHEDULE_BATCH = 50

export type MicrosoftSyncResult = { status: 'synced' | 'skipped'; retryable: boolean }

export function microsoftSyncErrorCode(error: unknown, authMode?: MicrosoftAccount['authMode']): string {
  if (error instanceof MicrosoftTokenError) return error.code
  if (error instanceof MicrosoftStoreError) return error.code
  if (error instanceof ImapConnectionError) {
    if (error.status === 400 || error.status === 401) {
      return authMode === 'password' ? 'basic_auth_rejected' : 'imap_access_rejected'
    }
    if (error.status === 404) return 'remote_message_not_found'
    if (error.status === 504) return 'timeout'
    if (/超过.*上限/.test(error.message)) return 'response_too_large'
    if (/XOAUTH2/.test(error.message)) return 'xoauth2_unavailable'
    return 'connection_failed'
  }
  return 'sync_failed'
}

export function missingMicrosoftUids(localUids: number[], remoteUids: number[]): number[] {
  const remote = new Set(remoteUids)
  return localUids.filter((uid) => !remote.has(uid))
}

async function claimLease(
  env: Env,
  accountId: string,
  leaseId: string,
  now: number,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE microsoft_imap_accounts
        SET sync_lease_id = ?, sync_lease_until = ?, status = 'syncing', updated_at = ?
      WHERE id = ? AND status NOT IN ('credential_error', 'permission_error')
        AND (sync_lease_until IS NULL OR sync_lease_until <= ?)`,
  ).bind(leaseId, now + LEASE_SECONDS, now, accountId, now).run()
  return Boolean(result.meta.changes)
}

async function localUids(
  env: Env,
  accountId: string,
  folderPath: string,
  uidValidity: number,
): Promise<number[]> {
  const { results } = await env.DB.prepare(
    `SELECT imap_uid FROM microsoft_imap_messages
      WHERE account_id = ? AND folder_path = ? AND uid_validity = ?
      ORDER BY received_at DESC, id DESC LIMIT ?`,
  ).bind(accountId, folderPath, uidValidity, INDEX_MESSAGE_LIMIT)
    .all<{ imap_uid: number }>()
  return results.map(({ imap_uid }) => imap_uid)
}

function messageStatement(
  env: Env,
  accountId: string,
  folderPath: string,
  uidValidity: number,
  message: MicrosoftMessageMetadata,
  now: number,
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO microsoft_imap_messages (
      id, account_id, folder_path, uid_validity, imap_uid,
      internet_message_id, sender_name, sender_address, recipients_json,
      cc_json, subject, preview, received_at, sent_at, size_bytes, flags_json,
      is_read, is_starred, has_attachments, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, folder_path, uid_validity, imap_uid) DO UPDATE SET
      internet_message_id = excluded.internet_message_id,
      sender_name = excluded.sender_name,
      sender_address = excluded.sender_address,
      recipients_json = excluded.recipients_json,
      cc_json = excluded.cc_json,
      subject = excluded.subject,
      preview = excluded.preview,
      received_at = excluded.received_at,
      sent_at = excluded.sent_at,
      size_bytes = excluded.size_bytes,
      flags_json = excluded.flags_json,
      is_read = excluded.is_read,
      is_starred = excluded.is_starred,
      has_attachments = excluded.has_attachments,
      updated_at = excluded.updated_at`,
  ).bind(
    `microsoft_msg_${crypto.randomUUID().replaceAll('-', '')}`,
    accountId,
    folderPath,
    uidValidity,
    message.uid,
    message.internetMessageId,
    message.senderName,
    message.senderAddress,
    JSON.stringify(message.recipients),
    JSON.stringify(message.cc),
    message.subject,
    message.preview,
    message.receivedAt || now,
    message.sentAt,
    message.sizeBytes,
    JSON.stringify(message.flags),
    Number(message.isRead),
    Number(message.isStarred),
    Number(message.hasAttachments),
    now,
    now,
  )
}

export async function refreshMicrosoftFolderWithClient(
  env: Env,
  accountId: string,
  folderPath: string,
  limit: number,
  client: MicrosoftImapClient,
  now = Math.floor(Date.now() / 1000),
): Promise<{ uidValidity: number; indexed: number }> {
  const mailbox = await client.examineFolder(folderPath)
  const remoteUids = await client.searchAllUids()
  const existing = await localUids(env, accountId, folderPath, mailbox.uidValidity)
  const targetCount = Math.min(
    INDEX_MESSAGE_LIMIT,
    Math.max(limit, existing.length),
  )
  const targetUids = remoteUids.slice(-targetCount)
  const metadata = await client.fetchMetadata(targetUids)
  const missing = missingMicrosoftUids(existing, remoteUids)
  const folder = await env.DB.prepare(
    `SELECT uid_validity FROM microsoft_imap_folders
      WHERE account_id = ? AND path = ? LIMIT 1`,
  ).bind(accountId, folderPath).first<{ uid_validity: number | null }>()
  if (!folder) throw new MicrosoftStoreError(404, 'folder_not_found', 'Microsoft 文件夹不存在。')

  const statements: D1PreparedStatement[] = []
  if (folder.uid_validity !== null && folder.uid_validity !== mailbox.uidValidity) {
    statements.push(env.DB.prepare(
      'DELETE FROM microsoft_imap_messages WHERE account_id = ? AND folder_path = ?',
    ).bind(accountId, folderPath))
  }
  statements.push(...metadata.map((message) => messageStatement(
    env,
    accountId,
    folderPath,
    mailbox.uidValidity,
    message,
    now,
  )))
  statements.push(...missing.map((uid) => env.DB.prepare(
    `DELETE FROM microsoft_imap_messages
      WHERE account_id = ? AND folder_path = ? AND uid_validity = ? AND imap_uid = ?`,
  ).bind(accountId, folderPath, mailbox.uidValidity, uid)))
  statements.push(env.DB.prepare(
    `DELETE FROM microsoft_imap_messages
      WHERE account_id = ? AND folder_path = ? AND id NOT IN (
        SELECT id FROM microsoft_imap_messages
          WHERE account_id = ? AND folder_path = ?
          ORDER BY received_at DESC, id DESC LIMIT ?
      )`,
  ).bind(accountId, folderPath, accountId, folderPath, INDEX_MESSAGE_LIMIT))
  statements.push(env.DB.prepare(
    `UPDATE microsoft_imap_folders
        SET uid_validity = ?, last_uid = ?, last_listed_at = ?
      WHERE account_id = ? AND path = ?`,
  ).bind(
    mailbox.uidValidity,
    Math.max(0, ...remoteUids),
    now,
    accountId,
    folderPath,
  ))
  await env.DB.batch(statements)
  return { uidValidity: mailbox.uidValidity, indexed: metadata.length }
}

export async function refreshMicrosoftFolders(
  env: Env,
  account: MicrosoftAccount,
  now = Math.floor(Date.now() / 1000),
): Promise<MicrosoftFolder[]> {
  const client = await openMicrosoftClient(env, account)
  try {
    const folders = await client.listFolders()
    await saveMicrosoftFolders(env, account.id, folders, now)
    return folders
  } finally {
    await client.close()
  }
}

async function recordFailure(
  env: Env,
  accountId: string,
  leaseId: string,
  error: unknown,
  authMode: MicrosoftAccount['authMode'] | undefined,
  now: number,
): Promise<string> {
  const code = microsoftSyncErrorCode(error, authMode)
  const credentialError = [
    'invalid_grant', 'invalid_client', 'credential_decryption_failed',
    'credential_key_unavailable', 'basic_auth_rejected',
  ].includes(code)
  const permissionError = [
    'imap_scope_missing', 'imap_access_rejected', 'xoauth2_unavailable',
    'invalid_scope', 'unauthorized_client', 'consent_required',
  ].includes(code)
  await env.DB.prepare(
    `UPDATE microsoft_imap_accounts
        SET status = ?, last_error_code = ?, last_error_at = ?, next_sync_at = ?,
            sync_lease_id = NULL, sync_lease_until = NULL, updated_at = ?
      WHERE id = ? AND sync_lease_id = ?`,
  ).bind(
    credentialError ? 'credential_error' : permissionError ? 'permission_error' : 'error',
    code,
    now,
    now + ((credentialError || permissionError) ? 24 * 60 * 60 : SYNC_INTERVAL_SECONDS),
    now,
    accountId,
    leaseId,
  ).run()
  return code
}

export async function syncMicrosoftAccount(
  env: Env,
  accountId: string,
  now = Math.floor(Date.now() / 1000),
): Promise<MicrosoftSyncResult> {
  const leaseId = crypto.randomUUID()
  if (!await claimLease(env, accountId, leaseId, now)) {
    return { status: 'skipped', retryable: false }
  }
  let account: MicrosoftAccount | null = null
  let client: MicrosoftImapClient | undefined
  try {
    account = await microsoftAccountForSync(env, accountId)
    if (!account) throw new MicrosoftStoreError(404, 'account_not_found', 'Microsoft 账号不存在。')
    client = await openMicrosoftClient(env, account)
    const folders = await client.listFolders()
    await saveMicrosoftFolders(env, accountId, folders, now)
    const inbox = folders.find(({ path }) => path.toUpperCase() === 'INBOX')
    if (!inbox) throw new MicrosoftStoreError(502, 'inbox_unavailable', 'Microsoft INBOX 不可用。')
    await refreshMicrosoftFolderWithClient(
      env,
      accountId,
      inbox.path,
      INITIAL_MESSAGE_LIMIT,
      client,
      now,
    )
    await env.DB.prepare(
      `UPDATE microsoft_imap_accounts
          SET status = 'active', last_synced_at = ?, next_sync_at = ?,
              last_error_code = '', last_error_at = NULL,
              sync_lease_id = NULL, sync_lease_until = NULL, updated_at = ?
        WHERE id = ? AND sync_lease_id = ?`,
    ).bind(now, now + SYNC_INTERVAL_SECONDS, now, accountId, leaseId).run()
    return { status: 'synced', retryable: false }
  } catch (error) {
    const code = await recordFailure(env, accountId, leaseId, error, account?.authMode, now)
    return {
      status: 'skipped',
      retryable: ![
        'invalid_grant', 'invalid_client', 'credential_decryption_failed',
        'credential_key_unavailable', 'basic_auth_rejected', 'imap_scope_missing',
        'imap_access_rejected', 'xoauth2_unavailable', 'invalid_scope',
        'response_too_large', 'account_not_found',
      ].includes(code),
    }
  } finally {
    await client?.close()
  }
}

export async function consumeMicrosoftSyncJob(
  message: Message<MailQueueJob>,
  env: Env,
): Promise<void> {
  if (message.body.kind !== 'microsoft-sync') return
  const result = await syncMicrosoftAccount(env, message.body.accountId)
  if (result.retryable && message.attempts < 3) {
    message.retry({ delaySeconds: 30 * 2 ** Math.max(0, message.attempts - 1) })
  } else {
    message.ack()
  }
}

export async function enqueueDueMicrosoftSyncs(
  env: Env,
  now = Math.floor(Date.now() / 1000),
): Promise<number> {
  if (!microsoftMailEnabled(env)) return 0
  const { results } = await env.DB.prepare(
    `SELECT id FROM microsoft_imap_accounts
      WHERE status IN ('active', 'error') AND next_sync_at <= ?
        AND (sync_lease_until IS NULL OR sync_lease_until <= ?)
      ORDER BY next_sync_at, id LIMIT ?`,
  ).bind(now, now, SCHEDULE_BATCH).all<{ id: string }>()
  let queued = 0
  for (const account of results) {
    const claimed = await env.DB.prepare(
      `UPDATE microsoft_imap_accounts SET next_sync_at = ?, updated_at = ?
        WHERE id = ? AND next_sync_at <= ?`,
    ).bind(now + SYNC_INTERVAL_SECONDS, now, account.id, now).run()
    if (!claimed.meta.changes) continue
    try {
      const job: MicrosoftSyncJob = {
        kind: 'microsoft-sync',
        accountId: account.id,
        reason: 'scheduled',
      }
      await env.MAIL_QUEUE.send(job)
      queued += 1
    } catch (error) {
      await env.DB.prepare(
        'UPDATE microsoft_imap_accounts SET next_sync_at = ? WHERE id = ?',
      ).bind(now, account.id).run()
      throw error
    }
  }
  return queued
}
