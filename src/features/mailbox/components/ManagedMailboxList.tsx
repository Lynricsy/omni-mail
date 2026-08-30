import { LoaderCircle, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  api,
  type MailboxAddress,
  type MailboxScope,
} from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { DangerConfirmDialog } from '../../../shared/ui/dialogs/DangerConfirmDialog'

type BusyAction = 'toggle' | 'primary' | 'delete' | ''

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '操作失败，请重试。')
}

export function ManagedMailboxList({
  mailboxes,
  scope,
  disabled,
  onMailboxesChanged,
  onScopeChange,
  onError,
  onNotice,
}: {
  mailboxes: MailboxAddress[]
  scope: MailboxScope
  disabled: boolean
  onMailboxesChanged: () => Promise<void>
  onScopeChange: (scope: MailboxScope) => void
  onError: (message: string) => void
  onNotice: (message: string) => void
}) {
  const [busyAddress, setBusyAddress] = useState('')
  const [busyAction, setBusyAction] = useState<BusyAction>('')
  const [pendingDelete, setPendingDelete] = useState<MailboxAddress | null>(null)

  function begin(address: string, action: BusyAction) {
    setBusyAddress(address)
    setBusyAction(action)
    onError('')
    onNotice('')
  }

  function finish() {
    setBusyAddress('')
    setBusyAction('')
  }

  async function toggle(mailbox: MailboxAddress) {
    begin(mailbox.address, 'toggle')
    try {
      await api.updateMailbox(mailbox.address, !mailbox.isActive)
      await onMailboxesChanged()
      if (mailbox.isActive && scope.type === 'mailbox' && scope.value === mailbox.address) {
        onScopeChange({ type: 'all' })
      }
      onNotice(t(mailbox.isActive ? '邮箱地址已停用' : '邮箱地址已启用'))
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      finish()
    }
  }

  async function setPrimary(mailbox: MailboxAddress) {
    begin(mailbox.address, 'primary')
    try {
      await api.setPrimaryMailbox(mailbox.address)
      await onMailboxesChanged()
      onNotice(t('邮箱已设为主邮箱'))
    } catch (error) {
      onError(errorMessage(error))
    } finally {
      finish()
    }
  }

  async function confirmDelete() {
    const mailbox = pendingDelete
    if (!mailbox || busyAddress || disabled) return
    begin(mailbox.address, 'delete')
    try {
      await api.deleteMailbox(mailbox.address)
      await onMailboxesChanged()
      if (scope.type === 'mailbox' && scope.value === mailbox.address) {
        onScopeChange({ type: 'all' })
      }
      setPendingDelete(null)
      onNotice(t('邮箱删除任务已开始'))
    } catch (error) {
      setPendingDelete(null)
      onError(errorMessage(error))
    } finally {
      finish()
    }
  }

  const blocked = disabled || Boolean(busyAddress)
  return (
    <>
      <div className="managed-mailboxes">
        {mailboxes.map((mailbox) => (
          <div className="managed-mailbox" key={mailbox.address}>
            <span className={mailbox.isActive ? 'is-active' : ''} aria-hidden="true" />
            <div className="managed-mailbox__details">
              <strong>{mailbox.address}</strong>
              <small>{t(mailbox.isPrimary
                ? '主邮箱 · 始终启用'
                : mailbox.isActive ? '正在接收邮件' : '已停止接收新邮件')}</small>
            </div>
            <div className="managed-mailbox__actions">
              {mailbox.isPrimary ? (
                <span className="managed-mailbox__primary">
                  <Star size={13} />{t('当前主邮箱')}
                </span>
              ) : <>
                {mailbox.isActive && <button
                  className="button button--secondary button--small"
                  type="button" disabled={blocked}
                  onClick={() => void setPrimary(mailbox)}
                >
                  {busyAddress === mailbox.address && busyAction === 'primary'
                    ? <LoaderCircle className="spin" size={14} />
                    : <Star size={14} />}
                  {t('设为主邮箱')}
                </button>}
                <button className="button button--secondary button--small"
                  type="button" disabled={blocked} onClick={() => void toggle(mailbox)}>
                  {busyAddress === mailbox.address && busyAction === 'toggle'
                    && <LoaderCircle className="spin" size={14} />}
                  {t(mailbox.isActive ? '停用' : '启用')}
                </button>
                <button className="icon-button icon-button--small icon-button--danger"
                  type="button" disabled={blocked}
                  aria-label={t('删除邮箱：{address}', { address: mailbox.address })}
                  data-tooltip={t('删除邮箱')} onClick={() => setPendingDelete(mailbox)}>
                  <Trash2 size={14} />
                </button>
              </>}
            </div>
          </div>
        ))}
      </div>
      {pendingDelete && <DangerConfirmDialog
        icon={Trash2}
        eyebrow={t('邮箱地址管理')}
        title={t('删除邮箱地址？')}
        description={t('邮箱地址“{address}”将从当前账户中移除。', {
          address: pendingDelete.address,
        })}
        impactTitle={t('主存储数据无法恢复')}
        impactDescription={t('该地址的历史邮件、草稿和附件将从主存储永久删除；备份仍按保留策略保存，地址也会被释放。')}
        confirmLabel={t(busyAddress === pendingDelete.address && busyAction === 'delete'
          ? '正在删除…' : '删除邮箱')}
        onCancel={() => { if (!busyAddress) setPendingDelete(null) }}
        onConfirm={() => void confirmDelete()}
      />}
    </>
  )
}
