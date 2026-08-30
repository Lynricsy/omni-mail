import {
  ControlledSmtpClient,
  ControlledSmtpError,
  type SmtpSocketFactory,
} from '../../shared/mail/smtp-client'

const endpoint = {
  host: 'smtp.qq.com', port: 465, serviceLabel: 'QQ 邮箱',
  credentialLabel: 'QQ 邮箱地址、IMAP/SMTP 服务和授权码',
  messageIdDomain: 'qq.com', auth: 'login',
} as const

export { ControlledSmtpError as QqMailSmtpError }

export class QqMailSmtpClient extends ControlledSmtpClient {
  constructor(email: string, authorizationCode: string, socketFactory?: SmtpSocketFactory) {
    super(email, authorizationCode, endpoint, socketFactory)
  }
}
