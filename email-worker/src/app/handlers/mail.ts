import PostalMime from 'postal-mime'
import { archiveIncomingMessage } from '../../features/messages/mail-archive'
import { indexStoredMessage, messageSearchStatement } from '../../shared/mail/message-search'
import { releaseStorage, reserveStorage } from '../../features/messages/message-storage'
import {
  deliverOutboundMessage,
  OutboundDeliveryError,
  OutboundProviderAcceptedError,
} from '../../features/outbound/outbound-message'
import { ensureSchema } from '../../platform/d1/schema'
import { consumeGmailSyncJob } from '../../features/gmail/gmail-sync'
import { consumeMicrosoftSyncJob } from '../../features/microsoft/microsoft-sync'
import { consumeQqMailSyncJob } from '../../features/qq-mail/qq-mail-sync'
import { consumeNaverMailSyncJob } from '../../features/naver-mail/naver-mail-sync'
import { consumeYandexMailSyncJob } from '../../features/yandex-mail/yandex-mail-sync'
import { consumeExternalMailSyncJob } from '../../features/external-mail/external-mail-sync'
import type { Env, MailQueueJob, MessageRow, ParseJob, StoredBody } from '../types'

type ParsedAddress = {
  address?: string
  name?: string
}

const UNASSIGNED_MAILBOX = '__unassigned__@omnimail.invalid'
export const MAX_INBOUND_MESSAGE_BYTES = 20 * 1024 * 1024

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase()
}

export function baseMailboxAddress(value: string): string {
  const normalized = normalizeAddress(value)
  const at = normalized.lastIndexOf('@')
  if (at < 1) return normalized
  const local = normalized.slice(0, at)
  const plus = local.indexOf('+')
  return plus > 0 ? `${local.slice(0, plus)}${normalized.slice(at)}` : normalized
}

export function replySubject(subject: string): string {
  const clean = subject.trim() || '无主题'
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`
}

export function textPreview(value: string, maximum = 180): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > maximum ? `${clean.slice(0, maximum - 1)}…` : clean
}

export function textToHtml(value: string): string {
  const escaped = value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll('\n', '<br>')}</p>`)
    .join('')
}

export function queueFailureStatus(attempts: number): 'processing' | 'failed' {
  return attempts >= 3 ? 'failed' : 'processing'
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function addressValue(address: ParsedAddress | undefined): string {
  return normalizeAddress(address?.address ?? '')
}

function addressName(address: ParsedAddress | undefined): string {
  return address?.name?.trim() ?? ''
}

function addressList(addresses: ParsedAddress[] | undefined): string[] {
  return (addresses ?? []).map(addressValue).filter(Boolean)
}

function referenceValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string').join(' ')
  return typeof value === 'string' ? value : ''
}

export async function mailboxForRecipient(
  env: Env,
  recipient: string,
): Promise<{ address: string; userId: string; deliveredTo: string | null } | null> {
  const exact = normalizeAddress(recipient)
  const base = baseMailboxAddress(recipient)
  const at = exact.lastIndexOf('@')
  const domain = at > 0 ? exact.slice(at + 1) : ''
  const row = await env.DB.prepare(
    `SELECT mb.address, mb.user_id
       FROM mailboxes mb
       JOIN users u ON u.id = mb.user_id
      WHERE mb.is_active = 1
        AND mb.is_hidden = 0
        AND mb.address IN (?, ?)
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM domains d WHERE d.name = ? AND d.is_active = 1
        )
      ORDER BY CASE WHEN mb.address = ? THEN 0 ELSE 1 END
      LIMIT 1`,
  ).bind(exact, base, domain, exact).first<{ address: string; user_id: string }>()
  if (row) return { address: row.address, userId: row.user_id, deliveredTo: null }

  const ownerEmail = normalizeAddress(env.SUPER_ADMIN_EMAIL || '')
  if (!domain || !ownerEmail) return null
  const catchAllOwner = await env.DB.prepare(
    `SELECT u.id
       FROM users u
      WHERE u.email = ?
        AND u.status = 'active'
        AND u.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM domains d WHERE d.name = ? AND d.is_active = 1
        )
        AND EXISTS (
          SELECT 1 FROM settings s
           WHERE s.key = 'unassigned_mail_enabled' AND s.value = '1'
        )`,
  ).bind(ownerEmail, domain).first<{ id: string }>()
  if (!catchAllOwner) return null
  await env.DB.prepare(
    `INSERT INTO mailboxes (
       address, user_id, is_primary, is_active, is_hidden
     ) VALUES (?, ?, 0, 1, 1)
     ON CONFLICT(address) DO UPDATE SET
       user_id = excluded.user_id, is_active = 1
     WHERE mailboxes.is_hidden = 1`,
  ).bind(UNASSIGNED_MAILBOX, catchAllOwner.id).run()
  return {
    address: UNASSIGNED_MAILBOX,
    userId: catchAllOwner.id,
    deliveredTo: exact,
  }
}

export async function receiveEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  await ensureSchema(env.DB)
  if (message.rawSize > MAX_INBOUND_MESSAGE_BYTES) {
    message.setReject('Message exceeds the 20 MiB OmniMail limit')
    return
  }
  const mailbox = await mailboxForRecipient(env, message.to)
  if (!mailbox) {
    message.setReject('Mailbox unavailable')
    return
  }

  const id = crypto.randomUUID()
  const rawKey = `raw/${id}.eml`
  const now = Math.floor(Date.now() / 1000)
  const incomingMessageId = message.headers.get('message-id')?.trim() || null
  const subject = message.headers.get('subject')?.trim() || '无主题'

  if (incomingMessageId) {
    const duplicate = await env.DB.prepare(
      'SELECT id FROM messages WHERE mailbox_address = ? AND message_id = ?',
    ).bind(mailbox.address, incomingMessageId).first<{ id: string }>()
    if (duplicate) return
  }

  const quotaBytes = Math.max(0, message.rawSize)
  if (!await reserveStorage(env.DB, mailbox.userId, quotaBytes)) {
    message.setReject('Mailbox storage quota exceeded')
    return
  }

  let rawStored = false
  let inserted = false
  try {
    const raw = await new Response(message.raw).arrayBuffer()
    await env.MAIL_BUCKET.put(rawKey, raw, {
      httpMetadata: { contentType: 'message/rfc822' },
    })
    rawStored = true
    const insertResult = await env.DB.prepare(
      `INSERT OR IGNORE INTO messages (
        id, mailbox_address, direction, status, folder, message_id,
        sender_address, delivered_to, recipients_json, subject, received_at,
        raw_key, size, quota_bytes, stored_bytes
      ) VALUES (?, ?, 'incoming', 'processing', 'inbox', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      mailbox.address,
      incomingMessageId,
      normalizeAddress(message.from),
      mailbox.deliveredTo,
      JSON.stringify([normalizeAddress(message.to)]),
      subject,
      now,
      rawKey,
      message.rawSize,
      quotaBytes,
      quotaBytes,
    ).run()

    if (!insertResult.meta.changes) {
      await env.MAIL_BUCKET.delete(rawKey)
      await releaseStorage(env.DB, mailbox.userId, quotaBytes)
      return
    }
    inserted = true
    try {
      await archiveIncomingMessage(env, id, raw, now)
    } catch (error) {
      console.error('Unable to archive incoming message', error)
    }

    await env.MAIL_QUEUE.send({ kind: 'parse', messageId: id })
  } catch (error) {
    if (inserted) {
      await env.DB.prepare(
        `UPDATE messages
            SET status = 'failed', processing_error = ?, last_failed_at = unixepoch(),
                updated_at = unixepoch()
          WHERE id = ?`,
      ).bind(error instanceof Error ? error.message : 'Unable to queue message', id).run()
    } else {
      if (rawStored) await env.MAIL_BUCKET.delete(rawKey)
      await releaseStorage(env.DB, mailbox.userId, quotaBytes)
    }
    throw error
  }
}

export async function parseMessage(job: ParseJob, env: Env): Promise<void> {
  const record = await env.DB.prepare(
    'SELECT * FROM messages WHERE id = ?',
  ).bind(job.messageId).first<MessageRow>()
  if (!record || record.status === 'ready' || record.status === 'sent') return
  if (!record.raw_key) throw new Error('Raw message key is missing')

  const raw = await env.MAIL_BUCKET.get(record.raw_key)
  if (!raw) throw new Error('Raw message object is missing')

  const parsed = await PostalMime.parse(await raw.arrayBuffer())
  const text = parsed.text?.trim() || stripHtml(parsed.html ?? '').replace(/\s+/g, ' ').trim()
  const html = parsed.html?.trim() ?? ''
  const bodyKey = `bodies/${record.id}.json`
  const body: StoredBody = { text, html }
  const storedBody = JSON.stringify(body)
  const bodyBytes = new TextEncoder().encode(storedBody).byteLength
  const writtenKeys: string[] = []
  try {
    await env.MAIL_BUCKET.put(bodyKey, storedBody, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    })
    writtenKeys.push(bodyKey)

    let attachmentBytes = 0
    const attachmentStatements: D1PreparedStatement[] = [
      env.DB.prepare('DELETE FROM attachments WHERE message_id = ?').bind(record.id),
    ]
    for (const [index, attachment] of (parsed.attachments ?? []).entries()) {
      const attachmentId = `${record.id}-${index}`
      const attachmentKey = `attachments/${record.id}/${index}`
      const attachmentSize = typeof attachment.content === 'string'
        ? new TextEncoder().encode(attachment.content).byteLength
        : attachment.content.byteLength
      await env.MAIL_BUCKET.put(attachmentKey, attachment.content, {
        httpMetadata: {
          contentType: attachment.mimeType || 'application/octet-stream',
        },
      })
      writtenKeys.push(attachmentKey)
      attachmentBytes += attachmentSize
      attachmentStatements.push(env.DB.prepare(
        `INSERT INTO attachments (
          id, message_id, filename, content_type, size, r2_key, content_id, disposition
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        attachmentId,
        record.id,
        attachment.filename || `附件-${index + 1}`,
        attachment.mimeType || 'application/octet-stream',
        attachmentSize,
        attachmentKey,
        attachment.contentId || null,
        attachment.disposition || 'attachment',
      ))
    }

    const parsedDate = parsed.date ? Math.floor(new Date(parsed.date).getTime() / 1000) : NaN
    const sender = addressValue(parsed.from) || record.sender_address
    const senderDisplayName = addressName(parsed.from)
    const subject = parsed.subject?.trim() || record.subject || '无主题'
    const references = referenceValue(parsed.references)
    const storedBytes = Math.max(0, record.size) + bodyBytes + attachmentBytes

    attachmentStatements.push(env.DB.prepare(
      `UPDATE messages SET
         status = 'ready',
         message_id = COALESCE(?, message_id),
         in_reply_to = ?,
         references_header = ?,
         sender_name = ?,
         sender_address = ?,
         recipients_json = ?,
         cc_json = ?,
         reply_to_json = ?,
         subject = ?,
         preview = ?,
         received_at = ?,
         body_key = ?,
         stored_bytes = ?,
         attachment_count = ?,
         has_html = ?,
         processing_error = NULL,
         updated_at = unixepoch()
       WHERE id = ?`,
    ).bind(
      parsed.messageId?.trim() || null,
      parsed.inReplyTo?.trim() || null,
      references || null,
      senderDisplayName || null,
      sender,
      JSON.stringify(addressList(parsed.to)),
      JSON.stringify(addressList(parsed.cc)),
      JSON.stringify(addressList(parsed.replyTo)),
      subject,
      textPreview(text || subject),
      Number.isFinite(parsedDate) ? parsedDate : record.received_at,
      bodyKey,
      storedBytes,
      parsed.attachments?.length ?? 0,
      html ? 1 : 0,
      record.id,
    ))
    attachmentStatements.push(messageSearchStatement(env.DB, record.id, {
      subject,
      sender,
      recipients: [
        ...addressList(parsed.to),
        ...addressList(parsed.cc),
      ],
      body: text,
    }))

    await env.DB.batch(attachmentStatements)
  } catch (error) {
    if (writtenKeys.length) {
      try {
        await env.MAIL_BUCKET.delete(writtenKeys)
      } catch (cleanupError) {
        console.error('Unable to remove objects from failed message parse', cleanupError)
      }
    }
    throw error
  }
}

async function consumeOutboundJob(
  message: Message<MailQueueJob>,
  env: Env,
): Promise<void> {
  if (message.body.kind !== 'outbound') return
  try {
    await deliverOutboundMessage(env, message.body)
    message.ack()
  } catch (error) {
    if (error instanceof OutboundProviderAcceptedError) {
      try {
        await env.DB.prepare(
          `UPDATE messages SET status = 'sent', provider_id = ?, delivery_status = 'sent',
              processing_error = NULL, updated_at = unixepoch() WHERE id = ?`,
        ).bind(error.providerId, message.body.messageId).run()
      } catch (recordError) {
        console.error('Provider accepted outbound mail but D1 could not record it', recordError)
      }
      message.ack()
      return
    }
    const detail = error instanceof Error ? error.message : 'Unable to deliver outbound message'
    const retryable = !(error instanceof OutboundDeliveryError) || error.retryable
    await env.DB.prepare(
      `UPDATE messages
          SET status = ?, processing_error = ?,
              processing_attempts = processing_attempts + 1,
              last_failed_at = unixepoch(), updated_at = unixepoch()
        WHERE id = ?`,
    ).bind(
      retryable ? queueFailureStatus(message.attempts) : 'failed',
      detail.slice(0, 500),
      message.body.messageId,
    ).run()
    if (retryable) {
      message.retry({ delaySeconds: Math.min(300, 30 * 2 ** Math.max(0, message.attempts - 1)) })
    } else {
      message.ack()
    }
  }
}

async function consumeSearchIndexJob(
  message: Message<MailQueueJob>,
  env: Env,
): Promise<void> {
  if (message.body.kind !== 'index') return
  try {
    await indexStoredMessage(env, message.body.messageId)
    message.ack()
  } catch {
    message.retry({ delaySeconds: 30 })
  }
}

export async function consumeEmailQueue(batch: MessageBatch<MailQueueJob>, env: Env): Promise<void> {
  await ensureSchema(env.DB)
  for (const message of batch.messages) {
    if (message.body.kind === 'gmail-sync') {
      await consumeGmailSyncJob(message, env)
      continue
    }
    if (message.body.kind === 'microsoft-sync') {
      await consumeMicrosoftSyncJob(message, env)
      continue
    }
    if (message.body.kind === 'qq-mail-sync') {
      await consumeQqMailSyncJob(message, env)
      continue
    }
    if (message.body.kind === 'naver-mail-sync') {
      await consumeNaverMailSyncJob(message, env)
      continue
    }
    if (message.body.kind === 'yandex-mail-sync') {
      await consumeYandexMailSyncJob(message, env)
      continue
    }
    if (message.body.kind === 'icloud-sync' || message.body.kind === 'linuxdo-mail-sync') {
      await consumeExternalMailSyncJob(message, env)
      continue
    }
    if (message.body.kind === 'outbound') {
      await consumeOutboundJob(message, env)
      continue
    }
    if (message.body.kind === 'index') {
      await consumeSearchIndexJob(message, env)
      continue
    }
    try {
      await parseMessage(message.body as ParseJob, env)
      message.ack()
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to parse message'
      await env.DB.prepare(
        `UPDATE messages
            SET status = ?, processing_error = ?,
                processing_attempts = processing_attempts + 1,
                last_failed_at = unixepoch(), updated_at = unixepoch()
          WHERE id = ?`,
      ).bind(
        queueFailureStatus(message.attempts),
        detail.slice(0, 500),
        (message.body as ParseJob).messageId,
      ).run()
      message.retry({ delaySeconds: 30 })
    }
  }
}
