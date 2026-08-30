import { QqMailAccountStore } from './qq-mail-store'
import { QqMailSmtpClient, QqMailSmtpError } from './qq-mail-smtp'
import type { SmtpAttachment } from '../../shared/mail/smtp-client'
import type { Env } from '../../app/types'

export class QqMailOutboundError extends Error {
  constructor(message: string, readonly retryable: boolean,
    readonly deliveryUncertain = false) {
    super(message)
    this.name = 'QqMailOutboundError'
  }
}

async function recordSmtpResult(env: Env, accountId: string,
  error?: QqMailSmtpError): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await env.DB.prepare(
    `UPDATE qq_mail_accounts SET status = ?, last_error_code = ?, last_error_at = ?,
            updated_at = ? WHERE id = ?`,
  ).bind(
    error ? (error.credentialFailure ? 'credential_error' : 'error') : 'active',
    error ? (error.credentialFailure ? 'authentication_failed' : 'smtp_failed') : '',
    error ? now : null,
    now,
    accountId,
  ).run().catch(() => undefined)
}

export async function deliverWithQqMail(env: Env, input: {
  userId: string
  mailboxAddress: string
  recipient: string
  subject: string
  text: string
  html: string
  attachments: SmtpAttachment[]
  inReplyTo?: string
  references?: string
}): Promise<string> {
  const store = new QqMailAccountStore(env, input.userId)
  const sender = await store.accountForIdentity(input.mailboxAddress)
  if (!sender) throw new QqMailOutboundError('QQ Mail identity is disconnected', false)
  const { account, identity } = sender
  const client = new QqMailSmtpClient(identity.email, account.authorizationCode)
  try {
    await client.open()
    const providerId = await client.send({
      to: input.recipient,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments,
      inReplyTo: input.inReplyTo,
      references: input.references,
    })
    if (identity.isPrimary) await recordSmtpResult(env, account.id)
    return providerId
  } catch (error) {
    if (error instanceof QqMailSmtpError) {
      if (identity.isPrimary) await recordSmtpResult(env, account.id, error)
      throw new QqMailOutboundError(error.message, error.retryable, error.deliveryUncertain)
    }
    throw error
  } finally {
    await client.close()
  }
}
