import { ArrowLeft, ArrowUp, KeyRound, LoaderCircle, Mail } from 'lucide-react'
import { useRef } from 'react'
import { useMessageReaderScroll } from '../../../shared/ui/mail-workspace/hooks/useMessageReaderScroll'
import type { ICloudMessage } from '../../../shared/api'
import { parseICloudSender } from '../../../shared/mail/sender'
import { t } from '../../../shared/i18n'
import { ICloudMessageBody } from '../../../shared/ui/mail-workspace/ICloudMessageBody'
import { MessageReaderToolbarTitle } from '../../../shared/ui/mail-workspace/MessageReaderToolbarTitle'

export function ICloudReader({ message, loading, method, remoteImagesEnabled, onBack }: {
  message: ICloudMessage | null
  loading: boolean
  method: 'imap' | 'web' | ''
  remoteImagesEnabled: boolean
  onBack: () => void
}) {
  const readerRoot = useRef<HTMLDivElement>(null)
  const readerScroll = useMessageReaderScroll(loading ? '' : message?.id || '', readerRoot)
  if (loading) {
    return <div className="reader-state reader-state--loading" role="status"><LoaderCircle className="spin" size={23} aria-hidden="true" />{t('正在从APPLE服务器获取邮件信息...')}</div>
  }
  if (!message) {
    return <div className="reader-state reader-state--empty"><span className="reader-empty-symbol"><Mail size={29} /></span><h2>{t('选择一封 iCloud 邮件')}</h2></div>
  }
  const sender = parseICloudSender(message.from)
  const senderLabel = sender.name || sender.address || t('未知发件人')
  const subject = message.subject || t('无主题')
  return (
    <article className="icloud-reader">
      <header className="reader-toolbar">
        <button className="icon-button mobile-back" type="button" onClick={onBack} aria-label={t('返回邮件列表')}><ArrowLeft size={18} /></button>
        <MessageReaderToolbarTitle key={message.id} detailsLabel={t('iCloud 邮件')}
          scrollTopLabel={t('回到顶部')} subject={subject}
          subjectPinned={readerScroll.subjectPinned} onScrollTop={readerScroll.scrollToTop} />
        {method && <span className={`icloud-source-badge is-${method}`}>{t(method === 'imap' ? 'IMAP 完整邮件' : 'Web 摘要')}</span>}
      </header>
      <div ref={readerRoot} className="reader-content icloud-reader-content">
        <div className="icloud-reader-inner">
          <div className="icloud-reader-heading">
            <h1 ref={readerScroll.subjectHeading}>{subject}</h1>
            <div className="icloud-reader-sender">
              <span>{senderLabel.slice(0, 1).toUpperCase()}</span>
              <p><strong>{senderLabel}</strong>{sender.name && sender.address && <small title={sender.address}>{sender.isHideMyEmailRelay ? t('通过 iCloud 隐藏邮箱转发') : `<${sender.address}>`}</small>}{message.to && <small>{t('收件：{address}', { address: message.to })}</small>}</p>
              {message.date && <time>{new Date(message.date).toLocaleString()}</time>}
            </div>
          </div>
          {method === 'web' && <div className="icloud-reader-web-note"><KeyRound size={15} /><span><strong>{t('当前显示 iCloud Web 摘要')}</strong>{t('配置当前账号的应用专用密码后，可读取 IMAP 完整正文。')}</span></div>}
          <div className="icloud-reader-body"><ICloudMessageBody message={message} remoteImagesEnabled={remoteImagesEnabled} /></div>
        </div>
      </div>
      <button className={`reader-scroll-top${readerScroll.subjectPinned ? ' is-visible' : ''}`}
        type="button" onClick={readerScroll.scrollToTop} aria-label={t('回到顶部')}
        aria-hidden={!readerScroll.subjectPinned} data-tooltip={t('回到顶部')}
        tabIndex={readerScroll.subjectPinned ? 0 : -1}>
        <ArrowUp size={19} aria-hidden="true" />
      </button>
    </article>
  )
}
