import { ScrollText, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { AuditLog } from '../../../shared/api'
import { t } from '../../../shared/i18n'

export function AuditLogDetailDialog({
  log,
  actionLabel,
  categoryLabel,
  actorLabel,
  targetLabel,
  formattedTime,
  detailParts,
  onClose,
}: {
  log: AuditLog
  actionLabel: string
  categoryLabel: string
  actorLabel: string
  targetLabel: string
  formattedTime: string
  detailParts: string[]
  onClose: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
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
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [])

  const actorSecondary = log.actor?.email || t(log.actor ? '无登录邮箱' : '未建立会话')
  const targetSecondary = log.target?.email || log.targetId || t('无附加信息')

  return createPortal(
    <div className="audit-detail-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        ref={dialogRef}
        className="audit-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="audit-detail-dialog__header">
          <span className="audit-detail-dialog__symbol"><ScrollText size={20} /></span>
          <div>
            <p className="eyebrow">AUDIT TRAIL · {categoryLabel}</p>
            <h2 id={titleId}>{actionLabel}</h2>
            <p id={descriptionId}>{t('查看这条操作日志的完整记录和诊断信息。')}</p>
          </div>
          <button className="icon-button" type="button" data-autofocus onClick={onClose} aria-label={t('关闭')}>
            <X size={18} />
          </button>
        </header>

        <div className="audit-detail-dialog__body">
          <dl className="audit-detail-metadata">
            <div><dt>{t('时间')}</dt><dd><time dateTime={new Date(log.createdAt * 1000).toISOString()}>{formattedTime}</time></dd></div>
            <div><dt>{t('日志类型')}</dt><dd>{categoryLabel}</dd></div>
            <div className="audit-detail-metadata__wide"><dt>{t('操作标识')}</dt><dd><code>{log.action}</code></dd></div>
            <div><dt>{t('操作者')}</dt><dd><strong>{actorLabel}</strong><small>{actorSecondary}</small></dd></div>
            <div><dt>{t('目标对象')}</dt><dd><strong>{targetLabel}</strong><small>{targetSecondary}</small></dd></div>
            <div><dt>{t('来源 IP')}</dt><dd><code>{log.ip}</code></dd></div>
            <div><dt>{t('日志 ID')}</dt><dd><code>#{log.id}</code></dd></div>
          </dl>

          <section className="audit-detail-diagnostics" aria-labelledby={`${titleId}-diagnostics`}>
            <h3 id={`${titleId}-diagnostics`}>{t('诊断详情')}</h3>
            {detailParts.length ? (
              <ul>{detailParts.map((part, index) => <li key={`${index}-${part}`}>{part}</li>)}</ul>
            ) : (
              <p>{t('无附加信息')}</p>
            )}
          </section>
        </div>

        <footer className="audit-detail-dialog__footer">
          <button className="button button--secondary" type="button" onClick={onClose}>{t('关闭')}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
