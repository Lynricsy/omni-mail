import { ArrowDownLeft, ArrowUpRight, MessagesSquare } from 'lucide-react'
import type { MessageSummary } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { formatMessageDate, senderLabel } from '../../../shared/mail/formatting'

export function MessageThread({
  currentId,
  messages,
  onSelect,
}: {
  currentId: string
  messages: MessageSummary[]
  onSelect: (message: MessageSummary) => void
}) {
  if (messages.length < 2) return null
  return <section className="message-thread" aria-label={t('邮件会话')}>
    <header><MessagesSquare size={15} /><strong>{t('会话中 {count} 封邮件', {
      count: messages.length,
    })}</strong></header>
    <div>
      {messages.map((message) => {
        const current = message.id === currentId
        const DirectionIcon = message.direction === 'outgoing' ? ArrowUpRight : ArrowDownLeft
        return <button key={message.id} type="button" className={current ? 'is-current' : ''}
          aria-current={current ? 'true' : undefined} onClick={() => onSelect(message)}>
          <DirectionIcon size={14} />
          <span><strong>{senderLabel(message)}</strong><small>{message.preview || message.subject}</small></span>
          <time dateTime={new Date(message.date).toISOString()}>{formatMessageDate(message.date)}</time>
        </button>
      })}
    </div>
  </section>
}
