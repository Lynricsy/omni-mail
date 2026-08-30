import { Check, Copy, ExternalLink, ShieldAlert, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../i18n'

export function ExternalLinkDialog({
  href,
  onClose,
  onContinue,
}: {
  href: string
  onClose: () => void
  onContinue: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const destination = new URL(href).host

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [onClose])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(href)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return createPortal(
    <div className="external-link-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        ref={dialogRef}
        className="external-link-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header>
          <span className="external-link-dialog__symbol"><ShieldAlert size={22} /></span>
          <div>
            <p className="eyebrow">EXTERNAL LINK</p>
            <h2 id={titleId}>{t('即将离开 OmniMail')}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t('关闭')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="external-link-dialog__body">
          <p id={descriptionId}>{t('您将要访问外部网站。请先确认目标域名可信，并留意钓鱼或仿冒页面。')}</p>
          <dl>
            <div>
              <dt>{t('目标域名')}</dt>
              <dd><ExternalLink size={15} /><strong>{destination}</strong></dd>
            </div>
            <div>
              <dt>{t('完整链接')}</dt>
              <dd className="external-link-url">
                <code>{href}</code>
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  aria-label={t(copyState === 'copied' ? '链接已复制' : '复制链接')}
                >
                  {copyState === 'copied' ? <Check size={16} /> : <Copy size={16} />}
                  <span>{t(copyState === 'copied' ? '链接已复制' : '复制链接')}</span>
                </button>
              </dd>
            </div>
          </dl>
          <p className="external-link-warning">
            <ShieldAlert size={16} />
            <span>{t('外部页面不受 OmniMail 控制，请勿在可疑页面输入密码、验证码或其他敏感信息。')}</span>
          </p>
          <p
            className={`external-link-copy-status${copyState === 'copied' ? ' external-link-copy-status--success' : ''}`}
            role="status"
            aria-live="polite"
          >
            {copyState === 'copied'
              ? t('链接已复制')
              : copyState === 'failed'
                ? t('无法访问剪贴板，请手动复制链接。')
                : ''}
          </p>
        </div>

        <footer>
          <button className="button button--secondary" type="button" data-autofocus onClick={onClose}>
            {t('取消')}
          </button>
          <button className="button button--primary" type="button" onClick={onContinue}>
            <ExternalLink size={16} />{t('继续访问')}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
