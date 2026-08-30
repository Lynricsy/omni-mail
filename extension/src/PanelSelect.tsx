import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t, useLocale } from '../../src/shared/i18n'

export interface PanelSelectOption {
  label: string
  value: string
}

interface Props {
  ariaLabel: string
  disabled?: boolean
  id: string
  onChange: (value: string) => void
  options: PanelSelectOption[]
  value: string
}

export function PanelSelect({ ariaLabel, disabled = false, id, onChange, options, value }: Props) {
  useLocale()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const activeIndexRef = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))
  const selectedOption = options[selectedIndex]
  const unavailable = disabled || !options.length

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [open])

  useEffect(() => {
    if (unavailable) setOpen(false)
  }, [unavailable])

  function activate(index: number) {
    activeIndexRef.current = index
    setActiveIndex(index)
  }

  function select(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const lastIndex = options.length - 1
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      const current = activeIndexRef.current
      activate(!open ? selectedIndex : event.key === 'ArrowDown'
        ? Math.min(current + 1, lastIndex)
        : Math.max(current - 1, 0))
      return
    }
    if (open && (event.key === 'Home' || event.key === 'End')) {
      event.preventDefault()
      activate(event.key === 'Home' ? 0 : lastIndex)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) select(activeIndexRef.current)
      else {
        activate(selectedIndex)
        setOpen(true)
      }
      return
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
    if (event.key === 'Tab') setOpen(false)
  }

  return (
    <div className={`panel-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        id={id}
        className="panel-select-trigger"
        type="button"
        role="combobox"
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        aria-controls={`${id}-listbox`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={unavailable}
        onClick={() => {
          if (!open) activate(selectedIndex)
          setOpen((current) => !current)
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{selectedOption?.label || t('暂无可用选项')}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-listbox`} className="panel-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <button
              id={`${id}-option-${index}`}
              className={`panel-select-option${index === activeIndex ? ' is-active' : ''}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => select(index)}
              onPointerEnter={() => activate(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
