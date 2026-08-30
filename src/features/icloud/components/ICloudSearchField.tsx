import { LoaderCircle, Search, X } from 'lucide-react'
import { t } from '../../../shared/i18n'

export function ICloudSearchField({
  value,
  loading,
  summaryOnly,
  onChange,
}: {
  value: string
  loading: boolean
  summaryOnly: boolean
  onChange: (value: string) => void
}) {
  return <>
    <label className="search-field icloud-search-field" aria-busy={loading}>
      {loading
        ? <LoaderCircle className="spin" size={17} aria-hidden="true" />
        : <Search size={17} aria-hidden="true" />}
      <span className="sr-only">{t('搜索邮件')}</span>
      <input type="search" value={value} maxLength={120} autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('搜索发件人、主题或正文')} />
      {value && <button type="button" onClick={() => onChange('')}
        aria-label={t('清除搜索')}><X size={14} aria-hidden="true" /></button>}
    </label>
    {summaryOnly && value.trim() && <small className="icloud-search-note">
      {t('Web 摘要仅搜索当前已加载邮件')}
    </small>}
  </>
}
