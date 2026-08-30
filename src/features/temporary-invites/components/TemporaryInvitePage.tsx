import {
  AlertCircle,
  AtSign,
  Check,
  Clock3,
  Globe2,
  Languages,
  LoaderCircle,
  MailPlus,
  Send,
  ShieldCheck,
  UserRoundPlus,
} from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { api, type TemporaryInvite, type User } from '../../../shared/api'
import { getLocale, t } from '../../../shared/i18n'
import '../styles/temporary-invite-page.css'
import { Brand, ThemeToggle } from '../../auth/components/AuthPages'
import { LanguageToggle } from '../../../shared/ui/language/LanguageToggle'
import { TurnstileWidget } from '../../auth/components/TurnstileWidget'

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '发生了未知错误。')
}

function formatDuration(hours: number): string {
  return hours % 24 === 0
    ? t('{count} 天', { count: hours / 24 })
    : t('{count} 小时', { count: hours })
}

export function TemporaryInvitePage({
  token,
  appName,
  turnstileSiteKey,
  onAuthenticated,
}: {
  token: string
  appName: string
  turnstileSiteKey: string
  onAuthenticated: (user: User) => void
}) {
  const [invite, setInvite] = useState<TemporaryInvite | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [localPart, setLocalPart] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileAttempt, setTurnstileAttempt] = useState(0)

  useEffect(() => {
    let active = true
    api.temporaryInvite(token)
      .then((result) => {
        if (active) setInvite(result.invite)
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  function leaveInvitation() {
    window.history.replaceState(null, '', window.location.pathname)
    window.location.reload()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!invite) return
    if (password !== confirmation) {
      setError(t('两次输入的密码不一致。'))
      return
    }
    if (invite.multiUse && !turnstileToken) {
      setError(t('请先完成人机验证。'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await api.registerTemporaryInvite(token, {
        displayName,
        localPart: invite.addressMode === 'self_selected' ? localPart : undefined,
        password,
        turnstileToken: invite.multiUse ? turnstileToken : undefined,
      })
      setRegisteredEmail(result.email)
      try {
        const login = await api.login(result.email, password)
        if ('mfaRequired' in login) throw new Error('Unexpected MFA challenge')
        window.history.replaceState(null, '', window.location.pathname)
        onAuthenticated(login.user)
      } catch {
        setError(t('账号 {email} 已创建，但自动登录失败，请返回登录页手动登录。', { email: result.email }))
      }
    } catch (registerError) {
      setError(errorMessage(registerError))
      if (invite.multiUse) {
        setTurnstileToken('')
        setTurnstileAttempt((attempt) => attempt + 1)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page invite-page">
      <div className="auth-page__top">
        <Brand />
        <div><LanguageToggle /><ThemeToggle /></div>
      </div>

      {loading ? (
        <section className="invite-public-card invite-public-state" role="status">
          <LoaderCircle className="spin" size={22} />
          <span>{t('正在验证邀请链接…')}</span>
        </section>
      ) : !invite ? (
        <section className="invite-public-card invite-public-error">
          <span className="auth-symbol auth-symbol--danger"><AlertCircle size={27} /></span>
          <p className="eyebrow">INVITATION UNAVAILABLE</p>
          <h1>{t('这个邀请无法使用')}</h1>
          <p>{error || t('邀请链接不存在或已经失效。')}</p>
          <button className="button button--secondary" type="button" onClick={leaveInvitation}>
            {t('返回 {appName} 登录页', { appName })}
          </button>
        </section>
      ) : (
        <section className="invite-public-card">
          <header className="invite-public-header">
            <span className="auth-symbol"><UserRoundPlus size={27} /></span>
            <div>
              <p className="eyebrow">{invite.accountRole === 'temporary' ? 'TEMPORARY ACCOUNT' : 'REGULAR ACCOUNT'}</p>
              <h1>{t(invite.accountRole === 'temporary' ? '创建临时邮箱账号' : '创建普通邮箱账号')}</h1>
              <p>{invite.addressMode === 'assigned'
                ? t('管理员已经为你分配好邮箱，设置密码后即可进入 {appName}。', { appName })
                : t('管理员邀请你加入 {appName}，请自行选择一个尚未使用的邮箱名称。', { appName })}</p>
            </div>
          </header>

          <div className="invite-public-layout">
            <aside className="invite-public-summary">
              {invite.addressMode === 'assigned'
                ? <div><AtSign size={17} /><span><small>{t('管理员指定邮箱')}</small><strong>{invite.assignedAddress}</strong></span></div>
                : <div><Globe2 size={17} /><span><small>{t('管理员指定域名')}</small><strong>{invite.domain}</strong></span></div>}
              <div><Clock3 size={17} /><span><small>{t('注册链接有效至')}</small><strong>{formatDate(invite.expiresAt)}</strong></span></div>
              {invite.accountRole === 'temporary' && invite.accountLifetimeHours !== null && (
                <div><Clock3 size={17} /><span><small>{t('临时账号有效时间')}</small><strong>{t('注册成功后 {duration}', { duration: formatDuration(invite.accountLifetimeHours) })}</strong></span></div>
              )}
              <div><ShieldCheck size={17} /><span><small>{t('链接类型')}</small><strong>{t(invite.multiUse ? '多人注册链接' : '单次使用链接')}</strong></span></div>
              <div><MailPlus size={17} /><span><small>{t('邮箱权限')}</small><strong>{invite.addressMode === 'assigned' ? t('固定邮箱，不能自行新增或更改') : invite.canCreateMailboxes ? t('最多创建 {count} 个邮箱', { count: invite.mailboxLimit }) : t('仅使用注册时创建的邮箱')}</strong></span></div>
              <div><Send size={17} /><span><small>{t('发信权限')}</small><strong>{t(invite.canReply ? '可以使用发信服务发信与回复' : '仅接收与查看邮件')}</strong></span></div>
              <div><Languages size={17} /><span><small>{t('翻译权限')}</small><strong>{t(invite.canTranslate ? '可以使用 AI 翻译邮件' : '不能使用 AI 翻译邮件')}</strong></span></div>
              <p><Check size={16} />{t(invite.accountRole === 'temporary'
                ? '链接到期只停止注册；账号到期会自动删除，但邮箱和已有邮件继续保留。'
                : '链接到期只停止注册；已经创建的普通用户账号会长期有效。')}</p>
            </aside>

            {registeredEmail ? (
              <div className="invite-registration-result">
                <span><Check size={24} /></span>
                <h2>{t('账号已经创建')}</h2>
                <strong>{registeredEmail}</strong>
                {error && <p className="form-error" role="alert"><AlertCircle size={16} />{error}</p>}
                <button className="button button--primary" type="button" onClick={leaveInvitation}>
                  {t('前往登录')}
                </button>
              </div>
            ) : (
              <form className="invite-register-form" onSubmit={(event) => void submit(event)}>
                <label>
                  <span>{t('显示名称')}</span>
                  <input
                    autoComplete="name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={60}
                    placeholder={t('例如：Omni')}
                    required
                  />
                </label>
                {invite.addressMode === 'assigned' ? (
                  <label className="invite-fixed-address">
                    <span>{t('管理员指定邮箱')}</span>
                    <input
                      autoComplete="username"
                      value={invite.assignedAddress || ''}
                      readOnly
                    />
                    <small>{t('该邮箱会成为固定的登录账号和收件地址，注册后不能自行更改。')}</small>
                  </label>
                ) : (
                  <label>
                    <span>{t('选择邮箱名称')}</span>
                    <span className="invite-address-field">
                      <AtSign size={16} />
                      <input
                        autoComplete="username"
                        value={localPart}
                        onChange={(event) => setLocalPart(event.target.value.toLowerCase())}
                        maxLength={64}
                        placeholder="your-name"
                        pattern="[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+"
                        title={t('只能填写邮箱 @ 前面的有效字符')}
                        required
                      />
                      <strong>@{invite.domain}</strong>
                    </span>
                    <small>{t('完整登录邮箱：{address}', { address: `${localPart || 'your-name'}@${invite.domain}` })}</small>
                  </label>
                )}
                <label>
                  <span>{t('设置密码')}</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    minLength={10}
                    maxLength={128}
                    placeholder={t('至少 10 个字符')}
                    required
                  />
                </label>
                <label>
                  <span>{t('确认密码')}</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    minLength={10}
                    maxLength={128}
                    placeholder={t('再次输入密码')}
                    required
                  />
                </label>

                {invite.multiUse && (
                  turnstileSiteKey ? (
                    <TurnstileWidget
                      key={turnstileAttempt}
                      siteKey={turnstileSiteKey}
                      action="temporary-invite"
                      onTokenChange={setTurnstileToken}
                    />
                  ) : (
                    <p className="form-error" role="alert">
                      <AlertCircle size={16} />{t('管理员尚未配置邀请安全验证。')}
                    </p>
                  )
                )}
                {error && <p className="form-error" role="alert"><AlertCircle size={16} />{error}</p>}
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={submitting || (invite.multiUse && !turnstileToken)}
                >
                  {submitting && <LoaderCircle className="spin" size={17} />}
                  {t(submitting ? '正在创建账号…' : '创建账号并进入邮箱')}
                </button>
              </form>
            )}
          </div>
        </section>
      )}
    </main>
  )
}
