import { ImapSearchField } from '../../../shared/ui/mail-workspace/ImapSearchField'

export function QqMailSearchField({ value, loading, onChange }: {
  value: string
  loading: boolean
  onChange: (value: string) => void
}) {
  return <ImapSearchField value={value} loading={loading} provider="QQ 邮箱" onChange={onChange} />
}
