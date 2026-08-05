import { normalizeEmail, validEmail } from './api-helpers'
import { sendOutboundMessage } from './outbound-message'
import { outboundProviderConfigError, outboundProviderForAddress } from './outbound-provider-config'
import type { Env, SessionUser } from './types'

export type NewMessageInput = {
  mailboxAddress?: string
  to?: string
  subject?: string
  text?: string
  idempotencyKey?: string
}

export type ValidNewMessage = {
  mailboxAddress: string
  to: string
  subject: string
  text: string
  idempotencyKey: string
}

export type NewMessageValidation =
  | { value: ValidNewMessage; error?: never }
  | { value?: never; error: string }

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

export function validateNewMessage(input: NewMessageInput): NewMessageValidation {
  const mailboxAddress = normalizeEmail(input.mailboxAddress || '')
  const to = normalizeEmail(input.to || '')
  const subject = input.subject?.trim() || ''
  const text = input.text?.trim() || ''
  const idempotencyKey = input.idempotencyKey?.trim() || ''
  if (!validEmail(mailboxAddress)) return { error: '发件邮箱格式无效。' }
  if (!validEmail(to)) return { error: '请输入有效的收件邮箱地址。' }
  if (!subject || subject.length > 500 || /[\r\n]/.test(subject)) {
    return { error: '邮件主题需要在 1–500 个字符之间。' }
  }
  if (!text || text.length > 50_000) {
    return { error: '邮件正文需要在 1–50,000 个字符之间。' }
  }
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) {
    return { error: '无效的请求标识。' }
  }
  return { value: { mailboxAddress, to, subject, text, idempotencyKey } }
}

export async function sendMessage(
  env: Env,
  user: SessionUser,
  input: NewMessageInput,
  ip: string,
): Promise<Response> {
  if (user.role !== 'super_admin' && !user.canReply) {
    return json({ error: '当前账户没有发信权限。' }, 403)
  }
  const validated = validateNewMessage(input)
  if ('error' in validated) return json({ error: validated.error }, 400)
  const message = validated.value
  const domain = message.mailboxAddress.slice(message.mailboxAddress.lastIndexOf('@') + 1)
  const mailbox = await env.DB.prepare(
    `SELECT address FROM mailboxes
      WHERE address = ? AND user_id = ? AND is_active = 1 AND is_hidden = 0
        AND EXISTS (
          SELECT 1 FROM domains d WHERE d.name = ? AND d.is_active = 1
        )`,
  ).bind(message.mailboxAddress, user.id, domain).first<{ address: string }>()
  if (!mailbox) return json({ error: '发件邮箱不存在或已停用。' }, 404)
  const configError = outboundProviderConfigError(env)
  if (configError) return json({ error: configError }, 503)
  if (!outboundProviderForAddress(env, mailbox.address)) {
    return json({ error: '该发件域名尚未配置发信服务。' }, 503)
  }

  return sendOutboundMessage(env, user, {
    mailboxAddress: mailbox.address,
    recipients: [message.to],
    subject: message.subject,
    text: message.text,
    idempotencyKey: message.idempotencyKey,
    auditAction: 'message.send',
    auditDetail: { recipient: message.to },
  }, ip)
}
