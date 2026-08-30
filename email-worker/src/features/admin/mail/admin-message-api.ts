import {
  attachmentDisposition,
  inlineDisposition,
  normalizeEmail,
  safeJsonArray,
} from '../../../shared/http/api-helpers'
import { writeAudit } from '../../../shared/audit/audit'
import { messageSummary } from '../../messages/message-list-api'
import { permanentlyDeleteMessage } from '../../messages/message-storage'
import { searchLikePattern } from '../../../shared/mail/message-search'
import { pageResult, parsePageRequest } from '../../../shared/http/pagination'
import { retentionValues } from '../settings/storage-policy'
import type { AttachmentRow, Env, MessageRow, SessionUser, StoredBody } from '../../../app/types'

type AdminMessageRow = MessageRow & {
  owner_user_id: string
  owner_email: string
  owner_name: string
}

type AdminSummaryRow = AdminMessageRow & { sort_time: number }
type AdminMessageAction = 'trash' | 'restore' | 'delete'

const directions = new Set(['all', 'incoming', 'outgoing'])
const folders = new Set(['all', 'inbox', 'sent', 'trash'])
const statuses = new Set(['all', 'processing', 'ready', 'failed', 'sent'])
const dayRanges = new Set([0, 1, 7, 30, 90])
const actions = new Set<AdminMessageAction>(['trash', 'restore', 'delete'])
const PREVIEWABLE_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function requireSuperAdmin(user: SessionUser): Response | null {
  return user.role === 'super_admin'
    ? null
    : json({ error: '只有主管理员可以管理全站邮件。' }, 403)
}

function adminSummary(row: AdminMessageRow) {
  return {
    ...messageSummary(row),
    sizeBytes: row.quota_bytes,
    owner: {
      id: row.owner_user_id,
      email: row.owner_email,
      displayName: row.owner_name,
    },
  }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

export async function listAdminMessages(
  env: Env,
  user: SessionUser,
  request: Request,
): Promise<Response> {
  const denied = requireSuperAdmin(user)
  if (denied) return denied
  const pagination = parsePageRequest(request, 2)
  if (!pagination) return json({ error: '分页参数无效，limit 需要在 1–100 之间。' }, 400)

  const params = new URL(request.url).searchParams
  const query = (params.get('q') || '').trim().slice(0, 120)
  const owner = normalizeEmail(params.get('user') || '')
  const mailbox = normalizeEmail(params.get('mailbox') || '')
  const direction = params.get('direction') || 'all'
  const folder = params.get('folder') || 'all'
  const status = params.get('status') || 'all'
  const days = Number(params.get('days') || 0)
  if (
    owner.length > 254
    || mailbox.length > 254
    || !directions.has(direction)
    || !folders.has(folder)
    || !statuses.has(status)
    || !dayRanges.has(days)
  ) return json({ error: '邮件管理筛选条件无效。' }, 400)

  const conditions: string[] = []
  const bindings: Array<string | number> = []
  if (query) {
    const pattern = searchLikePattern(query)
    conditions.push(
      `(EXISTS (
        SELECT 1 FROM message_search ms
         WHERE ms.message_id = m.id AND ms.content LIKE ? ESCAPE '\\'
      ) OR m.subject LIKE ? ESCAPE '\\'
        OR m.sender_address LIKE ? ESCAPE '\\'
        OR m.sender_name LIKE ? ESCAPE '\\'
        OR m.recipients_json LIKE ? ESCAPE '\\'
        OR u.email LIKE ? ESCAPE '\\')`,
    )
    bindings.push(pattern, pattern, pattern, pattern, pattern, pattern)
  }
  if (owner) {
    conditions.push("LOWER(u.email) LIKE ? ESCAPE '\\'")
    bindings.push(searchLikePattern(owner))
  }
  if (mailbox) {
    conditions.push("LOWER(COALESCE(m.delivered_to, m.mailbox_address)) LIKE ? ESCAPE '\\'")
    bindings.push(searchLikePattern(mailbox))
  }
  if (direction !== 'all') {
    conditions.push('m.direction = ?')
    bindings.push(direction)
  }
  if (folder !== 'all') {
    conditions.push('m.folder = ?')
    bindings.push(folder)
  }
  if (status !== 'all') {
    conditions.push('m.status = ?')
    bindings.push(status)
  }
  if (days) {
    conditions.push('COALESCE(m.received_at, m.sent_at, m.created_at) >= ?')
    bindings.push(Math.floor(Date.now() / 1000) - days * 86400)
  }
  if (pagination.cursor) {
    const [sortTime, id] = pagination.cursor.values
    if (
      typeof sortTime !== 'number'
      || !Number.isSafeInteger(sortTime)
      || sortTime < 0
      || typeof id !== 'string'
      || !id
      || id.length > 100
    ) return json({ error: '邮件分页游标无效。' }, 400)
    conditions.push(
      '(COALESCE(m.received_at, m.sent_at, m.created_at) < ? OR '
      + '(COALESCE(m.received_at, m.sent_at, m.created_at) = ? AND m.id < ?))',
    )
    bindings.push(sortTime, sortTime, id)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { results } = await env.DB.prepare(
    `SELECT m.*, mb.user_id AS owner_user_id, u.email AS owner_email,
            u.display_name AS owner_name,
            COALESCE(m.received_at, m.sent_at, m.created_at) AS sort_time
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
       JOIN users u ON u.id = mb.user_id
       ${where}
      ORDER BY sort_time DESC, m.id DESC
      LIMIT ?`,
  ).bind(...bindings, pagination.limit + 1).all<AdminSummaryRow>()
  const result = pageResult(results, pagination.limit, (row) => [row.sort_time, row.id])
  return json({
    messages: result.items.map(adminSummary),
    page: result.page,
  })
}

async function adminMessage(env: Env, messageId: string): Promise<AdminMessageRow | null> {
  return env.DB.prepare(
    `SELECT m.*, mb.user_id AS owner_user_id, u.email AS owner_email,
            u.display_name AS owner_name
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
       JOIN users u ON u.id = mb.user_id
      WHERE m.id = ?`,
  ).bind(messageId).first<AdminMessageRow>()
}

export async function getAdminMessageDetail(
  env: Env,
  user: SessionUser,
  messageId: string,
  ip: string,
): Promise<Response> {
  const denied = requireSuperAdmin(user)
  if (denied) return denied
  const message = await adminMessage(env, messageId)
  if (!message) return json({ error: '邮件不存在。' }, 404)

  let body: StoredBody = { text: '', html: '' }
  if (message.body_key) {
    const object = await env.MAIL_BUCKET.get(message.body_key)
    if (object) body = await object.json<StoredBody>()
  }
  const { results: attachments } = await env.DB.prepare(
    `SELECT id, message_id, filename, content_type, size, r2_key, content_id, disposition
       FROM attachments WHERE message_id = ? ORDER BY id`,
  ).bind(message.id).all<AttachmentRow>()
  await writeAudit(env, user.id, 'message.admin_view', message.id, ip, {
    ownerUserId: message.owner_user_id,
    mailboxAddress: message.delivered_to || message.mailbox_address,
  })
  const summary = adminSummary(message)
  return json({
    message: {
      ...summary,
      messageId: message.message_id,
      inReplyTo: message.in_reply_to,
      references: message.references_header,
      cc: safeJsonArray(message.cc_json),
      text: body.text,
      html: body.html,
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.content_type,
        size: attachment.size,
        contentId: attachment.content_id,
        disposition: attachment.disposition,
      })),
    },
    thread: [summary],
  })
}

type AdminAttachmentRow = AttachmentRow & {
  owner_user_id: string
  mailbox_address: string
}

async function adminAttachment(
  env: Env,
  messageId: string,
  attachmentId: string,
): Promise<AdminAttachmentRow | null> {
  return env.DB.prepare(
    `SELECT a.id, a.message_id, a.filename, a.content_type, a.size, a.r2_key,
            a.content_id, a.disposition, mb.user_id AS owner_user_id,
            COALESCE(m.delivered_to, m.mailbox_address) AS mailbox_address
       FROM attachments a
       JOIN messages m ON m.id = a.message_id
       JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE a.id = ? AND a.message_id = ?`,
  ).bind(attachmentId, messageId).first<AdminAttachmentRow>()
}

export async function getAdminMessageAttachment(
  env: Env,
  user: SessionUser,
  messageId: string,
  attachmentId: string,
  preview: boolean,
  ip: string,
): Promise<Response> {
  const denied = requireSuperAdmin(user)
  if (denied) return denied
  const row = await adminAttachment(env, messageId, attachmentId)
  if (!row) return json({ error: '附件不存在。' }, 404)
  const contentType = row.content_type.split(';', 1)[0].trim().toLowerCase()
  if (preview && !PREVIEWABLE_ATTACHMENT_TYPES.has(contentType)) {
    return json({ error: '此附件类型不支持预览。' }, 415)
  }
  const object = await env.MAIL_BUCKET.get(row.r2_key)
  if (!object) return json({ error: '附件文件不存在。' }, 404)
  await writeAudit(env, user.id, 'message.admin_download', messageId, ip, {
    ownerUserId: row.owner_user_id,
    mailboxAddress: row.mailbox_address,
    attachmentId: row.id,
    preview,
  })
  const headers: Record<string, string> = {
    'Content-Type': preview ? contentType : row.content_type || 'application/octet-stream',
    'Content-Length': String(row.size),
    'Content-Disposition': preview
      ? inlineDisposition(row.filename)
      : attachmentDisposition(row.filename),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (preview) {
    headers['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'self'"
    headers['X-Frame-Options'] = 'SAMEORIGIN'
  }
  return new Response(object.body, { headers })
}

export async function getAdminRawMessage(
  env: Env,
  user: SessionUser,
  messageId: string,
  ip: string,
): Promise<Response> {
  const denied = requireSuperAdmin(user)
  if (denied) return denied
  const message = await adminMessage(env, messageId)
  if (!message?.raw_key) return json({ error: '原始邮件不存在。' }, 404)
  const object = await env.MAIL_BUCKET.get(message.raw_key)
  if (!object) return json({ error: '原始邮件不存在。' }, 404)
  await writeAudit(env, user.id, 'message.admin_download', message.id, ip, {
    ownerUserId: message.owner_user_id,
    mailboxAddress: message.delivered_to || message.mailbox_address,
    raw: true,
  })
  return new Response(object.body, {
    headers: {
      'Content-Type': 'message/rfc822',
      'Content-Disposition': attachmentDisposition(`${message.subject || 'message'}.eml`),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function parseAdminAction(value: unknown): { ids: string[]; action: AdminMessageAction } | null {
  if (!value || typeof value !== 'object') return null
  const input = value as { ids?: unknown; action?: unknown }
  if (!Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 50) return null
  if (typeof input.action !== 'string' || !actions.has(input.action as AdminMessageAction)) return null
  const ids = [...new Set(input.ids)]
  if (ids.some((id) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) {
    return null
  }
  return { ids: ids as string[], action: input.action as AdminMessageAction }
}

export async function manageAdminMessages(
  env: Env,
  user: SessionUser,
  request: Request,
  ip: string,
): Promise<Response> {
  const denied = requireSuperAdmin(user)
  if (denied) return denied
  const input = parseAdminAction(await request.json().catch(() => null))
  if (!input) return json({ error: '邮件管理参数无效，单次最多选择 50 封邮件。' }, 400)

  const marks = placeholders(input.ids.length)
  const { results } = await env.DB.prepare(
    `SELECT m.*, mb.user_id AS owner_user_id, u.email AS owner_email,
            u.display_name AS owner_name
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
       JOIN users u ON u.id = mb.user_id
      WHERE m.id IN (${marks})`,
  ).bind(...input.ids).all<AdminMessageRow>()
  let updatedCount = 0
  if (input.action === 'delete') {
    for (const message of results.filter((item) => item.folder === 'trash')) {
      if (await permanentlyDeleteMessage(env, message.owner_user_id, message)) {
        updatedCount += 1
      }
    }
  } else {
    let sql = ''
    let leadingBindings: Array<string | number> = []
    if (input.action === 'trash') {
      const now = Math.floor(Date.now() / 1000)
      const { trashRetentionDays } = await retentionValues(env.DB)
      sql = `UPDATE messages
        SET folder = 'trash', trashed_at = COALESCE(trashed_at, ?),
            purge_after = COALESCE(trashed_at, ?) + ?, updated_at = unixepoch()
        WHERE id IN (${marks}) AND folder != 'trash'`
      leadingBindings = [now, now, trashRetentionDays * 86400]
    } else {
      sql = `UPDATE messages
        SET folder = CASE direction WHEN 'outgoing' THEN 'sent' ELSE 'inbox' END,
            trashed_at = NULL, purge_after = NULL, updated_at = unixepoch()
        WHERE id IN (${marks}) AND folder = 'trash'`
    }
    const update = await env.DB.prepare(sql).bind(...leadingBindings, ...input.ids).run()
    updatedCount = Number(update.meta.changes || 0)
  }
  await writeAudit(env, user.id, `message.admin_${input.action}`, null, ip, {
    requestedCount: input.ids.length,
    updatedCount,
    ownerCount: new Set(results.map((message) => message.owner_user_id)).size,
  })
  return json({ ok: true, updatedCount })
}
