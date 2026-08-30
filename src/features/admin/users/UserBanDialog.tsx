import { Ban } from 'lucide-react'
import { t } from '../../../shared/i18n'
import { DangerConfirmDialog } from '../../../shared/ui/dialogs/DangerConfirmDialog'

export function UserBanDialog({
  email,
  onCancel,
  onConfirm,
}: {
  email: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <DangerConfirmDialog
      icon={Ban}
      eyebrow="DISABLE ACCOUNT"
      title={t('封禁 {email}？', { email })}
      description={t('该账户会立即退出登录，所有现有会话都将失效。')}
      impactTitle={t('立即生效')}
      impactDescription={t('用户之后无法继续访问邮箱，管理员可随时重新启用账户。')}
      confirmLabel={t('确认封禁')}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
