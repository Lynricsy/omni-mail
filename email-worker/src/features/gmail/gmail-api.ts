import { attachmentDisposition, safeJsonArray, validEmail } from '../../shared/http/api-helpers'
import { writeAudit } from '../../shared/audit/audit'
import { gmailImapEnabled } from './gmail-credentials'
import type { GmailImapClient } from './gmail-imap'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import { GmailAccountStore, GmailStoreError, publicGmailAccount } from './gmail-store'
import { markRemoteMessageRead } from './gmail-read-state'
import { gmailSyncErrorCode } from './gmail-sync'
import { requestedMailSyncLimit } from '../../platform/imap/sync-limit'
import type { GmailAccount, PublicGmailAccount } from './gmail-types'
import { sha256 } from '../auth/session/auth'
import type { Env, GmailSyncJob, MailSyncLimit, SessionUser } from '../../app/types'

const VALIDATION_WINDOW_SECONDS = 10 * 60
const VALIDATION_ATTEMPTS = 5
const MANUAL_SYNC_INTERVAL_SECONDS = 60
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

type GmailMessageRow = {
  id: string
  account_id: string
  gmail_message_id: string
  imap_uid: number
  uid_validity: number
  sender_name: string
  sender_address: string
  recipients_json: string
  cc_json: string
  subject: string
  preview: string
  internal_date: number
  size_bytes: number
  is_read: number
  is_starred: number
  has_attachments: number
  account_name: string
  account_email: string
  account_status: PublicGmailAccount['status']
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

function responseError(error: unknown): Response {
  if (error instanceof GmailStoreError) {
    return privateJson({ error: error.message }, error.status)
  }
  if (error instanceof ImapConnectionError) {
    if (error.status === 404) {
      return privateJson({ error: 'Gmail 邮件不存在或已移出收件箱。' }, 404)
    }
    const code = gmailSyncErrorCode(error)
    const messages: Record<string, string> = {
      authentication_failed: 'Gmail 登录失败，请检查邮箱地址和应用专用密码。',
      timeout: '连接 Gmail 超时，请稍后重试。',
      response_too_large: 'Gmail 返回的邮件内容超过读取上限。',
      extension_unavailable: '当前账号未提供所需的 Gmail IMAP 扩展。',
      connection_failed: '暂时无法连接 Gmail，请稍后重试。',
    }
    const status = code === 'authentication_failed' ? 400
      : code === 'response_too_large' ? 413
        : error.status === 404 ? 404
          : error.status === 504 ? 504 : 502
    return privateJson({ error: messages[code] || messages.connection_failed }, status)
  }
  console.error('Gmail request failed', {
    code: gmailSyncErrorCode(error),
    type: error instanceof Error ? error.name : typeof error,
  })
  return privateJson({ error: 'Gmail 暂时无法处理这个请求。' }, 500)
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json<unknown>()
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error()
    return body as Record<string, unknown>
  } catch {
    throw new GmailStoreError(400, '请求体必须是 JSON 对象。')
  }
}

export function gmailNameField(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 60 || /[\r\n\0]/.test(name)) {
    throw new GmailStoreError(400, '账号名称需要为 1–60 个字符。')
  }
  return name
}

export function gmailEmailField(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!validEmail(email) || /[\r\n\0]/.test(email)) {
    throw new GmailStoreError(400, '请填写完整的 Gmail 或 Google Workspace 邮箱地址。')
  }
  return email
}

export function gmailAppPasswordField(value: unknown): string {
  const password = typeof value === 'string' ? value.replaceAll(' ', '') : ''
  if (!/^[\x21-\x7E]{16}$/.test(password) || /[\r\n\0]/.test(password)) {
    throw new GmailStoreError(400, '请填写 Google 生成的 16 位应用专用密码，而不是账号主密码。')
  }
  return password
}

function maskedEmail(email: string): string {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}***@${domain}`
}

async function gmailClient(email: string, password: string): Promise<GmailImapClient> {
  const { GmailImapClient } = await import('./gmail-imap')
  return new GmailImapClient(email, password)
}

async function validateCredentials(email: string, password: string): Promise<void> {
  const client = await gmailClient(email, password)
  try {
    await client.open()
    await client.examineInbox()
  } finally {
    await client.close()
  }
}

async function claimValidationAttempt(
  env: Env,
  userId: string,
  ip: string,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  const identity = await sha256(`${userId}:${ip}`)
  const windowStartedAt = Math.floor(now / VALIDATION_WINDOW_SECONDS) * VALIDATION_WINDOW_SECONDS
  const result = await env.DB.prepare(
    `INSERT INTO gmail_imap_validation_limits (
       identity_hash, window_started_at, attempt_count, updated_at
     ) VALUES (?, ?, 1, ?)
     ON CONFLICT(identity_hash) DO UPDATE SET
       window_started_at = excluded.window_started_at,
       attempt_count = CASE
         WHEN gmail_imap_validation_limits.window_started_at = excluded.window_started_at
           THEN gmail_imap_validation_limits.attempt_count + 1
         ELSE 1
       END,
       updated_at = excluded.updated_at
     WHERE gmail_imap_validation_limits.window_started_at != excluded.window_started_at
        OR gmail_imap_validation_limits.attempt_count < ?`,
  ).bind(identity, windowStartedAt, now, VALIDATION_ATTEMPTS).run()
  if (!result.meta.changes) {
    throw new GmailStoreError(429, 'Gmail 凭据验证过于频繁，请稍后重试。')
  }
}

async function enqueueSync(
  env: Env,
  accountId: string,
  reason: GmailSyncJob['reason'],
  limit?: MailSyncLimit,
): Promise<void> {
  const job: GmailSyncJob = { kind: 'gmail-sync', accountId, reason, limit }
  await env.MAIL_QUEUE.send(job)
}

export async function listGmailAccounts(env: Env, user: SessionUser): Promise<Response> {
  try {
    const enabled = gmailImapEnabled(env)
    const accounts = enabled ? await new GmailAccountStore(env, user.id).list() : []
    return privateJson({ enabled, accounts })
  } catch (error) {
    return responseError(error)
  }
}

export async function createGmailAccount(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const body = await jsonBody(request)
    const name = gmailNameField(body.name)
    const email = gmailEmailField(body.email)
    const appPassword = gmailAppPasswordField(body.appPassword)
    const store = new GmailAccountStore(env, user.id)
    const existing = await store.list()
    if (existing.some((account) => account.email === email)) {
      throw new GmailStoreError(409, '这个 Gmail 账号已经连接。')
    }
    await claimValidationAttempt(env, user.id, ip)
    await validateCredentials(email, appPassword)
    const now = Math.floor(Date.now() / 1000)
    const account: GmailAccount = {
      id: `gmail_${crypto.randomUUID().replaceAll('-', '')}`,
      userId: user.id,
      name,
      email,
      appPassword,
      status: 'active',
      uidValidity: null,
      lastSeenUid: 0,
      lastSyncedAt: null,
      nextSyncAt: 0,
      lastErrorCode: '',
      lastErrorAt: null,
      syncLeaseId: null,
      syncLeaseUntil: null,
      lastManualSyncAt: null,
      createdAt: now,
      updatedAt: now,
    }
    await store.insert(account)
    await writeAudit(env, user.id, 'gmail.account.connect', account.id, ip, {
      email: maskedEmail(email),
    })
    try { await enqueueSync(env, account.id, 'connect') } catch { /* cron will retry */ }
    return privateJson({ account: publicGmailAccount(account) }, 201)
  } catch (error) {
    return responseError(error)
  }
}

export async function renameGmailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const store = new GmailAccountStore(env, user.id)
    const account = await store.rename(
      accountId,
      gmailNameField((await jsonBody(request)).name),
      Math.floor(Date.now() / 1000),
    )
    await writeAudit(env, user.id, 'gmail.account.rename', accountId, ip)
    return privateJson({ account })
  } catch (error) {
    return responseError(error)
  }
}

export async function updateGmailAppPassword(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  try {
    const password = gmailAppPasswordField((await jsonBody(request)).appPassword)
    const store = new GmailAccountStore(env, user.id)
    const account = await store.get(accountId)
    await claimValidationAttempt(env, user.id, ip)
    await validateCredentials(account.email, password)
    const now = Math.floor(Date.now() / 1000)
    await store.replaceAppPassword(accountId, password, now)
    await writeAudit(env, user.id, 'gmail.account.credential_update', accountId, ip, {
      email: maskedEmail(account.email),
    })
    try { await enqueueSync(env, accountId, 'manual') } catch { /* cron will retry */ }
    return privateJson({ account: {
      ...publicGmailAccount(account),
      status: 'active',
      lastErrorCode: '',
      lastErrorAt: null,
      nextSyncAt: 0,
    } })
  } catch (error) {
    return responseError(error)
  }
}

async function recordRemoteFailure(env: Env, accountId: string, error: unknown): Promise<void> {
  if (error instanceof ImapConnectionError && error.status === 404) return
  const code = gmailSyncErrorCode(error)
  const now = Math.floor(Date.now() / 1000)
  try {
    await env.DB.prepare(
      `UPDATE gmail_imap_accounts SET status = ?, last_error_code = ?,
              last_error_at = ?, updated_at = ? WHERE id = ?`,
    ).bind(code === 'authentication_failed' ? 'credential_error' : 'error', code, now, now, accountId).run()
  } catch { /* preserve remote failure */ }
}

export async function verifyGmailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  ip: string,
): Promise<Response> {
  try {
    const account = await new GmailAccountStore(env, user.id).get(accountId)
    await claimValidationAttempt(env, user.id, ip)
    try {
      await validateCredentials(account.email, account.appPassword)
    } catch (error) {
      await recordRemoteFailure(env, accountId, error)
      throw error
    }
    const now = Math.floor(Date.now() / 1000)
    await env.DB.prepare(
      `UPDATE gmail_imap_accounts SET status = 'active', last_error_code = '',
              last_error_at = NULL, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    ).bind(now, accountId, user.id).run()
    await writeAudit(env, user.id, 'gmail.account.verify', accountId, ip, {
      email: maskedEmail(account.email),
    })
    return privateJson({ ok: true, validatedAt: now })
  } catch (error) {
    return responseError(error)
  }
}

export async function deleteGmailAccount(
  env: Env,
  user: SessionUser,
  accountId: string,
  ip: string,
): Promise<Response> {
  try {
    const account = await new GmailAccountStore(env, user.id).remove(accountId)
    await writeAudit(env, user.id, 'gmail.account.disconnect', accountId, ip, {
      email: maskedEmail(account.email),
    })
    return privateJson({ ok: true, remoteRevocationRequired: true })
  } catch (error) {
    return responseError(error)
  }
}

export async function requestGmailSync(
  env: Env,
  user: SessionUser,
  accountId: string,
  request: Request,
  defer: (task: Promise<unknown>) => void,
): Promise<Response> {
  try {
    const limit = await requestedMailSyncLimit(request).catch(() => {
      throw new GmailStoreError(400, '同步数量必须是 10、20 或 50 封邮件。')
    })
    const store = new GmailAccountStore(env, user.id)
    const account = await store.publicAccount(accountId)
    if (!account) throw new GmailStoreError(404, 'Gmail 账号不存在。')
    if (account.status === 'credential_error') {
      throw new GmailStoreError(409, '请先更新失效的 Gmail 应用专用密码。')
    }
    const now = Math.floor(Date.now() / 1000)
    const result = await env.DB.prepare(
      `UPDATE gmail_imap_accounts SET last_manual_sync_at = ?, next_sync_at = 0,
              updated_at = ?
        WHERE id = ? AND user_id = ?
          AND (last_manual_sync_at IS NULL OR last_manual_sync_at <= ?)`,
    ).bind(now, now, accountId, user.id, now - MANUAL_SYNC_INTERVAL_SECONDS).run()
    if (!result.meta.changes) {
      throw new GmailStoreError(429, '手动同步过于频繁，请稍后重试。')
    }
    defer(enqueueSync(env, accountId, 'manual', limit).catch((error) => {
      console.error('Unable to enqueue manual Gmail synchronization', {
        accountId,
        type: error instanceof Error ? error.name : typeof error,
      })
    }))
    return privateJson({ queued: true, limit }, 202)
  } catch (error) {
    return responseError(error)
  }
}

function encodeCursor(date: number, id: string): string {
  return btoa(JSON.stringify({ date, id }))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function decodeCursor(value: string | null): { date: number; id: string } | null {
  if (!value) return null
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=')
    const parsed = JSON.parse(atob(normalized)) as { date?: unknown; id?: unknown }
    if (!Number.isSafeInteger(parsed.date) || typeof parsed.id !== 'string' || parsed.id.length > 80) {
      throw new Error()
    }
    return { date: parsed.date as number, id: parsed.id }
  } catch {
    throw new GmailStoreError(400, 'Gmail 邮件分页游标无效。')
  }
}

function publicMessage(row: GmailMessageRow) {
  return {
    id: row.id,
    account: {
      id: row.account_id,
      name: row.account_name,
      email: row.account_email,
      status: row.account_status,
    },
    senderName: row.sender_name,
    senderAddress: row.sender_address,
    recipients: safeJsonArray(row.recipients_json),
    cc: safeJsonArray(row.cc_json),
    subject: row.subject,
    preview: row.preview,
    date: row.internal_date,
    sizeBytes: row.size_bytes,
    isRead: Boolean(row.is_read),
    isStarred: Boolean(row.is_starred),
    hasAttachments: Boolean(row.has_attachments),
  }
}

export async function listGmailMessages(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  try {
    if (!gmailImapEnabled(env)) throw new GmailStoreError(503, 'Gmail 功能尚未配置。')
    const search = new URL(request.url).searchParams
    const accountId = search.get('accountId')?.trim() || ''
    if (accountId && !await new GmailAccountStore(env, user.id).publicAccount(accountId)) {
      throw new GmailStoreError(404, 'Gmail 账号不存在。')
    }
    const limitValue = Number(search.get('limit') || 30)
    const limit = Number.isInteger(limitValue) ? Math.max(1, Math.min(50, limitValue)) : 30
    const query = (search.get('q') || '').trim().slice(0, 120)
    const cursor = decodeCursor(search.get('cursor'))
    const conditions = ['a.user_id = ?']
    const bindings: unknown[] = [user.id]
    if (accountId) {
      conditions.push('a.id = ?')
      bindings.push(accountId)
    }
    if (query) {
      const term = query.toLowerCase()
      conditions.push(`(instr(lower(m.sender_name), ?) > 0
        OR instr(lower(m.sender_address), ?) > 0
        OR instr(lower(m.recipients_json), ?) > 0
        OR instr(lower(m.cc_json), ?) > 0
        OR instr(lower(m.subject), ?) > 0)`)
      bindings.push(term, term, term, term, term)
    }
    if (cursor) {
      conditions.push('(m.internal_date < ? OR (m.internal_date = ? AND m.id < ?))')
      bindings.push(cursor.date, cursor.date, cursor.id)
    }
    const { results } = await env.DB.prepare(
      `SELECT m.id, m.account_id, m.gmail_message_id, m.imap_uid, m.uid_validity,
              m.sender_name, m.sender_address, m.recipients_json, m.cc_json,
              m.subject, m.preview, m.internal_date, m.size_bytes, m.is_read,
              m.is_starred, m.has_attachments, a.name AS account_name,
              a.email AS account_email, a.status AS account_status
         FROM gmail_imap_messages m
         JOIN gmail_imap_accounts a ON a.id = m.account_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.internal_date DESC, m.id DESC LIMIT ?`,
    ).bind(...bindings, limit + 1).all<GmailMessageRow>()
    const hasMore = results.length > limit
    const pageRows = results.slice(0, limit)
    const last = pageRows.at(-1)
    return privateJson({
      messages: pageRows.map(publicMessage),
      page: {
        hasMore,
        nextCursor: hasMore && last ? encodeCursor(last.internal_date, last.id) : null,
        limit,
      },
    })
  } catch (error) {
    return responseError(error)
  }
}

async function ownedMessage(
  env: Env,
  userId: string,
  accountId: string,
  messageId: string,
): Promise<GmailMessageRow> {
  const row = await env.DB.prepare(
    `SELECT m.id, m.account_id, m.gmail_message_id, m.imap_uid, m.uid_validity,
            m.sender_name, m.sender_address, m.recipients_json, m.cc_json,
            m.subject, m.preview, m.internal_date, m.size_bytes, m.is_read,
            m.is_starred, m.has_attachments, a.name AS account_name,
            a.email AS account_email, a.status AS account_status
       FROM gmail_imap_accounts a
       JOIN gmail_imap_messages m ON m.account_id = a.id
      WHERE a.user_id = ? AND a.id = ? AND m.id = ? LIMIT 1`,
  ).bind(userId, accountId, messageId).first<GmailMessageRow>()
  if (!row) throw new GmailStoreError(404, 'Gmail 邮件不存在。')
  return row
}

async function remoteMessage(
  env: Env,
  user: SessionUser,
  accountId: string,
  messageId: string,
) {
  const row = await ownedMessage(env, user.id, accountId, messageId)
  const account = await new GmailAccountStore(env, user.id).get(accountId)
  const client = await gmailClient(account.email, account.appPassword)
  try {
    await client.open()
    const mailbox = await client.examineInbox()
    let uid = row.uid_validity === mailbox.uidValidity ? row.imap_uid : null
    if (uid === null) uid = await client.findUid(row.gmail_message_id)
    if (uid === null) throw new ImapConnectionError(404, '邮件不存在或已移出收件箱。', true)
    let parsed
    try {
      parsed = await client.getMessage(uid)
    } catch (error) {
      if (!(error instanceof ImapConnectionError) || error.status !== 404) throw error
      uid = await client.findUid(row.gmail_message_id)
      if (uid === null) throw error
      parsed = await client.getMessage(uid)
    }
    if (uid !== row.imap_uid || mailbox.uidValidity !== row.uid_validity) {
      await env.DB.prepare(
        `UPDATE gmail_imap_messages SET imap_uid = ?, uid_validity = ?, updated_at = ?
          WHERE id = ? AND account_id = ?`,
      ).bind(uid, mailbox.uidValidity, Math.floor(Date.now() / 1000), row.id, accountId).run()
    }
    return { row, parsed, account, uid }
  } catch (error) {
    await recordRemoteFailure(env, accountId, error)
    throw error
  } finally {
    await client.close()
  }
}

export async function getGmailMessage(
  env: Env,
  user: SessionUser,
  accountId: string,
  messageId: string,
): Promise<Response> {
  try {
    const { row, parsed, account, uid } = await remoteMessage(env, user, accountId, messageId)
    const markedRead = !row.is_read && await markRemoteMessageRead(env, account, row.id, uid)
    return privateJson({
      message: {
        ...publicMessage(row),
        ...parsed.message,
        id: row.id,
        isRead: Boolean(row.is_read) || markedRead,
      },
    })
  } catch (error) {
    return responseError(error)
  }
}

export async function getGmailAttachment(
  env: Env,
  user: SessionUser,
  accountId: string,
  messageId: string,
  partId: string,
): Promise<Response> {
  try {
    const { parsed } = await remoteMessage(env, user, accountId, messageId)
    const index = /^\d+$/.test(partId) ? Number(partId) : -1
    const attachment = parsed.parsedAttachments[index]
    if (!attachment) throw new GmailStoreError(404, '附件不存在。')
    const content = typeof attachment.content === 'string'
      ? new TextEncoder().encode(attachment.content)
      : attachment.content instanceof Uint8Array
        ? attachment.content : new Uint8Array(attachment.content)
    if (content.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new GmailStoreError(413, '附件超过 5 MiB 下载上限。')
    }
    const filename = parsed.message.attachments[index]?.filename || `attachment-${index + 1}`
    const contentType = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(attachment.mimeType)
      ? attachment.mimeType : 'application/octet-stream'
    return new Response(content, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': attachmentDisposition(filename),
        'Content-Length': String(content.byteLength),
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    return responseError(error)
  }
}
