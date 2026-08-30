import {
  SmtpComposeDialog,
  type SmtpComposeInput,
} from '../../../shared/ui/mail-workspace/SmtpComposeDialog'
import { t } from '../../../shared/i18n'

export type LinuxDoMailComposeInput = SmtpComposeInput

export function LinuxDoMailComposeDialog({ username, busy, error, onCancel, onSubmit }: {
  username: string
  busy: boolean
  error: string
  onCancel: () => void
  onSubmit: (input: LinuxDoMailComposeInput) => Promise<void>
}) {
  return <SmtpComposeDialog sender={username} title={t('新建 Linux DO 邮件')}
    providerLabel={t('Linux DO SMTP')}
    deliveryNote={t('通过 Linux DO 官方 SMTP 安全发送。')}
    busy={busy} error={error} onCancel={onCancel} onSubmit={onSubmit} />
}
