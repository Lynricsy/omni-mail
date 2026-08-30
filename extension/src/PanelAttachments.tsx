import { Download, Eye, LoaderCircle, Paperclip, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t, useLocale } from '../../src/shared/i18n'
import type { AttachmentPayload } from './protocol'

export interface PanelAttachment {
  id: string
  filename: string
  contentType: string
  size: number
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function payloadBlob(payload: AttachmentPayload): Blob {
  const bytes = bytesFromBase64(payload.contentBase64)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: payload.contentType })
}

function attachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

function canPreview(contentType: string): boolean {
  return ['image/gif', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']
    .includes(contentType.toLowerCase())
}

export function PanelAttachments({ attachments, request }: {
  attachments: PanelAttachment[]
  request: (attachment: PanelAttachment) => Promise<AttachmentPayload>
}) {
  useLocale()
  const objectUrl = useRef('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{
    id: string
    filename: string
    contentType: string
    url?: string
    text?: string
  } | null>(null)

  function clearPreview() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = ''
    setPreview(null)
  }

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
  }, [])

  async function download(attachment: PanelAttachment) {
    setBusy(`download:${attachment.id}`)
    setError('')
    try {
      const payload = await request(attachment)
      const url = URL.createObjectURL(payloadBlob(payload))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = payload.filename
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : t('附件下载失败。'))
    } finally {
      setBusy('')
    }
  }

  async function showPreview(attachment: PanelAttachment) {
    setBusy(`preview:${attachment.id}`)
    setError('')
    try {
      const payload = await request(attachment)
      clearPreview()
      if (payload.contentType.toLowerCase() === 'text/plain') {
        const bytes = bytesFromBase64(payload.contentBase64)
        if (bytes.byteLength > 256 * 1024) throw new Error(t('文本附件过大，请下载后查看。'))
        setPreview({
          id: attachment.id,
          filename: payload.filename,
          contentType: payload.contentType,
          text: new TextDecoder().decode(bytes),
        })
      } else if (canPreview(payload.contentType)) {
        objectUrl.current = URL.createObjectURL(payloadBlob(payload))
        setPreview({
          id: attachment.id,
          filename: payload.filename,
          contentType: payload.contentType,
          url: objectUrl.current,
        })
      } else {
        throw new Error(t('此附件类型不支持安全预览，请下载后查看。'))
      }
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : t('附件预览失败。'))
    } finally {
      setBusy('')
    }
  }

  if (!attachments.length) return null
  return (
    <section className="panel-attachments" aria-labelledby="panel-attachments-title">
      <div className="panel-attachments-heading">
        <strong id="panel-attachments-title"><Paperclip size={14} aria-hidden="true" />
          {t('附件（{count}）', { count: attachments.length })}</strong>
      </div>
      <div className="panel-attachment-list">
        {attachments.map((attachment) => (
          <article key={attachment.id}>
            <span><strong title={attachment.filename}>{attachment.filename}</strong>
              <small>{attachmentSize(attachment.size)}</small></span>
            <div>
              {canPreview(attachment.contentType) && <button type="button"
                disabled={Boolean(busy)} onClick={() => void showPreview(attachment)}>
                {busy === `preview:${attachment.id}`
                  ? <LoaderCircle className="spin" size={13} aria-hidden="true" />
                  : <Eye size={13} aria-hidden="true" />}{t('预览')}</button>}
              <button type="button" disabled={Boolean(busy)}
                onClick={() => void download(attachment)}>
                {busy === `download:${attachment.id}`
                  ? <LoaderCircle className="spin" size={13} aria-hidden="true" />
                  : <Download size={13} aria-hidden="true" />}{t('下载')}</button>
            </div>
          </article>
        ))}
      </div>
      {error && <div className="panel-attachment-error" role="alert">{error}</div>}
      {preview && <div className="panel-attachment-preview">
        <header><strong>{preview.filename}</strong><button type="button"
          aria-label={t('关闭附件预览')} onClick={clearPreview}><X size={14} /></button></header>
        {preview.url
          ? <img src={preview.url} alt={preview.filename} />
          : <pre tabIndex={0}>{preview.text}</pre>}
      </div>}
    </section>
  )
}
