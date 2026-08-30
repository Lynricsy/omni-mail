import { AtSign, Check, ChevronDown, Copy, Folder, Inbox, RefreshCw, Settings2, X } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import type { MicrosoftAccount, MicrosoftFolder } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import '../../../shared/ui/mail-workspace/styles/scope-switcher.css'

const SCOPE_EXIT_MS = 120
const limits = [25, 50, 100, 200]

function statusLabel(account: MicrosoftAccount): string {
  if (account.status === 'syncing') return t('正在同步')
  if (account.status === 'credential_error') return t('凭据失效')
  if (account.status === 'permission_error') return t('权限不足')
  if (account.status === 'error') return t('同步异常')
  return t('已连接')
}

export function MicrosoftScopeSwitcher({
  accounts, folders, selectedAccountId, selectedFolderPath, limit, folderRefreshing,
  onAccountChange, onFolderChange, onLimitChange, onRefreshFolders, onCopyAddress, onManage,
}: {
  accounts: MicrosoftAccount[]
  folders: MicrosoftFolder[]
  selectedAccountId: string
  selectedFolderPath: string
  limit: number
  folderRefreshing: boolean
  onAccountChange: (accountId: string) => void
  onFolderChange: (folderPath: string) => void
  onLimitChange: (limit: number) => void
  onRefreshFolders: () => Promise<void>
  onCopyAddress: (address: string) => Promise<boolean>
  onManage: () => void
}) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [copiedAccountId, setCopiedAccountId] = useState('')
  const titleId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)
  const copyTimer = useRef<number | null>(null)
  const selected = accounts.find(({ id }) => id === selectedAccountId)
  const visibleFolders = folders.length ? folders : [{
    path: 'INBOX', displayName: 'INBOX', flags: [], specialUse: '\\Inbox',
    uidValidity: null, lastUid: 0,
  }]

  function finishClose(afterClose?: () => void, restoreFocus = true) {
    closeTimer.current = null
    setOpen(false); setClosing(false); afterClose?.()
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus())
  }

  function close(afterClose?: () => void, restoreFocus = true) {
    if (closing || closeTimer.current !== null) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishClose(afterClose, restoreFocus)
      return
    }
    setClosing(true)
    closeTimer.current = window.setTimeout(
      () => finishClose(afterClose, restoreFocus), SCOPE_EXIT_MS,
    )
  }

  function toggle() {
    if (!open) setOpen(true)
    else close()
  }

  const closeFromEffect = useEffectEvent(close)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => panel.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); closeFromEffect()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
  }, [])

  async function copyAddress(account: MicrosoftAccount) {
    if (!await onCopyAddress(account.email)) return
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    setCopiedAccountId(account.id)
    copyTimer.current = window.setTimeout(() => {
      copyTimer.current = null
      setCopiedAccountId('')
    }, 1_600)
  }

  return <div className="icloud-scope-switcher microsoft-scope-switcher">
    <button ref={trigger} className="icloud-scope-trigger" type="button"
      aria-haspopup="dialog" aria-expanded={open && !closing} onClick={toggle}>
      <span>{t('当前 Microsoft')}</span>
      <strong>{selected?.name || t('全部 Microsoft')}</strong>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <>
      <button className="icloud-scope-backdrop" type="button" tabIndex={-1}
        aria-hidden="true" onClick={() => close()} />
      <div ref={panel} className={`icloud-scope-panel microsoft-scope-panel${closing ? ' is-closing' : ''}`}
        role="dialog" aria-modal="true" aria-hidden={closing || undefined}
        inert={closing || undefined} aria-labelledby={titleId} tabIndex={-1}>
        <header><div><small>MICROSOFT SCOPE</small>
          <h2 id={titleId}>{t('选择 Microsoft 邮箱')}</h2></div>
          <button className="icon-button icon-button--small" type="button" onClick={() => close()}
            aria-label={t('关闭')}><X size={16} /></button></header>
        <div className="icloud-scope-content">
          <section><h3>{t('查看范围')}</h3>
            <button className={`icloud-scope-option${!selectedAccountId ? ' is-selected' : ''}`}
              type="button" onClick={() => close(() => onAccountChange(''))}>
              <span className="icloud-scope-icon"><Inbox size={16} /></span>
              <span><strong>{t('全部 Microsoft')}</strong>
                <small>{t('所有已连接 Microsoft 账号 · INBOX')}</small></span>
              {!selectedAccountId && <Check size={15} />}
            </button>
            {accounts.map((account) => <div
              className={`icloud-scope-account${account.id === selectedAccountId ? ' is-selected' : ''}`}
              key={account.id}>
              <button className="icloud-scope-option" type="button"
                onClick={() => close(() => onAccountChange(account.id))}>
                <span className="icloud-scope-icon"><AtSign size={16} /></span>
                <span><strong>{account.name}</strong>
                  <small>{account.email} · {statusLabel(account)}</small></span>
                {account.id === selectedAccountId && <Check size={15} />}
              </button>
              <button className="icloud-scope-copy" type="button"
                onClick={() => void copyAddress(account)}
                aria-label={copiedAccountId === account.id
                  ? t('已复制：{address}', { address: account.email })
                  : t('复制邮箱地址：{address}', { address: account.email })}
                data-tooltip={copiedAccountId === account.id ? t('已复制') : t('复制')}>
                {copiedAccountId === account.id
                  ? <Check size={15} aria-hidden="true" />
                  : <Copy size={15} aria-hidden="true" />}
              </button>
              <button className="icloud-scope-settings" type="button"
                onClick={() => close(onManage, false)} aria-label={t('管理 Microsoft 账号')}
                data-tooltip={t('账号设置')}><Settings2 size={15} aria-hidden="true" /></button>
            </div>)}
          </section>
          {selectedAccountId && <section>
            <div className="icloud-scope-section-header"><h3>{t('文件夹')}</h3>
              <button className="microsoft-scope-refresh" type="button" disabled={folderRefreshing}
                onClick={() => void onRefreshFolders()} aria-label={t('刷新文件夹列表')}>
                <RefreshCw className={folderRefreshing ? 'spin' : ''} size={15} />
                {t('刷新')}</button></div>
            {visibleFolders.map((folder) => <button
              className={`icloud-scope-option${folder.path === selectedFolderPath ? ' is-selected' : ''}`}
              type="button" key={folder.path} onClick={() => close(() => onFolderChange(folder.path))}>
              <span className="icloud-scope-icon"><Folder size={16} /></span>
              <span><strong>{folder.displayName || folder.path}</strong><small>{folder.path}</small></span>
              {folder.path === selectedFolderPath && <Check size={15} />}
            </button>)}
          </section>}
          <section><h3>{t('每页邮件')}</h3>
            <div className="microsoft-scope-limits">{limits.map((value) => <button type="button"
              aria-pressed={limit === value} key={value}
              onClick={() => close(() => onLimitChange(value))}>{value}</button>)}</div>
            <p className="microsoft-scope-note">
              {t('INBOX 约每 5 分钟定时收信；其他文件夹可手动刷新。')}</p>
          </section>
        </div>
      </div>
    </>}
  </div>
}
