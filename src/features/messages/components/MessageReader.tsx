import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  Clock3,
  CheckCircle2,
  Download,
  LoaderCircle,
  Mail,
  Reply,
  RotateCcw,
  Star,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type MessageDetail, type MessageSummary, type MessageTranslation as Translation } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { failedMailApi } from '../api/failedMailApi'
import { getLocale, t } from '../../../shared/i18n'
import {
  EMAIL_FRAME_SANDBOX,
  emailDocumentHeight,
  emailFrameReady,
  useSmoothEmailFrame,
} from '../../../shared/ui/mail-workspace/hooks/useSmoothEmailFrame'
import { useTransientScrollbar } from '../../../shared/ui/scroll/useTransientScrollbar'
import { useMessageReaderScroll } from '../../../shared/ui/mail-workspace/hooks/useMessageReaderScroll'
import { ExternalLinkDialog } from '../../../shared/ui/dialogs/ExternalLinkDialog'
import { MessageAttachments } from './MessageAttachments'
import { MessageReaderToolbarTitle } from '../../../shared/ui/mail-workspace/MessageReaderToolbarTitle'
import { MessageThread } from './MessageThread'
import { MessageTranslation } from './MessageTranslation'
import { ReplyComposer } from './ReplyComposer'
import {
  buildEmailDocument,
  emailLinkHref,
  normalizeContentId,
} from './messageReaderDocument'
export {
  emailImageSources,
  emailLinkHref,
  normalizeContentId,
  safeEmailHref,
  shouldProxyRemoteImage,
} from './messageReaderDocument'

function formatFullDate(timestamp: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

export { EMAIL_FRAME_SANDBOX, emailDocumentHeight, emailFrameReady }

export function MessageReader({
  message,
  loading,
  replyEnabled,
  translationEnabled,
  remoteImagesEnabled,
  thread,
  onBack,
  onStar,
  onTrash,
  onRestore,
  onReplySent,
  canRetryFailedMessage,
  onRetryFailedMessage,
  onSelectThread,
  managementMode = false,
  attachmentUrl = api.attachmentUrl,
  attachmentPreviewUrl = api.attachmentPreviewUrl,
  rawUrl = api.rawUrl,
  emptyLabel = '选择一封邮件',
}: {
  message: MessageDetail | null
  loading: boolean
  replyEnabled: boolean
  translationEnabled: boolean
  remoteImagesEnabled: boolean
  thread: MessageSummary[]
  onBack: () => void
  onStar: () => void
  onTrash: () => void
  onRestore: () => void
  onReplySent: () => void
  canRetryFailedMessage: boolean
  onRetryFailedMessage: () => void
  onSelectThread: (message: MessageSummary) => void
  managementMode?: boolean
  attachmentUrl?: (messageId: string, attachmentId: string) => string
  attachmentPreviewUrl?: (messageId: string, attachmentId: string) => string
  rawUrl?: (messageId: string) => string
  emptyLabel?: string
}) {
  const [replying, setReplying] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState('')
  const [inlineImageSources, setInlineImageSources] = useState<ReadonlyMap<string, string>>(new Map())
  const [externalLink, setExternalLink] = useState<string | null>(null)
  const [displayedTranslation, setDisplayedTranslation] = useState<{
    messageId: string; value: Translation
  } | null>(null)
  const readerScrollbar = useTransientScrollbar(message?.id ?? '')
  const readerScroll = useMessageReaderScroll(loading ? '' : message?.id ?? '', readerScrollbar.root)
  const displayTranslation = useCallback((messageId: string, value: Translation | null) => {
    setDisplayedTranslation(value ? { messageId, value } : null)
  }, [])
  const closeExternalLink = useCallback(() => setExternalLink(null), [])
  const handleEmailLinkClick = useCallback((event: Event) => {
    const href = emailLinkHref(event.target)
    if (!href) return
    event.preventDefault()
    setExternalLink(href)
  }, [])
  const handleEmailLinkKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Enter') return
    const href = emailLinkHref(event.target)
    if (!href) return
    event.preventDefault()
    setExternalLink(href)
  }, [])

  useEffect(() => {
    setReplying(false)
    setRetrying(false)
    setRetryError('')
    setExternalLink(null)
    setDisplayedTranslation(null)
  }, [message?.id])
  useEffect(() => {
    const controller = new AbortController()
    const objectUrls: string[] = []
    const inlineAttachments = message?.attachments.filter((attachment) => (
      attachment.contentId && attachment.contentType.startsWith('image/')
    )) ?? []
    setInlineImageSources(new Map())

    if (!message || inlineAttachments.length === 0) return () => controller.abort()
    void Promise.all(inlineAttachments.map(async (attachment) => {
      try {
        const response = await fetch(attachmentUrl(message.id, attachment.id), {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) return null
        const blob = await response.blob()
        if (controller.signal.aborted) return null
        const objectUrl = URL.createObjectURL(blob)
        objectUrls.push(objectUrl)
        return [
          normalizeContentId(attachment.contentId ?? ''),
          objectUrl,
        ] as const
      } catch {
        return null
      }
    })).then((entries) => {
      if (controller.signal.aborted) return
      setInlineImageSources(new Map(entries.filter((entry): entry is readonly [string, string] => entry !== null)))
    })
    return () => {
      controller.abort()
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [attachmentUrl, message])

  const activeTranslation = displayedTranslation && displayedTranslation.messageId === message?.id
    ? displayedTranslation.value : null
  const displayedHtml = activeTranslation?.html || message?.html || ''
  const displayedText = activeTranslation?.text || message?.text || ''
  const displayedSubject = activeTranslation?.subject || message?.subject || ''
  const readerSubject = displayedSubject || t('无主题')
  const initialEmailDocument = useMemo(
    () => message?.html
      ? buildEmailDocument(message.html, remoteImagesEnabled, inlineImageSources)
      : '',
    [inlineImageSources, message?.html, remoteImagesEnabled],
  )
  const emailDocument = useMemo(
    () => displayedHtml === message?.html
      ? initialEmailDocument
      : displayedHtml
      ? buildEmailDocument(displayedHtml, remoteImagesEnabled, inlineImageSources)
      : '',
    [displayedHtml, initialEmailDocument, inlineImageSources, message?.html, remoteImagesEnabled],
  )
  const emailFrame = useSmoothEmailFrame({
    messageId: message?.id ?? '',
    initialDocument: initialEmailDocument,
    displayedDocument: emailDocument,
    onLinkClick: handleEmailLinkClick,
    onLinkKeyDown: handleEmailLinkKeyDown,
    onScrollActivity: readerScrollbar.onWheel,
  })

  const retryFailedMessage = useCallback(async () => {
    if (retrying) return
    setRetryError('')
    setRetrying(true)
    try {
      if (!message) return
      await failedMailApi.retry(message.id)
      onRetryFailedMessage()
    } catch (error) {
      setRetryError(errorMessage(error))
    } finally {
      setRetrying(false)
    }
  }, [message, onRetryFailedMessage, retrying])

  if (loading) {
    return (
      <div className="reader-state reader-state--loading" role="status" aria-live="polite">
        <span className="reader-loading-visual" aria-hidden="true">
          <span className="reader-loading-mail"><Mail size={23} /></span>
        </span>
        <span className="reader-loading-copy">
          <strong>{t('正在打开邮件')}</strong>
          <small>{t('安全读取邮件内容')}</small>
        </span>
      </div>
    )
  }
  if (!message) {
    return (
      <div className="reader-state reader-state--empty">
        <span className="reader-empty-symbol"><Mail size={29} /></span>
        <h2>{t(emptyLabel)}</h2>
      </div>
    )
  }

  const frameIsReady = emailFrameReady(
    message.id,
    message.html,
    initialEmailDocument,
    emailFrame.preparedFrame,
  )

  return (
    <article
      className={`message-reader${frameIsReady ? '' : ' message-reader--preparing'}`}
      aria-busy={!frameIsReady}
    >
      <header className="reader-toolbar">
        <button className="icon-button mobile-back" type="button" onClick={onBack} aria-label={t('返回邮件列表')}>
          <ArrowLeft size={18} />
        </button>
        <MessageReaderToolbarTitle
          key={message.id}
          detailsLabel={t(managementMode ? '管理邮件' : '邮件详情')}
          scrollTopLabel={t('回到顶部')}
          subject={readerSubject}
          subjectPinned={readerScroll.subjectPinned}
          onScrollTop={readerScroll.scrollToTop}
        />
        <div className="reader-toolbar__spacer" />
        {message.folder === 'trash' && (
          <button className="toolbar-button" type="button" onClick={onRestore}>
            <Undo2 size={16} /> {t('恢复')}
          </button>
        )}
        {!managementMode && (
          <button className="icon-button" type="button" onClick={onStar} aria-label={t(message.isStarred ? '取消星标' : '添加星标')}>
            <Star size={17} fill={message.isStarred ? 'currentColor' : 'none'} />
          </button>
        )}
        <button className="icon-button icon-button--danger" type="button" onClick={onTrash} aria-label={t(message.folder === 'trash' ? '永久删除' : '移入垃圾箱')}>
          <Trash2 size={17} />
        </button>
      </header>

      <div
        ref={readerScrollbar.root}
        className={`reader-content${readerScrollbar.active ? ' is-scrollbar-active' : ''}`}
        onWheel={readerScrollbar.onWheel}
        onTouchMove={readerScrollbar.onTouchMove}
        onKeyDown={readerScrollbar.onKeyDown}
        onPointerDown={readerScrollbar.onPointerDown}
        onScroll={readerScrollbar.onScroll}
      >
        <header className="message-heading">
          <h1 ref={readerScroll.subjectHeading}>{readerSubject}</h1>
          <div className="sender-block">
            <span className="sender-avatar">
              {(message.senderName || message.senderAddress || 'M').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{message.senderName || message.senderAddress}</strong>
              {message.senderName && <span>&lt;{message.senderAddress}&gt;</span>}
              <small>
                {message.direction === 'outgoing'
                  ? t('发给 {recipients}', { recipients: message.recipients.join(', ') })
                  : t('发送至 {address}', { address: message.mailboxAddress })}
              </small>
            </div>
            <time dateTime={new Date(message.date).toISOString()}>{formatFullDate(message.date)}</time>
          </div>
        </header>
        {!managementMode && (
          <MessageThread currentId={message.id} messages={thread} onSelect={onSelectThread} />
        )}

        {message.folder === 'trash' && message.purgeAfter && (
          <p className="trash-retention-notice">
            <Clock3 size={15} />
            {t('该邮件将在 {date} 自动永久删除。', {
              date: formatFullDate(message.purgeAfter),
            })}
          </p>
        )}

        {message.status === 'processing' && (
          <div className="message-notice"><LoaderCircle className="spin" size={17} />
            {t(message.direction === 'outgoing'
              ? '邮件已进入发送队列，系统正在可靠投递。'
              : '邮件正在安全解析，请稍后刷新。')}
          </div>
        )}
        {message.status === 'failed' && (
          <div className="message-notice message-notice--error">
            <AlertCircle size={17} />
            <span className="message-notice__copy">{t(
              message.direction === 'outgoing' ? '发送失败：{error}' : '解析失败：{error}',
              { error: retryError || message.processingError || t('未知错误') },
            )}</span>
            {message.direction === 'outgoing' && canRetryFailedMessage
              && !message.processingError?.startsWith('投递结果不确定') && (
              <button
                className="message-notice__action"
                type="button"
                onClick={() => void retryFailedMessage()}
                disabled={retrying}
              >
                {retrying ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />}
                {t(retrying ? '正在重新发送…' : '重新发送')}
              </button>
            )}
          </div>
        )}
        {message.direction === 'outgoing' && message.deliveryStatus === 'delivered' && (
          <div className="message-notice message-notice--success">
            <CheckCircle2 size={17} />{t('收件服务器已确认送达。')}
          </div>
        )}
        {message.direction === 'outgoing' && message.deliveryStatus === 'delayed' && (
          <div className="message-notice">
            <Clock3 size={17} />{t('收件服务器暂时延迟接收，发信服务会继续尝试投递。')}
          </div>
        )}
        {message.direction === 'outgoing'
          && ['bounced', 'complained', 'failed', 'suppressed'].includes(message.deliveryStatus || '') && (
          <div className="message-notice message-notice--error">
            <AlertCircle size={17} />{t('邮件未能送达，详情请查看对应发信服务控制台。')}
          </div>
        )}

        <MessageTranslation
          key={message.id}
          messageId={message.id}
          enabled={!managementMode && translationEnabled && Boolean(message.text.trim())
            && ['ready', 'sent'].includes(message.status)}
          onDisplayChange={displayTranslation}
        >
          {displayedHtml ? (
            <div
              className="email-frame-stack"
              style={{ height: `${emailFrame.activeHeight}px` }}
            >
              {emailFrame.documents.map((document, index) => {
                if (!document) return null
                const isActive = emailFrame.activeIndex === index
                const isRetiring = emailFrame.retiringIndex === index && !isActive
                return (
                  <iframe
                    key={index}
                    ref={emailFrame.frameRefs[index]}
                    className={`email-frame email-frame--buffer${isActive ? ' is-active' : ''}${isRetiring ? ' is-retiring' : ''}`}
                    data-frame-slot={index}
                    sandbox={EMAIL_FRAME_SANDBOX}
                    scrolling="no"
                    srcDoc={document}
                    title={t('邮件正文：{subject}', { subject: displayedSubject })}
                    aria-hidden={!isActive}
                    tabIndex={isActive ? 0 : -1}
                    onLoad={(event) => emailFrame.onLoad(index as 0 | 1, document, event)}
                  />
                )
              })}
            </div>
          ) : (
            <div className="plain-body">{displayedText || t('这封邮件没有可显示的正文。')}</div>
          )}
        </MessageTranslation>

        {message.attachments.length > 0 && (
          <MessageAttachments
            messageId={message.id}
            attachments={message.attachments}
            attachmentUrl={attachmentUrl}
            attachmentPreviewUrl={attachmentPreviewUrl}
          />
        )}

        <div className="message-footer-actions">
          {message.direction === 'incoming' && (
            <a className="quiet-link" href={rawUrl(message.id)} download>
              <Download size={14} /> {t('下载原始邮件')}
            </a>
          )}
          {message.direction === 'incoming' && replyEnabled && message.status === 'ready' && !replying && (
            <button className="button button--secondary" type="button" onClick={() => setReplying(true)}>
              <Reply size={16} /> {t('回复')}
            </button>
          )}
        </div>
      </div>

      <button
        className={`reader-scroll-top${readerScroll.subjectPinned ? ' is-visible' : ''}`}
        type="button"
        onClick={readerScroll.scrollToTop}
        aria-label={t('回到顶部')}
        aria-hidden={!readerScroll.subjectPinned}
        data-tooltip={t('回到顶部')}
        tabIndex={readerScroll.subjectPinned ? 0 : -1}
      >
        <ArrowUp size={19} aria-hidden="true" />
      </button>

      {replying && (
        <ReplyComposer
          message={message}
          onClose={() => setReplying(false)}
          onSent={() => {
            setReplying(false)
            onReplySent()
          }}
        />
      )}
      {externalLink && (
        <ExternalLinkDialog
          href={externalLink}
          onClose={closeExternalLink}
          onContinue={() => {
            window.open(externalLink, '_blank', 'noopener,noreferrer')
            setExternalLink(null)
          }}
        />
      )}
      {!frameIsReady && (
        <div className="reader-state reader-state--loading reader-frame-preparing" role="status" aria-live="polite">
          <span className="reader-loading-visual" aria-hidden="true">
            <span className="reader-loading-mail"><Mail size={23} /></span>
          </span>
          <span className="reader-loading-copy">
            <strong>{t('正在打开邮件')}</strong>
            <small>{t('正在准备邮件布局')}</small>
          </span>
        </div>
      )}
    </article>
  )
}
