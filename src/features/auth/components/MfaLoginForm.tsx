import { LoaderCircle } from 'lucide-react'
import type { FormEvent } from 'react'
import { t } from '../../../shared/i18n'

export function MfaLoginForm({
  code,
  submitting,
  onCodeChange,
  onSubmit,
}: {
  code: string
  submitting: boolean
  onCodeChange: (code: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <p className="auth-mfa-description">
        {t('输入验证器应用中的 6 位验证码，或使用一枚恢复码。')}
      </p>
      <label>
        <span>{t('验证码或恢复码')}</span>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          placeholder="000000"
          maxLength={24}
          required
        />
      </label>
      <button className="button button--primary auth-submit" type="submit"
        disabled={submitting || !code.trim()}>
        {submitting && <LoaderCircle className="spin" size={17} />}
        {t('验证并登录')}
      </button>
    </form>
  )
}
