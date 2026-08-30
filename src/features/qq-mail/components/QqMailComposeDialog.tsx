import { useState } from 'react'
import { t } from '../../../shared/i18n'
import type { QqMailIdentity } from '../../../shared/api'
import {
  SmtpComposeDialog,
  type SmtpComposeInput,
} from '../../../shared/ui/mail-workspace/SmtpComposeDialog'
import { QqMailIcon } from './QqMailIcon'

export type QqMailComposeInput = SmtpComposeInput & { sender: string }

export function QqMailComposeDialog({ identities, initialSender, initialTo, initialSubject,
  busy, error, onCancel, onSubmit }: {
  identities: QqMailIdentity[]
  initialSender: string
  initialTo?: string
  initialSubject?: string
  busy: boolean
  error: string
  onCancel: () => void
  onSubmit: (input: QqMailComposeInput) => Promise<void>
}) {
  const [sender, setSender] = useState(initialSender)
  const selected = identities.find(({ email }) => email === sender) || identities[0]
  return <SmtpComposeDialog sender={selected?.email || sender}
    senderValue={selected?.email || sender} onSenderChange={setSender}
    senderOptions={identities.map((identity) => ({
      value: identity.email,
      label: identity.name,
      address: identity.email,
    }))} title={t(initialTo ? '回复 QQ 邮件' : '新建 QQ 邮件')}
    providerLabel={t('QQ SMTP')} deliveryNote={t('通过 QQ 邮箱官方 SMTP 安全发送。')}
    senderIcon={<QqMailIcon width={14} height={14} aria-hidden="true" />}
    initialTo={initialTo} initialSubject={initialSubject}
    busy={busy} error={error} onCancel={onCancel}
    onSubmit={(input) => onSubmit({ ...input, sender: selected?.email || sender })} />
}
