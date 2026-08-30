import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../../shared/i18n'

export function LinuxDoMailConnectDialog({
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  error: string
  onCancel: () => void
  onSubmit: (username: string, password: string) => Promise<void>
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [visible, setVisible] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const helpId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const busyRef = useRef(busy)
  const cancelRef = useRef(onCancel)
  busyRef.current = busy
  cancelRef.current = onCancel

  function close() {
    if (closeTimer.current !== undefined || busyRef.current) return
    setVisible(false)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    closeTimer.current = window.setTimeout(() => cancelRef.current(), reducedMotion ? 0 : 210)
  }

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => {
      setVisible(true)
      dialogRef.current?.querySelector<HTMLInputElement>('[data-modal-autofocus]')?.focus()
    })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) close()
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled])',
      )
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => {
      cancelAnimationFrame(frame)
      if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
      window.removeEventListener('keydown', keydown)
      previousFocus?.focus()
    }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    await onSubmit(username, password)
  }

  return createPortal(
    <div className={`icloud-modal-backdrop${visible ? ' is-visible' : ''}`}
      onMouseDown={(event) => !busy && event.target === event.currentTarget && close()}>
      <section ref={dialogRef} className="icloud-modal linuxdo-connect-dialog" role="dialog"
        aria-modal="true" aria-busy={busy} aria-labelledby={titleId}
        aria-describedby={descriptionId}>
        <header>
          <div><h2 id={titleId}>{t('连接 Linux DO 邮箱')}</h2>
            <p id={descriptionId}>{t('使用完整的 @linux.do 地址和密码或认证令牌。')}</p></div>
          <button className="icon-button" type="button" disabled={busy} onClick={close}
            aria-label={t('关闭')}><X size={17} aria-hidden="true" /></button>
        </header>
        <form className="icloud-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="linuxdo-mail-username">
            <span>{t('邮箱用户名')}</span>
            <input id="linuxdo-mail-username" data-modal-autofocus type="email" required
              maxLength={254} autoComplete="section-linuxdo username" placeholder="name@linux.do"
              disabled={busy} value={username}
              onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label htmlFor="linuxdo-mail-password">
            <span>{t('密码或认证令牌')}</span>
            <span className="linuxdo-password-field">
              <input id="linuxdo-mail-password" type={shown ? 'text' : 'password'} required
                maxLength={512} autoComplete="section-linuxdo current-password"
                aria-describedby={helpId} disabled={busy} value={password}
                onChange={(event) => setPassword(event.target.value)} />
              <button type="button" disabled={busy} aria-pressed={shown}
                onClick={() => setShown((current) => !current)}
                aria-label={t(shown ? '隐藏密码' : '显示密码')}>
                {shown ? <EyeOff size={17} aria-hidden="true" />
                  : <Eye size={17} aria-hidden="true" />}
              </button>
            </span>
          </label>
          <p id={helpId} className="linuxdo-connect-note">
            <ShieldCheck size={15} aria-hidden="true" />
            {t('建议使用可撤销的专用认证令牌；凭据只会加密保存在 Worker 中。')}
          </p>
          {error && <p className="inline-error" role="alert">
            <AlertCircle size={15} aria-hidden="true" />{error}
          </p>}
          <footer>
            <button className="button button--secondary" type="button" disabled={busy}
              onClick={close}>{t('取消')}</button>
            <button className="button button--primary" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" />
                : <KeyRound size={16} aria-hidden="true" />}
              {t(busy ? '正在验证…' : '验证并连接')}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  )
}
