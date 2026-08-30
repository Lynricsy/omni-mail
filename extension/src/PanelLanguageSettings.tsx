import { Languages } from 'lucide-react'
import { getLocale, setLocale, t, useLocale, type Locale } from '../../src/shared/i18n'

export function PanelLanguageSettings() {
  useLocale()
  const locale = getLocale()
  const options: Array<{ value: Locale; label: string }> = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en-US', label: 'English' },
  ]
  return <section className="page-card panel-language-setting"
    aria-labelledby="panel-language-title">
    <div><Languages size={16} aria-hidden="true" /><span>
      <strong id="panel-language-title">{t('界面语言')}</strong>
      <small>{t('切换 Float 面板显示语言')}</small></span></div>
    <div role="radiogroup" aria-labelledby="panel-language-title">
      {options.map((option) => <button type="button" role="radio"
        aria-checked={locale === option.value} className={locale === option.value
          ? 'is-selected' : ''} key={option.value}
        onClick={() => setLocale(option.value)}>{option.label}</button>)}
    </div>
  </section>
}
