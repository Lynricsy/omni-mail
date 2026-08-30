import {
  ControlledSmtpClient,
  ControlledSmtpError,
  serializeSmtpMessage,
  type SmtpAttachment,
  type SmtpMessage,
  type SmtpSocketFactory,
} from '../../shared/mail/smtp-client'

const endpoint = {
  host: 'mail.linux.do', port: 465, serviceLabel: 'Linux DO Mail',
  credentialLabel: '密码或认证令牌', messageIdDomain: 'linux.do', auth: 'plain',
} as const

export type LinuxDoMailSmtpAttachment = SmtpAttachment
export type LinuxDoMailSmtpMessage = SmtpMessage
export { ControlledSmtpError as LinuxDoMailSmtpError }

export function serializeLinuxDoMailMessage(
  message: LinuxDoMailSmtpMessage,
  options: { date?: Date; messageId?: string } = {},
) {
  return serializeSmtpMessage(message, { ...options, messageIdDomain: endpoint.messageIdDomain })
}

export class LinuxDoMailSmtpClient extends ControlledSmtpClient {
  constructor(username: string, password: string, socketFactory?: SmtpSocketFactory) {
    super(username, password, endpoint, socketFactory)
  }
}
