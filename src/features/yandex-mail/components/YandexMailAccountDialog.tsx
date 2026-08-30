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
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { api, type YandexMailAccount } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { DangerConfirmDialog } from '../../../shared/ui/dialogs/DangerConfirmDialog'
import '../styles/yandex-mail-dialog.css'

type View = 'accounts' | 'account' | 'connect'
const DIALOG_EXIT_MS = 170

function statusLabel(account: YandexMailAccount): string {
  if (account.status === 'syncing') return t('正在同步')
  if (account.status === 'credential_error') return t('应用专用密码失效')
  if (account.status === 'error') return t('同步异常')
  return t('已连接')
}

function accountErrorLabel(code: string): string {
  if (code === 'authentication_failed') return t('应用专用密码无效，或 Yandex 邮箱尚未开启 IMAP 服务。')
  if (code === 'timeout') return t('连接 Yandex 邮箱超时，系统稍后会重试。')
  if (code === 'response_too_large') return t('Yandex 邮箱响应超过安全读取上限。')
  if (code === 'credential_key_unavailable') return t('Yandex 邮箱凭据加密密钥暂时不可用。')
  if (code === 'credential_decryption_failed') return t('已保存的 Yandex 邮箱应用专用密码无法解密，请更新应用专用密码。')
  return t('暂时无法同步，系统稍后会重试。')
}

export function YandexMailAccountDialog({ accounts, startAdding = false, onClose, onChanged }: {
  accounts: YandexMailAccount[]
  startAdding?: boolean
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [view, setView] = useState<View>(accounts.length && !startAdding ? 'accounts' : 'connect')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeVisible, setCodeVisible] = useState(false)
  const [target, setTarget] = useState<YandexMailAccount | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const feedbackRef = useRef<HTMLParagraphElement>(null)
  const closeTimer = useRef<number | null>(null)
  const busyRef = useRef(busy)
  const confirmDeleteRef = useRef(confirmDelete)
  const onCloseRef = useRef(onClose)
  busyRef.current = busy
  confirmDeleteRef.current = confirmDelete
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
    setTarget((current) => current
      ? accounts.find(({ id }) => id === current.id) ?? current
      : current)
  }, [accounts])

  function clearFeedback() {
    setError('')
    setNotice('')
  }

  function openAccount(account: YandexMailAccount) {
    clearFeedback()
    setTarget(account)
    setRenameValue(account.name)
    setCode('')
    setConfirmDelete(false)
    setView('account')
  }

  function goBack() {
    clearFeedback()
    setConfirmDelete(false)
    setCode('')
    setTarget(null)
    setView('accounts')
  }

  async function connect(event: FormEvent) {
    event.preventDefault()
    setBusy('connect')
    clearFeedback()
    try {
      await api.connectYandexMail({ name, email, appPassword: code })
      setName(''); setEmail(''); setCode('')
      await onChanged()
      setNotice(t('Yandex 邮箱账号已连接，首次同步已进入队列。'))
      setView('accounts')
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
      await api.updateYandexMailAppPassword(target.id, code)
      setCode('')
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
      const result = await api.renameYandexMail(target.id, renameValue)
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

  async function verify(account: YandexMailAccount) {
    setBusy(`verify:${account.id}`)
    clearFeedback()
    try {
      await api.verifyYandexMail(account.id)
      await onChanged()
      setNotice(t('Yandex 邮箱连接验证成功。'))
    } catch (verifyError) {
      setError(errorMessage(verifyError))
      await onChanged()
    } finally {
      setBusy('')
    }
  }

  async function sync(account: YandexMailAccount) {
    setBusy(`sync:${account.id}`)
    clearFeedback()
    try {
      await api.syncYandexMail(account.id)
      setNotice(t('同步任务已加入队列。'))
    } catch (syncError) {
      setError(errorMessage(syncError))
    } finally {
      setBusy('')
    }
  }

  async function remove(account: YandexMailAccount) {
    setBusy(`delete:${account.id}`)
    clearFeedback()
    try {
      await api.disconnectYandexMail(account.id)
      setConfirmDelete(false)
      setTarget(null)
      await onChanged()
      setNotice(t('本地连接和索引已删除；请继续在 Yandex 邮箱设置中撤销对应应用专用密码。'))
      setView('accounts')
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setBusy('')
    }
  }

  const title = view === 'accounts' ? t('Yandex 邮箱账号管理')
    : view === 'account' ? t('设置 {name}', { name: target?.name || t('Yandex 邮箱账号') })
      : t('连接 Yandex 邮箱账号')
  const description = view === 'accounts' ? t('连接新账号，或选择已有账号管理应用专用密码与状态。')
    : view === 'account' ? t('修改备注、验证连接、更新应用专用密码或断开邮箱。')
      : t('验证 Yandex IMAP 后，加密保存应用专用密码。')
  const canGoBack = view === 'account' || (view === 'connect' && accounts.length > 0)

  return <div className={`icloud-modal-backdrop gmail-dialog-backdrop yandex-mail-dialog-backdrop${visible ? ' is-visible' : ''}${closing ? ' is-closing' : ''}`}
    role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
    <section ref={dialogRef} className="icloud-modal gmail-account-dialog" role="dialog"
      aria-modal="true" aria-busy={Boolean(busy)} aria-labelledby={titleId}
      aria-describedby={descriptionId} aria-hidden={confirmDelete || undefined}
      inert={confirmDelete || undefined}>
      <header className={canGoBack ? 'has-back' : ''}>
        {canGoBack && <button className="icon-button gmail-dialog-back" type="button"
          onClick={goBack} disabled={Boolean(busy)} aria-label={t('返回')}>
          <ArrowLeft size={17} aria-hidden="true" />
        </button>}
        <div><p className="eyebrow">Yandex MAIL · IMAP</p><h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p></div>
        <button ref={closeRef} className="icon-button" type="button" onClick={close}
          disabled={Boolean(busy)} aria-label={t('关闭')}><X size={17} aria-hidden="true" /></button>
      </header>

      {(notice || error) && <div className="gmail-dialog-feedback">
        {notice && <p className="gmail-dialog-notice" role="status"><Check size={15} />{notice}</p>}
        {error && <p ref={feedbackRef} className="inline-error" role="alert" tabIndex={-1}>
          <AlertCircle size={15} />{error}</p>}
      </div>}

      {view === 'connect' && <form className="icloud-form gmail-connect-form" onSubmit={connect}>
        <label htmlFor="yandex-mail-account-name"><span>{t('账号名称')}</span>
          <input id="yandex-mail-account-name" value={name} maxLength={60} required autoComplete="off"
            disabled={Boolean(busy)} onChange={(event) => setName(event.target.value)}
            placeholder={t('例如：个人 Yandex 邮箱')} /></label>
        <label htmlFor="yandex-mail-account-email"><span>{t('邮箱地址')}</span>
          <input id="yandex-mail-account-email" type="email" value={email} maxLength={254} required
            autoComplete="username" disabled={Boolean(busy)}
            onChange={(event) => setEmail(event.target.value)} placeholder="owner@yandex.com" /></label>
        <label htmlFor="yandex-mail-app-password"><span>{t('Yandex 邮箱应用专用密码')}</span>
          <span className="gmail-password-input"><input id="yandex-mail-app-password"
            type={codeVisible ? 'text' : 'password'} value={code} required
            autoComplete="new-password" inputMode="text" disabled={Boolean(busy)}
            aria-describedby="yandex-mail-code-help" onChange={(event) => setCode(event.target.value)} />
            <button type="button" disabled={Boolean(busy)} onClick={() => setCodeVisible((value) => !value)}
              aria-label={t(codeVisible ? '隐藏应用专用密码' : '显示应用专用密码')}>
              {codeVisible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button></span>
          <small id="yandex-mail-code-help">{t('请先在邮件客户端设置中启用 IMAP 和应用密码，再为 OmniMail 生成独立的 Mail 应用密码；不要填写 Yandex 登录密码。')}</small>
        </label>
        <footer className="gmail-connect-actions">
          <a className="button button--secondary"
            href="https://yandex.com/support/yandex-360/customers/mail/en/mail-clients/others"
            target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />{t('查看 Yandex 设置指南')}</a>
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
            onClick={() => { clearFeedback(); setView('connect') }}>
            <Plus size={15} aria-hidden="true" />{t('添加账号')}</button></div>
        {!accounts.length && <div className="gmail-account-list__empty">
          <KeyRound size={20} aria-hidden="true" /><strong>{t('还没有 Yandex 邮箱账号')}</strong>
          <span>{t('添加账号后，可在这里分别管理连接与应用专用密码。')}</span></div>}
        {accounts.map((account) => <button className="gmail-account-card" type="button"
          key={account.id} onClick={() => openAccount(account)}>
          <span className="gmail-account-card__icon">{account.name.slice(0, 1).toUpperCase()}</span>
          <span className="gmail-account-card__content"><strong>{account.name}</strong>
            <small>{account.email}</small>
            {account.lastSyncedAt && <small>{t('最后同步：{time}', {
              time: new Date(account.lastSyncedAt * 1000).toLocaleString(),
            })}</small>}
            {account.lastErrorCode && <small className="gmail-account-error">
              {accountErrorLabel(account.lastErrorCode)}</small>}</span>
          <span className="gmail-account-card__side"><em className={`is-${account.status}`}>
            {statusLabel(account)}</em><span>{t('管理')}<ChevronRight size={14} aria-hidden="true" /></span></span>
        </button>)}
      </div>}

      {view === 'account' && target && <div className="gmail-account-settings">
        <div className="gmail-account-summary">
          <span className="gmail-account-summary__icon"><KeyRound size={18} aria-hidden="true" /></span>
          <span><strong>{target.email}</strong><small>{target.lastSyncedAt
            ? t('最后同步：{time}', { time: new Date(target.lastSyncedAt * 1000).toLocaleString() })
            : t('尚未完成首次同步')}</small></span>
          <em className={`is-${target.status}`}>
            {target.status === 'active' ? <ShieldCheck size={13} /> : <AlertCircle size={13} />}
            {statusLabel(target)}</em>
        </div>
        {target.lastErrorCode && <p className="gmail-account-detail-error">
          <AlertCircle size={15} aria-hidden="true" />{accountErrorLabel(target.lastErrorCode)}</p>}

        <form className="icloud-form gmail-account-rename" onSubmit={rename}>
          <div className="gmail-account-section-heading">
            <span className="gmail-account-section-icon"><Pencil size={16} aria-hidden="true" /></span>
            <span><strong>{t('备注名称')}</strong><small>{t('只用于 OmniMail 内区分账号。')}</small></span>
          </div>
          <label htmlFor={`yandex-mail-rename-${target.id}`}><span>{t('账号名称')}</span>
            <span className="gmail-account-rename__field">
              <input id={`yandex-mail-rename-${target.id}`} value={renameValue} maxLength={60} required
                disabled={Boolean(busy)} onChange={(event) => setRenameValue(event.target.value)} />
              <button className="button button--secondary" type="submit"
                disabled={Boolean(busy) || renameValue.trim() === target.name}>
                {busy === `rename:${target.id}` ? <LoaderCircle className="spin" size={15} />
                  : <Check size={15} />}{t('保存备注')}</button>
            </span>
          </label>
        </form>

        <section className="gmail-account-action"><span><strong>{t('验证邮箱连接')}</strong>
          <small>{t('检查当前应用专用密码是否仍可登录 Yandex 邮箱 IMAP。')}</small></span>
          <button className="button button--secondary" type="button" disabled={Boolean(busy)}
            onClick={() => void verify(target)}>
            {busy === `verify:${target.id}` ? <LoaderCircle className="spin" size={16} />
              : <ShieldCheck size={16} />}{t('立即验证')}</button></section>
        <section className="gmail-account-action"><span><strong>{t('同步这个账号')}</strong>
          <small>{t('立即将最新 Yandex 邮件加入后台同步队列。')}</small></span>
          <button className="button button--secondary" type="button" disabled={Boolean(busy)}
            onClick={() => void sync(target)}>
            {busy === `sync:${target.id}` ? <LoaderCircle className="spin" size={16} />
              : <RefreshCw size={16} />}{t('立即同步')}</button></section>

        <form className="icloud-form gmail-account-credential" onSubmit={updateCode}>
          <div className="gmail-account-section-heading">
            <span className="gmail-account-section-icon"><KeyRound size={16} aria-hidden="true" /></span>
            <span><strong>{t('更新应用专用密码')}</strong><small>{t('验证成功后才会替换已保存的密文。')}</small></span>
          </div>
          <label htmlFor={`yandex-mail-code-${target.id}`}><span>{t('新应用专用密码')}</span>
            <span className="gmail-password-input"><input id={`yandex-mail-code-${target.id}`}
              type={codeVisible ? 'text' : 'password'} value={code} required
              autoComplete="new-password" inputMode="text" disabled={Boolean(busy)}
              aria-describedby={`yandex-mail-code-help-${target.id}`}
              onChange={(event) => setCode(event.target.value)} />
              <button type="button" disabled={Boolean(busy)} onClick={() => setCodeVisible((value) => !value)}
                aria-label={t(codeVisible ? '隐藏应用专用密码' : '显示应用专用密码')}>
                {codeVisible ? <EyeOff size={17} /> : <Eye size={17} />}
              </button></span>
          </label>
          <p id={`yandex-mail-code-help-${target.id}`} className="gmail-account-note">
            <ShieldCheck size={15} aria-hidden="true" />
            {t('新应用专用密码不会显示或保存到浏览器；旧应用专用密码会保留到验证成功。')}</p>
          <footer><button className="button button--primary" type="submit"
            disabled={Boolean(busy) || !code.trim()}>
            {busy === `code:${target.id}` ? <LoaderCircle className="spin" size={16} />
              : <KeyRound size={16} />}{t('验证并更新')}</button></footer>
        </form>

        <div className="gmail-account-danger"><span><strong>{t('断开这个 Yandex 邮箱账号')}</strong>
          <small>{t('删除 OmniMail 保存的密文和本地索引，不会删除 Yandex 邮箱中的邮件。')}</small></span>
          <button className="button icloud-danger-button" type="button" disabled={Boolean(busy)}
            onClick={() => setConfirmDelete(true)}><Trash2 size={16} />{t('断开账号')}</button></div>
      </div>}
    </section>
    {confirmDelete && target && <DangerConfirmDialog icon={Trash2}
      eyebrow={t('YANDEX MAIL · 账号管理')} title={t('断开 Yandex 邮箱账号？')}
      description={t('账号“{name}”及其本地索引将从 OmniMail 中移除。', {
        name: target.name,
      })}
      impactTitle={t('Yandex 邮箱中的邮件不会被删除')}
      impactDescription={t('应用专用密码仍需前往 Yandex 邮箱设置手动撤销。')}
      confirmLabel={t(busy === `delete:${target.id}` ? '正在断开…' : '确认断开')}
      busy={busy === `delete:${target.id}`} onCancel={() => setConfirmDelete(false)}
      onConfirm={() => void remove(target)} />}
  </div>
}
