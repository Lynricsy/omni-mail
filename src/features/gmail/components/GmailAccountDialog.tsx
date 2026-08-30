import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { api, type GmailAccount, type MailSyncLimit } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { DangerConfirmDialog } from '../../../shared/ui/dialogs/DangerConfirmDialog'
import { GmailAccountSettings, type GmailAccountSettingsView } from './GmailAccountSettings'
import '../../qq-mail/styles/qq-mail-dialog.css'

type View = 'accounts' | 'connect' | GmailAccountSettingsView
type MotionDirection = 'forward' | 'back'
const DIALOG_EXIT_MS = 170

function statusLabel(account: GmailAccount): string {
  if (account.status === 'syncing') return t('正在同步')
  if (account.status === 'credential_error') return t('应用密码失效')
  if (account.status === 'error') return t('同步异常')
  return t('已连接')
}

function accountErrorLabel(code: string): string {
  if (code === 'authentication_failed') return t('应用专用密码无效，请更新后重试。')
  if (code === 'timeout') return t('连接 Gmail 超时，系统稍后会重试。')
  if (code === 'response_too_large') return t('Gmail 响应超过安全读取上限。')
  if (code === 'extension_unavailable') return t('当前账号缺少所需的 Gmail IMAP 扩展。')
  if (code === 'credential_key_unavailable') return t('Gmail 凭据加密密钥暂时不可用。')
  if (code === 'credential_decryption_failed') return t('已保存的 Gmail 凭据无法解密，请更新应用密码。')
  return t('暂时无法同步，系统稍后会重试。')
}

function accountViewCopy(view: GmailAccountSettingsView, name: string) {
  if (view === 'account') return {
    title: t('设置 {name}', { name }), description: t('选择一个项目继续设置。'),
  }
  if (view === 'rename') return {
    title: t('备注名称'), description: t('只用于 OmniMail 内区分账号。'),
  }
  if (view === 'verify') return {
    title: t('验证邮箱连接'), description: t('检查当前应用专用密码是否仍可登录 Gmail IMAP。'),
  }
  if (view === 'sync') return {
    title: t('同步这个账号'), description: t('立即将最新 Gmail 邮件加入后台同步队列。'),
  }
  return {
    title: t('更新应用专用密码'), description: t('验证成功后才会替换已保存的密文。'),
  }
}

export function GmailAccountDialog({ accounts, startAdding = false, onClose, onChanged }: {
  accounts: GmailAccount[]
  startAdding?: boolean
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [view, setView] = useState<View>(accounts.length && !startAdding ? 'accounts' : 'connect')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [target, setTarget] = useState<GmailAccount | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [syncLimit, setSyncLimit] = useState<MailSyncLimit>(20)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [motionDirection, setMotionDirection] = useState<MotionDirection>('forward')
  const [hasNavigated, setHasNavigated] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const closeTimer = useRef<number | null>(null)
  const busyRef = useRef(busy)
  const onCloseRef = useRef(onClose)
  const previousView = useRef(view)
  busyRef.current = busy
  onCloseRef.current = onClose

  const accountView = view === 'accounts' || view === 'connect' ? null : view

  function close() {
    if (busyRef.current || closeTimer.current !== null) return
    setClosing(true)
    setVisible(false)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      onCloseRef.current()
    }, reducedMotion ? 0 : DIALOG_EXIT_MS)
  }

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const enterFrame = window.requestAnimationFrame(() => {
      setVisible(true)
      closeRef.current?.focus()
    })
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    ) || [])
    const onKeyDown = (event: KeyboardEvent) => {
      if (closeTimer.current !== null) {
        if (event.key === 'Tab' || event.key === 'Escape') event.preventDefault()
        return
      }
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const controls = focusable()
      if (!controls.length) return
      const first = controls[0]
      const last = controls.at(-1)!
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(enterFrame)
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [])

  useEffect(() => {
    setTarget((currentTarget) => currentTarget
      ? accounts.find(({ id }) => id === currentTarget.id) ?? currentTarget
      : currentTarget)
  }, [accounts])

  useEffect(() => {
    if (previousView.current === view) return
    previousView.current = view
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  useEffect(() => { if (error) feedbackRef.current?.focus() }, [error])

  function clearFeedback() {
    setError('')
    setNotice('')
  }

  function navigate(next: View, direction: MotionDirection) {
    setMotionDirection(direction)
    setHasNavigated(true)
    setView(next)
  }

  function openAccount(account: GmailAccount) {
    clearFeedback()
    setTarget(account)
    setRenameValue(account.name)
    setPassword('')
    setConfirmDelete(false)
    navigate('account', 'forward')
  }

  function openSetting(next: Exclude<GmailAccountSettingsView, 'account'>) {
    clearFeedback()
    setPassword('')
    setPasswordVisible(false)
    navigate(next, 'forward')
  }

  function goBack() {
    clearFeedback()
    setConfirmDelete(false)
    setPassword('')
    if (view !== 'accounts' && view !== 'connect' && view !== 'account') {
      navigate('account', 'back')
      return
    }
    setTarget(null)
    navigate('accounts', 'back')
  }

  async function connect(event: FormEvent) {
    event.preventDefault()
    setBusy('connect')
    clearFeedback()
    try {
      await api.connectGmail({ name, email, appPassword: password })
      setName(''); setEmail(''); setPassword('')
      await onChanged()
      setNotice(t('Gmail 账号已连接，首次同步已进入队列。'))
      navigate('accounts', 'back')
    } catch (connectError) {
      setError(errorMessage(connectError))
    } finally {
      setBusy('')
    }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault()
    if (!target) return
    setBusy(`password:${target.id}`)
    clearFeedback()
    try {
      await api.updateGmailAppPassword(target.id, password)
      setPassword('')
      await onChanged()
      setNotice(t('应用专用密码已更新，旧凭据未在验证前被覆盖。'))
    } catch (updateError) {
      setError(errorMessage(updateError))
    } finally {
      setBusy('')
    }
  }

  async function rename(event: FormEvent) {
    event.preventDefault()
    if (!target) return
    setBusy(`rename:${target.id}`)
    clearFeedback()
    try {
      const result = await api.renameGmail(target.id, renameValue)
      setTarget(result.account)
      setRenameValue(result.account.name)
      await onChanged()
      setNotice(t('账号名称已更新。'))
    } catch (renameError) {
      setError(errorMessage(renameError))
    } finally {
      setBusy('')
    }
  }

  async function verify(account: GmailAccount) {
    setBusy(`verify:${account.id}`)
    clearFeedback()
    try {
      await api.verifyGmail(account.id)
      await onChanged()
      setNotice(t('Gmail 连接验证成功。'))
    } catch (verifyError) {
      setError(errorMessage(verifyError))
      await onChanged()
    } finally {
      setBusy('')
    }
  }

  async function sync(account: GmailAccount) {
    setBusy(`sync:${account.id}`)
    clearFeedback()
    try {
      await api.syncGmail(account.id, syncLimit)
      setNotice(t('同步任务已加入队列。'))
    } catch (syncError) {
      setError(errorMessage(syncError))
    } finally {
      setBusy('')
    }
  }

  async function remove(account: GmailAccount) {
    setBusy(`delete:${account.id}`)
    clearFeedback()
    try {
      await api.disconnectGmail(account.id)
      setConfirmDelete(false)
      setTarget(null)
      await onChanged()
      setNotice(t('本地连接和索引已删除；请继续在 Google 账号中撤销对应应用密码。'))
      navigate('accounts', 'back')
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setBusy('')
    }
  }

  const copy = accountView ? accountViewCopy(accountView, target?.name || t('Gmail 账号')) : null
  const title = view === 'accounts' ? t('Gmail 账号管理')
    : view === 'connect' ? t('连接 Gmail 账号') : copy!.title
  const description = view === 'accounts'
    ? t('连接新账号，或选择已有账号管理凭据与状态。')
    : view === 'connect' ? t('验证 Gmail IMAP 后，加密保存应用专用密码。') : copy!.description
  const canGoBack = view !== 'accounts' && (view !== 'connect' || accounts.length > 0)
  const motionClass = hasNavigated ? ` qq-mail-view-motion is-${motionDirection}` : ''

  return <div className={`icloud-modal-backdrop gmail-dialog-backdrop${visible ? ' is-visible' : ''}${closing ? ' is-closing' : ''}`}
    role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <section ref={dialogRef} className={`icloud-modal gmail-account-dialog${accountView ? ' qq-mail-account-flow' : ''}`}
      role="dialog" aria-modal="true" aria-busy={Boolean(busy)} aria-labelledby={titleId}
      aria-describedby={descriptionId}>
      <header className={canGoBack ? 'has-back' : ''}>
        {canGoBack && <button className="icon-button gmail-dialog-back" type="button" onClick={goBack}
          disabled={Boolean(busy)} aria-label={t('返回')}><ArrowLeft size={17} aria-hidden="true" /></button>}
        <div key={`heading:${view}`} className={motionClass.trim() || undefined}>
          <p className="eyebrow">GMAIL · IMAP</p>
          <h2 ref={titleRef} id={titleId} tabIndex={-1}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <button ref={closeRef} className="icon-button" type="button" onClick={close}
          disabled={Boolean(busy)} aria-label={t('关闭')}><X size={17} aria-hidden="true" /></button>
      </header>

      <div key={`view:${view}`} className={`qq-mail-dialog-pane${motionClass}`}>
        {(notice || error) && <div className="gmail-dialog-feedback">
          {notice && <p className="gmail-dialog-notice" role="status"><Check size={15} />{notice}</p>}
          {error && <p ref={feedbackRef} className="inline-error" role="alert" tabIndex={-1}>
            <AlertCircle size={15} />{error}</p>}
        </div>}

        {view === 'connect' && <form className="icloud-form gmail-connect-form"
          onSubmit={(event) => void connect(event)}>
          <label htmlFor="gmail-account-name"><span>{t('账号名称')}</span>
            <input id="gmail-account-name" value={name} maxLength={60} required autoComplete="off"
              disabled={Boolean(busy)} onChange={(event) => setName(event.target.value)}
              placeholder={t('例如：个人 Gmail')} /></label>
          <label htmlFor="gmail-account-email"><span>{t('邮箱地址')}</span>
            <input id="gmail-account-email" type="email" value={email} maxLength={254} required
              autoComplete="username" disabled={Boolean(busy)} onChange={(event) => setEmail(event.target.value)}
              placeholder="name@gmail.com" /></label>
          <label htmlFor="gmail-app-password"><span>{t('16 位应用专用密码')}</span>
            <span className="gmail-password-input"><input id="gmail-app-password"
              type={passwordVisible ? 'text' : 'password'} value={password} required
              autoComplete="new-password" inputMode="text" disabled={Boolean(busy)}
              aria-describedby="gmail-connect-password-help"
              onChange={(event) => setPassword(event.target.value)} placeholder="abcd efgh ijkl mnop" />
              <button type="button" disabled={Boolean(busy)} onClick={() => setPasswordVisible((value) => !value)}
                aria-label={t(passwordVisible ? '隐藏应用密码' : '显示应用密码')}>
                {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button></span>
            <small id="gmail-connect-password-help">{t('这不是 Google 账号主密码；可以直接粘贴带空格的分组格式。')}</small>
          </label>
          <footer className="gmail-connect-actions">
            <a className="button button--secondary" href="https://myaccount.google.com/apppasswords"
              target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden="true" />{t('创建 Google 应用密码')}</a>
            <button className="button button--primary" type="submit" disabled={Boolean(busy)}>
              {busy === 'connect' ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
              {t(busy === 'connect' ? '正在验证并连接…' : '验证并连接')}</button>
          </footer>
        </form>}

        {view === 'accounts' && <div className="gmail-account-list">
          <div className="gmail-account-list__summary"><span>{t('已连接 {count} 个账号', { count: accounts.length })}</span>
            <button className="button button--primary button--small" type="button"
              onClick={() => { clearFeedback(); navigate('connect', 'forward') }}>
              <Plus size={15} aria-hidden="true" />{t('添加账号')}</button></div>
          {!accounts.length && <div className="gmail-account-list__empty"><KeyRound size={20} aria-hidden="true" />
            <strong>{t('还没有 Gmail 账号')}</strong><span>{t('添加账号后，可在这里分别管理连接与凭据。')}</span></div>}
          {accounts.map((account) => <button className="gmail-account-card" type="button" key={account.id}
            onClick={() => openAccount(account)}>
            <span className="gmail-account-card__icon">{account.name.slice(0, 1).toUpperCase()}</span>
            <span className="gmail-account-card__content"><strong>{account.name}</strong><small>{account.email}</small>
              {account.lastSyncedAt && <small>{t('最后同步：{time}', { time: new Date(account.lastSyncedAt * 1000).toLocaleString() })}</small>}
              {account.lastErrorCode && <small className="gmail-account-error">{accountErrorLabel(account.lastErrorCode)}</small>}
            </span>
            <span className="gmail-account-card__side"><em className={`is-${account.status}`}>{statusLabel(account)}</em>
              <span>{t('管理')}<ChevronRight size={14} aria-hidden="true" /></span></span>
          </button>)}
        </div>}

        {accountView && target && <GmailAccountSettings account={target} view={accountView}
          status={statusLabel(target)} accountError={target.lastErrorCode ? accountErrorLabel(target.lastErrorCode) : ''}
          renameValue={renameValue} password={password} passwordVisible={passwordVisible} busy={busy}
          syncLimit={syncLimit} onOpen={openSetting} onRenameValueChange={setRenameValue} onRename={rename}
          onVerify={() => void verify(target)} onSync={() => void sync(target)} onSyncLimitChange={setSyncLimit}
          onPasswordChange={setPassword} onPasswordVisibleChange={() => setPasswordVisible((value) => !value)}
          onUpdatePassword={updatePassword} onDisconnect={() => setConfirmDelete(true)} />}
      </div>
    </section>
    {confirmDelete && target && <DangerConfirmDialog icon={Trash2} eyebrow={t('GMAIL · 账号管理')}
      title={t('断开这个 Gmail 账号')} description={t('账号“{name}”及其本地索引将从 OmniMail 中移除。', { name: target.name })}
      impactTitle={t('Gmail 中的邮件不会被删除')}
      impactDescription={t('应用专用密码仍需前往 Google 账号设置手动撤销。')}
      confirmLabel={t(busy === `delete:${target.id}` ? '正在断开…' : '确认断开')}
      busy={busy === `delete:${target.id}`} onCancel={() => setConfirmDelete(false)}
      onConfirm={() => void remove(target)} />}
  </div>
}
