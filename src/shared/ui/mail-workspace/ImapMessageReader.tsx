import { AlertCircle, ArrowLeft, ArrowUp, LoaderCircle, Mail, Paperclip, RefreshCw, Reply } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { t } from '../../i18n'
import { ICloudMessageBody } from './ICloudMessageBody'
import { MessageReaderToolbarTitle } from './MessageReaderToolbarTitle'
import { useMessageReaderScroll } from './hooks/useMessageReaderScroll'

type ImapMessageSummary = {
  id: string
  senderName: string
  senderAddress: string
}

type ImapMessageDetail = ImapMessageSummary & {
  account: { id: string }
  from: string
  subject: string
  to: string
  date: string
  body: string
  html: string
  preview: string
  isRead: boolean
  attachments: Array<{
    partId: string
    filename: string
    contentType: string
    size: number
  }>
}

function senderLabel(message: ImapMessageSummary): string {
  return message.senderName || message.senderAddress || t('未知发件人')
}

export function ImapMessageReader({
  provider,
  selected,
  message,
  loading,
  error,
  remoteImagesEnabled,
  attachmentUrl,
  onBack,
  onRetry,
  onReply,
  showEmptyStateDescription = true,
}: {
  provider: string
  selected: ImapMessageSummary | null
  message: ImapMessageDetail | null
  loading: boolean
  error: string
  remoteImagesEnabled: boolean
  attachmentUrl: (accountId: string, messageId: string, partId: string) => string
  onBack: () => void
  onRetry: () => void
  onReply?: () => void
  showEmptyStateDescription?: boolean
}) {
  const errorRef = useRef<HTMLDivElement>(null)
  const readerRoot = useRef<HTMLDivElement>(null)
  const readerScroll = useMessageReaderScroll(loading ? '' : message?.id || '', readerRoot)
  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  if (loading) {
    return <div className="reader-state reader-state--loading" role="status">
      <LoaderCircle className="spin" size={23} aria-hidden="true" />
      {t('正在获取 {provider} 正文…', { provider })}
    </div>
  }
  if (error && selected) {
    return <div ref={errorRef} className="reader-state gmail-reader-error" role="alert" tabIndex={-1}>
      <span className="reader-empty-symbol"><AlertCircle size={27} /></span>
      <h2>{t('无法显示这封 {provider} 邮件', { provider })}</h2>
      <p>{error}</p>
      <button className="button button--secondary button--small" type="button" onClick={onRetry}>
        <RefreshCw size={15} />{t('重试读取')}
      </button>
    </div>
  }
  if (!message) {
    return <div className="reader-state reader-state--empty">
      <span className="reader-empty-symbol"><Mail size={29} /></span>
      <h2>{t('选择一封 {provider} 邮件', { provider })}</h2>
      {showEmptyStateDescription
        && <p>{t('打开邮件后会尝试同步 {provider} 已读状态。', { provider })}</p>}
    </div>
  }

  const subject = message.subject || t('无主题')
  return <article className="icloud-reader gmail-reader">
    <header className="reader-toolbar">
      <button className="icon-button mobile-back" type="button" onClick={onBack}
        aria-label={t('返回邮件列表')}><ArrowLeft size={18} /></button>
      <MessageReaderToolbarTitle key={message.id} detailsLabel={t('{provider} 邮件', { provider })}
        scrollTopLabel={t('回到顶部')} subject={subject}
        subjectPinned={readerScroll.subjectPinned} onScrollTop={readerScroll.scrollToTop} />
      <span className="icloud-source-badge is-imap">IMAP</span>
    </header>
    <div ref={readerRoot} className="reader-content icloud-reader-content">
      <div className="icloud-reader-inner">
        <div className="icloud-reader-heading">
          <h1 ref={readerScroll.subjectHeading}>{subject}</h1>
          <div className="icloud-reader-sender">
            <span>{senderLabel(message).slice(0, 1).toUpperCase()}</span>
            <p><strong>{senderLabel(message)}</strong>
              {message.senderAddress && <small>&lt;{message.senderAddress}&gt;</small>}
              {message.to && <small>{t('收件：{address}', { address: message.to })}</small>}</p>
            {message.date && <time>{new Date(message.date).toLocaleString()}</time>}
          </div>
        </div>
        {!message.isRead && <p className="gmail-readonly-note"><AlertCircle size={14} />
          {t('邮件正文已打开，但未能同步 {provider} 已读状态；重新打开可重试。', { provider })}</p>}
        <div className="icloud-reader-body"><ICloudMessageBody message={message}
          remoteImagesEnabled={remoteImagesEnabled} /></div>
        {message.attachments.length > 0 && <section className="gmail-attachments">
          <h2><Paperclip size={16} />{t('附件')}</h2>
          <div>{message.attachments.map((attachment) => <a key={attachment.partId}
            href={attachmentUrl(message.account.id, message.id, attachment.partId)} download>
            <span><strong>{attachment.filename}</strong>
              <small>{attachment.contentType} · {Math.ceil(attachment.size / 1024)} KiB</small></span>
          </a>)}</div>
        </section>}
        {onReply && <div className="icloud-reader-actions">
          <button className="button button--secondary" type="button" onClick={onReply}>
            <Reply size={16} aria-hidden="true" />{t('回复')}
          </button>
        </div>}
      </div>
    </div>
    <button className={`reader-scroll-top${readerScroll.subjectPinned ? ' is-visible' : ''}`}
      type="button" onClick={readerScroll.scrollToTop} aria-label={t('回到顶部')}
      aria-hidden={!readerScroll.subjectPinned} data-tooltip={t('回到顶部')}
      tabIndex={readerScroll.subjectPinned ? 0 : -1}>
      <ArrowUp size={19} aria-hidden="true" />
    </button>
  </article>
}
