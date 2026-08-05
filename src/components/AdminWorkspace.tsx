import { AlertCircle, ArrowRight, BadgeCheck, Ban, BarChart3, Clock3, Image as ImageIcon, ListChecks, LoaderCircle, Mail, RefreshCw, Save, Send, Settings2, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import {
  api,
  type AppConfig,
  type ManagedDomain,
  type MailRefreshInterval,
  type MailboxAddress,
  type RegistrationDomainPolicyMode,
  type User,
} from '../lib/api'
import { registrationDomainsFromText } from '../lib/registration'
import { t } from '../lib/i18n'
import { AccountSettings } from './AccountSettings'
import { AdminMailManagement } from './AdminMailManagement'
import { AdminPageHeader } from './AdminPageHeader'
import { AuditLogs } from './AuditLogs'
import { DomainManagement } from './DomainManagement'
import { InvitationManagement } from './InvitationManagement'
import type { AdminView } from './MailboxSidebar'
import { MailStatistics } from './MailStatistics'
import { OutboundRateLimitSettings } from './OutboundRateLimitSettings'
import { StoragePolicySettings } from './StoragePolicySettings'
import { UserManagement } from './UserManagement'
import { VersionStatusCard } from './VersionStatusCard'

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
  onOpenDeploymentWizard: () => void
}) {
  const [registrationSaving, setRegistrationSaving] = useState(false)
  const [registrationError, setRegistrationError] = useState('')
  const [registrationDomainMode, setRegistrationDomainMode] = useState<
    RegistrationDomainPolicyMode
  >(config.registrationDomainPolicy.mode)
  const [registrationDomainsDraft, setRegistrationDomainsDraft] = useState(
    () => config.registrationDomainPolicy.domains.join('\n'),
  )
  const [registrationDomainsSaving, setRegistrationDomainsSaving] = useState(false)
  const [registrationDomainsError, setRegistrationDomainsError] = useState('')
  const [refreshSaving, setRefreshSaving] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [remoteImagesSaving, setRemoteImagesSaving] = useState(false)
  const [remoteImagesError, setRemoteImagesError] = useState('')
  const [unassignedMailSaving, setUnassignedMailSaving] = useState(false)
  const [unassignedMailError, setUnassignedMailError] = useState('')

  async function saveRegistration(
    enabled: boolean,
    method = config.registrationMethod,
  ) {
    setRegistrationSaving(true)
    setRegistrationError('')
    try {
      const result = await api.updateRegistrationSetting(enabled, method)
      onConfigChange({
        ...config,
        registrationEnabled: result.registrationEnabled,
        registrationAvailable: result.registrationEnabled && (
          result.registrationMethod === 'linuxdo'
            ? config.linuxDoLoginEnabled
            : config.registrationProtectionReady
        ),
        registrationMethod: result.registrationMethod,
      })
    } catch (error) {
      setRegistrationError(t(error instanceof Error ? error.message : '无法更新注册设置。'))
    } finally {
      setRegistrationSaving(false)
    }
  }

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

  async function saveRegistrationDomains() {
    const domains = registrationDomainsFromText(registrationDomainsDraft)
    if (registrationDomainMode === 'allowlist' && domains.length === 0) {
      setRegistrationDomainsError(t('允许列表至少需要填写一个邮箱后缀。'))
      return
    }
    setRegistrationDomainsSaving(true)
    setRegistrationDomainsError('')
    try {
      const result = await api.updateRegistrationDomainPolicy({
        mode: registrationDomainMode,
        domains,
      })
      const policy = result.registrationDomainPolicy
      setRegistrationDomainMode(policy.mode)
      setRegistrationDomainsDraft(policy.domains.join('\n'))
      onConfigChange({
        ...config,
        registrationDomainPolicy: policy,
      })
    } catch (error) {
      setRegistrationDomainsError(
        t(error instanceof Error ? error.message : '无法保存邮箱后缀限制。'),
      )
    } finally {
      setRegistrationDomainsSaving(false)
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
  if (view === 'mail' && user.role === 'super_admin') return <AdminMailManagement />
  if (view === 'account') {
    return <AccountSettings user={user} onUserChange={onUserChange} onLogout={onLogout} />
  }

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
              <dd>{config.superAdminEmail || t('未配置 SUPER_ADMIN_EMAIL')}</dd>
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

        <section className="admin-card admin-card--settings">
          <header>
            <UserPlus size={17} />
            <div>
              <h2>{t('外部注册')}</h2>
              <p>{t('控制未登录访客是否可以创建普通账户')}</p>
            </div>
          </header>
          <fieldset className="registration-domain-mode">
            <legend>{t('注册方式')}</legend>
            <label className={config.registrationMethod === 'password' ? 'is-selected' : ''}>
              <input type="radio" name="registration-method"
                checked={config.registrationMethod === 'password'}
                disabled={registrationSaving || (
                  config.registrationEnabled && !config.registrationProtectionReady
                )}
                onChange={() => void saveRegistration(config.registrationEnabled, 'password')} />
              <span><UserPlus size={15} /><span><strong>{t('邮箱与密码')}</strong>
                <small>{t('访客填写邮箱、名称和密码注册')}</small></span></span>
            </label>
            <label className={config.registrationMethod === 'linuxdo' ? 'is-selected' : ''}>
              <input type="radio" name="registration-method"
                checked={config.registrationMethod === 'linuxdo'}
                disabled={registrationSaving || !config.linuxDoLoginEnabled}
                onChange={() => void saveRegistration(config.registrationEnabled, 'linuxdo')} />
              <span><BadgeCheck size={15} /><span><strong>{t('仅 Linux DO')}</strong>
                <small>{t('新用户必须通过 Linux DO Connect 注册')}</small></span></span>
            </label>
          </fieldset>
          <label className="policy-toggle">
            <span>
              {registrationSaving ? <LoaderCircle className="spin" size={17} /> : <UserPlus size={17} />}
              <span>
                <strong>{t(config.registrationEnabled ? '允许外部注册' : '外部注册已关闭')}</strong>
                <small>
                  {t(config.registrationMethod === 'linuxdo'
                    ? config.linuxDoLoginEnabled
                      ? 'Linux DO Connect 已配置；新账户默认没有邮箱权限'
                      : '配置 Linux DO Connect 后才能开启'
                    : config.registrationProtectionReady
                      ? 'Turnstile 已启用；新账户默认无创建邮箱和发信权限'
                      : '配置 Cloudflare Turnstile 后才能开启')}
                </small>
              </span>
            </span>
            <input
              type="checkbox"
              checked={config.registrationEnabled}
              disabled={registrationSaving || (!config.registrationEnabled && (
                config.registrationMethod === 'linuxdo'
                  ? !config.linuxDoLoginEnabled
                  : !config.registrationProtectionReady
              ))}
              aria-label={t('允许外部注册')}
              onChange={() => void saveRegistration(!config.registrationEnabled)}
            />
          </label>
          {registrationError && (
            <p className="inline-error" role="alert">
              <AlertCircle size={15} />{registrationError}
            </p>
          )}
          {config.registrationMethod === 'password' && !config.registrationProtectionReady && (
            <p className="admin-note">{t('需要在 Worker 中配置 TURNSTILE_SITE_KEY 和 TURNSTILE_SECRET_KEY，防止机器人批量注册。')}</p>
          )}
          {config.registrationMethod === 'linuxdo' && !config.linuxDoLoginEnabled && (
            <p className="admin-note">{t('需要在 Worker 中配置 LINUX_DO_CLIENT_ID 和 LINUX_DO_CLIENT_SECRET。')}</p>
          )}
          {config.registrationMethod === 'password' && <div className="registration-domain-policy">
            <fieldset className="registration-domain-mode">
              <legend>{t('邮箱后缀规则')}</legend>
              <label className={registrationDomainMode === 'blocklist' ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="registration-domain-mode"
                  checked={registrationDomainMode === 'blocklist'}
                  onChange={() => {
                    setRegistrationDomainMode('blocklist')
                    setRegistrationDomainsError('')
                  }}
                />
                <span>
                  <Ban size={15} />
                  <span><strong>{t('禁止列表')}</strong><small>{t('列表内拒绝，其他邮箱允许注册')}</small></span>
                </span>
              </label>
              <label className={registrationDomainMode === 'allowlist' ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="registration-domain-mode"
                  checked={registrationDomainMode === 'allowlist'}
                  onChange={() => {
                    setRegistrationDomainMode('allowlist')
                    setRegistrationDomainsError('')
                  }}
                />
                <span>
                  <BadgeCheck size={15} />
                  <span><strong>{t('允许列表')}</strong><small>{t('仅列表内邮箱可以注册')}</small></span>
                </span>
              </label>
            </fieldset>
            <label htmlFor="registration-domain-list">
              <span>
                {registrationDomainMode === 'allowlist'
                  ? <BadgeCheck size={15} />
                  : <Ban size={15} />}
                {t(registrationDomainMode === 'allowlist'
                  ? '允许注册的邮箱后缀'
                  : '禁止注册的邮箱后缀')}
              </span>
              <textarea
                id="registration-domain-list"
                value={registrationDomainsDraft}
                rows={3}
                maxLength={26000}
                spellCheck={false}
                placeholder={'qq.com\n163.com'}
                onChange={(event) => {
                  setRegistrationDomainsDraft(event.target.value)
                  setRegistrationDomainsError('')
                }}
              />
            </label>
            <footer>
              <small>
                {t('每行或逗号分隔，最多 100 个；')}
                {registrationDomainMode === 'allowlist'
                  ? t('至少填写一个后缀。')
                  : t('留空表示不限制。')}
              </small>
              <button
                className="button button--secondary button--small"
                type="button"
                disabled={registrationDomainsSaving}
                onClick={() => void saveRegistrationDomains()}
              >
                {registrationDomainsSaving
                  ? <LoaderCircle className="spin" size={14} />
                  : <Save size={14} />}
                {t(registrationDomainsSaving ? '保存中…' : '保存限制')}
              </button>
            </footer>
            {registrationDomainsError && (
              <p className="inline-error" role="alert">
                <AlertCircle size={15} />{registrationDomainsError}
              </p>
            )}
          </div>}
        </section>

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
