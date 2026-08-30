import { AtSign, Check, ChevronDown } from 'lucide-react'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { MailboxAddress } from '../../api'
import { t } from '../../i18n'

export type ComposeSenderOption = {
  value: string
  label: string
  address: string
}

type SelectOption = MailboxAddress | ComposeSenderOption

function optionValue(option: SelectOption): string {
  return 'value' in option ? option.value : option.address
}
function optionAddress(option: SelectOption): string { return option.address }
function optionTitle(option: SelectOption): string {
  return 'value' in option ? option.label : option.address
}
function optionSubtitle(option: SelectOption): string {
  return 'value' in option
    ? option.address
    : `${option.domain}${option.isPrimary ? ` · ${t('主邮箱')}` : ''}`
}

export function ComposeMailboxSelect({ mailboxes, value, disabled, onChange, icon }: {
  mailboxes: SelectOption[]
  value: string
  disabled: boolean
  onChange: (value: string) => void
  icon?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()
  const selectedIndex = Math.max(0, mailboxes.findIndex((mailbox) => optionValue(mailbox) === value))
  const selected = mailboxes[selectedIndex]

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  function showMenu(index = selectedIndex) {
    if (disabled || !mailboxes.length) return
    setOpen(true)
    requestAnimationFrame(() => optionRefs.current[index]?.focus())
  }

  function closeMenu(focusTrigger = false) {
    setOpen(false)
    if (focusTrigger) requestAnimationFrame(() => trigger.current?.focus())
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      closeMenu()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    showMenu(event.key === 'ArrowUp' ? mailboxes.length - 1 : selectedIndex)
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const current = optionRefs.current.findIndex((option) => option === document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu(true)
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    let next = current
    if (event.key === 'ArrowDown') next = Math.min(mailboxes.length - 1, current + 1)
    else if (event.key === 'ArrowUp') next = Math.max(0, current - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = mailboxes.length - 1
    else return
    event.preventDefault()
    optionRefs.current[next]?.focus()
  }

  return <div className={`compose-mailbox-select${open ? ' is-open' : ''}`} ref={root}>
    <button ref={trigger} className="compose-mailbox-select__trigger" type="button"
      role="combobox" aria-label={t('发件人')} aria-haspopup="listbox" aria-expanded={open}
      aria-controls={menuId} disabled={disabled}
      onClick={() => open ? closeMenu() : showMenu()} onKeyDown={handleTriggerKeyDown}>
      <span className="compose-mailbox-select__icon">{icon || <AtSign size={14} />}</span>
      <span>{selected ? optionAddress(selected) : value}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div className="compose-mailbox-select__menu" id={menuId} role="listbox"
      aria-label={t('发件人')} onKeyDown={handleMenuKeyDown}>
      {mailboxes.map((mailbox, index) => <button
        ref={(node) => { optionRefs.current[index] = node }}
        className={optionValue(mailbox) === value ? 'is-selected' : ''} type="button"
        role="option" aria-selected={optionValue(mailbox) === value}
        tabIndex={optionValue(mailbox) === value ? 0 : -1} key={optionValue(mailbox)}
        onClick={() => { onChange(optionValue(mailbox)); closeMenu(true) }}>
        <span className="compose-mailbox-select__icon">{icon || <AtSign size={14} />}</span>
        <span><strong>{optionTitle(mailbox)}</strong><small>{optionSubtitle(mailbox)}</small></span>
        {optionValue(mailbox) === value && <Check size={15} />}
      </button>)}
    </div>}
  </div>
}
