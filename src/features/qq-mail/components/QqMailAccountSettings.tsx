import {
  AlertCircle,
  AtSign,
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
import type { MailSyncLimit, QqMailAccount, QqMailIdentity } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { MailSyncLimitSelect } from '../../../shared/ui/mail-workspace/MailSyncLimitSelect'
import { QqMailIdentitySettings } from './QqMailIdentitySettings'

export type QqMailAccountSettingsView =
  'account' | 'rename' | 'identities' | 'verify' | 'sync' | 'credential'

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

export function QqMailAccountSettings({ account, view, status, accountError, renameValue,
  code, codeVisible, busy, onOpen, onRenameValueChange, onRename, onAddIdentity,
  onDeleteIdentity, onVerify, onSync, syncLimit, onSyncLimitChange, onCodeChange,
  onCodeVisibleChange, onUpdateCode, onDisconnect }: {
  account: QqMailAccount
  view: QqMailAccountSettingsView
  status: string
  accountError: string
  renameValue: string
  code: string
  codeVisible: boolean
  busy: string
  onOpen: (view: Exclude<QqMailAccountSettingsView, 'account'>) => void
  onRenameValueChange: (value: string) => void
  onRename: (event: FormEvent) => void
  onAddIdentity: (name: string, email: string) => Promise<boolean>
  onDeleteIdentity: (identity: QqMailIdentity) => void
  onVerify: () => void
  onSync: () => void
  syncLimit: MailSyncLimit
  onSyncLimitChange: (value: MailSyncLimit) => void
  onCodeChange: (value: string) => void
  onCodeVisibleChange: () => void
  onUpdateCode: (event: FormEvent) => void
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
        <SettingsOption icon={AtSign} title={t('邮箱身份')}
          description={t('{count} 个已验证发信身份', { count: account.identities.length })}
          onClick={() => onOpen('identities')} />
        <SettingsOption icon={ShieldCheck} title={t('验证邮箱连接')} description={status}
          onClick={() => onOpen('verify')} />
        <SettingsOption icon={RefreshCw} title={t('同步这个账号')}
          description={account.lastSyncedAt
            ? t('最后同步：{time}', { time: new Date(account.lastSyncedAt * 1000).toLocaleString() })
            : t('尚未完成首次同步')} onClick={() => onOpen('sync')} />
        <SettingsOption icon={KeyRound} title={t('更新授权码')}
          description={t('验证成功后才会替换已保存的密文。')}
          onClick={() => onOpen('credential')} />
      </div>
      <div className="qq-mail-settings-danger">
        <SettingsOption icon={Trash2} title={t('断开这个 QQ 邮箱账号')}
          description={t('删除 OmniMail 保存的密文和本地索引，不会删除 QQ 邮箱中的邮件。')}
          danger onClick={onDisconnect} />
      </div>
    </div>
  }

  if (view === 'rename') {
    return <form className="icloud-form gmail-account-rename" onSubmit={onRename}>
      <label htmlFor={`qq-mail-rename-${account.id}`}><span>{t('账号名称')}</span>
        <input id={`qq-mail-rename-${account.id}`} value={renameValue} maxLength={60} required
          autoFocus disabled={disabled} onChange={(event) => onRenameValueChange(event.target.value)} />
      </label>
      <footer><button className="button button--primary" type="submit"
        disabled={disabled || renameValue.trim() === account.name}>
        {busy === `rename:${account.id}` ? <LoaderCircle className="spin" size={15} />
          : <Check size={15} />}{t('保存备注')}</button></footer>
    </form>
  }

  if (view === 'identities') {
    return <QqMailIdentitySettings account={account} busy={disabled}
      adding={busy === `identity:add:${account.id}`} onAdd={onAddIdentity}
      onDelete={onDeleteIdentity} />
  }

  if (view === 'verify' || view === 'sync') {
    const verifying = view === 'verify'
    return <section className="qq-mail-setting-detail">
      <span className="qq-mail-setting-detail__icon">
        {verifying ? <ShieldCheck size={22} aria-hidden="true" />
          : <RefreshCw size={22} aria-hidden="true" />}
      </span>
      <strong>{t(verifying ? '验证邮箱连接' : '同步这个账号')}</strong>
      <p>{t(verifying ? '检查当前授权码是否仍可登录 QQ 邮箱 IMAP。'
        : '立即将最新 QQ 邮件加入后台同步队列。')}</p>
      {!verifying && <MailSyncLimitSelect id={`qq-mail-sync-limit-${account.id}`}
        value={syncLimit} disabled={disabled} onChange={onSyncLimitChange} />}
      <button className="button button--primary" type="button" disabled={disabled}
        onClick={verifying ? onVerify : onSync}>
        {busy === `${verifying ? 'verify' : 'sync'}:${account.id}`
          ? <LoaderCircle className="spin" size={16} />
          : verifying ? <ShieldCheck size={16} /> : <RefreshCw size={16} />}
        {t(verifying ? '立即验证' : '立即同步')}</button>
    </section>
  }

  return <form className="icloud-form gmail-account-credential" onSubmit={onUpdateCode}>
    <label htmlFor={`qq-mail-code-${account.id}`}><span>{t('新授权码')}</span>
      <span className="gmail-password-input"><input id={`qq-mail-code-${account.id}`}
        type={codeVisible ? 'text' : 'password'} value={code} required autoFocus
        autoComplete="new-password" inputMode="text" disabled={disabled}
        aria-describedby={`qq-mail-code-help-${account.id}`}
        onChange={(event) => onCodeChange(event.target.value)} />
        <button type="button" disabled={disabled} onClick={onCodeVisibleChange}
          aria-label={t(codeVisible ? '隐藏授权码' : '显示授权码')}>
          {codeVisible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button></span>
    </label>
    <p id={`qq-mail-code-help-${account.id}`} className="gmail-account-note">
      <ShieldCheck size={15} aria-hidden="true" />
      {t('新授权码不会显示或保存到浏览器；旧授权码会保留到验证成功。')}</p>
    <footer><button className="button button--primary" type="submit"
      disabled={disabled || !code.trim()}>
      {busy === `code:${account.id}` ? <LoaderCircle className="spin" size={16} />
        : <KeyRound size={16} />}{t('验证并更新')}</button></footer>
  </form>
}
