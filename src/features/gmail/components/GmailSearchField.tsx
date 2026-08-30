import { ImapSearchField } from '../../../shared/ui/mail-workspace/ImapSearchField'

export function GmailSearchField({ value, loading, onChange }: {
  value: string
  loading: boolean
  onChange: (value: string) => void
}) {
  return <ImapSearchField value={value} loading={loading} provider="Gmail" onChange={onChange} />
}
