import { AtSign, Check, Copy } from 'lucide-react'
import type { MailboxAddress } from '../../../shared/api'
import { t } from '../../../shared/i18n'

export function MailboxAddressOption({
  mailbox,
  selected,
  onSelect,
  onCopy,
}: {
  mailbox: MailboxAddress
  selected: boolean
  onSelect: () => void
  onCopy: () => void
}) {
  const copyLabel = t('复制邮箱地址：{address}', { address: mailbox.address })
  return (
    <div className="mailbox-address-item">
      <button
        className={`mailbox-address-option${selected ? ' is-selected' : ''}`}
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
      >
        <AtSign size={15} />
        <span>{mailbox.address}</span>
        {mailbox.isPrimary && <small>{t('主邮箱')}</small>}
        {selected && <Check size={15} />}
      </button>
      <button
        className="mailbox-address-copy"
        type="button"
        aria-label={copyLabel}
        data-tooltip={copyLabel}
        onClick={onCopy}
      >
        <Copy size={15} />
      </button>
    </div>
  )
}
