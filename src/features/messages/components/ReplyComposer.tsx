import {
  AlertCircle,
  FileImage,
  FileText,
  LoaderCircle,
  Paperclip,
  Send,
  X,
} from 'lucide-react'
import { type ChangeEvent, type FormEvent, useMemo, useRef, useState } from 'react'
import { api, type MessageDetail } from '../../../shared/api'
import {
  attachmentSelectionError,
  formatAttachmentSize,
  MAX_ATTACHMENTS,
} from '../../../shared/mail/attachmentPolicy'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'

export function ReplyComposer({
  message,
  onClose,
  onSent,
}: {
  message: MessageDetail
  onClose: () => void
  onSent: () => void
}) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const attachmentInput = useRef<HTMLInputElement>(null)
  const idempotencyKey = useMemo(
    () => crypto.randomUUID().replaceAll('-', ''),
    [],
  )
  const attachmentBytes = attachments.reduce((total, attachment) => total + attachment.size, 0)

  function addAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    const validationError = attachmentSelectionError(files, attachments)
    if (validationError) {
      setError(t(validationError))
      return
    }
    setError('')
    setAttachments((current) => [...current, ...files])
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!text.trim()) return
    setSending(true)
    setError('')
    try {
      await api.reply(message.id, text, idempotencyKey, attachments)
      onSent()
    } catch (sendError) {
      setError(errorMessage(sendError))
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="reply-composer" onSubmit={submit}>
      <div className="reply-composer__header">
        <div>
          <small>{t('回复给')}</small>
          <strong>{message.senderName || message.senderAddress}</strong>
        </div>
        <button className="icon-button icon-button--small" type="button" onClick={onClose}
          aria-label={t('关闭回复')} disabled={sending}>
          <X size={17} />
        </button>
      </div>
      <label className="sr-only" htmlFor="reply-body">{t('回复内容')}</label>
      <textarea
        id="reply-body"
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t('写下回复…')}
        maxLength={50_000}
        disabled={sending}
      />
      {attachments.length > 0 && (
        <section className="reply-attachments" aria-label={t('附件')}>
          <header aria-live="polite">
            <strong><Paperclip size={13} />{t('附件')}</strong>
            <span>{attachments.length}/{MAX_ATTACHMENTS} · {formatAttachmentSize(attachmentBytes)}</span>
          </header>
          <div>
            {attachments.map((attachment, index) => (
              <span className="reply-attachment" key={`${attachment.name}-${attachment.lastModified}-${index}`}>
                {attachment.type.startsWith('image/')
                  ? <FileImage size={15} />
                  : <FileText size={15} />}
                <span>
                  <strong title={attachment.name}>{attachment.name}</strong>
                  <small>{formatAttachmentSize(attachment.size)}</small>
                </span>
                <button type="button" disabled={sending}
                  onClick={() => setAttachments((current) => current.filter((_, item) => item !== index))}
                  aria-label={t('移除附件：{name}', { name: attachment.name })}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}
      {error && <p className="inline-error" role="alert"><AlertCircle size={15} />{error}</p>}
      <div className="reply-composer__footer">
        <div className="reply-composer__tools">
          <input ref={attachmentInput} className="sr-only" type="file" multiple tabIndex={-1}
            aria-label={t('选择附件')} onChange={addAttachments}
            disabled={sending || attachments.length >= MAX_ATTACHMENTS} />
          <button className="reply-attach" type="button"
            onClick={() => attachmentInput.current?.click()}
            disabled={sending || attachments.length >= MAX_ATTACHMENTS}>
            <Paperclip size={15} />{t('添加附件')}
          </button>
          <span>{t('通过已配置的发信服务发送')}</span>
        </div>
        <button className="button button--primary button--small" type="submit" disabled={sending || !text.trim()}>
          {sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}
          {t('发送回复')}
        </button>
      </div>
    </form>
  )
}
