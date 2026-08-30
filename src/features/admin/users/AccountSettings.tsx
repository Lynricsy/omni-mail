import {
  AlertCircle,
  AtSign,
  BookOpen,
  CheckCircle2,
  Clock3,
  Cloud,
  HardDrive,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  MonitorCog,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { api, type User } from '../../../shared/api'
import { getLocale, t } from '../../../shared/i18n'
import { roleLabel } from '../../../shared/auth/roles'
import { AdminPageHeader } from '../shell/AdminPageHeader'
import { ThemeToggle } from '../../auth/components/AuthPages'
import { LanguageToggle } from '../../../shared/ui/language/LanguageToggle'
import { TotpSettings } from '../../auth/components/TotpSettings'

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '保存账户设置时发生了未知错误。')
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`
}

function Feedback({ type, children }: {
  type: 'error' | 'success'
  children: string
}) {
  const Icon = type === 'error' ? AlertCircle : CheckCircle2
  return (
    <p className={`account-feedback is-${type}`} role={type === 'error' ? 'alert' : 'status'}>
      <Icon size={16} />
      {children}
    </p>
  )
}

export function AccountSettings({
  user,
  onUserChange,
  onLogout,
  onOpenApiGuide,
  onOpenICloud,
  iCloudWorkspaceEnabled,
}: {
  user: User
  onUserChange: (user: User) => void
  onLogout: () => Promise<void>
  onOpenApiGuide: () => void
  onOpenICloud: () => void
  iCloudWorkspaceEnabled: boolean
}) {
  const [displayName, setDisplayName] = useState(user.displayName)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => setDisplayName(user.displayName), [user.displayName])

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    setProfileBusy(true)
    setProfileError('')
    setProfileSaved(false)
    try {
      const result = await api.updateAccount({ displayName })
      onUserChange(result.user)
      setProfileSaved(true)
    } catch (error) {
      setProfileError(errorMessage(error))
    } finally {
      setProfileBusy(false)
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault()
    setPasswordError('')
    setPasswordSaved(false)
    if (newPassword !== confirmPassword) {
      setPasswordError(t('两次输入的新密码不一致。'))
      return
    }
    setPasswordBusy(true)
    try {
      const result = await api.updateAccount({ currentPassword, newPassword })
      onUserChange(result.user)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
    } catch (error) {
      setPasswordError(errorMessage(error))
    } finally {
      setPasswordBusy(false)
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault()
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await api.deleteAccount(user.role === 'user'
        ? { confirmationEmail: deleteConfirmation }
        : { currentPassword: deleteConfirmation })
      window.location.reload()
    } catch (error) {
      setDeleteError(errorMessage(error))
      setDeleteBusy(false)
    }
  }

  function closeDeleteDialog() {
    if (deleteBusy) return
    setDeleteOpen(false)
    setDeleteConfirmation('')
    setDeleteError('')
  }

  const profileChanged = displayName.trim() !== user.displayName
  const canDeleteAccount = user.role === 'user' || user.role === 'temporary'
  const regularAccount = user.role === 'user'
  const storagePercent = user.storageQuotaBytes > 0
    ? Math.min(100, (user.storageUsedBytes / user.storageQuotaBytes) * 100)
    : 0

  return (
    <main className="admin-workspace account-workspace">
      <AdminPageHeader
        icon={UserRound}
        eyebrow="ACCOUNT · PERSONAL"
        title={t('账号设置')}
        description={t('管理你的个人资料、登录密码和当前设备偏好。')}
        className="account-workspace__header"
        actions={<div className="user-header-actions">
          <button className="button button--secondary" type="button" onClick={onOpenApiGuide}>
            <BookOpen size={16} />{t('API 使用')}
          </button>
          {iCloudWorkspaceEnabled && <button className="button button--secondary" type="button" onClick={onOpenICloud}>
            <Cloud size={16} />{t('iCloud 隐藏邮箱')}
          </button>}
        </div>}
      />

      <div className="account-settings-grid">
        <div className="account-settings-column">
          {(user.role === 'super_admin' || user.role === 'admin') && <TotpSettings />}
          <section className="admin-card account-card">
            <header>
              <UserRound size={17} />
              <div>
                <h2>{t('个人资料')}</h2>
                <p>{t('这些信息只属于当前登录账户')}</p>
              </div>
            </header>
            <div className="account-identity">
              <span>{user.displayName.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{user.displayName}</strong>
                <small>{roleLabel(user.role)}</small>
              </div>
            </div>
            <dl className="settings-list account-summary-list">
              <div>
                <dt><AtSign size={15} />{t('登录邮箱')}</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt><ShieldCheck size={15} />{t('账户角色')}</dt>
                <dd>{roleLabel(user.role)}</dd>
              </div>
              <div className="account-storage-summary">
                <dt><HardDrive size={15} />{t('存储空间')}</dt>
                <dd className="account-storage-usage">
                  <strong>{formatBytes(user.storageUsedBytes)}</strong>
                  <span>/ {user.storageQuotaBytes === 0
                    ? t('不限')
                    : formatBytes(user.storageQuotaBytes)}</span>
                </dd>
                {user.storageQuotaBytes > 0 && (
                  <span
                    className={storagePercent >= 90 ? 'is-warning' : ''}
                    role="meter"
                    aria-label={t('存储空间使用率')}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(storagePercent)}
                  >
                    <span style={{ width: `${storagePercent}%` }} />
                  </span>
                )}
              </div>
              {user.role === 'temporary' && (
                <div>
                  <dt><Clock3 size={15} />{t('账号有效至')}</dt>
                  <dd>{user.temporaryExpiresAt
                    ? formatDate(user.temporaryExpiresAt)
                    : t('未设置自动到期时间')}</dd>
                </div>
              )}
            </dl>
            <form className="account-form" onSubmit={saveProfile}>
              <label className="account-field">
                <span>{t('显示名称')}</span>
                <input
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value)
                    setProfileSaved(false)
                  }}
                  maxLength={60}
                  required
                />
              </label>
              {profileError && <Feedback type="error">{profileError}</Feedback>}
              {profileSaved && <Feedback type="success">{t('个人资料已保存。')}</Feedback>}
              <button
                className="button button--primary"
                type="submit"
                disabled={profileBusy || !profileChanged}
              >
                {profileBusy && <LoaderCircle className="spin" size={16} />}
                {t('保存资料')}
              </button>
            </form>
          </section>

          <section className="admin-card account-card">
            <header>
              <MonitorCog size={17} />
              <div>
                <h2>{t('外观与语言')}</h2>
                <p>{t('偏好保存在当前浏览器')}</p>
              </div>
            </header>
            <div className="account-preference">
              <div>
                <strong>{t('界面主题')}</strong>
                <span>{t('在浅色和深色模式之间切换')}</span>
              </div>
              <ThemeToggle labeled />
            </div>
            <div className="account-preference">
              <div>
                <strong>{t('界面语言')}</strong>
                <span>{t('选择 OmniMail 的显示语言')}</span>
              </div>
              <LanguageToggle labeled />
            </div>
          </section>
        </div>

        <div className="account-settings-column">
          <section className="admin-card account-card">
            <header>
              <KeyRound size={17} />
              <div>
                <h2>{t('修改密码')}</h2>
                <p>{t('需要先验证当前登录密码')}</p>
              </div>
            </header>
            <form className="account-form account-password-form" onSubmit={savePassword}>
              <label className="account-field">
                <span>{t('当前密码')}</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </label>
              <label className="account-field">
                <span>{t('新密码')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(event.target.value)
                    setPasswordSaved(false)
                  }}
                  minLength={10}
                  maxLength={128}
                  placeholder={t('至少 10 个字符')}
                  required
                />
              </label>
              <label className="account-field">
                <span>{t('确认新密码')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={10}
                  maxLength={128}
                  required
                />
              </label>
              {passwordError && <Feedback type="error">{passwordError}</Feedback>}
              {passwordSaved && <Feedback type="success">{t('密码已经更新。')}</Feedback>}
              <button className="button button--primary" type="submit" disabled={passwordBusy}>
                {passwordBusy && <LoaderCircle className="spin" size={16} />}
                {t('更新密码')}
              </button>
            </form>
          </section>

          <section className="admin-card account-card">
            <header>
              <LogOut size={17} />
              <div>
                <h2>{t('当前会话')}</h2>
                <p>{t('安全退出这台设备上的 OmniMail')}</p>
              </div>
            </header>
            <button
              className="button button--secondary account-logout"
              type="button"
              onClick={() => void onLogout()}
            >
              <LogOut size={16} />
              {t('退出登录')}
            </button>
          </section>

          {canDeleteAccount && (
            <section className="admin-card account-card account-danger-card">
              <header>
                <Trash2 size={17} />
                <div>
                  <h2>{t(regularAccount ? '注销账号' : '删除临时账号')}</h2>
                  <p>{t('立即结束账号访问，数据稍后按保留策略清理')}</p>
                </div>
              </header>
              <div className="account-danger-note">
                <Mail size={17} />
                <p><strong>{t('数据不会立即删除')}</strong><span>{t('收件地址、已有邮件和附件会暂时保留，之后按管理员设置的保留期自动清理。')}</span></p>
              </div>
              <button
                className="button account-delete-trigger"
                type="button"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={16} />
                {t(regularAccount ? '注销我的账号' : '删除我的临时账号')}
              </button>
            </section>
          )}
        </div>
      </div>

      {deleteOpen && (
        <div className="user-panel-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeDeleteDialog()
        }}>
          <section
            className="user-panel account-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="account-delete-title"
            aria-describedby="account-delete-description"
          >
            <header>
              <span><TriangleAlert size={21} /></span>
              <div>
                <p className="eyebrow">{regularAccount ? 'DELETE ACCOUNT' : 'DELETE TEMPORARY ACCOUNT'}</p>
                <h2 id="account-delete-title">{t(regularAccount ? '确认注销账号' : '确认删除临时账号')}</h2>
                <p id="account-delete-description">{t('这会立即退出所有设备，并永久关闭该账号的登录能力。')}</p>
              </div>
            </header>
            <form onSubmit={(event) => void deleteAccount(event)}>
              <div className="account-delete-risks">
                <p><Trash2 size={16} /><span><strong>{t('账号无法恢复')}</strong><small>{t('当前账号及其所有登录会话会立即失效。')}</small></span></p>
                <p><Mail size={16} /><span><strong>{t('数据进入保留期')}</strong><small>{t('邮箱地址、邮件和附件会在管理员设置的保留期结束后清理。')}</small></span></p>
              </div>
              <label className="account-field">
                <span>{t(regularAccount ? '输入当前登录邮箱确认' : '输入当前密码确认')}</span>
                <input
                  type={regularAccount ? 'email' : 'password'}
                  autoComplete={regularAccount ? 'email' : 'current-password'}
                  autoFocus
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  placeholder={regularAccount ? user.email : undefined}
                  maxLength={regularAccount ? 254 : 128}
                  required
                />
              </label>
              {deleteError && <Feedback type="error">{deleteError}</Feedback>}
              <footer>
                <button className="button button--secondary" type="button" disabled={deleteBusy} onClick={closeDeleteDialog}>
                  {t('取消')}
                </button>
                <button className="button account-delete-confirm" type="submit" disabled={deleteBusy || !deleteConfirmation}>
                  {deleteBusy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                  {t(deleteBusy ? '正在注销…' : regularAccount ? '确认注销账号' : '确认删除账号')}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
