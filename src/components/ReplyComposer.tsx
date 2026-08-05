import { AlertCircle, LoaderCircle, Send, X } from 'lucide-react'
import { type FormEvent, useMemo, useState } from 'react'
import { api, type MessageDetail } from '../lib/api'
import { t } from '../lib/i18n'

function errorMessage(error: unknown): string {
  return t(error instanceof Error ? error.message : '发生了未知错误。')
}

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
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const idempotencyKey = useMemo(
    () => crypto.randomUUID().replaceAll('-', ''),
    [],
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!text.trim()) return
    setSending(true)
    setError('')
    try {
      await api.reply(message.id, text, idempotencyKey)
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
        <button className="icon-button icon-button--small" type="button" onClick={onClose} aria-label={t('关闭回复')}>
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
      />
      {error && <p className="inline-error" role="alert"><AlertCircle size={15} />{error}</p>}
      <div className="reply-composer__footer">
        <span>{t('通过已配置的发信服务发送')}</span>
        <button className="button button--primary button--small" type="submit" disabled={sending || !text.trim()}>
          {sending ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}
          {t('发送回复')}
        </button>
      </div>
    </form>
  )
}
