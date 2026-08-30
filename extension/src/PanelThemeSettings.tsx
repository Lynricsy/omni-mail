import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ThemePreference } from './protocol'
import { t, useLocale } from '../../src/shared/i18n'

const options: Array<{
  value: ThemePreference
  label: string
  description: string
  icon: ReactNode
}> = [
  { value: 'system', label: '跟随系统', description: '自动匹配设备外观', icon: <Monitor size={16} /> },
  { value: 'light', label: '亮色', description: '始终使用浅色界面', icon: <Sun size={16} /> },
  { value: 'dark', label: '暗色', description: '始终使用深色界面', icon: <Moon size={16} /> },
]

export function PanelThemeSettings({ value, onChange }: {
  value: ThemePreference
  onChange: (theme: ThemePreference) => void
}) {
  useLocale()
  return (
    <section className="page-card theme-setting-card" aria-labelledby="theme-setting-title">
      <div className="theme-setting-heading">
        <strong id="theme-setting-title">{t('外观主题')}</strong>
        <span>{t('立即生效并保存在当前浏览器')}</span>
      </div>
      <div className="theme-options" role="group" aria-labelledby="theme-setting-title">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button className={selected ? 'is-selected' : ''} type="button"
              aria-pressed={selected} key={option.value} onClick={() => onChange(option.value)}>
              <span className="theme-option-icon" aria-hidden="true">{option.icon}</span>
              <span><strong>{t(option.label)}</strong><small>{t(option.description)}</small></span>
              <span className="theme-option-check" aria-hidden="true">
                {selected && <Check size={13} />}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
