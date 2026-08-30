import { attachmentDisposition, safeJsonArray } from '../../shared/http/api-helpers'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import type { YandexMailImapClient } from './yandex-mail-imap'
import {
  privateYandexMailJson,
  yandexMailResponseError,
  recordYandexMailRemoteFailure,
  requireYandexMailEnabled,
} from './yandex-mail-api-shared'
import { markRemoteYandexMailMessageRead } from './yandex-mail-read-state'
import { YandexMailAccountStore, YandexMailStoreError } from './yandex-mail-store'
import type { PublicYandexMailAccount } from './yandex-mail-types'
import type { Env, SessionUser } from '../../app/types'

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

type YandexMailMessageRow = {
  id: string
  account_id: string
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
  account_status: PublicYandexMailAccount['status']
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
    throw new YandexMailStoreError(400, 'Yandex 邮箱邮件分页游标无效。')
  }
}

function publicMessage(row: YandexMailMessageRow) {
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

export async function listYandexMailMessages(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  try {
    requireYandexMailEnabled(env)
    const search = new URL(request.url).searchParams
    const accountId = search.get('accountId')?.trim() || ''
    if (accountId && !await new YandexMailAccountStore(env, user.id).publicAccount(accountId)) {
      throw new YandexMailStoreError(404, 'Yandex 邮箱账号不存在。')
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
      `SELECT m.id, m.account_id, m.imap_uid, m.uid_validity, m.sender_name,
              m.sender_address, m.recipients_json, m.cc_json, m.subject, m.preview,
              m.internal_date, m.size_bytes, m.is_read, m.is_starred,
              m.has_attachments, a.name AS account_name, a.email AS account_email,
              a.status AS account_status
         FROM yandex_mail_messages m
         JOIN yandex_mail_accounts a ON a.id = m.account_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY m.internal_date DESC, m.id DESC LIMIT ?`,
    ).bind(...bindings, limit + 1).all<YandexMailMessageRow>()
    const hasMore = results.length > limit
    const pageRows = results.slice(0, limit)
    const last = pageRows.at(-1)
    return privateYandexMailJson({
      messages: pageRows.map(publicMessage),
      page: {
        hasMore,
        nextCursor: hasMore && last ? encodeCursor(last.internal_date, last.id) : null,
        limit,
      },
    })
  } catch (error) {
    return yandexMailResponseError(error)
  }
}

async function ownedMessage(
  env: Env,
  userId: string,
  accountId: string,
  messageId: string,
): Promise<YandexMailMessageRow> {
  const row = await env.DB.prepare(
    `SELECT m.id, m.account_id, m.imap_uid, m.uid_validity, m.sender_name,
            m.sender_address, m.recipients_json, m.cc_json, m.subject, m.preview,
            m.internal_date, m.size_bytes, m.is_read, m.is_starred,
            m.has_attachments, a.name AS account_name, a.email AS account_email,
            a.status AS account_status
       FROM yandex_mail_accounts a
       JOIN yandex_mail_messages m ON m.account_id = a.id
      WHERE a.user_id = ? AND a.id = ? AND m.id = ? LIMIT 1`,
  ).bind(userId, accountId, messageId).first<YandexMailMessageRow>()
  if (!row) throw new YandexMailStoreError(404, 'Yandex 邮箱邮件不存在。')
  return row
}

async function yandexMailClient(email: string, code: string): Promise<YandexMailImapClient> {
  const { YandexMailImapClient } = await import('./yandex-mail-imap')
  return new YandexMailImapClient(email, code)
}

async function remoteMessage(
  env: Env,
  user: SessionUser,
  accountId: string,
  messageId: string,
) {
  const row = await ownedMessage(env, user.id, accountId, messageId)
  const account = await new YandexMailAccountStore(env, user.id).get(accountId)
  const client = await yandexMailClient(account.email, account.appPassword)
  try {
    await client.open()
    const mailbox = await client.examineInbox()
    if (row.uid_validity !== mailbox.uidValidity) {
      throw new ImapConnectionError(
        409,
        'Yandex 邮箱索引已变化，请先同步列表后再打开邮件。',
        true,
      )
    }
    const parsed = await client.getMessage(row.imap_uid)
    return { row, parsed, account, uid: row.imap_uid }
  } catch (error) {
    await recordYandexMailRemoteFailure(env, accountId, error)
    throw error
  } finally {
    await client.close()
  }
}

export async function getYandexMailMessage(
  env: Env,
  user: SessionUser,
  accountId: string,
  messageId: string,
): Promise<Response> {
  try {
    requireYandexMailEnabled(env)
    const { row, parsed, account, uid } = await remoteMessage(
      env, user, accountId, messageId,
    )
    const markedRead = !row.is_read
      && await markRemoteYandexMailMessageRead(env, account, row.id, uid)
    return privateYandexMailJson({
      message: {
        ...publicMessage(row),
        ...parsed.message,
        id: row.id,
        isRead: Boolean(row.is_read) || markedRead,
      },
    })
  } catch (error) {
    return yandexMailResponseError(error)
  }
}

export async function getYandexMailAttachment(
  env: Env,
  user: SessionUser,
  accountId: string,
  messageId: string,
  partId: string,
): Promise<Response> {
  try {
    requireYandexMailEnabled(env)
    const { parsed } = await remoteMessage(env, user, accountId, messageId)
    const index = /^\d+$/.test(partId) ? Number(partId) : -1
    const attachment = parsed.parsedAttachments[index]
    if (!attachment) throw new YandexMailStoreError(404, '附件不存在。')
    const content = typeof attachment.content === 'string'
      ? new TextEncoder().encode(attachment.content)
      : attachment.content instanceof Uint8Array
        ? attachment.content : new Uint8Array(attachment.content)
    if (content.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new YandexMailStoreError(413, '附件超过 5 MiB 下载上限。')
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
    return yandexMailResponseError(error)
  }
}
