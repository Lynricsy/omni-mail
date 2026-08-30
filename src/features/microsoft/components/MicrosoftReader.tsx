import { AlertCircle, ArrowLeft, ArrowUp, LoaderCircle, Mail, Paperclip, RefreshCw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { api, type MicrosoftMessageDetail, type MicrosoftMessageSummary } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { ICloudMessageBody } from '../../../shared/ui/mail-workspace/ICloudMessageBody'
import { MessageReaderToolbarTitle } from '../../../shared/ui/mail-workspace/MessageReaderToolbarTitle'
import { useMessageReaderScroll } from '../../../shared/ui/mail-workspace/hooks/useMessageReaderScroll'

function senderLabel(message: Pick<MicrosoftMessageSummary, 'senderName' | 'senderAddress'>) {
  return message.senderName || message.senderAddress || t('未知发件人')
}

export function MicrosoftReader({ selected, message, loading, error, remoteImagesEnabled,
  onBack, onRetry }: {
  selected: MicrosoftMessageSummary | null
  message: MicrosoftMessageDetail | null
  loading: boolean
  error: string
  remoteImagesEnabled: boolean
  onBack: () => void
  onRetry: () => void
}) {
  const errorRef = useRef<HTMLDivElement>(null)
  const readerRoot = useRef<HTMLDivElement>(null)
  const readerScroll = useMessageReaderScroll(loading ? '' : message?.id || '', readerRoot)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  if (loading) return <div className="reader-state reader-state--loading" role="status">
    <LoaderCircle className="spin" size={23} aria-hidden="true" />
    {t('正在按需读取 Microsoft 邮件正文…')}
  </div>
  if (error && selected) return <div ref={errorRef}
    className="reader-state gmail-reader-error" role="alert" tabIndex={-1}>
    <span className="reader-empty-symbol"><AlertCircle size={27} /></span>
    <h2>{t('无法显示这封 Microsoft 邮件')}</h2>
    <p>{error}</p>
    <button className="button button--secondary button--small" type="button" onClick={onRetry}>
      <RefreshCw size={15} />{t('重试读取')}
    </button>
  </div>
  if (!message) return <div className="reader-state reader-state--empty">
    <span className="reader-empty-symbol"><Mail size={29} /></span>
    <h2>{t('选择一封 Microsoft 邮件')}</h2>
  </div>

  const subject = message.subject || t('无主题')
  return <article className="icloud-reader gmail-reader microsoft-reader">
    <header className="reader-toolbar">
      <button className="icon-button mobile-back" type="button" onClick={onBack}
        aria-label={t('返回邮件列表')}><ArrowLeft size={18} /></button>
      <MessageReaderToolbarTitle key={message.id} detailsLabel={t('Microsoft 邮件')}
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
        <div className="icloud-reader-body"><ICloudMessageBody message={message}
          remoteImagesEnabled={remoteImagesEnabled} /></div>
        {message.attachments.length > 0 && <section className="gmail-attachments">
          <h2><Paperclip size={16} />{t('附件')}</h2>
          <div>{message.attachments.map((attachment) => <a key={attachment.partId}
            href={api.microsoftAttachmentUrl(message.account.id, message.id, attachment.partId)} download>
            <span><strong>{attachment.filename}</strong>
              <small>{attachment.contentType} · {Math.ceil(attachment.size / 1024)} KiB</small></span>
          </a>)}</div>
        </section>}
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
