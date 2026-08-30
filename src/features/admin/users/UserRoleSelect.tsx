import { Check, ChevronDown, Clock3, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { ManagedUserPolicy } from '../../../shared/api'
import { t } from '../../../shared/i18n'

const roleOptions = [
  {
    value: 'admin' as const,
    label: '管理员',
    description: '管理用户、域名与系统配置',
    Icon: ShieldCheck,
  },
  {
    value: 'user' as const,
    label: '普通用户',
    description: '长期使用的标准邮箱账户',
    Icon: UserRound,
  },
  {
    value: 'temporary' as const,
    label: '临时用户',
    description: '使用管理员配置的临时权限',
    Icon: Clock3,
  },
]

export function UserRoleSelect({
  value,
  allowAdmin,
  disabled,
  onChange,
}: {
  value: ManagedUserPolicy['role']
  allowAdmin: boolean
  disabled: boolean
  onChange: (role: ManagedUserPolicy['role']) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const options = roleOptions.filter((option) => (
    option.value !== 'admin' || allowAdmin || value === 'admin'
  ))
  const selected = options.find((option) => option.value === value) || options[0]

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [open])

  return (
    <div className={`user-role-select ${open ? 'is-open' : ''}`} ref={root}>
      <button
        className="user-role-select__trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <selected.Icon size={16} />
        <span>{t(selected.label)}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="user-role-select__menu" id={menuId} role="listbox">
          {options.map(({ value: optionValue, label, description, Icon }) => (
            <button
              className={optionValue === value ? 'is-selected' : ''}
              type="button"
              role="option"
              aria-selected={optionValue === value}
              key={optionValue}
              onClick={() => {
                onChange(optionValue)
                setOpen(false)
              }}
            >
              <span className="user-role-select__icon"><Icon size={16} /></span>
              <span><strong>{t(label)}</strong><small>{t(description)}</small></span>
              {optionValue === value && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
