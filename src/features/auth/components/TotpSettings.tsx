import { CheckCircle2, Copy, KeyRound, LoaderCircle, RefreshCw, ShieldCheck, ShieldOff, TriangleAlert } from 'lucide-react'
import QRCode from 'qrcode'
import { type FormEvent, useEffect, useState } from 'react'
import { api, type MfaStatus } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'

type Setup = { secret: string; uri: string; qrCode: string }

export function TotpSettings() {
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void api.mfaStatus().then(setStatus).catch((reason) => setError(errorMessage(reason)))
  }, [])

  async function startSetup() {
    setBusy(true)
    setError('')
    setRecoveryCodes([])
    try {
      const result = await api.startMfaSetup()
      const qrCode = await QRCode.toDataURL(result.uri, { width: 196, margin: 1 })
      setSetup({ ...result, qrCode })
      setCode('')
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api.confirmMfaSetup(code)
      setRecoveryCodes(result.recoveryCodes)
      setSetup(null)
      setCode('')
      setStatus((current) => current && ({
        ...current,
        enabled: true,
        pending: false,
        recoveryCodesRemaining: result.recoveryCodes.length,
      }))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  async function disable(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.disableMfa(code)
      setStatus((current) => current && ({
        ...current,
        enabled: false,
        pending: false,
        recoveryCodesRemaining: 0,
      }))
      setCode('')
      setRecoveryCodes([])
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="admin-card account-card mfa-card">
      <header>
        <ShieldCheck size={17} />
        <div>
          <h2>{t('管理员二次验证')}</h2>
          <p>{t('使用验证器应用保护高权限账户')}</p>
        </div>
      </header>

      {!status && !error && <p className="mfa-loading" role="status">
        <LoaderCircle className="spin" size={16} />{t('正在读取安全设置…')}
      </p>}

      {status && !status.ready && (
        <div className="mfa-warning">
          <TriangleAlert size={17} />
          <p><strong>{t('尚未配置加密密钥')}</strong><span>{t('请先添加 TOTP_ENCRYPTION_KEY Worker Secret。')}</span></p>
        </div>
      )}

      {status?.ready && !status.enabled && !setup && !recoveryCodes.length && (
        <div className="mfa-state">
          <ShieldOff size={20} />
          <p><strong>{t('二次验证未启用')}</strong><span>{t('启用后，密码或 Linux DO 登录都需要一次性验证码。')}</span></p>
          <button className="button button--primary" type="button" disabled={busy}
            onClick={() => void startSetup()}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
            {t('开始设置')}
          </button>
        </div>
      )}

      {setup && (
        <form className="mfa-setup" onSubmit={(event) => void confirm(event)}>
          <div className="mfa-setup-code">
            <img src={setup.qrCode} alt={t('验证器设置二维码')} width="196" height="196" />
            <div>
              <strong>{t('扫描二维码')}</strong>
              <span>{t('也可以在验证器中手动输入下面的密钥。')}</span>
              <code>{setup.secret}</code>
              <button className="button button--secondary button--small" type="button"
                onClick={() => void copy(setup.secret)}>
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {t(copied ? '已复制' : '复制密钥')}
              </button>
            </div>
          </div>
          <label className="account-field">
            <span>{t('输入验证器中的 6 位验证码')}</span>
            <input inputMode="numeric" autoComplete="one-time-code" value={code}
              onChange={(event) => setCode(event.target.value)} pattern="[0-9]{6}"
              maxLength={6} placeholder="000000" required />
          </label>
          <div className="mfa-actions">
            <button className="button button--primary" type="submit"
              disabled={busy || !/^\d{6}$/.test(code)}>
              {busy && <LoaderCircle className="spin" size={16} />}{t('确认并启用')}
            </button>
            <button className="button button--secondary" type="button" disabled={busy}
              onClick={() => void startSetup()}>
              <RefreshCw size={15} />{t('重新生成')}
            </button>
          </div>
        </form>
      )}

      {recoveryCodes.length > 0 && (
        <div className="mfa-recovery" role="status">
          <TriangleAlert size={18} />
          <div>
            <strong>{t('立即保存恢复码')}</strong>
            <span>{t('每枚恢复码只能使用一次，关闭后不会再次显示。')}</span>
            <pre>{recoveryCodes.join('\n')}</pre>
            <button className="button button--secondary button--small" type="button"
              onClick={() => void copy(recoveryCodes.join('\n'))}>
              <Copy size={14} />{t('复制全部恢复码')}
            </button>
          </div>
        </div>
      )}

      {status?.enabled && !recoveryCodes.length && (
        <form className="mfa-enabled" onSubmit={(event) => void disable(event)}>
          <div className="mfa-state is-enabled">
            <ShieldCheck size={20} />
            <p><strong>{t('二次验证已启用')}</strong><span>{t('剩余 {count} 枚恢复码', { count: status.recoveryCodesRemaining })}</span></p>
          </div>
          <label className="account-field">
            <span>{t('输入验证码或恢复码以停用')}</span>
            <input autoComplete="one-time-code" value={code}
              onChange={(event) => setCode(event.target.value)} maxLength={24} required />
          </label>
          <button className="button account-delete-trigger" type="submit"
            disabled={busy || !code.trim()}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <ShieldOff size={16} />}
            {t('停用二次验证')}
          </button>
        </form>
      )}

      {error && <p className="account-feedback is-error" role="alert">
        <TriangleAlert size={16} />{error}
      </p>}
    </section>
  )
}
