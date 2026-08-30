import type { NaverMailAccount } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { ImapScopeSwitcher } from '../../../shared/ui/mail-workspace/ImapScopeSwitcher'

export function NaverMailScopeSwitcher({ accounts, selectedAccountId, onChange, onManage }: {
  accounts: NaverMailAccount[]
  selectedAccountId: string
  onChange: (accountId: string) => void
  onManage: () => void
}) {
  return <ImapScopeSwitcher accounts={accounts} selectedAccountId={selectedAccountId}
    provider="NAVER 邮箱" credentialErrorLabel={t('应用专用密码失效')}
    onChange={onChange} onManage={onManage} />
}
