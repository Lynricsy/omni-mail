import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
  Unplug,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import type { LinuxDoMailAccount } from '../../../shared/api'
import { t } from '../../../shared/i18n'

type AccountAction = 'verify' | 'update' | ''

export function LinuxDoMailAccountDialog({
  account,
  action,
  error,
  onCancel,
  onVerify,
  onUpdateCredential,
  onRequestDisconnect,
}: {
  account: LinuxDoMailAccount
  action: AccountAction
  error: string
  onCancel: () => void
  onVerify: () => Promise<void>
  onUpdateCredential: (password: string) => Promise<void>
  onRequestDisconnect: () => void
}) {
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [visible, setVisible] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const helpId = useId()
  const errorId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const busy = Boolean(action)
  const busyRef = useRef(busy)
  const cancelRef = useRef(onCancel)
  busyRef.current = busy
  cancelRef.current = onCancel

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => {
      setVisible(true)
      dialogRef.current?.querySelector<HTMLElement>('[data-modal-autofocus]')?.focus()
    })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) cancelRef.current()
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
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', keydown)
      previousFocus?.focus()
    }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    await onUpdateCredential(password)
  }

  return createPortal(
    <div className={`icloud-modal-backdrop${visible ? ' is-visible' : ''}`}
      onMouseDown={(event) => !busy && event.target === event.currentTarget && onCancel()}>
      <section ref={dialogRef} className="icloud-modal linuxdo-account-dialog" role="dialog"
        aria-modal="true" aria-busy={busy} aria-labelledby={titleId}
        aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ''}`}>
        <header>
          <div>
            <p className="eyebrow">LINUX DO · MAIL</p>
            <h2 id={titleId}>{t('Linux DO 账号管理')}</h2>
            <p id={descriptionId}>{t('验证连接、更新凭据或断开当前邮箱。')}</p>
          </div>
          <button className="icon-button" type="button" disabled={busy} onClick={onCancel}
            aria-label={t('关闭')}><X size={17} aria-hidden="true" /></button>
        </header>

        <div className="linuxdo-account-summary">
          <span className="linuxdo-account-summary__icon"><KeyRound size={18} aria-hidden="true" /></span>
          <span><strong>{account.username}</strong>
            <small>{t('上次验证：{time}', {
              time: account.lastValidated ? new Date(account.lastValidated).toLocaleString() : t('尚未验证'),
            })}</small></span>
          <span className={`linuxdo-status is-${account.status}`}>
            {account.status === 'active' ? <ShieldCheck size={13} /> : <AlertCircle size={13} />}
            {t(account.status === 'active' ? '已连接' : '需要验证')}
          </span>
        </div>

        {error && <p id={errorId} className="inline-error linuxdo-account-error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />{error}
        </p>}

        <section className="linuxdo-account-action">
          <span><strong>{t('验证邮箱连接')}</strong>
            <small>{t('检查当前凭据是否仍可登录 Linux DO Mail。')}</small></span>
          <button className="button button--secondary" type="button" data-modal-autofocus
            disabled={busy} onClick={() => void onVerify()}>
            {action === 'verify' ? <LoaderCircle className="spin" size={16} aria-hidden="true" />
              : <ShieldCheck size={16} aria-hidden="true" />}
            {t(action === 'verify' ? '正在验证…' : '立即验证')}
          </button>
        </section>

        <form className="icloud-form linuxdo-account-credential" onSubmit={(event) => void submit(event)}>
          <div className="linuxdo-account-section-heading">
            <span className="linuxdo-account-section-icon"><KeyRound size={16} aria-hidden="true" /></span>
            <span><strong>{t('更新密码或认证令牌')}</strong>
              <small>{t('验证成功后才会替换已保存的密文。')}</small></span>
          </div>
          <label htmlFor="linuxdo-mail-new-password">
            <span>{t('新密码或认证令牌')}</span>
            <span className="linuxdo-password-field">
              <input id="linuxdo-mail-new-password" required maxLength={512}
                type={shown ? 'text' : 'password'} autoComplete="new-password"
                aria-invalid={Boolean(error)}
                aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`}
                disabled={busy} value={password}
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
            {t('新凭据不会显示或保存到浏览器；建议使用可撤销的专用认证令牌。')}
          </p>
          <footer>
            <button className="button button--primary" disabled={busy || !password.trim()}>
              {action === 'update' ? <LoaderCircle className="spin" size={16} aria-hidden="true" />
                : <KeyRound size={16} aria-hidden="true" />}
              {t(action === 'update' ? '正在验证并更新…' : '验证并更新')}
            </button>
          </footer>
        </form>

        <div className="linuxdo-account-danger">
          <span><strong>{t('断开 Linux DO 邮箱')}</strong>
            <small>{t('删除 OmniMail 保存的密文，不影响服务器上的邮件。')}</small></span>
          <button className="button icloud-danger-button" type="button" disabled={busy}
            onClick={onRequestDisconnect}><Unplug size={16} aria-hidden="true" />{t('断开账号')}</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
