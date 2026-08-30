import {
  AlertCircle,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import type { FormEvent } from 'react'
import type { GmailAccount, MailSyncLimit } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { MailSyncLimitSelect } from '../../../shared/ui/mail-workspace/MailSyncLimitSelect'

export type GmailAccountSettingsView =
  'account' | 'rename' | 'verify' | 'sync' | 'credential'

function SettingsOption({ icon: Icon, title, description, danger = false, onClick }: {
  icon: LucideIcon
  title: string
  description: string
  danger?: boolean
  onClick: () => void
}) {
  return <button className={`qq-mail-settings-option${danger ? ' is-danger' : ''}`}
    type="button" onClick={onClick}>
    <span className="qq-mail-settings-option__icon"><Icon size={17} aria-hidden="true" /></span>
    <span><strong>{title}</strong><small>{description}</small></span>
    <ChevronRight size={16} aria-hidden="true" />
  </button>
}

export function GmailAccountSettings({ account, view, status, accountError, renameValue,
  password, passwordVisible, busy, syncLimit, onOpen, onRenameValueChange, onRename,
  onVerify, onSync, onSyncLimitChange, onPasswordChange, onPasswordVisibleChange,
  onUpdatePassword, onDisconnect }: {
  account: GmailAccount
  view: GmailAccountSettingsView
  status: string
  accountError: string
  renameValue: string
  password: string
  passwordVisible: boolean
  busy: string
  syncLimit: MailSyncLimit
  onOpen: (view: Exclude<GmailAccountSettingsView, 'account'>) => void
  onRenameValueChange: (value: string) => void
  onRename: (event: FormEvent) => void
  onVerify: () => void
  onSync: () => void
  onSyncLimitChange: (value: MailSyncLimit) => void
  onPasswordChange: (value: string) => void
  onPasswordVisibleChange: () => void
  onUpdatePassword: (event: FormEvent) => void
  onDisconnect: () => void
}) {
  const disabled = Boolean(busy)
  if (view === 'account') {
    return <div className="gmail-account-settings">
      <div className="gmail-account-summary">
        <span className="gmail-account-summary__icon"><KeyRound size={18} aria-hidden="true" /></span>
        <span><strong>{account.email}</strong><small>{account.lastSyncedAt
          ? t('最后同步：{time}', { time: new Date(account.lastSyncedAt * 1000).toLocaleString() })
          : t('尚未完成首次同步')}</small></span>
        <em className={`is-${account.status}`}>
          {account.status === 'active' ? <ShieldCheck size={13} /> : <AlertCircle size={13} />}
          {status}</em>
      </div>
      {accountError && <p className="gmail-account-detail-error">
        <AlertCircle size={15} aria-hidden="true" />{accountError}</p>}
      <div className="qq-mail-settings-menu" role="group" aria-label={t('账号设置选项')}>
        <SettingsOption icon={Pencil} title={t('备注名称')} description={account.name}
          onClick={() => onOpen('rename')} />
        <SettingsOption icon={ShieldCheck} title={t('验证邮箱连接')} description={status}
          onClick={() => onOpen('verify')} />
        <SettingsOption icon={RefreshCw} title={t('同步这个账号')}
          description={account.lastSyncedAt
            ? t('最后同步：{time}', { time: new Date(account.lastSyncedAt * 1000).toLocaleString() })
            : t('尚未完成首次同步')} onClick={() => onOpen('sync')} />
        <SettingsOption icon={KeyRound} title={t('更新应用专用密码')}
          description={t('验证成功后才会替换已保存的密文。')}
          onClick={() => onOpen('credential')} />
      </div>
      <div className="qq-mail-settings-danger">
        <SettingsOption icon={Trash2} title={t('断开这个 Gmail 账号')}
          description={t('删除 OmniMail 保存的密文和本地索引，不会删除 Gmail 中的邮件。')}
          danger onClick={onDisconnect} />
      </div>
    </div>
  }

  if (view === 'rename') {
    return <form className="icloud-form gmail-account-rename" onSubmit={onRename}>
      <label htmlFor={`gmail-rename-${account.id}`}><span>{t('账号名称')}</span>
        <input id={`gmail-rename-${account.id}`} value={renameValue} maxLength={60} required
          autoFocus disabled={disabled} onChange={(event) => onRenameValueChange(event.target.value)} />
      </label>
      <footer><button className="button button--primary" type="submit"
        disabled={disabled || renameValue.trim() === account.name}>
        {busy === `rename:${account.id}` ? <LoaderCircle className="spin" size={15} />
          : <Check size={15} />}{t('保存备注')}</button></footer>
    </form>
  }

  if (view === 'verify' || view === 'sync') {
    const verifying = view === 'verify'
    return <section className="qq-mail-setting-detail">
      <span className="qq-mail-setting-detail__icon">
        {verifying ? <ShieldCheck size={22} aria-hidden="true" />
          : <RefreshCw size={22} aria-hidden="true" />}
      </span>
      <strong>{t(verifying ? '验证邮箱连接' : '同步这个账号')}</strong>
      <p>{t(verifying ? '检查当前应用专用密码是否仍可登录 Gmail IMAP。'
        : '立即将最新 Gmail 邮件加入后台同步队列。')}</p>
      {!verifying && <MailSyncLimitSelect id={`gmail-sync-limit-${account.id}`}
        value={syncLimit} disabled={disabled} onChange={onSyncLimitChange} />}
      <button className="button button--primary" type="button" disabled={disabled}
        onClick={verifying ? onVerify : onSync}>
        {busy === `${verifying ? 'verify' : 'sync'}:${account.id}`
          ? <LoaderCircle className="spin" size={16} />
          : verifying ? <ShieldCheck size={16} /> : <RefreshCw size={16} />}
        {t(verifying ? '立即验证' : '立即同步')}</button>
    </section>
  }

  return <form className="icloud-form gmail-account-credential" onSubmit={onUpdatePassword}>
    <div className="gmail-account-section-heading">
      <span className="gmail-account-section-icon"><KeyRound size={16} aria-hidden="true" /></span>
      <span><strong>{t('更新应用专用密码')}</strong>
        <small>{t('验证成功后才会替换已保存的密文。')}</small></span>
    </div>
    <label htmlFor={`gmail-password-${account.id}`}><span>{t('新应用专用密码')}</span>
      <span className="gmail-password-input"><input id={`gmail-password-${account.id}`}
        type={passwordVisible ? 'text' : 'password'} value={password} required autoFocus
        autoComplete="new-password" inputMode="text" disabled={disabled}
        aria-describedby={`gmail-password-help-${account.id}`}
        onChange={(event) => onPasswordChange(event.target.value)} placeholder="abcd efgh ijkl mnop" />
        <button type="button" disabled={disabled} onClick={onPasswordVisibleChange}
          aria-label={t(passwordVisible ? '隐藏应用密码' : '显示应用密码')}>
          {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button></span>
    </label>
    <p id={`gmail-password-help-${account.id}`} className="gmail-account-note">
      <ShieldCheck size={15} aria-hidden="true" />
      {t('新凭据不会显示或保存到浏览器；旧凭据会保留到验证成功。')}</p>
    <footer><button className="button button--primary" type="submit"
      disabled={disabled || !password.trim()}>
      {busy === `password:${account.id}` ? <LoaderCircle className="spin" size={16} />
        : <KeyRound size={16} />}{t('验证并更新')}</button></footer>
  </form>
}
