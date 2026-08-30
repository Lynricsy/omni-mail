import { AtSign, Check, ChevronDown } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { ManagedDomain } from '../../../shared/api'
import { t } from '../../../shared/i18n'

export function MailboxDomainSelect({
  value,
  domains,
  disabled,
  onChange,
}: {
  value: string
  domains: ManagedDomain[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{
    above: boolean
    left: number
    top: number
    width: number
    maxHeight: number
  } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()
  const selectedIndex = Math.max(0, domains.findIndex((domain) => domain.name === value))
  const selectedLabel = domains[selectedIndex]?.name || t('暂无可用域名')

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    function closeOnViewportChange(event: Event) {
      if (!menu.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('resize', closeOnViewportChange)
    document.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('resize', closeOnViewportChange)
      document.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [open])

  function showMenu(index = selectedIndex) {
    const rect = trigger.current?.getBoundingClientRect()
    if (disabled || !rect) return
    const menuHeight = Math.min(210, Math.max(50, domains.length * 40 + 10))
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const above = spaceBelow < Math.min(menuHeight, 120) && spaceAbove > spaceBelow
    const width = Math.max(150, rect.width)
    setPosition({
      above,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: above ? rect.top - 6 : rect.bottom + 6,
      width,
      maxHeight: Math.max(50, Math.min(menuHeight, above ? spaceAbove : spaceBelow)),
    })
    setOpen(true)
    requestAnimationFrame(() => optionRefs.current[index]?.focus())
  }

  function closeMenu(focusTrigger = false) {
    setOpen(false)
    if (focusTrigger) requestAnimationFrame(() => trigger.current?.focus())
  }

  function movePastMenu(backward: boolean) {
    const panel = root.current?.closest('.mailbox-switcher__panel')
    if (!panel || !trigger.current) return
    const focusable = [...panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )]
    const index = focusable.indexOf(trigger.current)
    focusable[index + (backward ? -1 : 1)]?.focus()
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    event.stopPropagation()
    showMenu(event.key === 'ArrowUp' ? domains.length - 1 : selectedIndex)
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const current = optionRefs.current.findIndex((option) => option === document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      closeMenu()
      movePastMenu(event.shiftKey)
      return
    }
    let next = current
    if (event.key === 'ArrowDown') next = Math.min(domains.length - 1, current + 1)
    else if (event.key === 'ArrowUp') next = Math.max(0, current - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = domains.length - 1
    else return
    event.preventDefault()
    optionRefs.current[next]?.focus()
  }

  return (
    <div className={`mailbox-domain-select ${open ? 'is-open' : ''}`} ref={root}>
      <button
        ref={trigger}
        className="mailbox-domain-select__trigger"
        type="button"
        role="combobox"
        aria-label={t('邮箱域名')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => open ? closeMenu() : showMenu()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={15} />
      </button>
      {open && position && createPortal(
        <div
          ref={menu}
          className="mailbox-domain-select__menu"
          id={menuId}
          role="listbox"
          aria-label={t('邮箱域名')}
          data-placement={position.above ? 'above' : 'below'}
          onKeyDown={handleMenuKeyDown}
          style={{
            left: position.left,
            top: position.top,
            width: position.width,
            maxHeight: position.maxHeight,
          }}
        >
          {domains.map((domain, index) => (
            <button
              ref={(node) => { optionRefs.current[index] = node }}
              className={domain.name === value ? 'is-selected' : ''}
              type="button"
              role="option"
              aria-selected={domain.name === value}
              key={domain.name}
              onClick={() => {
                onChange(domain.name)
                closeMenu(true)
              }}
            >
              <AtSign size={14} />
              <span>{domain.name}</span>
              {domain.name === value && <Check size={15} />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
