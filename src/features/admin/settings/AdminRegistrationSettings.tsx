import { AlertCircle, BadgeCheck, Ban, LoaderCircle, Save, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { api, type AppConfig, type RegistrationDomainPolicyMode } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { registrationDomainsFromText } from '../../auth/model/registration'

export function AdminRegistrationSettings({ config, onConfigChange }: {
  config: AppConfig
  onConfigChange: (config: AppConfig) => void
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

  async function saveRegistration(enabled: boolean, method = config.registrationMethod) {
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
      onConfigChange({ ...config, registrationDomainPolicy: policy })
    } catch (error) {
      setRegistrationDomainsError(
        t(error instanceof Error ? error.message : '无法保存邮箱后缀限制。'),
      )
    } finally {
      setRegistrationDomainsSaving(false)
    }
  }

  return (
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
            <input type="radio" name="registration-domain-mode"
              checked={registrationDomainMode === 'blocklist'}
              onChange={() => { setRegistrationDomainMode('blocklist'); setRegistrationDomainsError('') }} />
            <span><Ban size={15} /><span><strong>{t('禁止列表')}</strong><small>{t('列表内拒绝，其他邮箱允许注册')}</small></span></span>
          </label>
          <label className={registrationDomainMode === 'allowlist' ? 'is-selected' : ''}>
            <input type="radio" name="registration-domain-mode"
              checked={registrationDomainMode === 'allowlist'}
              onChange={() => { setRegistrationDomainMode('allowlist'); setRegistrationDomainsError('') }} />
            <span><BadgeCheck size={15} /><span><strong>{t('允许列表')}</strong><small>{t('仅列表内邮箱可以注册')}</small></span></span>
          </label>
        </fieldset>
        <label htmlFor="registration-domain-list">
          <span>{registrationDomainMode === 'allowlist' ? <BadgeCheck size={15} /> : <Ban size={15} />}
            {t(registrationDomainMode === 'allowlist' ? '允许注册的邮箱后缀' : '禁止注册的邮箱后缀')}</span>
          <textarea id="registration-domain-list" value={registrationDomainsDraft} rows={3}
            maxLength={26000} spellCheck={false} placeholder={'qq.com\n163.com'}
            onChange={(event) => { setRegistrationDomainsDraft(event.target.value); setRegistrationDomainsError('') }} />
        </label>
        <footer>
          <small>{t('每行或逗号分隔，最多 100 个；')}
            {registrationDomainMode === 'allowlist' ? t('至少填写一个后缀。') : t('留空表示不限制。')}</small>
          <button className="button button--secondary button--small" type="button"
            disabled={registrationDomainsSaving} onClick={() => void saveRegistrationDomains()}>
            {registrationDomainsSaving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
            {t(registrationDomainsSaving ? '保存中…' : '保存限制')}
          </button>
        </footer>
        {registrationDomainsError && <p className="inline-error" role="alert">
          <AlertCircle size={15} />{registrationDomainsError}
        </p>}
      </div>}
    </section>
  )
}
