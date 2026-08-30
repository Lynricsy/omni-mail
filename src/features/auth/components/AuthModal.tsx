import { AlertCircle, LoaderCircle, LogIn, ShieldCheck, UserPlus, X } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'
import { api, type RegistrationDomainPolicy, type User } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { emailAllowedByDomainPolicy } from '../model/registration'
import { LinuxDoAuthButton } from './LinuxDoAuthButton'
import { MfaLoginForm } from './MfaLoginForm'
import { TurnstileWidget } from './TurnstileWidget'
import { useAuthModalLifecycle } from '../hooks/useAuthModalLifecycle'

export type AuthMode = 'login' | 'register'

export function AuthModal({
  mode,
  appName,
  registrationEnabled,
  registrationMethod,
  linuxDoLoginEnabled,
  registrationDomainPolicy,
  turnstileSiteKey,
  onModeChange,
  onClose,
  onAuthenticated,
}: {
  mode: AuthMode
  appName: string
  registrationEnabled: boolean
  registrationMethod: 'password' | 'linuxdo'
  linuxDoLoginEnabled: boolean
  registrationDomainPolicy: RegistrationDomainPolicy
  turnstileSiteKey: string
  onModeChange: (mode: AuthMode) => void
  onClose: () => void
  onAuthenticated: (user: User) => void
}) {
  const titleId = useId()
  const modalRef = useRef<HTMLElement>(null)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(() => (
    new URLSearchParams(window.location.search).has('mfa_required')
  ))
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileAttempt, setTurnstileAttempt] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(() => (
    new URLSearchParams(window.location.search).has('auth_error')
      ? t('Linux DO 登录失败，请重试或联系管理员。')
      : ''
  ))
  const registering = mode === 'register'
  const oauthOnly = registering && registrationMethod === 'linuxdo'

  useAuthModalLifecycle(modalRef, onClose)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (mfaRequired) {
      if (!mfaCode.trim()) return
      setSubmitting(true)
      setError('')
      try {
        const result = await api.completeMfaLogin(mfaCode)
        onAuthenticated(result.user)
      } catch (submitError) {
        setError(errorMessage(submitError))
      } finally {
        setSubmitting(false)
      }
      return
    }
    if (registering && password !== confirmPassword) {
      setError(t('两次输入的密码不一致。'))
      return
    }
    if (registering && !emailAllowedByDomainPolicy(email, registrationDomainPolicy)) {
      setError(t(registrationDomainPolicy.mode === 'allowlist'
        ? '该邮箱后缀不在管理员允许的注册范围内。'
        : '管理员不允许使用该邮箱后缀注册。'))
      return
    }
    if (registering && !turnstileToken) {
      setError(t('请先完成人机验证。'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = registering
        ? await api.register({ email, displayName, password, turnstileToken })
        : await api.login(email, password)
      if ('mfaRequired' in result) {
        setMfaRequired(true)
        setPassword('')
        return
      }
      onAuthenticated(result.user)
    } catch (submitError) {
      setError(errorMessage(submitError))
      if (registering) {
        setTurnstileToken('')
        setTurnstileAttempt((attempt) => attempt + 1)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="public-auth-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={modalRef}
        className="public-auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <span>{mfaRequired
            ? <ShieldCheck size={21} />
            : registering ? <UserPlus size={21} /> : <LogIn size={21} />}</span>
          <div>
            <p className="eyebrow">{mfaRequired ? 'TWO-FACTOR AUTH' : registering ? 'CREATE ACCOUNT' : 'WELCOME BACK'}</p>
            <h2 id={titleId}>{mfaRequired
              ? t('完成二次验证')
              : registering
              ? t('创建普通账户')
              : t('登录 {appName}', { appName })}</h2>
          </div>
          <button type="button" aria-label={t('关闭')} data-tooltip={t('关闭')} onClick={onClose}>
            <X size={19} />
          </button>
        </header>

        {mfaRequired ? (
          <MfaLoginForm code={mfaCode} submitting={submitting}
            onCodeChange={setMfaCode} onSubmit={submit} />
        ) : <form className="auth-form" onSubmit={submit}>
          {!oauthOnly && <>
          {registering && (
            <label>
              <span>{t('显示名称')}</span>
              <input
                autoFocus
                autoComplete="name"
                value={displayName}
                maxLength={60}
                placeholder={t('你的显示名称')}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
          )}
          <label>
            <span>{t('登录邮箱')}</span>
            <input
              autoFocus={!registering}
              type="email"
              autoComplete="email"
              value={email}
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>{t('密码')}</span>
            <input
              type="password"
              autoComplete={registering ? 'new-password' : 'current-password'}
              value={password}
              minLength={registering ? 10 : undefined}
              placeholder={t(registering ? '至少 10 个字符' : '输入邮箱密码')}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {registering && (
            <label>
              <span>{t('确认密码')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                minLength={10}
                placeholder={t('再次输入密码')}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
          )}
          {registering && (
            <TurnstileWidget
              key={turnstileAttempt}
              siteKey={turnstileSiteKey}
              onTokenChange={setTurnstileToken}
            />
          )}
          <button
            className="button button--primary auth-submit"
            type="submit"
            disabled={submitting || (registering && !turnstileToken)}
          >
            {submitting && <LoaderCircle className="spin" size={17} />}
            {registering ? t('创建并登录') : t('登录')}
          </button>
          </>}
          {linuxDoLoginEnabled && (!registering || oauthOnly) && (
            <LinuxDoAuthButton registering={oauthOnly} />
          )}
        </form>}
        {error && <p className="form-error" role="alert"><AlertCircle size={16} />{error}</p>}

        {!mfaRequired && <footer>
          {t(registering ? '已经有账户？' : registrationEnabled ? '还没有账户？' : '当前未开放外部注册。')}
          {(registering || registrationEnabled) && (
            <button
              type="button"
              onClick={() => onModeChange(registering ? 'login' : 'register')}
            >
              {t(registering ? '返回登录' : '创建账户')}
            </button>
          )}
        </footer>}
      </section>
    </div>
  )
}
