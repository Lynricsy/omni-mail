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
} from '../lib/api'
import { t } from '../lib/i18n'

interface Props {
  domains: ManagedDomain[]
  disabled: boolean
  onCreated: (mailbox: MailboxAddress) => Promise<void>
}

function randomLocalPart(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `omni-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function message(error: unknown): string {
  return t(error instanceof Error ? error.message : '无法生成邮箱，请稍后重试。')
}

export function QuickMailboxGenerator({ domains, disabled, onCreated }: Props) {
  const enabledDomains = useMemo(
    () => domains.filter((domain) => domain.isActive),
    [domains],
  )
  const [open, setOpen] = useState(false)
  const [domain, setDomain] = useState('')
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
    setBusy(true)
    setError('')
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await api.addMailbox(`${randomLocalPart()}@${domain}`)
        await onCreated(result.mailbox)
        setOpen(false)
        setBusy(false)
        return
      } catch (generateError) {
        const mayRetry = generateError instanceof ApiError
          && generateError.status === 409
          && attempt < 2
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
            <p>{t('选择域名后缀，系统会生成一个未占用的随机邮箱地址。')}</p>
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
              <span>{t('生成格式')}</span>
              <strong>omni-{t('随机字符')}@{domain}</strong>
            </div>
            {error && <p className="quick-mailbox__error" role="alert">{error}</p>}
            <button
              className="button button--primary quick-mailbox__submit"
              type="button"
              disabled={busy || !domain}
              onClick={() => void generate()}
            >
              {busy ? <LoaderCircle className="spin" size={16} /> : <MailPlus size={16} />}
              {t(busy ? '正在生成…' : '一键生成邮箱')}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
