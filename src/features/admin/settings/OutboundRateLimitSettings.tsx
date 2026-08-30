import { AlertCircle, Gauge, LoaderCircle, Save, Send } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { api, type OutboundRateLimitSettings as RateSettings } from '../../../shared/api'
import { t } from '../../../shared/i18n'

const defaults: RateSettings = { enabled: true, minuteLimit: 10, dayLimit: 200 }

export function OutboundRateLimitSettings() {
  const [value, setValue] = useState(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api.outboundRateLimitSettings()
      .then((result) => setValue(result.outboundRateLimit))
      .catch((loadError) => setError(t(
        loadError instanceof Error ? loadError.message : '无法读取发信限速设置。',
      )))
      .finally(() => setLoading(false))
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const result = await api.updateOutboundRateLimitSettings(value)
      setValue(result.outboundRateLimit)
      setNotice(t('发信限速设置已保存'))
    } catch (saveError) {
      setError(t(saveError instanceof Error ? saveError.message : '无法保存发信限速设置。'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-card admin-card--settings outbound-rate-card">
      <header>
        <Gauge size={17} />
        <div>
          <h2>{t('发信限速')}</h2>
          <p>{t('限制主动发件、草稿发送和回复的合计频率')}</p>
        </div>
      </header>
      {loading ? (
        <p className="rate-limit-loading"><LoaderCircle className="spin" size={15} />{t('正在读取发信限速…')}</p>
      ) : (
        <form onSubmit={(event) => void save(event)}>
          <label className="policy-toggle">
            <span><Send size={17} /><span><strong>{t('启用发信限速')}</strong><small>{t(value.enabled ? '超额请求会返回 429' : '所有用户暂时不受频率限制')}</small></span></span>
            <input
              type="checkbox"
              checked={value.enabled}
              disabled={saving}
              onChange={(event) => setValue({ ...value, enabled: event.target.checked })}
            />
          </label>
          <div className="rate-limit-inputs">
            <label>
              <span>{t('每分钟默认上限')}</span>
              <input
                type="number"
                min="1"
                max="100"
                required
                value={value.minuteLimit}
                disabled={saving}
                onChange={(event) => setValue({ ...value, minuteLimit: Number(event.target.value) })}
              />
              <small>{t('允许范围 1–100 封')}</small>
            </label>
            <label>
              <span>{t('每日默认上限')}</span>
              <input
                type="number"
                min="1"
                max="10000"
                required
                value={value.dayLimit}
                disabled={saving}
                onChange={(event) => setValue({ ...value, dayLimit: Number(event.target.value) })}
              />
              <small>{t('允许范围 1–10,000 封，按 UTC 自然日')}</small>
            </label>
          </div>
          <button className="button button--secondary rate-limit-save" type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}
            {t(saving ? '正在保存…' : '保存限速设置')}
          </button>
        </form>
      )}
      {notice && <p className="rate-limit-notice">{notice}</p>}
      {error && <p className="inline-error" role="alert"><AlertCircle size={15} />{error}</p>}
      <p className="admin-note">{t('用户管理中可以覆盖默认值、查看当前窗口用量并清零计数。')}</p>
    </section>
  )
}
