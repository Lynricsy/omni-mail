import { Download, Eye, Paperclip, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type Attachment } from '../../../shared/api'
import { attachmentPreviewKind, type AttachmentPreviewKind } from '../../../shared/mail/attachmentPreview'
import { t } from '../../../shared/i18n'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentPreviewDialog({
  messageId,
  attachment,
  kind,
  attachmentUrl,
  attachmentPreviewUrl,
  onClose,
}: {
  messageId: string
  attachment: Attachment
  kind: AttachmentPreviewKind
  attachmentUrl: (messageId: string, attachmentId: string) => string
  attachmentPreviewUrl: (messageId: string, attachmentId: string) => string
  onClose: () => void
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const [imageFailed, setImageFailed] = useState(false)
  const previewUrl = attachmentPreviewUrl(messageId, attachment.id)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
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
      cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [onClose])

  return createPortal(
    <div className="attachment-preview-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section
        ref={dialogRef}
        className="attachment-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <span className="attachment-preview-dialog__symbol"><Paperclip size={20} /></span>
          <div>
            <p className="eyebrow">{t('附件预览')}</p>
            <h2 id={titleId} title={attachment.filename}>{attachment.filename}</h2>
            <small>{formatSize(attachment.size)}</small>
          </div>
          <button
            className="icon-button"
            type="button"
            data-autofocus
            aria-label={t('关闭')}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className={`attachment-preview-dialog__body attachment-preview-dialog__body--${kind}`}>
          {kind === 'image' && !imageFailed && (
            <img
              src={previewUrl}
              alt={attachment.filename}
              onError={() => setImageFailed(true)}
            />
          )}
          {kind === 'image' && imageFailed && (
            <p className="attachment-preview-dialog__error" role="alert">
              {t('无法加载附件预览。')}
            </p>
          )}
          {kind === 'pdf' && (
            <iframe src={previewUrl} title={t('附件预览：{name}', { name: attachment.filename })} />
          )}
        </div>

        <footer>
          <a
            className="button button--secondary"
            href={attachmentUrl(messageId, attachment.id)}
            download
          >
            <Download size={16} />{t('下载附件')}
          </a>
          <button className="button button--primary" type="button" onClick={onClose}>
            {t('关闭')}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

export function MessageAttachments({
  messageId,
  attachments,
  attachmentUrl = api.attachmentUrl,
  attachmentPreviewUrl = api.attachmentPreviewUrl,
}: {
  messageId: string
  attachments: Attachment[]
  attachmentUrl?: (messageId: string, attachmentId: string) => string
  attachmentPreviewUrl?: (messageId: string, attachmentId: string) => string
}) {
  const [preview, setPreview] = useState<{
    attachment: Attachment
    kind: AttachmentPreviewKind
  } | null>(null)
  const closePreview = useCallback(() => setPreview(null), [])

  return (
    <>
      <section className="attachments" aria-labelledby="attachments-title">
        <h2 id="attachments-title"><Paperclip size={16} />{t('附件')}</h2>
        <div className="attachment-grid">
          {attachments.map((attachment) => {
            const kind = attachmentPreviewKind(attachment.contentType)
            const contents = (
              <>
                <span><Paperclip size={17} /></span>
                <div>
                  <strong>{attachment.filename}</strong>
                  <small>{formatSize(attachment.size)}</small>
                </div>
                {kind ? <Eye size={16} /> : <Download size={16} />}
              </>
            )
            return kind ? (
              <button
                className="attachment-card"
                key={attachment.id}
                type="button"
                aria-label={t('预览附件：{name}', { name: attachment.filename })}
                onClick={() => setPreview({ attachment, kind })}
              >
                {contents}
              </button>
            ) : (
              <a
                className="attachment-card"
                key={attachment.id}
                href={attachmentUrl(messageId, attachment.id)}
                download
              >
                {contents}
              </a>
            )
          })}
        </div>
      </section>
      {preview && (
        <AttachmentPreviewDialog
          messageId={messageId}
          attachment={preview.attachment}
          kind={preview.kind}
          attachmentUrl={attachmentUrl}
          attachmentPreviewUrl={attachmentPreviewUrl}
          onClose={closePreview}
        />
      )}
    </>
  )
}
