import type { YandexMailAccount } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { ImapScopeSwitcher } from '../../../shared/ui/mail-workspace/ImapScopeSwitcher'

export function YandexMailScopeSwitcher({ accounts, selectedAccountId, onChange, onManage }: {
  accounts: YandexMailAccount[]
  selectedAccountId: string
  onChange: (accountId: string) => void
  onManage: () => void
}) {
  return <ImapScopeSwitcher accounts={accounts} selectedAccountId={selectedAccountId}
    provider="Yandex 邮箱" credentialErrorLabel={t('应用专用密码失效')}
    onChange={onChange} onManage={onManage} />
}
