import { attachmentDisposition, inlineDisposition, safeJsonArray } from '../../shared/http/api-helpers'
import { writeAudit } from '../../shared/audit/audit'
import { messageSummary } from './message-list-api'
import { listMessageThread } from './message-thread'
import { permanentlyDeleteMessage } from './message-storage'
import { retentionValues } from '../admin/settings/storage-policy'
import type { AttachmentRow, Env, MessageRow, SessionUser, StoredBody } from '../../app/types'

async function ownedMessage(
  env: Env,
  userId: string,
  messageId: string,
): Promise<MessageRow | null> {
  return env.DB.prepare(
    `SELECT m.*
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE m.id = ? AND mb.user_id = ?`,
  ).bind(messageId, userId).first<MessageRow>()
}

export async function getMessageDetail(
  env: Env,
  user: SessionUser,
  messageId: string,
): Promise<Response> {
  const message = await ownedMessage(env, user.id, messageId)
  if (!message) return Response.json({ error: '邮件不存在。' }, { status: 404 })

  let body: StoredBody = { text: '', html: '' }
  if (message.body_key) {
    const object = await env.MAIL_BUCKET.get(message.body_key)
    if (object) body = await object.json<StoredBody>()
  }
  const { results: attachments } = await env.DB.prepare(
    `SELECT id, message_id, filename, content_type, size, r2_key, content_id, disposition
       FROM attachments WHERE message_id = ? ORDER BY id`,
  ).bind(message.id).all<AttachmentRow>()
  const summary = messageSummary(message)
  let thread = [summary]
  try {
    thread = await listMessageThread(env, user, message)
  } catch (error) {
    console.error('Unable to load message thread', { messageId: message.id }, error)
  }

  return Response.json({
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
    thread,
  })
}

export async function updateMessage(
  env: Env,
  user: SessionUser,
  messageId: string,
  request: Request,
): Promise<Response> {
  const message = await ownedMessage(env, user.id, messageId)
  if (!message) return Response.json({ error: '邮件不存在。' }, { status: 404 })
  const body = await request.json<{
    isRead?: boolean
    isStarred?: boolean
    folder?: 'inbox' | 'sent' | 'trash'
  }>().catch(() => ({} as {
    isRead?: boolean
    isStarred?: boolean
    folder?: 'inbox' | 'sent' | 'trash'
  }))
  const allowedFolder = body.folder && ['inbox', 'sent', 'trash'].includes(body.folder)
    ? body.folder
    : message.folder
  const now = Math.floor(Date.now() / 1000)
  const movingToTrash = allowedFolder === 'trash'
  const trashDays = movingToTrash
    ? (await retentionValues(env.DB)).trashRetentionDays
    : 0
  const trashedAt = movingToTrash ? message.trashed_at ?? now : null
  const purgeAfter = movingToTrash ? trashedAt! + trashDays * 24 * 60 * 60 : null

  await env.DB.prepare(
    `UPDATE messages
        SET is_read = ?, is_starred = ?, folder = ?,
            trashed_at = ?, purge_after = ?, updated_at = unixepoch()
      WHERE id = ?`,
  ).bind(
    typeof body.isRead === 'boolean' ? Number(body.isRead) : message.is_read,
    typeof body.isStarred === 'boolean' ? Number(body.isStarred) : message.is_starred,
    allowedFolder,
    trashedAt,
    purgeAfter,
    message.id,
  ).run()
  return Response.json({ ok: true })
}

export async function deleteMessage(
  env: Env,
  user: SessionUser,
  messageId: string,
  ip: string,
): Promise<Response> {
  const message = await ownedMessage(env, user.id, messageId)
  if (!message) return Response.json({ error: '邮件不存在。' }, { status: 404 })
  if (message.folder !== 'trash') {
    return Response.json({ error: '请先将邮件移入垃圾箱。' }, { status: 409 })
  }

  await permanentlyDeleteMessage(env, user.id, message)
  await writeAudit(env, user.id, 'message.delete', message.id, ip)
  return Response.json({ ok: true })
}

const PREVIEWABLE_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

function previewableAttachmentType(contentType: string): string | null {
  const normalized = contentType.split(';', 1)[0].trim().toLowerCase()
  return PREVIEWABLE_ATTACHMENT_TYPES.has(normalized) ? normalized : null
}

async function ownedAttachment(
  env: Env,
  userId: string,
  messageId: string,
  attachmentId: string,
): Promise<AttachmentRow | null> {
  return env.DB.prepare(
    `SELECT a.id, a.message_id, a.filename, a.content_type, a.size, a.r2_key, a.content_id, a.disposition
       FROM attachments a
       JOIN messages m ON m.id = a.message_id
       JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE a.id = ? AND a.message_id = ? AND mb.user_id = ?`,
  ).bind(attachmentId, messageId, userId).first<AttachmentRow>()
}

async function storedAttachmentResponse(
  env: Env,
  row: AttachmentRow,
  contentType: string,
  disposition: string,
  preview = false,
): Promise<Response> {
  const object = await env.MAIL_BUCKET.get(row.r2_key)
  if (!object) return Response.json({ error: '附件文件不存在。' }, { status: 404 })
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(row.size),
    'Content-Disposition': disposition,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  if (preview) {
    headers['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'self'"
    headers['X-Frame-Options'] = 'SAMEORIGIN'
  }
  return new Response(object.body, { headers })
}

export async function getMessageAttachment(
  env: Env,
  user: SessionUser,
  messageId: string,
  attachmentId: string,
): Promise<Response> {
  const row = await ownedAttachment(env, user.id, messageId, attachmentId)
  if (!row) return Response.json({ error: '附件不存在。' }, { status: 404 })

  return storedAttachmentResponse(
    env,
    row,
    row.content_type || 'application/octet-stream',
    attachmentDisposition(row.filename),
  )
}

export async function previewMessageAttachment(
  env: Env,
  user: SessionUser,
  messageId: string,
  attachmentId: string,
): Promise<Response> {
  const row = await ownedAttachment(env, user.id, messageId, attachmentId)
  if (!row) return Response.json({ error: '附件不存在。' }, { status: 404 })

  const contentType = previewableAttachmentType(row.content_type)
  if (!contentType) {
    return Response.json({ error: '此附件类型不支持预览。' }, { status: 415 })
  }
  return storedAttachmentResponse(
    env,
    row,
    contentType,
    inlineDisposition(row.filename),
    true,
  )
}

export async function getRawMessage(
  env: Env,
  user: SessionUser,
  messageId: string,
): Promise<Response> {
  const message = await ownedMessage(env, user.id, messageId)
  if (!message?.raw_key) {
    return Response.json({ error: '原始邮件不存在。' }, { status: 404 })
  }
  const object = await env.MAIL_BUCKET.get(message.raw_key)
  if (!object) return Response.json({ error: '原始邮件不存在。' }, { status: 404 })
  return new Response(object.body, {
    headers: {
      'Content-Type': 'message/rfc822',
      'Content-Disposition': attachmentDisposition(`${message.subject || 'message'}.eml`),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
