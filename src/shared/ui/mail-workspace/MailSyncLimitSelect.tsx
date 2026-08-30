import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { MailSyncLimit } from '../../api'
import { t } from '../../i18n'

const SYNC_LIMITS: MailSyncLimit[] = [10, 20, 50]

export function MailSyncLimitSelect({ id, value, disabled, onChange }: {
  id: string
  value: MailSyncLimit
  disabled: boolean
  onChange: (value: MailSyncLimit) => void
}) {
  const helpId = `${id}-help`
  const menuId = `${id}-menu`
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(0, SYNC_LIMITS.indexOf(value))

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  function showMenu(index = selectedIndex) {
    if (disabled) return
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
    showMenu(event.key === 'ArrowUp' ? SYNC_LIMITS.length - 1 : selectedIndex)
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
    if (event.key === 'ArrowDown') next = Math.min(SYNC_LIMITS.length - 1, current + 1)
    else if (event.key === 'ArrowUp') next = Math.max(0, current - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = SYNC_LIMITS.length - 1
    else return
    event.preventDefault()
    optionRefs.current[next]?.focus()
  }

  return <label className="mail-sync-limit" htmlFor={id}>
    <span>{t('本次最多同步')}</span>
    <div className={`mail-sync-limit__select${open ? ' is-open' : ''}`} ref={root}>
      <button ref={trigger} id={id} className="mail-sync-limit__trigger" type="button"
        role="combobox" aria-label={t('本次最多同步')} aria-haspopup="listbox"
        aria-expanded={open} aria-controls={menuId} aria-describedby={helpId} disabled={disabled}
        onClick={() => open ? closeMenu() : showMenu()} onKeyDown={handleTriggerKeyDown}>
        <span>{t('{count} 封邮件', { count: value })}</span><ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && <div className="mail-sync-limit__menu" id={menuId} role="listbox"
        aria-label={t('本次最多同步')} onKeyDown={handleMenuKeyDown}>
        {SYNC_LIMITS.map((limit, index) => <button
          ref={(node) => { optionRefs.current[index] = node }}
          className={limit === value ? 'is-selected' : ''} type="button" role="option"
          aria-selected={limit === value} tabIndex={limit === value ? 0 : -1} key={limit}
          onClick={() => { onChange(limit); closeMenu(true) }}>
          <span><strong>{t('{count} 封邮件', { count: limit })}</strong>
            <small>{t(limit === 20 ? '推荐的后台同步批次' : '本次手动同步上限')}</small></span>
          {limit === value && <Check size={15} aria-hidden="true" />}
        </button>)}
      </div>}
    </div>
    <small id={helpId}>{t('只影响这次手动同步；后台同步默认每次最多 20 封。')}</small>
  </label>
}
