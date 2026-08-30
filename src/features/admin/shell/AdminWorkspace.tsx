import { AlertCircle, ArrowRight, BarChart3, Clock3, Image as ImageIcon, ListChecks, LoaderCircle, Mail, RefreshCw, Send, Settings2, ShieldCheck, Users } from 'lucide-react'
import { lazy, useState } from 'react'
import {
  api,
  type AppConfig,
  type ManagedDomain,
  type MailRefreshInterval,
  type MailboxAddress,
  type User,
} from '../../../shared/api'
import { t } from '../../../shared/i18n'
import '../styles/users/account-settings.css'
import '../styles/users/account-settings-responsive.css'
import '../styles/mail/admin-mail-management.css'
import '../styles/shell/admin-workspace.css'
import '../styles/shell/admin-workspace-responsive.css'
import '../styles/audit/audit-logs.css'
import '../styles/audit/audit-detail-dialog.css'
import '../styles/domains/domain-management.css'
import '../styles/mail/failed-mail-center.css'
import '../styles/invitations/invitation-history.css'
import '../styles/mail/mail-storage-statistics.css'
import '../styles/mail/mail-storage-statistics-responsive.css'
import '../styles/settings/outbound-rate-limit.css'
import '../styles/mail/statistics.css'
import '../styles/settings/storage-policy.css'
import '../styles/settings/system-settings.css'
import '../styles/invitations/temporary-invites.css'
import '../styles/users/user-management.css'
import '../styles/users/user-policy-panel.css'
import { AccountSettings } from '../users/AccountSettings'
import { AdminRegistrationSettings } from '../settings/AdminRegistrationSettings'
import { AdminMailManagement } from '../mail/AdminMailManagement'
import { AdminPageHeader } from './AdminPageHeader'
import { AuditLogs } from '../audit/AuditLogs'
import { DomainManagement } from '../domains/DomainManagement'
import { InvitationManagement } from '../invitations/InvitationManagement'
import { MailWorkspaceSettings } from '../settings/MailWorkspaceSettings'
import type { AdminView } from '../../mailbox/components/MailboxSidebar'
import { MailStatistics } from '../mail/MailStatistics'
import { OutboundRateLimitSettings } from '../settings/OutboundRateLimitSettings'
import { OfficialExtensionSettings } from '../settings/OfficialExtensionSettings'
import { RandomMailboxSettings } from '../settings/RandomMailboxSettings'
import { StoragePolicySettings } from '../settings/StoragePolicySettings'
import { UserManagement } from '../users/UserManagement'
import { VersionStatusCard } from '../settings/VersionStatusCard'

const ApiGuide = lazy(async () => ({ default: (await import('../../api-guide/components/ApiGuide')).ApiGuide }))

const refreshOptions: Array<{ value: MailRefreshInterval; label: string }> = [
  { value: 5, label: '5 秒' },
  { value: 10, label: '10 秒' },
  { value: 30, label: '30 秒' },
  { value: 60, label: '60 秒' },
  { value: 120, label: '120 秒' },
  { value: 0, label: '不刷新' },
]

function Status({ enabled, children }: { enabled: boolean; children: string }) {
  return (
    <span className={`admin-status ${enabled ? 'is-ready' : ''}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  )
}

export function AdminWorkspace({
  view,
  user,
  config,
  mailboxes,
  domains,
  onDomainsChanged,
  onConfigChange,
  onUserChange,
  onLogout,
  onOpenApiGuide,
  onOpenICloud,
  onOpenDeploymentWizard,
}: {
  view: AdminView
  user: User
  config: AppConfig
  mailboxes: MailboxAddress[]
  domains: ManagedDomain[]
  onDomainsChanged: () => Promise<void>
  onConfigChange: (config: AppConfig) => void
  onUserChange: (user: User) => void
  onLogout: () => Promise<void>
  onOpenApiGuide: () => void
  onOpenICloud: () => void
  onOpenDeploymentWizard: () => void
}) {
  const [refreshSaving, setRefreshSaving] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [remoteImagesSaving, setRemoteImagesSaving] = useState(false)
  const [remoteImagesError, setRemoteImagesError] = useState('')
  const [unassignedMailSaving, setUnassignedMailSaving] = useState(false)
  const [unassignedMailError, setUnassignedMailError] = useState('')

  async function saveRefreshInterval(interval: MailRefreshInterval) {
    if (interval === config.mailRefreshInterval) return
    setRefreshSaving(true)
    setRefreshError('')
    try {
      const result = await api.updateMailRefreshInterval(interval)
      onConfigChange({ ...config, mailRefreshInterval: result.mailRefreshInterval })
    } catch (error) {
      setRefreshError(t(error instanceof Error ? error.message : '无法更新自动刷新设置。'))
    } finally {
      setRefreshSaving(false)
    }
  }

  async function toggleRemoteImages() {
    setRemoteImagesSaving(true)
    setRemoteImagesError('')
    try {
      const result = await api.updateRemoteImagesSetting(!config.remoteImagesEnabled)
      onConfigChange({ ...config, remoteImagesEnabled: result.remoteImagesEnabled })
    } catch (error) {
      setRemoteImagesError(t(error instanceof Error ? error.message : '无法更新远程图片设置。'))
    } finally {
      setRemoteImagesSaving(false)
    }
  }

  async function toggleUnassignedMail() {
    setUnassignedMailSaving(true)
    setUnassignedMailError('')
    try {
      const result = await api.updateUnassignedMailSetting(!config.unassignedMailEnabled)
      onConfigChange({ ...config, unassignedMailEnabled: result.unassignedMailEnabled })
    } catch (error) {
      setUnassignedMailError(t(error instanceof Error ? error.message : '无法更新无人收件设置。'))
    } finally {
      setUnassignedMailSaving(false)
    }
  }


  if (view === 'users') {
    return <UserManagement currentUser={user} />
  }
  if (view === 'invites') {
    return (
      <InvitationManagement
        registrationProtectionReady={config.registrationProtectionReady}
      />
    )
  }
  if (view === 'logs') return <AuditLogs />
  if (view === 'mail' && user.role === 'super_admin') return <AdminMailManagement remoteImagesEnabled={config.remoteImagesEnabled} />
  if (view === 'account') {
    return <AccountSettings user={user} onUserChange={onUserChange} onLogout={onLogout} onOpenApiGuide={onOpenApiGuide} onOpenICloud={onOpenICloud} iCloudWorkspaceEnabled={config.iCloudWorkspaceEnabled} />
  }
  if (view === 'api') return <ApiGuide />

  const activeMailboxes = mailboxes.filter((mailbox) => mailbox.isActive)
  if (view === 'statistics') {
    return (
      <main className="admin-workspace">
        <AdminPageHeader
          icon={BarChart3}
          eyebrow="ADMIN · ALL MAILBOXES"
          title={t('邮箱统计')}
          description={t('查看全站收件趋势、来源域名和高频发件人。')}
        />
        <MailStatistics />
      </main>
    )
  }

  return (
    <main className="admin-workspace">
      <AdminPageHeader
        icon={Settings2}
        eyebrow="ADMIN · SYSTEM"
        title={t('系统设置')}
        description={t('集中管理全局域名、账户权限模型和邮件服务配置。')}
      />

      <div className="admin-detail-grid">
        <DomainManagement domains={domains} onChanged={onDomainsChanged} />

        <StoragePolicySettings canBrowseBackups={user.role === 'super_admin'} />

        <OutboundRateLimitSettings />

        <VersionStatusCard />

        <section className="admin-card admin-card--settings">
          <header>
            <ShieldCheck size={17} />
            <div>
              <h2>{t('主管理员')}</h2>
              <p>{t('系统最高权限登录身份')}</p>
            </div>
          </header>
          <dl className="settings-list">
            <div>
              <dt><Mail size={15} />{t('配置邮箱')}</dt>
              <dd>{user.role === 'super_admin' ? user.email : t('已配置')}</dd>
            </div>
            <div>
              <dt><ShieldCheck size={15} />{t('身份来源')}</dt>
              <dd>{t('Worker 环境变量')}</dd>
            </div>
          </dl>
          <p className="admin-note">{t('修改主管理员邮箱需要前往 Cloudflare Worker 的 Variables & Secrets，更新 SUPER_ADMIN_EMAIL 后重新部署或重启 Worker。')}</p>
          <button
            className="deployment-launch"
            type="button"
            onClick={onOpenDeploymentWizard}
          >
            <span><ListChecks size={17} /><span><strong>{t('部署初始化向导')}</strong><small>{t('重新检查资源绑定与服务配置')}</small></span></span>
            <ArrowRight size={16} />
          </button>
        </section>

        {user.role === 'super_admin' && (
          <OfficialExtensionSettings
            enabled={config.officialExtensionEnabled}
            onChange={(officialExtensionEnabled) => onConfigChange({
              ...config,
              officialExtensionEnabled,
            })}
          />
        )}

        <RandomMailboxSettings
          prefix={config.randomMailboxPrefix || ''}
          onChange={(randomMailboxPrefix) => onConfigChange({
            ...config,
            randomMailboxPrefix,
          })}
        />

        <MailWorkspaceSettings
          iCloudWorkspaceEnabled={config.iCloudWorkspaceEnabled}
          linuxDoMailWorkspaceEnabled={config.linuxDoMailWorkspaceEnabled}
          gmailWorkspaceEnabled={config.gmailWorkspaceEnabled}
          microsoftWorkspaceEnabled={config.microsoftWorkspaceEnabled}
          qqMailWorkspaceEnabled={config.qqMailWorkspaceEnabled}
          naverMailWorkspaceEnabled={config.naverMailWorkspaceEnabled}
          yandexMailWorkspaceEnabled={config.yandexMailWorkspaceEnabled}
          onChange={(settings) => onConfigChange({ ...config, ...settings })}
        />

        <section className="admin-card admin-card--settings">
          <header>
            <RefreshCw size={17} />
            <div>
              <h2>{t('邮件自动刷新')}</h2>
              <p>{t('设置所有用户收件箱的轮询频率')}</p>
            </div>
          </header>
          <fieldset className="refresh-options" aria-busy={refreshSaving}>
            <legend>{t('刷新间隔')}</legend>
            {refreshOptions.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="mail-refresh-interval"
                  value={option.value}
                  checked={config.mailRefreshInterval === option.value}
                  disabled={refreshSaving}
                  onChange={() => void saveRefreshInterval(option.value)}
                />
                <span>{t(option.label)}</span>
              </label>
            ))}
          </fieldset>
          <p className="refresh-setting-note">
            {refreshSaving && <LoaderCircle className="spin" size={14} />}
            {t(refreshSaving ? '正在保存全局设置…' : '页面处于后台时会暂停刷新，返回后继续。')}
          </p>
          {refreshError && (
            <p className="inline-error" role="alert">
              <AlertCircle size={15} />{refreshError}
            </p>
          )}
        </section>

        <section className="admin-card admin-card--settings">
          <header>
            <ImageIcon size={17} />
            <div>
              <h2>{t('邮件外部内容')}</h2>
              <p>{t('设置所有用户查看 HTML 邮件时的默认加载策略')}</p>
            </div>
          </header>
          <label className="policy-toggle">
            <span>
              {remoteImagesSaving
                ? <LoaderCircle className="spin" size={17} />
                : <ImageIcon size={17} />}
              <span>
                <strong>{t(config.remoteImagesEnabled ? '默认加载安全外部内容' : '默认阻止外部内容')}</strong>
                <small>{t(config.remoteImagesEnabled
                  ? 'HTTPS 图片会通过 OmniMail 代理自动加载'
                  : '保护用户隐私，避免触发发件人的追踪像素')}</small>
              </span>
            </span>
            <input
              type="checkbox"
              checked={config.remoteImagesEnabled}
              disabled={remoteImagesSaving}
              aria-label={t('默认加载安全外部内容')}
              onChange={() => void toggleRemoteImages()}
            />
          </label>
          {remoteImagesError && (
            <p className="inline-error" role="alert">
              <AlertCircle size={15} />{remoteImagesError}
            </p>
          )}
          <p className="admin-note">{t('仅加载图片等被动内容；邮件脚本、表单与嵌入页面始终会被阻止。')}</p>
        </section>

        <section className="admin-card admin-card--settings">
          <header>
            <Mail size={17} />
            <div>
              <h2>{t('无人收件')}</h2>
              <p>{t('接收尚未创建邮箱地址的邮件')}</p>
            </div>
          </header>
          <label className="policy-toggle">
            <span>
              {unassignedMailSaving
                ? <LoaderCircle className="spin" size={17} />
                : <Mail size={17} />}
              <span>
                <strong>{t(config.unassignedMailEnabled ? '无人收件已开启' : '拒收未分配邮件')}</strong>
                <small>{t(config.unassignedMailEnabled
                  ? '已管理域名的未分配邮件会进入主管理员收件箱'
                  : '未创建邮箱地址的邮件会在收件阶段被拒绝')}</small>
              </span>
            </span>
            <input
              type="checkbox"
              checked={config.unassignedMailEnabled}
              disabled={unassignedMailSaving}
              aria-label={t('开启无人收件')}
              onChange={() => void toggleUnassignedMail()}
            />
          </label>
          {unassignedMailError && (
            <p className="inline-error" role="alert">
              <AlertCircle size={15} />{unassignedMailError}
            </p>
          )}
          <p className="admin-note">{t('仅主管理员可以查看无人收件邮件；邮件列表会显示原始收件地址。关闭开关不会删除已经收到的邮件。')}</p>
        </section>

        <section className="admin-card admin-card--settings">
          <header>
            <Users size={17} />
            <div>
              <h2>{t('账户类型')}</h2>
              <p>{t('权限模型已经预留')}</p>
            </div>
          </header>
          <div className="role-list">
            <div><ShieldCheck size={16} /><strong>{t('管理员')}</strong><Status enabled>{t('已启用')}</Status></div>
            <div><Users size={16} /><strong>{t('普通用户')}</strong><Status enabled={false}>{t('按用户配置')}</Status></div>
            <div><Clock3 size={16} /><strong>{t('临时用户')}</strong><Status enabled={false}>{t('按用户配置')}</Status></div>
          </div>
        </section>

        <AdminRegistrationSettings config={config} onConfigChange={onConfigChange} />

        <section className="admin-card admin-card--settings">
          <header>
            <Send size={17} />
            <div>
              <h2>{t('邮件服务')}</h2>
              <p>{t('当前 Worker 功能状态')}</p>
            </div>
          </header>
          <div className="service-status-list">
            <div><span>Cloudflare Email Routing</span><Status enabled>{t('收件已启用')}</Status></div>
            <div><span>{t('发信与回复服务')}</span><Status enabled={config.replyEnabled}>{t(config.replyEnabled ? '已配置' : '未配置')}</Status></div>
            <div><span>{t('收件地址')}</span><strong>{activeMailboxes.length}</strong></div>
          </div>
        </section>
      </div>
    </main>
  )
}
