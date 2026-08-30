import {
  AtSign,
  Check,
  LoaderCircle,
  MailPlus,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  ApiError,
  type MailboxAddress,
  type ManagedDomain,
} from '../../../shared/api'
import { t } from '../../../shared/i18n'
import {
  randomMailboxLocalPart,
  validMailboxLocalPart,
} from '../model/mailboxAddress'

interface Props {
  domains: ManagedDomain[]
  disabled: boolean
  randomMailboxPrefix: string
  onCreated: (mailbox: MailboxAddress) => Promise<void>
}

function message(error: unknown): string {
  return t(error instanceof Error ? error.message : '无法生成邮箱，请稍后重试。')
}

export function QuickMailboxGenerator({
  domains,
  disabled,
  randomMailboxPrefix,
  onCreated,
}: Props) {
  const enabledDomains = useMemo(
    () => domains.filter((domain) => domain.isActive),
    [domains],
  )
  const [open, setOpen] = useState(false)
  const [domain, setDomain] = useState('')
  const [localPart, setLocalPart] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (enabledDomains.some((item) => item.name === domain)) return
    setDomain(enabledDomains[0]?.name || '')
  }, [domain, enabledDomains])

  useEffect(() => {
    if (!open) return
    function pointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node) && !busy) setOpen(false)
    }
    function keyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) setOpen(false)
    }
    document.addEventListener('pointerdown', pointerDown)
    document.addEventListener('keydown', keyDown)
    return () => {
      document.removeEventListener('pointerdown', pointerDown)
      document.removeEventListener('keydown', keyDown)
    }
  }, [busy, open])

  async function generate() {
    if (!domain || busy) return
    const requestedLocalPart = localPart.trim().toLowerCase()
    if (requestedLocalPart && !validMailboxLocalPart(requestedLocalPart)) {
      setError(t('邮箱前缀支持字母、数字、点、下划线、加号和连字符，长度为 1–64 个字符。'))
      return
    }
    setBusy(true)
    setError('')
    const maximumAttempts = requestedLocalPart ? 1 : 3
    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      try {
        const nextLocalPart = requestedLocalPart
          || randomMailboxLocalPart(randomMailboxPrefix)
        const result = await api.addMailbox(`${nextLocalPart}@${domain}`)
        await onCreated(result.mailbox)
        setLocalPart('')
        setOpen(false)
        setBusy(false)
        return
      } catch (generateError) {
        const mayRetry = generateError instanceof ApiError
          && generateError.status === 409
          && attempt < maximumAttempts - 1
        if (mayRetry) continue
        setError(message(generateError))
        break
      }
    }
    setBusy(false)
  }

  const unavailable = disabled || !enabledDomains.length

  return (
    <div className="quick-mailbox" ref={rootRef}>
      <button
        className="icon-button"
        type="button"
        aria-label={t('快速生成邮箱')}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip={t(unavailable ? '暂无创建邮箱的权限或可用域名' : '快速生成邮箱')}
        disabled={unavailable}
        onClick={() => {
          setError('')
          setOpen((current) => !current)
        }}
      >
        <MailPlus size={17} />
      </button>

      {open && (
        <section className="quick-mailbox__panel" role="dialog" aria-labelledby="quick-mailbox-title">
          <header>
            <div>
              <small>QUICK MAILBOX</small>
              <strong id="quick-mailbox-title">{t('快速生成邮箱')}</strong>
            </div>
            <button
              className="icon-button icon-button--small"
              type="button"
              aria-label={t('关闭快速生成邮箱')}
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </header>

          <div className="quick-mailbox__content">
            <p>{t('输入邮箱前缀，或者留空让系统随机生成。')}</p>
            <label className="quick-mailbox__local-part" htmlFor="quick-mailbox-local-part">
              <span>{t('邮箱前缀')} <small>{t('可选')}</small></span>
              <input
                id="quick-mailbox-local-part"
                type="text"
                value={localPart}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                placeholder={t('留空随机生成')}
                disabled={busy}
                onChange={(event) => {
                  setLocalPart(event.target.value)
                  setError('')
                }}
              />
            </label>
            <div className="quick-mailbox__domains" role="radiogroup" aria-label={t('邮箱域名后缀')}>
              {enabledDomains.map((item) => (
                <button
                  className={domain === item.name ? 'is-selected' : ''}
                  type="button"
                  role="radio"
                  aria-checked={domain === item.name}
                  disabled={busy}
                  key={item.name}
                  onClick={() => setDomain(item.name)}
                >
                  <AtSign size={15} />
                  <span>{item.name}</span>
                  {domain === item.name && <Check size={15} />}
                </button>
              ))}
            </div>
            <div className="quick-mailbox__preview">
              <span>{t('即将创建')}</span>
              <strong>{localPart.trim().toLowerCase()
                || `${randomMailboxPrefix}${t('随机字符')}`}@{domain}</strong>
            </div>
            {error && <p className="quick-mailbox__error" role="alert">{error}</p>}
            <button
              className="button button--primary quick-mailbox__submit"
              type="button"
              disabled={busy || !domain}
              onClick={() => void generate()}
            >
              {busy ? <LoaderCircle className="spin" size={16} /> : <MailPlus size={16} />}
              {t(busy
                ? '正在生成…'
                : localPart.trim() ? '创建自定义邮箱' : '随机生成邮箱')}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
