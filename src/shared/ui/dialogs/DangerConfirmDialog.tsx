import { TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../i18n'

export function DangerConfirmDialog({
  icon: Icon,
  eyebrow,
  title,
  description,
  impactTitle,
  impactDescription,
  confirmLabel,
  confirmation,
  busy = false,
  onCancel,
  onConfirm,
}: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
  impactTitle: string
  impactDescription: string
  confirmLabel: string
  confirmation?: {
    label: string
    expected: string
    value: string
    onChange: (value: string) => void
  }
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef(onCancel)
  const busyRef = useRef(busy)
  cancelRef.current = onCancel
  busyRef.current = busy

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) cancelRef.current()
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [])

  return createPortal(
    <div className="mail-delete-backdrop" role="presentation" onMouseDown={(event) => {
      if (!busy && event.target === event.currentTarget) onCancel()
    }}>
      <section
        ref={dialogRef}
        className="mail-delete-dialog admin-danger-dialog is-permanent"
        role="alertdialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header>
          <span><Icon size={21} /></span>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" type="button" disabled={busy} onClick={onCancel} aria-label={t('关闭')}>
            <X size={17} />
          </button>
        </header>
        <div className="mail-delete-dialog__body">
          <p id={descriptionId}>{description}</p>
          <p className="mail-delete-impact">
            <TriangleAlert size={17} />
            <span><strong>{impactTitle}</strong><small>{impactDescription}</small></span>
          </p>
          {confirmation && (
            <label className="admin-danger-confirmation">
              <span>{confirmation.label}</span>
              <input
                data-autofocus
                inputMode="numeric"
                value={confirmation.value}
                onChange={(event) => confirmation.onChange(event.target.value)}
              />
            </label>
          )}
        </div>
        <footer>
          <button className="button button--secondary" type="button" disabled={busy} data-autofocus={confirmation ? undefined : true} onClick={onCancel}>
            {t('取消')}
          </button>
          <button
            className="button mail-delete-confirm is-permanent"
            type="button"
            disabled={busy || Boolean(confirmation && confirmation.value !== confirmation.expected)}
            onClick={onConfirm}
          >
            <Icon size={16} />
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
