import { LoaderCircle, Search, X } from 'lucide-react'
import { useId, type FormEvent } from 'react'
import { t } from '../../../shared/i18n'

export function LinuxDoMailSearchField({
  value,
  folder,
  loading,
  onChange,
  onSubmit,
  onClear,
}: {
  value: string
  folder: 'inbox' | 'sent'
  loading: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onClear: () => void
}) {
  const inputId = useId()
  const searchLabel = folder === 'sent' ? '搜索已发送邮件' : '搜索收件箱邮件'

  function submit(event: FormEvent) {
    event.preventDefault()
    if (value.trim() && !loading) onSubmit()
  }

  return <form className="search-field linuxdo-search-field" role="search"
    aria-label={t(searchLabel)} aria-busy={loading} onSubmit={submit}>
    <button className="linuxdo-search-submit" type="submit" disabled={loading || !value.trim()}
      aria-label={t(searchLabel)} data-tooltip={t('按当前文件夹搜索')}>
      {loading ? <LoaderCircle className="spin" size={17} aria-hidden="true" />
        : <Search size={17} aria-hidden="true" />}
    </button>
    <label className="sr-only" htmlFor={inputId}>{t(searchLabel)}</label>
    <input id={inputId} type="search" value={value} maxLength={120} autoComplete="off"
      enterKeyHint="search" onChange={(event) => onChange(event.target.value)}
      placeholder={t(folder === 'sent'
        ? '搜索收件人、主题或正文'
        : '搜索发件人、主题或正文')} />
    {value && <button type="button" onClick={onClear} aria-label={t('清除搜索')}>
      <X size={14} aria-hidden="true" />
    </button>}
  </form>
}
