import type { QqMailAccount } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { ImapScopeSwitcher } from '../../../shared/ui/mail-workspace/ImapScopeSwitcher'

export function QqMailScopeSwitcher({ accounts, selectedAccountId, onChange, onManage }: {
  accounts: QqMailAccount[]
  selectedAccountId: string
  onChange: (accountId: string) => void
  onManage: () => void
}) {
  return <ImapScopeSwitcher accounts={accounts} selectedAccountId={selectedAccountId}
    provider="QQ 邮箱" credentialErrorLabel={t('授权码失效')}
    onChange={onChange} onManage={onManage} />
}
