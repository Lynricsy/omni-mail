import { Inbox, LoaderCircle, RefreshCw } from 'lucide-react'
import type { MessageSummary } from '../../src/shared/api/api-types'
import { getLocale, t, useLocale } from '../../src/shared/i18n'

interface Props {
  loading: boolean
  messages: MessageSummary[]
  onRefresh: () => void
  onSelect: (message: MessageSummary) => void
  refreshInterval: number
  refreshing: boolean
}

function messageDate(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  return new Intl.DateTimeFormat(getLocale(), date.toDateString() === today.toDateString()
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { month: 'short', day: 'numeric' }).format(date)
}

export function PanelRecentMail({
  loading,
  messages,
  onRefresh,
  onSelect,
  refreshInterval,
  refreshing,
}: Props) {
  useLocale()
  const recentMessages = messages.slice(0, 3)
  const refreshText = refreshInterval > 0
    ? t('每 {count} 秒自动刷新', { count: refreshInterval })
    : t('自动刷新已关闭')

  return (
    <section className="page-card recent-mail-card" aria-labelledby="recent-mail-title">
      <header className="recent-mail-header">
        <div>
          <span id="recent-mail-title">{t('当前邮箱邮件')}</span>
          <small>{refreshText}</small>
        </div>
        <button
          className="recent-refresh-button"
          type="button"
          title={t('立即刷新')}
          aria-label={t('立即刷新当前邮箱')}
          disabled={refreshing}
          onClick={onRefresh}
        >
          <RefreshCw className={refreshing ? 'spin' : ''} size={15} />
        </button>
      </header>

      {loading && !recentMessages.length ? (
        <div className="recent-mail-empty"><LoaderCircle className="spin" size={17} />{t('正在读取邮件…')}</div>
      ) : recentMessages.length ? (
        <div className="recent-mail-list">
          {recentMessages.map((message) => (
            <button
              className={message.isRead ? '' : 'is-unread'}
              type="button"
              key={message.id}
              onClick={() => onSelect(message)}
            >
              <span className="recent-mail-dot" />
              <span className="recent-mail-copy">
                <span><strong>{message.subject || t('（无主题）')}</strong><time>{messageDate(message.date)}</time></span>
                <small>{message.senderName || message.senderAddress || t('未知发件人')}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="recent-mail-empty">
          <Inbox size={18} />
          <span>{t('还没有邮件，收到后会自动显示在这里。')}</span>
        </div>
      )}
    </section>
  )
}
