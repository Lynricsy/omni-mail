import {
  AlertCircle,
  AtSign,
  Bell,
  Check,
  Cloud,
  Inbox,
  LoaderCircle,
  MailPlus,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { api, type AppConfig, type User } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import {
  extensionAuthorizationRequest,
  extensionAuthorizationResult,
} from '../model/extensionAuthorization'
import { t } from '../../../shared/i18n'
import '../styles/extension-authorization.css'
import { AuthModal, Brand, ThemeToggle } from '../../auth/components/AuthPages'
import { LanguageToggle } from '../../../shared/ui/language/LanguageToggle'

export function ExtensionAuthorizationPage({
  config,
  user,
  onAuthenticated,
  onLogout,
}: {
  config: AppConfig
  user: User | null
  onAuthenticated: (user: User) => void
  onLogout: () => Promise<void>
}) {
  const [request] = useState(() => extensionAuthorizationRequest())
  const [loginOpen, setLoginOpen] = useState(() => {
    const search = new URLSearchParams(window.location.search)
    return search.has('auth_error') || search.has('mfa_required')
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function cancel(): void {
    if (!request) {
      window.location.assign('/')
      return
    }
    window.location.assign(extensionAuthorizationResult(request, { error: 'access_denied' }))
  }

  async function approve(): Promise<void> {
    if (!request || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const result = await api.authorizeExtension(request)
      window.location.assign(result.redirectTo)
    } catch (approveError) {
      setError(errorMessage(approveError))
      setSubmitting(false)
    }
  }

  return (
    <div className="extension-auth-page">
      <header className="extension-auth-nav">
        <Brand />
        <div><LanguageToggle /><ThemeToggle /></div>
      </header>
      <main className="extension-auth-main">
        <section className="extension-auth-card" aria-labelledby="extension-auth-title">
          <div className="extension-auth-icon"><ShieldCheck size={25} /></div>
          <p className="eyebrow">OMNIMAIL FLOAT</p>
          <h1 id="extension-auth-title">{t(request ? '授权浏览器扩展' : '授权请求无效')}</h1>
          {!request ? (
            <>
              <p className="extension-auth-intro">
                {t('此请求不是有效的 OmniMail Float 授权请求，请返回扩展后重试。')}
              </p>
              <div className="form-error" role="alert">
                <AlertCircle size={16} />{t('回调地址或安全参数不正确。')}
              </div>
              <button className="button button--secondary" type="button" onClick={cancel}>
                {t('返回 OmniMail')}
              </button>
            </>
          ) : (
            <>
              <p className="extension-auth-intro">
                {t('OmniMail Float 希望连接你的账户，以便在其他网页快速生成邮箱和收取邮件。')}
              </p>
              <div className="extension-auth-permissions" aria-label={t('请求的权限')}>
                <article><MailPlus size={18} /><span><strong>{t('生成邮箱')}</strong><small>{t('在你有权限的域名下创建随机地址')}</small></span><Check size={16} /></article>
                <article><Cloud size={18} /><span><strong>{t('iCloud 隐藏邮箱')}</strong><small>{t('使用已有隐藏地址、创建新地址并读取来信')}</small></span><Check size={16} /></article>
                <article><Inbox size={18} /><span><strong>{t('读取收件箱')}</strong><small>{t('查看邮箱列表、邮件正文和用户主动打开的附件')}</small></span><Check size={16} /></article>
                <article><AtSign size={18} /><span><strong>{t('已连接的第三方邮箱')}</strong><small>{t('读取已连接账号、文件夹和邮件，并在用户操作后请求同步')}</small></span><Check size={16} /></article>
                <article><Bell size={18} /><span><strong>{t('新邮件通知')}</strong><small>{t('扩展在后台检查并提醒新邮件')}</small></span><Check size={16} /></article>
              </div>
              {user ? (
                <div className="extension-auth-account">
                  <span>{user.displayName.slice(0, 1).toUpperCase()}</span>
                  <p><strong>{user.displayName}</strong><small>{user.email}</small></p>
                  <button type="button" disabled={submitting} onClick={() => void onLogout()}>{t('换一个账户')}</button>
                </div>
              ) : (
                <div className="extension-auth-signed-out">
                  <p>{t('请先通过 OmniMail 网站验证身份，密码不会提供给扩展。')}</p>
                  <button className="button button--primary" type="button" onClick={() => setLoginOpen(true)}>
                    {t('登录并继续')}
                  </button>
                </div>
              )}
              {error && <div className="form-error" role="alert"><AlertCircle size={16} />{error}</div>}
              <div className="extension-auth-actions">
                <button className="button button--secondary" type="button" disabled={submitting} onClick={cancel}>{t('取消')}</button>
                <button className="button button--primary" type="button" disabled={!user || submitting} onClick={() => void approve()}>
                  {submitting && <LoaderCircle className="spin" size={17} />}
                  {submitting ? t('正在授权…') : t('允许访问')}
                </button>
              </div>
              <p className="extension-auth-security"><ShieldCheck size={14} />{t('扩展只会收到可随时撤销的设备令牌，不会读取你的网页登录 Cookie。')}</p>
            </>
          )}
        </section>
      </main>
      {loginOpen && !user && (
        <AuthModal
          mode="login"
          appName={config.appName}
          registrationEnabled={false}
          registrationMethod={config.registrationMethod}
          linuxDoLoginEnabled={config.linuxDoLoginEnabled}
          registrationDomainPolicy={config.registrationDomainPolicy}
          turnstileSiteKey={config.turnstileSiteKey}
          onModeChange={() => {}}
          onClose={() => setLoginOpen(false)}
          onAuthenticated={(nextUser) => { setLoginOpen(false); onAuthenticated(nextUser) }}
        />
      )}
    </div>
  )
}
