import { ImapSearchField } from '../../../shared/ui/mail-workspace/ImapSearchField'

export function NaverMailSearchField({ value, loading, onChange }: {
  value: string
  loading: boolean
  onChange: (value: string) => void
}) {
  return <ImapSearchField value={value} loading={loading} provider="NAVER 邮箱" onChange={onChange} />
}
