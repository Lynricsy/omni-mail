import { safeJsonArray, validEmail } from '../../shared/http/api-helpers'
import { attachmentFilesError, normalizeAttachmentFilename } from '../../shared/mail/attachment-policy'
import { replySubject } from '../../app/handlers/mail'
import { sendOutboundMessage, type OutboundAttachmentUpload } from '../outbound/outbound-message'
import { outboundProviderConfigError, outboundProviderForAddress } from '../outbound/outbound-provider-config'
import { resendConfigForAddress } from '../outbound/resend-config'
import type { Env, MessageRow, SessionUser } from '../../app/types'

type ReplyInput = {
  text?: string
  idempotencyKey?: string
  attachments?: Array<string | File>
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

async function ownedMessage(
  env: Env,
  userId: string,
  messageId: string,
): Promise<MessageRow | null> {
  return env.DB.prepare(
    `SELECT m.*
      FROM messages m
      JOIN mailboxes mb ON mb.address = m.mailbox_address
      WHERE m.id = ? AND mb.user_id = ?
        AND mb.is_active = 1 AND mb.is_hidden = 0
        AND EXISTS (
          SELECT 1 FROM domains d
           WHERE d.name = LOWER(SUBSTR(m.mailbox_address, INSTR(m.mailbox_address, '@') + 1))
             AND d.is_active = 1
        )`,
  ).bind(messageId, userId).first<MessageRow>()
}

async function replyInput(request: Request): Promise<ReplyInput> {
  if (request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
    const form = await request.formData().catch(() => null)
    if (!form) return {}
    const text = form.get('text')
    const idempotencyKey = form.get('idempotencyKey')
    return {
      text: typeof text === 'string' ? text : undefined,
      idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      attachments: form.getAll('attachments'),
    }
  }
  return request.json<ReplyInput>().catch(() => ({}))
}

export async function sendReply(
  env: Env,
  user: SessionUser,
  messageId: string,
  request: Request,
  ip: string,
): Promise<Response> {
  if (user.role !== 'super_admin' && !user.canReply) {
    return json({ error: '当前账户没有回信权限。' }, 403)
  }
  const input = await replyInput(request)
  const text = input.text?.trim() || ''
  const idempotencyKey = input.idempotencyKey?.trim() || ''
  if (!text || text.length > 50_000) {
    return json({ error: '回复内容需要在 1–50,000 个字符之间。' }, 400)
  }
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) {
    return json({ error: '无效的请求标识。' }, 400)
  }
  const entries = input.attachments ?? []
  if (entries.some((entry) => !(entry instanceof File))) {
    return json({ error: '请选择要上传的附件。' }, 400)
  }
  const files = entries as File[]
  const attachmentError = attachmentFilesError(files)
  if (attachmentError) return json({ error: attachmentError }, 400)

  const original = await ownedMessage(env, user.id, messageId)
  if (!original) return json({ error: '邮件不存在。' }, 404)
  if (original.delivered_to) {
    return json({ error: '无人收件邮件不能直接回复。' }, 409)
  }
  if (original.direction !== 'incoming' || !validEmail(original.sender_address)) {
    return json({ error: '这封邮件无法回复。' }, 409)
  }
  const configError = outboundProviderConfigError(env)
  if (configError) return json({ error: configError }, 503)
  const provider = outboundProviderForAddress(env, original.mailbox_address)
  if (!provider) {
    return json({ error: '该发件域名尚未配置发信服务。' }, 503)
  }
  if (files.length && provider.provider === 'sendflare'
    && !resendConfigForAddress(env, original.mailbox_address)) {
    return json({ error: 'SendFlare 暂不支持附件，请为该域名配置 Resend 后重试。' }, 503)
  }

  const references = [original.references_header, original.message_id]
    .filter(Boolean)
    .join(' ')
  const replyTo = safeJsonArray(original.reply_to_json).find(validEmail)
    || original.sender_address
  const attachmentUploads: OutboundAttachmentUpload[] = files.map((file) => ({
    id: crypto.randomUUID(),
    filename: normalizeAttachmentFilename(file.name),
    contentType: file.type && file.type.length <= 100 && !/[\r\n]/.test(file.type)
      ? file.type
      : 'application/octet-stream',
    size: file.size,
    body: file,
  }))
  return sendOutboundMessage(env, user, {
    mailboxAddress: original.mailbox_address,
    recipients: [replyTo],
    subject: replySubject(original.subject),
    text,
    idempotencyKey,
    inReplyTo: original.message_id,
    references,
    attachmentUploads,
    auditAction: 'message.reply',
    auditDetail: { originalId: original.id, attachmentCount: attachmentUploads.length },
  }, ip)
}
