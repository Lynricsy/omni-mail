import { AlertCircle, BadgeCheck, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { api } from '../../../shared/api'
import { t } from '../../../shared/i18n'

export function OfficialExtensionSettings({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    setSaving(true)
    setError('')
    try {
      const result = await api.updateOfficialExtensionSetting(!enabled)
      onChange(result.officialExtensionEnabled)
    } catch (updateError) {
      setError(t(
        updateError instanceof Error
          ? updateError.message
          : '无法更新官方浏览器扩展设置。',
      ))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="admin-card admin-card--settings">
      <header>
        <BadgeCheck size={17} />
        <div>
          <h2>{t('官方浏览器扩展')}</h2>
          <p>{t('控制 Chrome Web Store 固定版本能否连接当前实例')}</p>
        </div>
      </header>
      <label className="policy-toggle">
        <span>
          {saving
            ? <LoaderCircle className="spin" size={17} />
            : <BadgeCheck size={17} />}
          <span>
            <strong>{t(enabled ? '官方扩展已启用' : '官方扩展已关闭')}</strong>
            <small>{t(enabled
              ? '允许商店版 OmniMail Float 连接并请求账户授权'
              : '固定扩展来源不能访问当前实例的 API')}</small>
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={saving}
          aria-label={t('开启官方浏览器扩展')}
          onChange={() => void toggle()}
        />
      </label>
      {error && (
        <p className="inline-error" role="alert">
          <AlertCircle size={15} />{error}
        </p>
      )}
      <p className="admin-note">{t('Chrome Web Store 版使用固定扩展 ID，无需配置 APP_ORIGINS；开发版或其他扩展 ID 仍通过 APP_ORIGINS 单独允许。')}</p>
    </section>
  )
}
