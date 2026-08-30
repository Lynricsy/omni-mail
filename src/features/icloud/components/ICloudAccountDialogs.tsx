import {
  AlertCircle,
  Check,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, type ICloudAccount, type ICloudHost } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { DangerConfirmDialog } from '../../../shared/ui/dialogs/DangerConfirmDialog'
import { ICloudRegionSelect } from './ICloudRegionSelect'

function Spinner() {
  return <LoaderCircle className="spin" size={17} aria-hidden="true" />
}

export function ICloudModal({ title, description, suspended = false, onClose, children }: {
  title: string
  description: string
  suspended?: boolean
  onClose: () => void
  children: ReactNode | ((close: () => void) => ReactNode)
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  const suspendedRef = useRef(suspended)
  const closeTimer = useRef<number | undefined>(undefined)
  const [visible, setVisible] = useState(false)
  onCloseRef.current = onClose
  suspendedRef.current = suspended
  function close() {
    if (closeTimer.current !== undefined) return
    setVisible(false)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), reducedMotion ? 0 : 210)
  }
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const enterFrame = requestAnimationFrame(() => setVisible(true))
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) || [])
    const first = dialog?.querySelector<HTMLElement>('[data-modal-autofocus]') || focusable()[0]
    first?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (suspendedRef.current) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const firstItem = items[0]
      const lastItem = items.at(-1)!
      if (!dialog?.contains(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? lastItem : firstItem).focus()
      } else if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault(); lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault(); firstItem.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      cancelAnimationFrame(enterFrame)
      if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
      document.removeEventListener('keydown', keydown)
      previous?.focus()
    }
  }, [])
  return (
    <div className={`icloud-modal-backdrop${visible ? ' is-visible' : ''}`}
      onMouseDown={(event) => !suspended && event.target === event.currentTarget && close()}>
      <section ref={dialogRef} className="icloud-modal" role="dialog" aria-modal="true"
        aria-hidden={suspended || undefined} inert={suspended} aria-labelledby="icloud-modal-title"
        aria-describedby="icloud-modal-description">
        <header>
          <div><h2 id="icloud-modal-title">{title}</h2><p id="icloud-modal-description">{description}</p></div>
          <button className="icon-button" type="button" disabled={suspended} onClick={close}
            aria-label={t('关闭')}><X size={17} /></button>
        </header>
        {typeof children === 'function' ? children(close) : children}
      </section>
    </div>
  )
}

export function AddICloudAccountDialog({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (account: ICloudAccount) => void
}) {
  const [name, setName] = useState('')
  const [host, setHost] = useState<ICloudHost>('icloud.com')
  const [cookies, setCookies] = useState('')
  const [icloudEmail, setICloudEmail] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent, close: () => void) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const result = await api.createICloudAccount({
        name, host, cookies, icloudEmail, appPassword,
      })
      onCreated(result.account); close()
    } catch (submitError) {
      setError(t('添加失败：{error}', { error: errorMessage(submitError) }))
    } finally { setSaving(false) }
  }
  return (
    <ICloudModal title={t('添加 iCloud 账号')} description={t('配置主邮箱收信、隐藏邮箱管理，或同时启用。')} onClose={onClose}>
      {(close) => <form className="icloud-form" onSubmit={(event) => void submit(event, close)}>
        <p className="icloud-account-warning"><AlertCircle size={17} aria-hidden="true" />{t('至少配置一种：主邮箱与应用专用密码用于收信；Cookie 仅用于管理隐藏邮箱。')}</p>
        <label><span>{t('账号名称')}</span><input value={name} maxLength={80} required autoFocus data-modal-autofocus onChange={(event) => setName(event.target.value)} placeholder={t('例如：个人 iCloud')} /></label>
        <div className="icloud-form-field"><span>{t('iCloud 区域')}</span><ICloudRegionSelect value={host} onChange={setHost} /></div>
        <label><span>Cookie · {t('可选')}</span><textarea value={cookies} rows={7}
          required={!icloudEmail.trim() && !appPassword.trim()}
          onChange={(event) => setCookies(event.target.value)} placeholder="X-APPLE-WEBAUTH-TOKEN=...; X-APPLE-ID-SESSION-ID=..." /></label>
        <p className="icloud-form-note"><EyeOff size={15} aria-hidden="true" />{t('Cookie 仅在同步、创建或管理隐藏邮箱时需要。')}</p>
        <fieldset className="icloud-optional-credentials">
          <legend><KeyRound size={16} aria-hidden="true" />{t('主邮箱收信')}<small>{t('可选')}</small></legend>
          <div className="icloud-app-password-fields">
            <label><span>{t('iCloud 邮箱')}</span><input type="email" value={icloudEmail}
              maxLength={254} required={Boolean(appPassword)} autoComplete="username"
              onChange={(event) => setICloudEmail(event.target.value)} placeholder="name@icloud.com" /></label>
            <label><span>{t('应用专用密码')}</span><input type="password" value={appPassword}
              maxLength={128} required={Boolean(icloudEmail)} autoComplete="new-password"
              onChange={(event) => setAppPassword(event.target.value)} /></label>
          </div>
          <p className="icloud-form-note"><KeyRound size={15} aria-hidden="true" />{t('只使用 iCloud 主邮箱时，只需填写邮箱和应用专用密码，无需 Cookie。')}</p>
        </fieldset>
        <p className="icloud-form-note"><ShieldCheck size={15} />{t('凭据会在 Worker 内加密，保存后不会回传到浏览器。')}</p>
        {error && <p className="inline-error" role="alert"><AlertCircle size={15} />{t(error)}</p>}
        <footer><button className="button button--secondary" type="button" onClick={close}>{t('取消')}</button><button className="button button--primary" disabled={saving}>{saving ? <Spinner /> : <Plus size={16} />}{t('验证并添加')}</button></footer>
      </form>}
    </ICloudModal>
  )
}

export function ICloudAccountSettingsDialog({ account, onClose, onChanged, onDeleted, onNotice }: {
  account: ICloudAccount
  onClose: () => void
  onChanged: () => Promise<void>
  onDeleted: () => Promise<void>
  onNotice: (message: string) => void
}) {
  const [name, setName] = useState(account.name)
  const [cookies, setCookies] = useState('')
  const [icloudEmail, setICloudEmail] = useState(account.icloudEmail)
  const [appPassword, setAppPassword] = useState('')
  const [saving, setSaving] = useState<'name' | 'cookies' | 'password' | 'delete' | ''>('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')
  async function saveName(event: FormEvent) {
    event.preventDefault(); setSaving('name'); setError('')
    try {
      const result = await api.updateICloudAccountName(account.id, name)
      setName(result.name)
      await onChanged(); onNotice(t('备注名称已保存'))
    } catch (saveError) { setError(errorMessage(saveError)) } finally { setSaving('') }
  }
  async function saveCookies(event: FormEvent) {
    event.preventDefault(); setSaving('cookies'); setError('')
    try { await api.updateICloudCookies(account.id, cookies); setCookies(''); await onChanged(); onNotice(t('Cookie 已更新')) }
    catch (saveError) { setError(errorMessage(saveError)) } finally { setSaving('') }
  }
  async function savePassword(event: FormEvent) {
    event.preventDefault(); setSaving('password'); setError('')
    try {
      await api.updateICloudAppPassword(account.id, icloudEmail, appPassword)
      setAppPassword(''); await onChanged(); onNotice(t('应用专用密码已更新'))
    } catch (saveError) { setError(errorMessage(saveError)) } finally { setSaving('') }
  }
  async function remove() {
    setSaving('delete'); setError('')
    try { await api.deleteICloudAccount(account.id); await onDeleted() }
    catch (deleteError) {
      setConfirmingDelete(false); setError(errorMessage(deleteError)); setSaving('')
    }
  }
  return (
    <ICloudModal title={t('设置 {name}', { name: account.name })} description={t('修改备注名称或覆盖更新凭据；原值不会显示。')} suspended={confirmingDelete} onClose={onClose}>
      {() => <>
      <form className="icloud-form icloud-account-name-form" onSubmit={saveName}>
        <h3><Settings2 size={17} />{t('备注名称')}</h3>
        <label><span>{t('备注名称')}</span><input value={name} maxLength={80} required
          data-modal-autofocus onChange={(event) => setName(event.target.value)} /></label>
        <button className="button button--secondary" disabled={Boolean(saving) || name.trim() === account.name}>{saving === 'name' ? <Spinner /> : <Check size={16} />}{t('保存备注')}</button>
      </form>
      <div className="icloud-credential-forms">
        <form className="icloud-form" onSubmit={saveCookies}>
          <h3><EyeOff size={17} />iCloud Cookie <small>{t(account.hasCookies ? '已配置' : '未配置')}</small></h3>
          <label><span>{t('新 Cookie')}</span><textarea value={cookies} rows={5} required onChange={(event) => setCookies(event.target.value)} /></label>
          <p className="icloud-form-note"><EyeOff size={15} aria-hidden="true" />{t('仅管理隐藏邮箱时需要；主邮箱收信无需 Cookie。')}</p>
          <button className="button button--secondary" disabled={Boolean(saving)}>{saving === 'cookies' ? <Spinner /> : <ShieldCheck size={16} />}{t('验证并覆盖')}</button>
        </form>
        <form className="icloud-form" onSubmit={savePassword}>
          <h3><KeyRound size={17} />{t('应用专用密码')} <small>{t(account.hasAppPassword ? '已配置' : '未配置')}</small></h3>
          <label><span>{t('iCloud 邮箱')}</span><input type="email" value={icloudEmail} required onChange={(event) => setICloudEmail(event.target.value)} placeholder="name@icloud.com" /></label>
          <label><span>{t('新应用专用密码')}</span><input type="password" value={appPassword} required autoComplete="new-password" onChange={(event) => setAppPassword(event.target.value)} /></label>
          <p className="icloud-form-note"><KeyRound size={15} />{t('该邮箱会作为当前账号的主邮箱，并显示在收件地址列表中。')}</p>
          <button className="button button--secondary" disabled={Boolean(saving)}>{saving === 'password' ? <Spinner /> : <ShieldCheck size={16} />}{t('测试并覆盖')}</button>
        </form>
      </div>
      {error && <p className="inline-error" role="alert"><AlertCircle size={15} />{t(error)}</p>}
      <footer className="icloud-credential-danger"><span>{t('删除账号会同时删除两项密文。')}</span><button className="button icloud-danger-button" type="button" onClick={() => setConfirmingDelete(true)} disabled={Boolean(saving)}><Trash2 size={15} />{t('删除这个 iCloud 账号')}</button></footer>
      {confirmingDelete && <DangerConfirmDialog
        icon={Trash2}
        eyebrow="ICLOUD ACCOUNT"
        title={t('删除 iCloud 账号？')}
        description={t('账号“{name}”将从 OmniMail 中移除。', { name: account.name })}
        impactTitle={t('此操作无法撤销')}
        impactDescription={t('保存的 Cookie 和应用专用密码会一并删除；Apple 账号和已有隐藏邮箱不会受影响。')}
        confirmLabel={t(saving === 'delete' ? '正在删除…' : '删除账号')}
        busy={saving === 'delete'}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => void remove()}
      />}
      </>}
    </ICloudModal>
  )
}
