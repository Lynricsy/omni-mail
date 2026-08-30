import { AlertCircle, ExternalLink, LoaderCircle, LogOut } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { OmniLogo } from '../../src/shared/ui/brand/OmniLogo'
import { t, useLocale } from '../../src/shared/i18n'
import { PanelThemeSettings } from './PanelThemeSettings'
import { PanelLanguageSettings } from './PanelLanguageSettings'
import type { AuthStatus, ExtensionSettings, ThemePreference } from './protocol'
import type { NotificationSettings } from './notification-settings'

const notificationSourceOptions: Array<{
  id: NotificationSettings['notificationSources'][number]
  label: string
}> = [
  { id: 'omnimail', label: 'OmniMail' },
  { id: 'icloud', label: 'iCloud' },
  { id: 'linuxdo', label: 'Linux DO' },
  { id: 'gmail', label: 'Gmail' },
  { id: 'microsoft', label: 'Microsoft' },
  { id: 'qq', label: 'QQ' },
  { id: 'naver', label: 'NAVER' },
  { id: 'yandex', label: 'Yandex' },
]

export function NavButton({ active, icon, label, onClick }: {
  active: boolean
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  useLocale()
  return (
    <button className={active ? 'is-active' : ''} type="button"
      aria-current={active ? 'page' : undefined} onClick={onClick}>
      {icon}<span>{t(label)}</span>
    </button>
  )
}

export function LoginView({ apiOrigin, busy, error, onLogin }: {
  apiOrigin: string
  busy: boolean
  error: string
  onLogin: (input: { apiOrigin: string }) => void
}) {
  useLocale()
  const [site, setSite] = useState(apiOrigin)
  return (
    <section className="login-view">
      <div className="login-logo"><OmniLogo size={30} /></div>
      <p className="eyebrow">OMNIMAIL FLOAT</p>
      <h1>{t('连接你的邮箱')}</h1>
      <p className="login-copy">{t('前往你的 OmniMail 网站验证身份并确认授权，扩展不会读取密码。')}</p>
      <form onSubmit={(event) => {
        event.preventDefault()
        onLogin({ apiOrigin: site })
      }}>
        <label htmlFor="omnimail-site">{t('OmniMail 地址')}</label>
        <input id="omnimail-site" type="url" required placeholder="https://mail.example.com"
          aria-describedby="omnimail-data-disclosure"
          value={site} onChange={(event) => setSite(event.target.value)} />
        <div className="login-data-disclosure" id="omnimail-data-disclosure">
          <strong>{t('授权后的数据使用')}</strong>
          <p>{t('扩展会从所选 OmniMail 实例读取账户名称、邮箱地址，以及已连接邮箱的邮件内容，并在本机保存可撤销令牌与功能设置。数据只用于生成、填入、收件和通知，不用于广告或用户画像。')}</p>
        </div>
        {error && <p className="login-error" role="alert"><AlertCircle size={15} />{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <ExternalLink size={17} />}
          {t(busy ? '等待网站授权…' : '前往 OmniMail 授权')}
        </button>
      </form>
      <p className="login-security">{t('继续后会在本机保存此站点地址并打开授权页；明确允许前不会读取账户或邮件。')}</p>
    </section>
  )
}

export function SettingsView({ auth, settings, onToggleFloating, onTheme,
  onNotifications, onOpenWeb, onLogout }: {
  auth: AuthStatus
  settings: ExtensionSettings
  onToggleFloating: (enabled: boolean) => void
  onTheme: (theme: ThemePreference) => void
  onNotifications: (settings: NotificationSettings) => void
  onOpenWeb: () => void
  onLogout: () => void
}) {
  useLocale()
  return (
    <section className="panel-page settings-page">
      <header className="page-heading"><p className="eyebrow">SETTINGS</p><h1>{t('扩展设置')}</h1><p>{t('管理外观、悬浮入口和当前 OmniMail 会话。')}</p></header>
      <div className="page-card setting-row"><div><strong>{t('网页悬浮按钮')}</strong><span>{t('在普通 HTTP/HTTPS 网页显示入口')}</span></div><input aria-label={t('网页悬浮按钮')} type="checkbox" checked={settings.floatingEnabled} onChange={(event) => onToggleFloating(event.target.checked)} /></div>
      <div className="page-card notification-settings">
        <div className="setting-row"><div><strong>{t('新邮件通知')}</strong>
          <span>{t('聚合已启用来源的最近未读邮件')}</span></div>
          <input aria-label={t('新邮件通知')} type="checkbox" checked={settings.notificationsEnabled}
            onChange={(event) => onNotifications({ ...settings,
              notificationsEnabled: event.target.checked })} /></div>
        {settings.notificationsEnabled && <>
          <fieldset><legend>{t('通知来源')}</legend><div className="notification-source-grid">
            {notificationSourceOptions.map((source) => <label key={source.id}>
              <input type="checkbox"
                checked={settings.notificationSources.includes(source.id)}
                onChange={(event) => onNotifications({ ...settings,
                  notificationSources: event.target.checked
                    ? [...settings.notificationSources, source.id]
                    : settings.notificationSources.filter((item) => item !== source.id),
                })} />{source.label}</label>)}
          </div></fieldset>
          <fieldset><legend>{t('勿扰时段（本机时间）')}</legend><div className="quiet-hours-fields">
            <label>{t('开始')}<input aria-label={t('开始')} type="time" value={settings.quietHoursStart}
              onChange={(event) => onNotifications({ ...settings,
                quietHoursStart: event.target.value })} /></label>
            <label>{t('结束')}<input aria-label={t('结束')} type="time" value={settings.quietHoursEnd}
              onChange={(event) => onNotifications({ ...settings,
                quietHoursEnd: event.target.value })} /></label>
          </div></fieldset>
        </>}
      </div>
      <PanelThemeSettings value={settings.theme} onChange={onTheme} />
      <PanelLanguageSettings />
      <div className="page-card account-card"><span>{t('当前账户')}</span><strong>{auth.user?.displayName}</strong><small>{auth.user?.email}</small><small>{auth.apiOrigin}</small></div>
      <button className="secondary-button" type="button" onClick={onOpenWeb}><ExternalLink size={16} />{t('打开完整网页端')}</button>
      <button className="danger-button" type="button" onClick={onLogout}><LogOut size={16} />{t('退出扩展登录')}</button>
    </section>
  )
}
