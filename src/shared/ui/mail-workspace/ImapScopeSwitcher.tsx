import { AtSign, Check, ChevronDown, Inbox, Settings2, X } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { t } from '../../i18n'
import './styles/scope-switcher.css'

const SCOPE_EXIT_MS = 120

type ImapAccount = {
  id: string
  name: string
  email: string
  status: 'active' | 'syncing' | 'credential_error' | 'error'
}

function statusLabel(account: ImapAccount, credentialLabel: string): string {
  if (account.status === 'syncing') return t('正在同步')
  if (account.status === 'credential_error') return credentialLabel
  if (account.status === 'error') return t('同步异常')
  return t('已连接')
}

export function ImapScopeSwitcher({
  accounts,
  selectedAccountId,
  provider,
  credentialErrorLabel,
  onChange,
  onManage,
}: {
  accounts: ImapAccount[]
  selectedAccountId: string
  provider: string
  credentialErrorLabel: string
  onChange: (accountId: string) => void
  onManage: () => void
}) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const titleId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)
  const selected = accounts.find(({ id }) => id === selectedAccountId)

  function finishClose(afterClose?: () => void, restoreFocus = true) {
    closeTimer.current = null
    setOpen(false)
    setClosing(false)
    afterClose?.()
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
      () => finishClose(afterClose, restoreFocus),
      SCOPE_EXIT_MS,
    )
  }

  const closeFromEffect = useEffectEvent(close)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => panel.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeFromEffect()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
  }, [])

  return <div className="icloud-scope-switcher gmail-scope-switcher">
    <button ref={trigger} className="icloud-scope-trigger" type="button"
      aria-haspopup="dialog" aria-expanded={open && !closing}
      onClick={() => open ? close() : setOpen(true)}>
      <span>{t('当前 {provider}', { provider })}</span>
      <strong>{selected?.name || t('全部 {provider}', { provider })}</strong>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <>
      <button className="icloud-scope-backdrop" type="button" tabIndex={-1}
        aria-hidden="true" onClick={() => close()} />
      <div ref={panel} className={`icloud-scope-panel gmail-scope-panel${closing ? ' is-closing' : ''}`}
        role="dialog" aria-modal="true" aria-hidden={closing || undefined}
        inert={closing || undefined} aria-labelledby={titleId} tabIndex={-1}>
        <header>
          <div><small>IMAP SCOPE</small><h2 id={titleId}>
            {t('选择 {provider} 邮箱', { provider })}</h2></div>
          <button className="icon-button icon-button--small" type="button" onClick={() => close()}
            aria-label={t('关闭')}><X size={16} /></button>
        </header>
        <div className="icloud-scope-content"><section>
          <h3>{t('查看范围')}</h3>
          <button className={`icloud-scope-option${!selectedAccountId ? ' is-selected' : ''}`}
            type="button" onClick={() => close(() => onChange(''))}>
            <span className="icloud-scope-icon"><Inbox size={16} /></span>
            <span><strong>{t('全部 {provider}', { provider })}</strong>
              <small>{t('所有已连接 {provider} 账号', { provider })}</small></span>
            {!selectedAccountId && <Check size={15} />}
          </button>
          {accounts.map((account) => <div
            className={`icloud-scope-account${account.id === selectedAccountId ? ' is-selected' : ''}`}
            key={account.id}>
            <button className="icloud-scope-option" type="button"
              onClick={() => close(() => onChange(account.id))}>
              <span className="icloud-scope-icon"><AtSign size={16} /></span>
              <span><strong>{account.name}</strong><small>
                {account.email} · {statusLabel(account, credentialErrorLabel)}</small></span>
              {account.id === selectedAccountId && <Check size={15} />}
            </button>
            <button className="icloud-scope-settings" type="button"
              onClick={() => close(onManage, false)}
              aria-label={t('管理 {provider} 账号', { provider })} data-tooltip={t('账号设置')}>
              <Settings2 size={15} aria-hidden="true" />
            </button>
          </div>)}
        </section></div>
      </div>
    </>}
  </div>
}
