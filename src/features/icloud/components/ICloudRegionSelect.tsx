import { Globe2 } from 'lucide-react'
import type { ICloudHost } from '../../../shared/api'
import { t } from '../../../shared/i18n'

const regions: Array<{ value: ICloudHost; label: string; domain: string }> = [
  { value: 'icloud.com', label: '全球', domain: 'icloud.com' },
  { value: 'icloud.com.cn', label: '中国大陆', domain: 'icloud.com.cn' },
]

export function ICloudRegionSelect({ value, onChange }: {
  value: ICloudHost
  onChange: (value: ICloudHost) => void
}) {
  return (
    <div className={`icloud-region-select${value === 'icloud.com.cn' ? ' is-china' : ''}`}
      role="group" aria-label={t('iCloud 区域')}>
      <span className="icloud-region-select__indicator" aria-hidden="true" />
      {regions.map((region) => (
        <button className={region.value === value ? 'is-selected' : ''} type="button"
          aria-pressed={region.value === value} key={region.value}
          onClick={() => onChange(region.value)}>
          <span className="icloud-region-select__icon"><Globe2 size={16} aria-hidden="true" /></span>
          <span><strong>{t(region.label)}</strong><small>{region.domain}</small></span>
        </button>
      ))}
    </div>
  )
}
