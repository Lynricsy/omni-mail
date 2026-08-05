import {
  ArrowLeft,
  AtSign,
  Check,
  ChevronDown,
  Globe2,
  Inbox,
  LoaderCircle,
  Plus,
  Settings2,
  X,
} from 'lucide-react'
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  api,
  type ManagedDomain,
  type MailboxAddress,
  type MailboxScope,
} from '../lib/api'
import { t } from '../lib/i18n'
import { MailboxAddressOption } from './MailboxAddressOption'

const SWITCHER_EXIT_MS = 190

interface Props {
  mailboxes: MailboxAddress[]
  loaded: boolean
  domains: ManagedDomain[]
  scope: MailboxScope
  canManage: boolean
  onScopeChange: (scope: MailboxScope) => void
  onMailboxesChanged: () => Promise<void>
}

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '操作失败，请重试。')
}

function scopeMatches(scope: MailboxScope, type: MailboxScope['type'], value = ''): boolean {
  if (type === 'all') return scope.type === 'all'
  if (scope.type === 'all') return false
  return scope.type === type && scope.value === value
}

function MailboxDomainSelect({
  value,
  domains,
  disabled,
  onChange,
}: {
  value: string
  domains: ManagedDomain[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{
    above: boolean
    left: number
    top: number
    width: number
    maxHeight: number
  } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()
  const selectedIndex = Math.max(0, domains.findIndex((domain) => domain.name === value))
  const selectedLabel = domains[selectedIndex]?.name || t('暂无可用域名')

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    function closeOnViewportChange(event: Event) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('resize', closeOnViewportChange)
    document.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', closeOnViewportChange)
      document.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [open])

  function showMenu(index = selectedIndex) {
    const rect = trigger.current?.getBoundingClientRect()
    if (disabled || !rect) return
    const menuHeight = Math.min(210, Math.max(50, domains.length * 40 + 10))
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const above = spaceBelow < Math.min(menuHeight, 120) && spaceAbove > spaceBelow
    const width = Math.max(150, rect.width)
    setPosition({
      above,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: above ? rect.top - 6 : rect.bottom + 6,
      width,
      maxHeight: Math.max(50, Math.min(menuHeight, above ? spaceAbove : spaceBelow)),
    })
    setOpen(true)
    requestAnimationFrame(() => optionRefs.current[index]?.focus())
  }

  function closeMenu(focusTrigger = false) {
    setOpen(false)
    if (focusTrigger) requestAnimationFrame(() => trigger.current?.focus())
  }

  function movePastMenu(backward: boolean) {
    const panel = root.current?.closest('.mailbox-switcher__panel')
    if (!panel || !trigger.current) return
    const focusable = [...panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )]
    const index = focusable.indexOf(trigger.current)
    focusable[index + (backward ? -1 : 1)]?.focus()
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    event.stopPropagation()
    showMenu(event.key === 'ArrowUp' ? domains.length - 1 : selectedIndex)
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const current = optionRefs.current.findIndex((option) => option === document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      closeMenu()
      movePastMenu(event.shiftKey)
      return
    }
    let next = current
    if (event.key === 'ArrowDown') next = Math.min(domains.length - 1, current + 1)
    else if (event.key === 'ArrowUp') next = Math.max(0, current - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = domains.length - 1
    else return
    event.preventDefault()
    optionRefs.current[next]?.focus()
  }

  return (
    <div className={`mailbox-domain-select ${open ? 'is-open' : ''}`} ref={root}>
      <button
        ref={trigger}
        className="mailbox-domain-select__trigger"
        type="button"
        role="combobox"
        aria-label={t('邮箱域名')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => open ? closeMenu() : showMenu()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={15} />
      </button>
      {open && position && createPortal(
        <div
          ref={menu}
          className="mailbox-domain-select__menu"
          id={menuId}
          role="listbox"
          aria-label={t('邮箱域名')}
          data-placement={position.above ? 'above' : 'below'}
          onKeyDown={handleMenuKeyDown}
          style={{
            left: position.left,
            top: position.top,
            width: position.width,
            maxHeight: position.maxHeight,
          }}
        >
          {domains.map((domain, index) => (
            <button
              ref={(node) => { optionRefs.current[index] = node }}
              className={domain.name === value ? 'is-selected' : ''}
              type="button"
              role="option"
              aria-selected={domain.name === value}
              key={domain.name}
              onClick={() => {
                onChange(domain.name)
                closeMenu(true)
              }}
            >
              <AtSign size={14} />
              <span>{domain.name}</span>
              {domain.name === value && <Check size={15} />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

export function MailboxSwitcher({
  mailboxes,
  loaded,
  domains,
  scope,
  canManage,
  onScopeChange,
  onMailboxesChanged,
}: Props) {
  const [open, setOpen] = useState(false)
  const [panelVisible, setPanelVisible] = useState(false)
  const [managing, setManaging] = useState(false)
  const [localPart, setLocalPart] = useState('')
  const [domainName, setDomainName] = useState('')
  const [busyAddress, setBusyAddress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | null>(null)
  const openingRef = useRef(false)
  const onboardingShown = useRef(false)

  const activeMailboxes = useMemo(
    () => mailboxes.filter((mailbox) => mailbox.isActive),
    [mailboxes],
  )
  const enabledDomains = useMemo(
    () => domains.filter((domain) => domain.isActive),
    [domains],
  )
  const groups = useMemo(() => {
    const grouped = new Map<string, MailboxAddress[]>()
    for (const mailbox of activeMailboxes) {
      const entries = grouped.get(mailbox.domain) || []
      entries.push(mailbox)
      grouped.set(mailbox.domain, entries)
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [activeMailboxes])
  const scopeLabel = scope.type === 'all' ? t('所有邮箱') : scope.value

  useEffect(() => {
    if (enabledDomains.some((domain) => domain.name === domainName)) return
    setDomainName(enabledDomains[0]?.name || '')
  }, [domainName, enabledDomains])

  useEffect(() => {
    if (onboardingShown.current || !loaded || !canManage || mailboxes.length) return
    onboardingShown.current = true
    show()
    setManaging(true)
  }, [canManage, loaded, mailboxes.length])

  useEffect(() => {
    if (!panelVisible) return
    panelRef.current?.focus()
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [panelVisible])

  useEffect(() => {
    if (!open || !openingRef.current) return
    const frame = window.requestAnimationFrame(() => {
      if (!openingRef.current) return
      openingRef.current = false
      setPanelVisible(true)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  function show() {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
    if (open) setPanelVisible(true)
    else {
      openingRef.current = true
      setOpen(true)
    }
  }

  function close() {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    openingRef.current = false
    setPanelVisible(false)
    triggerRef.current?.focus()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      setManaging(false)
      setError('')
      setNotice('')
      closeTimerRef.current = null
    }, reducedMotion ? 0 : SWITCHER_EXIT_MS)
  }

  function select(nextScope: MailboxScope) {
    onScopeChange(nextScope)
    close()
  }

  async function copyMailbox(address: string) {
    setError('')
    setNotice('')
    try {
      await navigator.clipboard.writeText(address)
      setNotice(t('已复制：{address}', { address }))
    } catch {
      setError(t('无法访问剪贴板，请手动复制邮箱地址。'))
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault()
    const nextLocalPart = localPart.trim().toLowerCase()
    if (!nextLocalPart || !domainName) return
    const nextAddress = `${nextLocalPart}@${domainName}`
    setBusyAddress(nextAddress)
    setError('')
    setNotice('')
    try {
      const result = await api.addMailbox(nextAddress)
      await onMailboxesChanged()
      setLocalPart('')
      setNotice(t('邮箱地址已启用'))
      onScopeChange({ type: 'mailbox', value: result.mailbox.address })
    } catch (addError) {
      setError(errorMessage(addError))
    } finally {
      setBusyAddress('')
    }
  }

  async function toggle(mailbox: MailboxAddress) {
    setBusyAddress(mailbox.address)
    setError('')
    setNotice('')
    try {
      await api.updateMailbox(mailbox.address, !mailbox.isActive)
      await onMailboxesChanged()
      if (mailbox.isActive && scope.type === 'mailbox' && scope.value === mailbox.address) {
        onScopeChange({ type: 'all' })
      }
      setNotice(t(mailbox.isActive ? '邮箱地址已停用' : '邮箱地址已启用'))
    } catch (toggleError) {
      setError(errorMessage(toggleError))
    } finally {
      setBusyAddress('')
    }
  }

  return (
    <div className="mailbox-switcher">
      <button
        ref={triggerRef}
        className="mailbox-scope-trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={panelVisible}
        onClick={() => panelVisible ? close() : show()}
      >
        <span>{t('当前邮箱')}</span>
        <strong>{scopeLabel}</strong>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {open && (
        <>
          <button
            className={`switcher-backdrop${panelVisible ? ' is-open' : ''}`}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={close}
          />
          <div
            ref={panelRef}
            className={`mailbox-switcher__panel${panelVisible ? ' is-open' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-hidden={!panelVisible}
            aria-labelledby="mailbox-switcher-title"
            data-state={panelVisible ? 'open' : 'closing'}
            tabIndex={-1}
          >
            <header className="switcher-header">
              {managing && (
                <button
                  className="icon-button icon-button--small"
                  type="button"
                  onClick={() => {
                    setManaging(false)
                    setError('')
                    setNotice('')
                  }}
                  aria-label={t('返回邮箱选择')}
                >
                  <ArrowLeft size={17} />
                </button>
              )}
              <div>
                <small>{managing ? 'SETTINGS' : 'MAILBOX SCOPE'}</small>
                <h2 id="mailbox-switcher-title">
                  {t(managing ? '管理邮箱地址' : '选择查看范围')}
                </h2>
              </div>
              <button
                className="icon-button icon-button--small"
                type="button"
                onClick={close}
                aria-label={t('关闭邮箱选择')}
              >
                <X size={17} />
              </button>
            </header>

            {managing ? (
              <div className="mailbox-manager">
                <form className="mailbox-add-form" onSubmit={add}>
                  <label htmlFor="new-mailbox-local-part">{t('新增邮箱地址')}</label>
                  <div>
                    <AtSign size={16} />
                    <input
                      id="new-mailbox-local-part"
                      type="text"
                      value={localPart}
                      onChange={(event) => setLocalPart(event.target.value)}
                      placeholder="hello"
                      autoComplete="off"
                      required
                    />
                    <span className="mailbox-domain-separator">@</span>
                    <MailboxDomainSelect
                      value={domainName}
                      domains={enabledDomains}
                      disabled={!enabledDomains.length}
                      onChange={setDomainName}
                    />
                    <button
                      className="button button--primary button--small"
                      type="submit"
                      disabled={Boolean(busyAddress) || !localPart.trim() || !domainName}
                    >
                      {busyAddress === `${localPart.trim().toLowerCase()}@${domainName}`
                        ? <LoaderCircle className="spin" size={15} />
                        : <Plus size={15} />}
                      {t('添加')}
                    </button>
                  </div>
                </form>
                <p className="mailbox-manager-note">
                  {t(enabledDomains.length
                    ? '只能在系统设置中已启用的域名下创建邮箱。'
                    : '系统尚未启用可创建邮箱的域名，请联系管理员。')}
                </p>

                <div className="managed-mailboxes">
                  {mailboxes.map((mailbox) => (
                    <div className="managed-mailbox" key={mailbox.address}>
                      <span className={mailbox.isActive ? 'is-active' : ''} aria-hidden="true" />
                      <div>
                        <strong>{mailbox.address}</strong>
                        <small>
                          {t(mailbox.isPrimary
                            ? '主邮箱 · 始终启用'
                            : mailbox.isActive ? '正在接收邮件' : '已停止接收新邮件')}
                        </small>
                      </div>
                      <button
                        className="button button--secondary button--small"
                        type="button"
                        disabled={mailbox.isPrimary || Boolean(busyAddress)}
                        onClick={() => void toggle(mailbox)}
                      >
                        {busyAddress === mailbox.address && (
                          <LoaderCircle className="spin" size={14} />
                        )}
                        {t(mailbox.isActive ? '停用' : '启用')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mailbox-scope-list">
                <button
                  className={scopeMatches(scope, 'all') ? 'is-selected' : ''}
                  type="button"
                  aria-pressed={scopeMatches(scope, 'all')}
                  onClick={() => select({ type: 'all' })}
                >
                  <span className="scope-icon"><Inbox size={17} /></span>
                  <span>
                    <strong>{t('所有邮箱')}</strong>
                    <small>{t('{count} 个启用地址', { count: activeMailboxes.length })}</small>
                  </span>
                  {scopeMatches(scope, 'all') && <Check size={16} />}
                </button>

                {groups.map(([domain, addresses]) => (
                  <section className="mailbox-domain-group" key={domain}>
                    <button
                      className={scopeMatches(scope, 'domain', domain) ? 'is-selected' : ''}
                      type="button"
                      aria-pressed={scopeMatches(scope, 'domain', domain)}
                      onClick={() => select({ type: 'domain', value: domain })}
                    >
                      <span className="scope-icon"><Globe2 size={17} /></span>
                      <span>
                        <strong>{domain}</strong>
                        <small>{t('{count} 个邮箱地址', { count: addresses.length })}</small>
                      </span>
                      {scopeMatches(scope, 'domain', domain) && <Check size={16} />}
                    </button>
                    <div className="mailbox-address-list">
                      {addresses.map((mailbox) => <MailboxAddressOption
                        key={mailbox.address}
                        mailbox={mailbox}
                        selected={scopeMatches(scope, 'mailbox', mailbox.address)}
                        onSelect={() => select({ type: 'mailbox', value: mailbox.address })}
                        onCopy={() => void copyMailbox(mailbox.address)}
                      />)}
                    </div>
                  </section>
                ))}
              </div>
            )}
            {(error || notice) && (
              <p
                className={`switcher-feedback${error ? ' is-error' : ''}${!managing && canManage ? ' is-above-footer' : ''}`}
                role={error ? 'alert' : 'status'} onAnimationEnd={(event) => { if (event.animationName === 'switcher-feedback-out') setNotice('') }}
              >
                {error || notice}
              </p>
            )}
            {!managing && canManage && (
              <footer className="switcher-footer">
                <button
                  type="button"
                  onClick={() => {
                    setManaging(true)
                    setError('')
                    setNotice('')
                  }}
                >
                  <Settings2 size={16} />
                  {t('管理邮箱地址')}
                </button>
              </footer>
            )}
          </div>
        </>
      )}
    </div>
  )
}
