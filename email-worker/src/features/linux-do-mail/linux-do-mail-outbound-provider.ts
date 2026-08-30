import { LinuxDoMailAccountStore } from './linux-do-mail-store'
import {
  LinuxDoMailSmtpClient,
  LinuxDoMailSmtpError,
  type LinuxDoMailSmtpAttachment,
} from './linux-do-mail-smtp'
import type { Env } from '../../app/types'

export class LinuxDoMailOutboundError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly deliveryUncertain = false,
  ) {
    super(message)
    this.name = 'LinuxDoMailOutboundError'
  }
}

export async function deliverWithLinuxDoMail(
  env: Env,
  input: {
    userId: string
    mailboxAddress: string
    recipient: string
    subject: string
    text: string
    html: string
    attachments: LinuxDoMailSmtpAttachment[]
  },
): Promise<string> {
  const accountStore = new LinuxDoMailAccountStore(env, input.userId)
  const account = await accountStore.get().catch(() => {
    throw new LinuxDoMailOutboundError('Linux DO Mail account is disconnected', false)
  })
  if (account.username !== input.mailboxAddress) {
    throw new LinuxDoMailOutboundError('Linux DO Mail account does not own this message', false)
  }
  const client = new LinuxDoMailSmtpClient(account.username, account.password)
  try {
    await client.open()
    const providerId = await client.send({
      to: input.recipient,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments,
    })
    await accountStore.recordValidation(account.id)
    return providerId
  } catch (error) {
    if (error instanceof LinuxDoMailSmtpError) {
      if (error.credentialFailure) {
        await accountStore.recordValidation(account.id, error.message).catch(() => undefined)
      }
      throw new LinuxDoMailOutboundError(
        error.message,
        error.retryable,
        error.deliveryUncertain,
      )
    }
    throw error
  } finally {
    await client.close()
  }
}
