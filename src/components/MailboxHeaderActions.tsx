import { Bell, BellOff, Copy, RefreshCw, SquarePen } from 'lucide-react'
import type {
  ManagedDomain,
  MailboxAddress,
  MailboxScope,
} from '../lib/api'
import { t } from '../lib/i18n'
import type { MailNotificationControls } from '../lib/useNewMailNotifications'
import { QuickMailboxGenerator } from './QuickMailboxGenerator'

interface Props {
  mailboxes: MailboxAddress[]
  domains: ManagedDomain[]
  scope: MailboxScope
  canGenerate: boolean
  canCompose: boolean
  refreshing: boolean
  notifications: MailNotificationControls
  onRefresh: () => void
  onCopied: (address: string) => void
  onCopyError: () => void
  onMailboxCreated: (mailbox: MailboxAddress) => Promise<void>
  onCompose: () => void
}

export function MailboxHeaderActions({
  mailboxes,
  domains,
  scope,
  canGenerate,
  canCompose,
  refreshing,
  notifications,
  onRefresh,
  onCopied,
  onCopyError,
  onMailboxCreated,
  onCompose,
}: Props) {
  const activeMailboxes = mailboxes.filter((mailbox) => mailbox.isActive)
  const address = scope.type === 'mailbox'
    ? scope.value
    : activeMailboxes.find((mailbox) => mailbox.isPrimary)?.address
      || activeMailboxes[0]?.address
      || ''

  async function copy() {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      onCopied(address)
    } catch {
      onCopyError()
    }
  }

  return (
    <div className="list-header__actions">
      <button className="button button--primary compose-trigger" type="button"
        onClick={onCompose} disabled={!canCompose || !address}
        aria-label={t('新建邮件')}
        data-tooltip={!canCompose ? t('当前账户没有发信权限。') : t('新建邮件')}>
        <SquarePen size={17} />
      </button>
      <button
        className="icon-button"
        type="button"
        onClick={() => void copy()}
        aria-label={`${t('复制当前邮箱')}${address ? ` ${address}` : ''}`}
        data-tooltip={address ? `${t('复制当前邮箱')} ${address}` : t('暂无可复制邮箱')}
        disabled={!address}
      >
        <Copy size={17} />
      </button>
      <QuickMailboxGenerator
        domains={domains}
        disabled={!canGenerate}
        onCreated={onMailboxCreated}
      />
      {notifications.supported && (
        <button
          className="icon-button"
          type="button"
          onClick={notifications.toggle}
          aria-label={t(notifications.enabled ? '关闭新邮件通知' : '开启新邮件通知')}
          data-tooltip={t(notifications.enabled ? '关闭新邮件通知' : '开启新邮件通知')}
        >
          {notifications.enabled ? <Bell size={17} /> : <BellOff size={17} />}
        </button>
      )}
      <button className="icon-button" type="button" onClick={onRefresh} aria-label={t('刷新邮件')} data-tooltip={t('刷新')}>
        <RefreshCw className={refreshing ? 'spin' : ''} size={17} />
      </button>
    </div>
  )
}
