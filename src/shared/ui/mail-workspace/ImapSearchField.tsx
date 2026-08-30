import { LoaderCircle, Search, X } from 'lucide-react'
import { t } from '../../i18n'

export function ImapSearchField({ value, loading, provider, onChange }: {
  value: string
  loading: boolean
  provider: string
  onChange: (value: string) => void
}) {
  return <label className="search-field gmail-search-field" aria-busy={loading}>
    {loading
      ? <LoaderCircle className="spin" size={17} aria-hidden="true" />
      : <Search size={17} aria-hidden="true" />}
    <span className="sr-only">{t('搜索 {provider} 邮件', { provider })}</span>
    <input type="search" value={value} maxLength={120} autoComplete="off"
      onChange={(event) => onChange(event.target.value)}
      placeholder={t('搜索发件人、收件人或主题')} />
    {value && <button type="button" onClick={() => onChange('')}
      aria-label={t('清除搜索')}><X size={14} aria-hidden="true" /></button>}
  </label>
}
