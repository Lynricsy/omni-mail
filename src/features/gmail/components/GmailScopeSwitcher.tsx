import type { GmailAccount } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { ImapScopeSwitcher } from '../../../shared/ui/mail-workspace/ImapScopeSwitcher'

export function GmailScopeSwitcher({ accounts, selectedAccountId, onChange, onManage }: {
  accounts: GmailAccount[]
  selectedAccountId: string
  onChange: (accountId: string) => void
  onManage: () => void
}) {
  return <ImapScopeSwitcher accounts={accounts} selectedAccountId={selectedAccountId}
    provider="Gmail" credentialErrorLabel={t('应用密码失效')}
    onChange={onChange} onManage={onManage} />
}
