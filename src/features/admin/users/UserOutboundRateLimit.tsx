import { Gauge, LoaderCircle, RotateCcw, Save } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { api, type AdminUser, type OutboundRateLimitState } from '../../../shared/api'
import { getLocale, t } from '../../../shared/i18n'

function resetTime(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp * 1000))
}

export function UserOutboundRateLimit({
  user,
  disabled,
  onUpdate,
}: {
  user: AdminUser
  disabled: boolean
  onUpdate: (value: OutboundRateLimitState) => void
}) {
  const rate = user.outboundRateLimit ?? {
    enabled: true,
    minuteLimit: 10,
    dayLimit: 200,
    minuteLimitOverride: null,
    dayLimitOverride: null,
    minuteUsed: 0,
    dayUsed: 0,
    minuteResetsAt: Math.floor(Date.now() / 60_000) * 60 + 60,
    dayResetsAt: Math.floor(Date.now() / 86_400_000) * 86_400 + 86_400,
  }
  const [minuteLimit, setMinuteLimit] = useState(rate.minuteLimitOverride?.toString() ?? '')
  const [dayLimit, setDayLimit] = useState(rate.dayLimitOverride?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setMinuteLimit(rate.minuteLimitOverride?.toString() ?? '')
    setDayLimit(rate.dayLimitOverride?.toString() ?? '')
    setMessage('')
  }, [rate.dayLimitOverride, rate.minuteLimitOverride, user.id])

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const result = await api.updateUserOutboundRateLimit(user.id, {
        minuteLimit: minuteLimit === '' ? null : Number(minuteLimit),
        dayLimit: dayLimit === '' ? null : Number(dayLimit),
      })
      onUpdate(result.outboundRateLimit)
      setMessage(t('用户发信限速已保存'))
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : '无法保存用户发信限速。'))
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    setResetting(true)
    setMessage('')
    try {
      const result = await api.resetUserOutboundRateLimit(user.id)
      onUpdate(result.outboundRateLimit)
      setMessage(t('当前发信计数已清零'))
    } catch (error) {
      setMessage(t(error instanceof Error ? error.message : '无法清零发信计数。'))
    } finally {
      setResetting(false)
    }
  }

  return (
    <form className="user-rate-limit" onSubmit={(event) => void save(event)}>
      <header>
        <Gauge size={16} />
        <span><strong>{t('用户发信限速')}</strong><small>{t(rate.enabled ? '全局限速已启用' : '全局限速当前已关闭')}</small></span>
      </header>
      <div className="user-rate-usage">
        <span><strong>{rate.minuteUsed} / {rate.minuteLimit}</strong><small>{t('本分钟 · {time} 重置', { time: resetTime(rate.minuteResetsAt) })}</small></span>
        <span><strong>{rate.dayUsed} / {rate.dayLimit}</strong><small>{t('本 UTC 日 · {time} 重置', { time: resetTime(rate.dayResetsAt) })}</small></span>
      </div>
      <div className="user-rate-inputs">
        <label>
          <span>{t('每分钟覆盖值')}</span>
          <input
            type="number"
            min="1"
            max="100"
            placeholder={String(rate.minuteLimit)}
            value={minuteLimit}
            disabled={disabled || saving || resetting}
            onChange={(event) => setMinuteLimit(event.target.value)}
          />
          <small>{t('留空继承全局值')}</small>
        </label>
        <label>
          <span>{t('每日覆盖值')}</span>
          <input
            type="number"
            min="1"
            max="10000"
            placeholder={String(rate.dayLimit)}
            value={dayLimit}
            disabled={disabled || saving || resetting}
            onChange={(event) => setDayLimit(event.target.value)}
          />
          <small>{t('留空继承全局值')}</small>
        </label>
      </div>
      {!disabled && (
        <div className="user-rate-actions">
          <button className="button button--secondary" type="button" disabled={saving || resetting} onClick={() => void reset()}>
            {resetting ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />}{t('清零当前计数')}
          </button>
          <button className="button button--primary" type="submit" disabled={saving || resetting}>
            {saving ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{t('保存限速')}
          </button>
        </div>
      )}
      {message && <p className="user-rate-message" role="status">{message}</p>}
    </form>
  )
}
