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
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  api,
  type ManagedDomain,
  type MailboxAddress,
  type MailboxScope,
} from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { MailboxAddressOption } from './MailboxAddressOption'
import { MailboxDomainSelect } from './MailboxDomainSelect'
import { ManagedMailboxList } from './ManagedMailboxList'

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
  const showOnboarding = useEffectEvent(show)

  useEffect(() => {
    if (enabledDomains.some((domain) => domain.name === domainName)) return
    setDomainName(enabledDomains[0]?.name || '')
  }, [domainName, enabledDomains])

  useEffect(() => {
    if (onboardingShown.current || !loaded || !canManage || mailboxes.length) return
    onboardingShown.current = true
    showOnboarding()
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

                <ManagedMailboxList
                  mailboxes={mailboxes}
                  scope={scope}
                  disabled={Boolean(busyAddress)}
                  onMailboxesChanged={onMailboxesChanged}
                  onScopeChange={onScopeChange}
                  onError={setError}
                  onNotice={setNotice}
                />
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
