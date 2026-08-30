import { ArchiveRestore, TriangleAlert, Trash2, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { t } from '../../../shared/i18n'

export function MailDeleteDialog({
  count,
  permanent,
  onCancel,
  onConfirm,
}: {
  count: number
  permanent: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current()
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

  const title = permanent
    ? count === 1
      ? t('永久删除这封邮件？')
      : t('永久删除所选的 {count} 封邮件？', { count })
    : count === 1
      ? t('将这封邮件移入垃圾箱？')
      : t('将所选的 {count} 封邮件移入垃圾箱？', { count })
  const description = permanent
    ? t('邮件正文、原始邮件和附件都会被永久删除，此操作无法撤销。')
    : t('邮件会保留在垃圾箱中，您可以在自动清理前恢复。')

  return (
    <div className="mail-delete-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel()
    }}>
      <section
        ref={dialogRef}
        className={`mail-delete-dialog${permanent ? ' is-permanent' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header>
          <span>{permanent ? <TriangleAlert size={22} /> : <Trash2 size={21} />}</span>
          <div>
            <p className="eyebrow">{permanent ? 'PERMANENT DELETE' : 'MOVE TO TRASH'}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} aria-label={t('关闭')}>
            <X size={17} />
          </button>
        </header>
        <div className="mail-delete-dialog__body">
          <p id={descriptionId}>{description}</p>
          <p className="mail-delete-impact">
            {permanent ? <TriangleAlert size={17} /> : <ArchiveRestore size={17} />}
            <span>
              <strong>{t(permanent ? '删除后无法恢复' : '之后仍可恢复')}</strong>
              <small>{t(permanent
                ? '请确认这些邮件和附件已经不再需要。'
                : '您可以前往垃圾箱恢复，或稍后永久删除。')}</small>
            </span>
          </p>
        </div>
        <footer>
          <button className="button button--secondary" type="button" data-autofocus onClick={onCancel}>
            {t('取消')}
          </button>
          <button className={`button mail-delete-confirm${permanent ? ' is-permanent' : ''}`} type="button" onClick={onConfirm}>
            <Trash2 size={16} />
            {t(permanent ? '永久删除' : '移入垃圾箱')}
          </button>
        </footer>
      </section>
    </div>
  )
}
