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
import {
  api,
  type MailSyncLimit,
  type QqMailAccount,
  type QqMailIdentity,
} from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { DangerConfirmDialog } from '../../../shared/ui/dialogs/DangerConfirmDialog'
import {
  QqMailAccountSettings,
  type QqMailAccountSettingsView,
} from './QqMailAccountSettings'
import '../styles/qq-mail-dialog.css'

type View = 'accounts' | 'connect' | QqMailAccountSettingsView
type MotionDirection = 'forward' | 'back'
const DIALOG_EXIT_MS = 170

function statusLabel(account: QqMailAccount): string {
  if (account.status === 'syncing') return t('正在同步')
  if (account.status === 'credential_error') return t('授权码失效')
  if (account.status === 'error') return t('同步异常')
  return t('已连接')
}

function accountErrorLabel(code: string): string {
  if (code === 'authentication_failed') return t('授权码无效，或 QQ 邮箱尚未开启 IMAP 服务。')
  if (code === 'timeout') return t('连接 QQ 邮箱超时，系统稍后会重试。')
  if (code === 'response_too_large') return t('QQ 邮箱响应超过安全读取上限。')
  if (code === 'smtp_failed') return t('QQ SMTP 发信失败，请稍后重试。')
  if (code === 'credential_key_unavailable') return t('QQ 邮箱凭据加密密钥暂时不可用。')
  if (code === 'credential_decryption_failed') return t('已保存的 QQ 邮箱授权码无法解密，请更新授权码。')
  return t('暂时无法同步，系统稍后会重试。')
}

function accountViewCopy(view: QqMailAccountSettingsView, name: string) {
  if (view === 'account') return {
    title: t('设置 {name}', { name }), description: t('选择一个项目继续设置。'),
  }
  if (view === 'rename') return {
    title: t('备注名称'), description: t('只用于 OmniMail 内区分账号。'),
  }
  if (view === 'identities') return {
    title: t('邮箱身份'), description: t('这些地址共享同一个 QQ 收件箱，只在发信时选择身份。'),
  }
  if (view === 'verify') return {
    title: t('验证邮箱连接'), description: t('检查当前授权码是否仍可登录 QQ 邮箱 IMAP。'),
  }
  if (view === 'sync') return {
    title: t('同步这个账号'), description: t('立即将最新 QQ 邮件加入后台同步队列。'),
  }
  return {
    title: t('更新授权码'), description: t('验证成功后才会替换已保存的密文。'),
  }
}

export function QqMailAccountDialog({ accounts, startAdding = false, onClose, onChanged }: {
  accounts: QqMailAccount[]
  startAdding?: boolean
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [view, setView] = useState<View>(accounts.length && !startAdding ? 'accounts' : 'connect')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeVisible, setCodeVisible] = useState(false)
  const [target, setTarget] = useState<QqMailAccount | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [identityToDelete, setIdentityToDelete] = useState<QqMailIdentity | null>(null)
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
  const confirmationOpen = confirmDelete || Boolean(identityToDelete)
  const confirmDeleteRef = useRef(confirmationOpen)
  const onCloseRef = useRef(onClose)
  const previousView = useRef(view)
  busyRef.current = busy
  confirmDeleteRef.current = confirmationOpen
  onCloseRef.current = onClose

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
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement : null
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
      if (confirmDeleteRef.current) return
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
    if (error) feedbackRef.current?.focus()
  }, [error])

  useEffect(() => {
    if (previousView.current === view) return
    previousView.current = view
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  useEffect(() => {
    setTarget((current) => current
      ? accounts.find(({ id }) => id === current.id) ?? current
      : current)
  }, [accounts])

  function clearFeedback() {
    setError('')
    setNotice('')
  }

  function navigate(next: View, direction: MotionDirection) {
    setMotionDirection(direction)
    setHasNavigated(true)
    setView(next)
  }

  function openAccount(account: QqMailAccount) {
    clearFeedback()
    setTarget(account)
    setRenameValue(account.name)
    setCode('')
    setConfirmDelete(false)
    setIdentityToDelete(null)
    navigate('account', 'forward')
  }

  function goBack() {
    clearFeedback()
    setConfirmDelete(false)
    setIdentityToDelete(null)
    setCode('')
    if (view !== 'accounts' && view !== 'connect' && view !== 'account') {
      navigate('account', 'back')
      return
    }
    setTarget(null)
    navigate('accounts', 'back')
  }

  function openSetting(next: Exclude<QqMailAccountSettingsView, 'account'>) {
    clearFeedback()
    setCode('')
    setCodeVisible(false)
    navigate(next, 'forward')
  }

  async function connect(event: FormEvent) {
    event.preventDefault()
    setBusy('connect')
    clearFeedback()
    try {
      await api.connectQqMail({ name, email, authorizationCode: code })
      setName(''); setEmail(''); setCode('')
      await onChanged()
      setNotice(t('QQ 邮箱账号已连接，首次同步已进入队列。'))
      navigate('accounts', 'back')
    } catch (connectError) {
      setError(errorMessage(connectError))
    } finally {
      setBusy('')
    }
  }

  async function updateCode(event: FormEvent) {
    event.preventDefault()
    if (!target) return
    setBusy(`code:${target.id}`)
    clearFeedback()
    try {
      await api.updateQqMailAuthorizationCode(target.id, code)
      setCode('')
      await onChanged()
      setNotice(t('授权码已更新，旧凭据未在验证前被覆盖。'))
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
      const result = await api.renameQqMail(target.id, renameValue)
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

  async function addIdentity(name: string, email: string): Promise<boolean> {
    if (!target) return false
    setBusy(`identity:add:${target.id}`)
    clearFeedback()
    try {
      const result = await api.addQqMailIdentity(target.id, {
        name,
        email,
      })
      setTarget(result.account)
      await onChanged()
      setNotice(t('发信身份已通过 QQ SMTP 验证并添加。'))
      return true
    } catch (identityError) {
      setError(errorMessage(identityError))
      return false
    } finally {
      setBusy('')
    }
  }

  async function removeIdentity(identity: QqMailIdentity) {
    if (!target) return
    setBusy(`identity:delete:${identity.id}`)
    clearFeedback()
    try {
      const result = await api.deleteQqMailIdentity(target.id, identity.id)
      setTarget(result.account)
      setIdentityToDelete(null)
      await onChanged()
      setNotice(t('发信身份已从 OmniMail 中删除。'))
    } catch (identityError) {
      setError(errorMessage(identityError))
    } finally {
      setBusy('')
    }
  }

  async function verify(account: QqMailAccount) {
    setBusy(`verify:${account.id}`)
    clearFeedback()
    try {
      await api.verifyQqMail(account.id)
      await onChanged()
      setNotice(t('QQ 邮箱连接验证成功。'))
    } catch (verifyError) {
      setError(errorMessage(verifyError))
      await onChanged()
    } finally {
      setBusy('')
    }
  }

  async function sync(account: QqMailAccount) {
    setBusy(`sync:${account.id}`)
    clearFeedback()
    try {
      await api.syncQqMail(account.id, syncLimit)
      setNotice(t('同步任务已加入队列。'))
    } catch (syncError) {
      setError(errorMessage(syncError))
    } finally {
      setBusy('')
    }
  }

  async function remove(account: QqMailAccount) {
    setBusy(`delete:${account.id}`)
    clearFeedback()
    try {
      await api.disconnectQqMail(account.id)
      setConfirmDelete(false)
      setTarget(null)
      await onChanged()
      setNotice(t('本地连接和索引已删除；请继续在 QQ 邮箱设置中撤销对应授权码。'))
      navigate('accounts', 'back')
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setBusy('')
    }
  }

  const accountView = view === 'accounts' || view === 'connect' ? null : view
  const accountCopy = accountView
    ? accountViewCopy(accountView, target?.name || t('QQ 邮箱账号')) : null
  const title = view === 'accounts' ? t('QQ 邮箱账号管理')
    : view === 'connect' ? t('连接 QQ 邮箱账号') : accountCopy!.title
  const description = view === 'accounts'
    ? t('连接新账号，或选择已有账号管理授权码、发信身份与状态。')
    : view === 'connect' ? t('验证 QQ IMAP 后，加密保存授权码。') : accountCopy!.description
  const canGoBack = view !== 'accounts' && (view !== 'connect' || accounts.length > 0)
  const motionClass = hasNavigated ? ` qq-mail-view-motion is-${motionDirection}` : ''

  return <div className={`icloud-modal-backdrop gmail-dialog-backdrop qq-mail-dialog-backdrop${visible ? ' is-visible' : ''}${closing ? ' is-closing' : ''}`}
    role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <section ref={dialogRef} className={`icloud-modal gmail-account-dialog${accountView ? ' qq-mail-account-flow' : ''}`} role="dialog"
      aria-modal="true" aria-busy={Boolean(busy)} aria-labelledby={titleId}
      aria-describedby={descriptionId} aria-hidden={confirmationOpen || undefined}
      inert={confirmationOpen || undefined}>
      <header className={canGoBack ? 'has-back' : ''}>
        {canGoBack && <button className="icon-button gmail-dialog-back" type="button"
          onClick={goBack} disabled={Boolean(busy)} aria-label={t('返回')}>
          <ArrowLeft size={17} aria-hidden="true" />
        </button>}
        <div key={`heading:${view}`} className={motionClass.trim() || undefined}>
          <p className="eyebrow">QQ MAIL · IMAP</p><h2 ref={titleRef} id={titleId} tabIndex={-1}>{title}</h2>
          <p id={descriptionId}>{description}</p></div>
        <button ref={closeRef} className="icon-button" type="button" onClick={close}
          disabled={Boolean(busy)} aria-label={t('关闭')}><X size={17} aria-hidden="true" /></button>
      </header>

      <div key={`view:${view}`} className={`qq-mail-dialog-pane${motionClass}`}>
        {(notice || error) && <div className="gmail-dialog-feedback">
        {notice && <p className="gmail-dialog-notice" role="status"><Check size={15} />{notice}</p>}
        {error && <p ref={feedbackRef} className="inline-error" role="alert" tabIndex={-1}>
          <AlertCircle size={15} />{error}</p>}
        </div>}

      {view === 'connect' && <form className="icloud-form gmail-connect-form" onSubmit={connect}>
        <label htmlFor="qq-mail-account-name"><span>{t('账号名称')}</span>
          <input id="qq-mail-account-name" value={name} maxLength={60} required autoComplete="off"
            disabled={Boolean(busy)} onChange={(event) => setName(event.target.value)}
            placeholder={t('例如：个人 QQ 邮箱')} /></label>
        <label htmlFor="qq-mail-account-email"><span>{t('邮箱地址')}</span>
          <input id="qq-mail-account-email" type="email" value={email} maxLength={254} required
            autoComplete="username" disabled={Boolean(busy)}
            onChange={(event) => setEmail(event.target.value)} placeholder="123456789@qq.com" /></label>
        <label htmlFor="qq-mail-authorization-code"><span>{t('QQ 邮箱授权码')}</span>
          <span className="gmail-password-input"><input id="qq-mail-authorization-code"
            type={codeVisible ? 'text' : 'password'} value={code} required
            autoComplete="new-password" inputMode="text" disabled={Boolean(busy)}
            aria-describedby="qq-mail-code-help" onChange={(event) => setCode(event.target.value)} />
            <button type="button" disabled={Boolean(busy)} onClick={() => setCodeVisible((value) => !value)}
              aria-label={t(codeVisible ? '隐藏授权码' : '显示授权码')}>
              {codeVisible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button></span>
          <small id="qq-mail-code-help">{t('请先在 QQ 邮箱设置中开启 IMAP/SMTP 服务并生成授权码；不要填写 QQ 登录密码。')}</small>
        </label>
        <footer className="gmail-connect-actions">
          <a className="button button--secondary" href="https://mail.qq.com/" target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />{t('打开 QQ 邮箱设置')}</a>
          <button className="button button--primary" type="submit" disabled={Boolean(busy)}>
            {busy === 'connect' ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
            {t(busy === 'connect' ? '正在验证并连接…' : '验证并连接')}
          </button>
        </footer>
      </form>}

      {view === 'accounts' && <div className="gmail-account-list">
        <div className="gmail-account-list__summary"><span>
          {t('已连接 {count} 个账号', { count: accounts.length })}</span>
          <button className="button button--primary button--small" type="button"
            onClick={() => { clearFeedback(); navigate('connect', 'forward') }}>
            <Plus size={15} aria-hidden="true" />{t('添加账号')}</button></div>
        {!accounts.length && <div className="gmail-account-list__empty">
          <KeyRound size={20} aria-hidden="true" /><strong>{t('还没有 QQ 邮箱账号')}</strong>
          <span>{t('添加账号后，可在这里分别管理连接与授权码。')}</span></div>}
        {accounts.map((account) => <button className="gmail-account-card" type="button"
          key={account.id} onClick={() => openAccount(account)}>
          <span className="gmail-account-card__icon">{account.name.slice(0, 1).toUpperCase()}</span>
          <span className="gmail-account-card__content"><strong>{account.name}</strong>
            <small>{account.email}</small>
            <small>{t('{count} 个已验证发信身份', { count: account.identities.length })}</small>
            {account.lastSyncedAt && <small>{t('最后同步：{time}', {
              time: new Date(account.lastSyncedAt * 1000).toLocaleString(),
            })}</small>}
            {account.lastErrorCode && <small className="gmail-account-error">
              {accountErrorLabel(account.lastErrorCode)}</small>}</span>
          <span className="gmail-account-card__side"><em className={`is-${account.status}`}>
            {statusLabel(account)}</em><span>{t('管理')}<ChevronRight size={14} aria-hidden="true" /></span></span>
        </button>)}
      </div>}

      {accountView && target && <QqMailAccountSettings account={target} view={accountView}
        status={statusLabel(target)}
        accountError={target.lastErrorCode ? accountErrorLabel(target.lastErrorCode) : ''}
        renameValue={renameValue} code={code} codeVisible={codeVisible} busy={busy}
        syncLimit={syncLimit} onSyncLimitChange={setSyncLimit}
        onOpen={openSetting} onRenameValueChange={setRenameValue} onRename={rename}
        onAddIdentity={addIdentity} onDeleteIdentity={setIdentityToDelete}
        onVerify={() => void verify(target)} onSync={() => void sync(target)}
        onCodeChange={setCode} onCodeVisibleChange={() => setCodeVisible((value) => !value)}
        onUpdateCode={updateCode} onDisconnect={() => setConfirmDelete(true)} />}
      </div>
    </section>
    {confirmDelete && target && <DangerConfirmDialog icon={Trash2}
      eyebrow={t('QQ MAIL · 账号管理')} title={t('断开 QQ 邮箱账号？')}
      description={t('账号“{name}”及其本地索引将从 OmniMail 中移除。', {
        name: target.name,
      })}
      impactTitle={t('QQ 邮箱中的邮件不会被删除')}
      impactDescription={t('授权码仍需前往 QQ 邮箱设置手动撤销。')}
      confirmLabel={t(busy === `delete:${target.id}` ? '正在断开…' : '确认断开')}
      busy={busy === `delete:${target.id}`} onCancel={() => setConfirmDelete(false)}
      onConfirm={() => void remove(target)} />}
    {identityToDelete && target && <DangerConfirmDialog icon={Trash2}
      eyebrow={t('QQ MAIL · 发信身份')} title={t('删除发信身份？')}
      description={t('地址“{address}”将不再出现在写信的发件人选择中。', {
        address: identityToDelete.email,
      })}
      impactTitle={t('共享收件箱和远端邮箱不受影响')}
      impactDescription={t('此操作只删除 OmniMail 保存的已验证发信身份。')}
      confirmLabel={t(busy === `identity:delete:${identityToDelete.id}` ? '正在删除…' : '确认删除')}
      busy={busy === `identity:delete:${identityToDelete.id}`}
      onCancel={() => setIdentityToDelete(null)}
      onConfirm={() => void removeIdentity(identityToDelete)} />}
  </div>
}
