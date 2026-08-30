import { ArrowUpDown, AtSign, Check, ChevronDown, Cloud, Copy, Inbox, Mail, Settings2, X } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react'
import type { ICloudAccount, ICloudAlias } from '../../../shared/api'
import { t } from '../../../shared/i18n'

export type ICloudAliasSort = 'label' | 'newest' | 'email'

const aliasCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const SCOPE_EXIT_MS = 120
const aliasSortOptions: Array<{ value: ICloudAliasSort; label: string }> = [
  { value: 'label', label: '名称' },
  { value: 'newest', label: '最新创建' },
  { value: 'email', label: '邮箱地址' },
]

function aliasCreatedAt(value?: string): number {
  const timestamp = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

export function sortICloudAliases(aliases: ICloudAlias[], sort: ICloudAliasSort): ICloudAlias[] {
  return [...aliases].sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1
    if (sort === 'newest') {
      const leftTime = aliasCreatedAt(left.createdAt)
      const rightTime = aliasCreatedAt(right.createdAt)
      if (leftTime !== rightTime) return rightTime > leftTime ? 1 : -1
    }
    if (sort === 'label') {
      const byLabel = aliasCollator.compare(left.label.trim() || left.email, right.label.trim() || right.email)
      if (byLabel) return byLabel
    }
    return aliasCollator.compare(left.email, right.email)
  })
}

export function ICloudScopeSwitcher({
  accounts,
  aliases,
  selectedAccountId,
  selectedAlias,
  onAccountChange,
  onAliasChange,
  onAliasCopy,
  onAccountSettings,
}: {
  accounts: ICloudAccount[]
  aliases: ICloudAlias[]
  selectedAccountId: string
  selectedAlias: string
  onAccountChange: (id: string) => void
  onAliasChange: (address: string) => void
  onAliasCopy: (address: string) => Promise<void>
  onAccountSettings: (account: ICloudAccount) => void
}) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [aliasSort, setAliasSort] = useState<ICloudAliasSort>('label')
  const [sortOpen, setSortOpen] = useState(false)
  const sortMenuId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const sortRoot = useRef<HTMLDivElement>(null)
  const sortTrigger = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | null>(null)
  const account = accounts.find((item) => item.id === selectedAccountId)
  const selectedSort = aliasSortOptions.find((option) => option.value === aliasSort)!
  const sortedAliases = useMemo(() => sortICloudAliases(aliases, aliasSort), [aliases, aliasSort])

  function finishClose(afterClose?: () => void, restoreFocus = true) {
    closeTimer.current = null
    setOpen(false)
    setClosing(false)
    afterClose?.()
    if (restoreFocus) requestAnimationFrame(() => trigger.current?.focus())
  }

  function close(afterClose?: () => void, restoreFocus = true) {
    if (closing || closeTimer.current !== null) return
    setSortOpen(false)
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

  function toggleOpen() {
    if (!open) {
      setOpen(true)
      return
    }
    if (closing || closeTimer.current !== null) {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      closeTimer.current = null
      setClosing(false)
      return
    }
    close()
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

  useEffect(() => {
    if (!sortOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!sortRoot.current?.contains(event.target as Node)) setSortOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setSortOpen(false)
      requestAnimationFrame(() => sortTrigger.current?.focus())
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [sortOpen])

  useEffect(() => () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
  }, [])

  function selectSort(sort: ICloudAliasSort) {
    setAliasSort(sort)
    setSortOpen(false)
    requestAnimationFrame(() => sortTrigger.current?.focus())
  }

  return (
    <div className="icloud-scope-switcher">
      <button ref={trigger} className="icloud-scope-trigger" type="button"
        aria-haspopup="dialog" aria-expanded={open && !closing} onClick={toggleOpen}>
        <span>{t('当前 iCloud')}</span>
        <strong>{account?.name || t('选择账号')}</strong>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && <>
        <button className="icloud-scope-backdrop" type="button" tabIndex={-1}
          aria-hidden="true" onClick={() => close()} />
        <div ref={panel} className={`icloud-scope-panel${closing ? ' is-closing' : ''}`}
          role="dialog" aria-modal="true" aria-hidden={closing || undefined} inert={closing || undefined}
          aria-labelledby="icloud-scope-title" tabIndex={-1}>
          <header>
            <div><small>ICLOUD SCOPE</small><h2 id="icloud-scope-title">{t('选择查看范围')}</h2></div>
            <button className="icon-button icon-button--small" type="button" onClick={() => close()}
              aria-label={t('关闭')}><X size={16} /></button>
          </header>
          <div className="icloud-scope-content">
            <section>
              <h3>{t('iCloud 账号')}</h3>
              {accounts.map((item) => (
                <div className={`icloud-scope-account${item.id === selectedAccountId ? ' is-selected' : ''}`}
                  key={item.id}>
                  <button className="icloud-scope-option" type="button"
                    onClick={() => close(() => onAccountChange(item.id))}>
                    <span className="icloud-scope-icon"><Cloud size={16} /></span>
                    <span><strong>{item.name}</strong><small>{item.realEmail || item.icloudEmail || t('尚未识别 Apple ID')}</small></span>
                    {item.id === selectedAccountId && <Check size={15} />}
                  </button>
                  <button className="icloud-scope-settings" type="button"
                    onClick={() => close(() => onAccountSettings(item), false)}
                    aria-label={t('设置 iCloud 账号：{name}', { name: item.name })}
                    data-tooltip={t('账号设置')}>
                    <Settings2 size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </section>
            <section>
              <div className="icloud-scope-section-header">
                <h3>{t('收件地址')}</h3>
                <div ref={sortRoot} className="icloud-scope-sort">
                  <button ref={sortTrigger} className="icloud-scope-sort-trigger" type="button"
                    aria-expanded={sortOpen} aria-controls={sortMenuId}
                    onClick={() => setSortOpen((value) => !value)}>
                    <span className="icloud-scope-sort-chip">
                      <ArrowUpDown size={13} aria-hidden="true" />
                      <span className="sr-only">{t('收件地址排序')}：</span>
                      <span>{t(selectedSort.label)}</span>
                      <ChevronDown size={12} aria-hidden="true" />
                    </span>
                  </button>
                  {sortOpen && <div id={sortMenuId} className="icloud-scope-sort-menu"
                    role="group" aria-label={t('收件地址排序')}>
                    {aliasSortOptions.map((option) => (
                      <button type="button" key={option.value}
                        aria-pressed={option.value === aliasSort}
                        onClick={() => selectSort(option.value)}>
                        <span>{t(option.label)}</span>
                        {option.value === aliasSort && <Check size={14} aria-hidden="true" />}
                      </button>
                    ))}
                  </div>}
                </div>
              </div>
              <button className={`icloud-scope-option${!selectedAlias ? ' is-selected' : ''}`} type="button"
                onClick={() => close(() => onAliasChange(''))}>
                <span className="icloud-scope-icon"><Inbox size={16} /></span>
                <span><strong>{t('全部邮件')}</strong><small>{t('所有收件地址')}</small></span>
                {!selectedAlias && <Check size={15} />}
              </button>
              {account?.hasAppPassword && account.icloudEmail && <div
                className={`icloud-scope-alias${account.icloudEmail === selectedAlias ? ' is-selected' : ''}`}>
                <button className="icloud-scope-option" type="button"
                  onClick={() => close(() => onAliasChange(account.icloudEmail))}>
                  <span className="icloud-scope-icon"><Mail size={16} aria-hidden="true" /></span>
                  <span><strong>{t('主邮箱')}</strong><small>{account.icloudEmail}</small></span>
                  {account.icloudEmail === selectedAlias && <Check size={15} />}
                </button>
                <button className="icloud-scope-copy" type="button"
                  onClick={() => void onAliasCopy(account.icloudEmail)}
                  aria-label={t('复制邮箱地址：{address}', { address: account.icloudEmail })}
                  data-tooltip={t('复制')}>
                  <Copy size={15} aria-hidden="true" />
                </button>
              </div>}
              {sortedAliases.map((alias) => (
                <div className={`icloud-scope-alias${alias.email === selectedAlias ? ' is-selected' : ''}`}
                  key={alias.anonymousId || alias.email}>
                  <button className="icloud-scope-option" type="button"
                    onClick={() => close(() => onAliasChange(alias.email))}>
                    <span className="icloud-scope-icon"><AtSign size={16} /></span>
                    <span><strong>{alias.label || t('未命名地址')}</strong><small>{alias.email}</small></span>
                    {alias.email === selectedAlias && <Check size={15} />}
                  </button>
                  <button className="icloud-scope-copy" type="button"
                    onClick={() => void onAliasCopy(alias.email)}
                    aria-label={t('复制邮箱地址：{address}', { address: alias.email })}
                    data-tooltip={t('复制')}>
                    <Copy size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </section>
          </div>
        </div>
      </>}
    </div>
  )
}
