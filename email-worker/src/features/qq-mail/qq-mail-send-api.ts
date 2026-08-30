import { replySubject } from '../../app/handlers/mail'
import { validEmail } from '../../shared/http/api-helpers'
import { validateNewMessage } from '../messages/send-message'
import { sendOutboundMessage } from '../outbound/outbound-message'
import {
  qqMailIdentityEmailField,
  qqMailJsonBody,
  maskedQqMailEmail,
  qqMailResponseError,
  requireQqMailEnabled,
} from './qq-mail-api-shared'
import { QqMailAccountStore, QqMailStoreError } from './qq-mail-store'
import type { Env, SessionUser } from '../../app/types'

type ReplyRow = {
  sender_address: string
  subject: string
  message_id_header: string
}

async function replyContext(env: Env, userId: string, accountId: string,
  messageId: unknown): Promise<ReplyRow | null> {
  if (typeof messageId !== 'string' || !messageId) return null
  if (messageId.length > 100 || /[\r\n\0]/.test(messageId)) {
    throw new QqMailStoreError(400, '回复邮件标识无效。')
  }
  const row = await env.DB.prepare(
    `SELECT m.sender_address, m.subject, m.message_id_header
       FROM qq_mail_messages m
       JOIN qq_mail_accounts a ON a.id = m.account_id
      WHERE m.id = ? AND a.id = ? AND a.user_id = ? LIMIT 1`,
  ).bind(messageId, accountId, userId).first<ReplyRow>()
  if (!row) throw new QqMailStoreError(404, '要回复的 QQ 邮件不存在。')
  if (!validEmail(row.sender_address)) {
    throw new QqMailStoreError(409, '这封 QQ 邮件没有可用的回复地址。')
  }
  return row
}

export async function sendQqMailMessage(env: Env, user: SessionUser,
  accountId: string, request: Request, ip: string): Promise<Response> {
  try {
    requireQqMailEnabled(env)
    if (user.role !== 'super_admin' && !user.canReply) {
      throw new QqMailStoreError(403, '当前账户没有发信权限。')
    }
    const body = await qqMailJsonBody(request)
    const account = await new QqMailAccountStore(env, user.id).get(accountId)
    if (account.status === 'credential_error') {
      throw new QqMailStoreError(409, '请先更新失效的 QQ 邮箱授权码。')
    }
    const sender = body.sender === undefined
      ? account.email
      : qqMailIdentityEmailField(body.sender)
    const identity = account.identities.find(({ email }) => email === sender)
    if (!identity) {
      throw new QqMailStoreError(400, '请选择这个 QQ 邮箱账号中已验证的发信身份。')
    }
    const reply = await replyContext(env, user.id, accountId, body.replyToMessageId)
    const validated = validateNewMessage({
      mailboxAddress: identity.email,
      to: reply?.sender_address || (typeof body.to === 'string' ? body.to : ''),
      subject: reply ? replySubject(reply.subject) : typeof body.subject === 'string' ? body.subject : '',
      text: typeof body.text === 'string' ? body.text : '',
      idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '',
    })
    if ('error' in validated) {
      throw new QqMailStoreError(400, validated.error || '邮件内容无效。')
    }
    const mailbox = await env.DB.prepare(
      `SELECT 1 AS found FROM mailboxes
        WHERE address = ? AND user_id = ? AND is_active = 1 AND is_hidden = 1`,
    ).bind(identity.email, user.id).first<{ found: number }>()
    if (!mailbox) throw new QqMailStoreError(409, 'QQ 邮箱发件通道尚未完成初始化。')
    const header = reply?.message_id_header && !/[\r\n\0]/.test(reply.message_id_header)
      ? reply.message_id_header : undefined
    return sendOutboundMessage(env, user, {
      mailboxAddress: identity.email,
      recipients: [validated.value.to],
      subject: validated.value.subject,
      text: validated.value.text,
      idempotencyKey: validated.value.idempotencyKey,
      inReplyTo: header,
      references: header,
      auditAction: 'qq_mail.message.send',
      auditDetail: {
        accountId,
        accountName: account.name,
        sender: maskedQqMailEmail(identity.email),
        recipient: maskedQqMailEmail(validated.value.to),
        recipientCount: validated.value.recipients.length,
        reply: Boolean(reply),
      },
      rateLimitMaximums: { dayLimit: 50 },
    }, ip)
  } catch (error) {
    return qqMailResponseError(error)
  }
}
