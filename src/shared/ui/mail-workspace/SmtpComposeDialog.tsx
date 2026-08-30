import { AlertCircle, AtSign, LoaderCircle, Send, ShieldCheck, Trash2, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../../i18n'
import { ComposeMailboxSelect } from './ComposeMailboxSelect'

export type SmtpComposeInput = {
  to: string
  subject: string
  text: string
  idempotencyKey: string
}

export type SmtpSenderOption = {
  value: string
  label: string
  address: string
}

export function SmtpComposeDialog({ sender, title, providerLabel, deliveryNote,
  senderIcon, senderOptions, senderValue, onSenderChange,
  initialTo = '', initialSubject = '', busy, error, onCancel, onSubmit }: {
  sender: string
  title: string
  providerLabel: string
  deliveryNote: string
  senderIcon?: ReactNode
  senderOptions?: SmtpSenderOption[]
  senderValue?: string
  onSenderChange?: (value: string) => void
  initialTo?: string
  initialSubject?: string
  busy: boolean
  error: string
  onCancel: () => void
  onSubmit: (input: SmtpComposeInput) => Promise<void>
}) {
  const [to, setTo] = useState(initialTo)
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState('')
  const idempotencyKey = useMemo(() => crypto.randomUUID().replaceAll('-', ''), [])
  const titleId = useId()
  const descriptionId = useId()
  const noteId = useId()
  const errorId = useId()
  const dialogRef = useRef<HTMLFormElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const busyRef = useRef(busy)
  const cancelRef = useRef(onCancel)
  busyRef.current = busy
  cancelRef.current = onCancel

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLInputElement>('[data-modal-autofocus]')?.focus()
    })
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) cancelRef.current()
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    window.addEventListener('keydown', keydown)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', keydown)
      previousFocus?.focus()
    }
  }, [])

  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  async function submit(event: FormEvent) {
    event.preventDefault()
    await onSubmit({ to, subject, text: body, idempotencyKey })
  }

  return createPortal(
    <div className="compose-backdrop"
      onMouseDown={(event) => !busy && event.target === event.currentTarget && onCancel()}>
      <form ref={dialogRef} className="compose-dialog linuxdo-compose-dialog" role="dialog"
        aria-modal="true" aria-busy={busy} aria-labelledby={titleId}
        aria-describedby={descriptionId} onSubmit={(event) => void submit(event)}>
        <header><div><h2 id={titleId}>{title}</h2>
          <span className="compose-provider"><ShieldCheck size={13} aria-hidden="true" />
            {providerLabel}</span></div>
          <button className="icon-button" type="button" disabled={busy} onClick={onCancel}
            aria-label={t('关闭')}><X size={18} aria-hidden="true" /></button></header>
        <div className="compose-dialog__body">
          <p className="sr-only" id={descriptionId}>{t('邮件将固定从 {username} 发出。', {
            username: sender,
          })}</p>
          <div className="compose-fields">
            <div className="compose-field"><span>{t('发件人')}</span>
              <div className="linuxdo-compose-sender">{senderOptions?.length ? (
                  <ComposeMailboxSelect mailboxes={senderOptions} value={senderValue || sender}
                    disabled={busy} icon={senderIcon} onChange={(value) => onSenderChange?.(value)} />
                ) : <><span>{senderIcon || <AtSign size={14} aria-hidden="true" />}</span>
                  <strong>{sender}</strong></>}</div>
            </div>
            <label className="compose-field" htmlFor={`${titleId}-to`}><span>{t('收件人')}</span>
              <input id={`${titleId}-to`} data-modal-autofocus required maxLength={254}
                type="email" autoComplete="off" spellCheck={false} disabled={busy} value={to}
                placeholder="name@example.com" onChange={(event) => setTo(event.target.value)} />
            </label>
            <label className="compose-field compose-field--subject" htmlFor={`${titleId}-subject`}>
              <span>{t('主题')}</span><input id={`${titleId}-subject`} required maxLength={500}
                autoComplete="off" disabled={busy} value={subject}
                placeholder={t('输入邮件主题…')}
                onChange={(event) => setSubject(event.target.value)} />
            </label>
          </div>
          <label className="compose-editor" htmlFor={`${titleId}-body`}><span className="sr-only">
            {t('正文')}</span><textarea id={`${titleId}-body`} required maxLength={50_000}
            aria-invalid={Boolean(error)} aria-describedby={`${noteId}${error ? ` ${errorId}` : ''}`}
            disabled={busy} value={body} placeholder={t('写下邮件内容…')}
            onChange={(event) => setBody(event.target.value)} /></label>
          {error && <p ref={errorRef} id={errorId} className="inline-error" role="alert" tabIndex={-1}>
            <AlertCircle size={15} aria-hidden="true" />{error}</p>}
        </div>
        <footer><button className="button button--primary" disabled={
          busy || !to.trim() || !subject.trim() || !body.trim()
        }>{busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" />
            : <Send size={16} aria-hidden="true" />}{t(busy ? '正在加入发送队列…' : '发送邮件')}
          </button><span id={noteId} className="compose-delivery-note">
            <ShieldCheck size={13} aria-hidden="true" />{deliveryNote}</span>
          <button className="compose-discard" type="button" disabled={busy} onClick={onCancel}
            aria-label={t('丢弃邮件')} data-tooltip={t('丢弃邮件')}>
            <Trash2 size={17} aria-hidden="true" /></button></footer>
      </form>
    </div>,
    document.body,
  )
}
