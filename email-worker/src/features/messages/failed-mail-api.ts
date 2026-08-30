import { writeAudit } from '../../shared/audit/audit'
import { outboundProviderConfigError, outboundProviderForAddress } from '../outbound/outbound-provider-config'
import { DELIVERY_UNCERTAIN_PREFIX } from '../outbound/outbound-message'
import type { Env, SessionUser } from '../../app/types'

interface FailedMessageRow {
  id: string
  mailbox_address: string
  sender_name: string | null
  sender_address: string
  subject: string
  processing_error: string | null
  processing_attempts: number
  last_failed_at: number | null
  updated_at: number
  size: number
  raw_key: string | null
  body_key: string | null
}

function isAdministrator(user: SessionUser): boolean {
  return user.role === 'super_admin' || user.role === 'admin'
}

export function failedMessageSummary(row: FailedMessageRow) {
  return {
    id: row.id,
    mailboxAddress: row.mailbox_address,
    senderName: row.sender_name || '',
    senderAddress: row.sender_address,
    subject: row.subject || '无主题',
    error: row.processing_error || '未知处理错误',
    attempts: Number(row.processing_attempts || 0),
    lastFailedAt: (row.last_failed_at || row.updated_at) * 1000,
    size: Number(row.size || 0),
    canRetry: Boolean(row.raw_key || row.body_key)
      && !row.processing_error?.startsWith(DELIVERY_UNCERTAIN_PREFIX),
  }
}

export async function listFailedMessages(env: Env, user: SessionUser): Promise<Response> {
  if (!isAdministrator(user)) {
    return Response.json({ error: '只有管理员可以查看失败邮件。' }, { status: 403 })
  }
  const [messagesResult, total] = await Promise.all([
    env.DB.prepare(
      `SELECT id, mailbox_address, sender_name, sender_address, subject,
              processing_error, processing_attempts, last_failed_at,
              updated_at, size, raw_key, body_key
         FROM messages
        WHERE status = 'failed'
        ORDER BY COALESCE(last_failed_at, updated_at) DESC, id DESC
        LIMIT 50`,
    ).all<FailedMessageRow>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM messages WHERE status = 'failed'",
    ).first<{ count: number }>(),
  ])
  return Response.json({
    messages: messagesResult.results.map(failedMessageSummary),
    total: Number(total?.count || 0),
  })
}

export async function retryFailedMessage(
  env: Env,
  user: SessionUser,
  messageId: string,
  ip: string,
): Promise<Response> {
  if (!isAdministrator(user)) {
    return Response.json({ error: '只有管理员可以重试失败邮件。' }, { status: 403 })
  }
  const message = await env.DB.prepare(
    `SELECT m.id, m.mailbox_address, m.direction, m.raw_key, m.body_key, m.in_reply_to,
            m.recipients_json, m.processing_error, mb.user_id, mb.is_hidden
       FROM messages m
       JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE m.id = ? AND m.status = 'failed'`,
  ).bind(messageId).first<{
    id: string
    mailbox_address: string
    direction: 'incoming' | 'outgoing'
    raw_key: string | null
    body_key: string | null
    in_reply_to: string | null
    recipients_json: string
    user_id: string
    is_hidden: number
    processing_error: string | null
  }>()
  if (!message) return Response.json({ error: '失败邮件不存在或已被处理。' }, { status: 404 })
  const objectKey = message.direction === 'outgoing' ? message.body_key : message.raw_key
  if (!objectKey || !await env.MAIL_BUCKET.head(objectKey)) {
    return Response.json({ error: '邮件存档不存在，无法重新处理。' }, { status: 409 })
  }
  const linuxDoAccount = message.is_hidden ? await env.DB.prepare(
    `SELECT 1 AS found FROM linux_do_mail_accounts
      WHERE user_id = ? AND username = ? LIMIT 1`,
  ).bind(message.user_id, message.mailbox_address).first<{ found: number }>() : null
  if (message.direction === 'outgoing' && message.is_hidden && !linuxDoAccount) {
    return Response.json({ error: 'Linux DO Mail 账号已断开，无法重新发送。' }, { status: 409 })
  }
  const configError = message.direction === 'outgoing' && !message.is_hidden
    ? outboundProviderConfigError(env)
    : null
  if (configError) return Response.json({ error: configError }, { status: 503 })
  if (message.direction === 'outgoing' && !message.is_hidden
    && !outboundProviderForAddress(env, message.mailbox_address)) {
    return Response.json({ error: '该发件域名尚未配置发信服务。' }, { status: 503 })
  }
  if (message.processing_error?.startsWith(DELIVERY_UNCERTAIN_PREFIX)) {
    return Response.json({ error: '这封邮件的投递结果不确定，已禁止自动重发。' }, { status: 409 })
  }

  const claimed = await env.DB.prepare(
      `UPDATE messages
        SET status = 'processing', processing_error = NULL,
            delivery_status = CASE WHEN direction = 'outgoing' THEN 'queued' ELSE delivery_status END,
            updated_at = unixepoch()
      WHERE id = ? AND status = 'failed'
        AND (processing_error IS NULL OR processing_error NOT LIKE ?)`,
  ).bind(message.id, `${DELIVERY_UNCERTAIN_PREFIX}%`).run()
  if (!claimed.meta.changes) {
    return Response.json({ error: '这封邮件已经被其他请求处理。' }, { status: 409 })
  }
  try {
    await env.MAIL_QUEUE.send(message.direction === 'outgoing' ? {
      kind: 'outbound',
      messageId: message.id,
      userId: message.user_id,
      ip,
      auditAction: message.in_reply_to ? 'message.reply' : 'message.send',
      auditDetail: { recipients: JSON.parse(message.recipients_json) },
    } : { kind: 'parse', messageId: message.id })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unable to queue retry'
    await env.DB.prepare(
      `UPDATE messages SET status = 'failed', processing_error = ?,
          last_failed_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`,
    ).bind(detail.slice(0, 500), message.id).run()
    return Response.json({ error: '重新提交失败，请稍后再试。' }, { status: 503 })
  }
  await writeAudit(env, user.id, 'message.retry', message.id, ip, {})
  return Response.json({ ok: true })
}
