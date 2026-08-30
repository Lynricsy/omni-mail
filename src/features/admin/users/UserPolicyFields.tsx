import { Ban, Languages, MailPlus, Send } from 'lucide-react'
import type { ManagedUserPolicy } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { UserRoleSelect } from './UserRoleSelect'

export function UserPolicyFields({
  value,
  onChange,
  allowAdmin,
  showStatus,
  useRoleDefaults = false,
  disabled = false,
}: {
  value: ManagedUserPolicy
  onChange: (next: ManagedUserPolicy) => void
  allowAdmin: boolean
  showStatus: boolean
  useRoleDefaults?: boolean
  disabled?: boolean
}) {
  return (
    <div className="user-policy-fields">
      <label>
        <span>{t('账户角色')}</span>
        <UserRoleSelect
          value={value.role}
          allowAdmin={allowAdmin}
          disabled={disabled}
          onChange={(role) => {
            onChange({
              ...value,
              role,
              canCreateMailboxes: role === 'admin' ? true : value.canCreateMailboxes,
              canTranslate: role === 'admin'
                ? true
                : useRoleDefaults ? role !== 'temporary' : value.canTranslate,
            })
          }}
        />
      </label>

      <label>
        <span>{t('邮箱数量上限')}</span>
        <input
          type="number"
          min="0"
          max="100"
          value={value.mailboxLimit}
          disabled={disabled}
          onChange={(event) => onChange({
            ...value,
            mailboxLimit: Math.max(0, Math.min(100, Number(event.target.value))),
          })}
        />
        <small>{t('范围 0–100；已经创建的邮箱不会被自动删除。')}</small>
      </label>

      <label>
        <span>{t('存储配额（MiB）')}</span>
        <input
          type="number"
          min="0"
          max="102400"
          value={value.storageQuotaMiB}
          disabled={disabled}
          onChange={(event) => onChange({
            ...value,
            storageQuotaMiB: Number(event.target.value) === 0
              ? 0
              : Math.max(16, Math.min(102400, Number(event.target.value))),
          })}
        />
        <small>{t('填写 0 表示不限；其他值需要在 16–102400 MiB 之间。')}</small>
      </label>

      <label className="policy-toggle">
        <span><MailPlus size={17} /><span><strong>{t('创建与管理邮箱')}</strong><small>{t(value.role === 'admin' ? '管理员默认拥有此权限' : '允许添加、启用和停用自己的收件地址')}</small></span></span>
        <input
          type="checkbox"
          checked={value.role === 'admin' || value.canCreateMailboxes}
          disabled={disabled || value.role === 'admin'}
          onChange={(event) => onChange({ ...value, canCreateMailboxes: event.target.checked })}
        />
      </label>

      <label className="policy-toggle">
        <span><Send size={17} /><span><strong>{t('使用发信服务发信与回复')}</strong><small>{t('仍需 Worker 已配置发信服务')}</small></span></span>
        <input
          type="checkbox"
          checked={value.canReply}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, canReply: event.target.checked })}
        />
      </label>

      <label className="policy-toggle">
        <span><Languages size={17} /><span><strong>{t('使用 AI 翻译邮件')}</strong><small>{t(value.role === 'admin' ? '管理员默认拥有此权限' : '允许查看缓存译文并请求新的 AI 翻译')}</small></span></span>
        <input
          type="checkbox"
          checked={value.role === 'admin' || value.canTranslate}
          disabled={disabled || value.role === 'admin'}
          onChange={(event) => onChange({ ...value, canTranslate: event.target.checked })}
        />
      </label>

      {showStatus && (
        <label className="policy-toggle policy-toggle--danger">
          <span><Ban size={17} /><span><strong>{t('封禁账户')}</strong><small>{t('保存后立即注销该用户的所有会话')}</small></span></span>
          <input
            type="checkbox"
            checked={value.status === 'disabled'}
            disabled={disabled}
            onChange={(event) => onChange({
              ...value,
              status: event.target.checked ? 'disabled' : 'active',
            })}
          />
        </label>
      )}
    </div>
  )
}
