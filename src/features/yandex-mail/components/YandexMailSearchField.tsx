import { ImapSearchField } from '../../../shared/ui/mail-workspace/ImapSearchField'

export function YandexMailSearchField({ value, loading, onChange }: {
  value: string
  loading: boolean
  onChange: (value: string) => void
}) {
  return <ImapSearchField value={value} loading={loading} provider="Yandex 邮箱" onChange={onChange} />
}
