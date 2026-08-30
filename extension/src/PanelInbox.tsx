import { ArrowLeft, Inbox, LoaderCircle, RefreshCw, Reply, SquarePen } from 'lucide-react'
import { useState } from 'react'
import { getLocale, t, useLocale } from '../../src/shared/i18n'
import type {
  ICloudAccount,
  ICloudAlias,
  MailboxAddress,
  MessageDetail,
  MessageSummary,
  PageInfo,
} from '../../src/shared/api/api-types'
import { safeEmailDocument } from './email-document'
import { PanelAttachments } from './PanelAttachments'
import { PanelCompose } from './PanelCompose'
import { PanelICloudInbox } from './PanelICloudInbox'
import { PanelIndexedInbox } from './PanelIndexedInbox'
import type {
  IndexedMailSourceId,
  MailSourceDescriptor,
  MailSourceId,
} from './mail-source'
import { PanelSelect } from './PanelSelect'
import { type AttachmentPayload, sendExtensionMessage } from './protocol'

interface Props {
  iCloudAccountId: string
  iCloudAccounts: ICloudAccount[]
  iCloudAliases: ICloudAlias[]
  iCloudAuthorized: boolean
  iCloudEnabled: boolean
  iCloudLoadingAccounts: boolean
  iCloudLoadingAliases: boolean
  iCloudPreferredAlias: string
  canSend: boolean
  loading: boolean
  loadingMore: boolean
  mailbox: string
  mailboxes: MailboxAddress[]
  messages: MessageSummary[]
  page: PageInfo
  refreshing: boolean
  selected: MessageDetail | null
  source: MailSourceId
  sources: MailSourceDescriptor[]
  unavailableSources: MailSourceId[]
  upgradeRequired: boolean
  onBack: () => void
  onICloudAccount: (accountId: string) => void
  onICloudOpenWeb: () => void
  onICloudReauthorize: () => void
  onMailbox: (address: string) => void
  onLoadMore: () => void
  onRefresh: () => void
  onSelect: (message: MessageSummary) => void
  onOpenSourceWeb: (source: MailSourceId) => void
  onUpgradeAuthorization: () => void
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  return new Intl.DateTimeFormat(getLocale(), date.toDateString() === today.toDateString()
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { month: 'short', day: 'numeric' }).format(date)
}

function senderName(message: MessageSummary): string {
  return message.senderName || message.senderAddress || '未知发件人'
}

function OmniInbox(props: Pick<Props,
  'loading' | 'mailbox' | 'mailboxes' | 'messages' | 'refreshing' | 'selected'
  | 'loadingMore' | 'page' | 'sources' | 'onBack' | 'onLoadMore' | 'onMailbox'
  | 'onRefresh' | 'onSelect' | 'canSend'
>) {
  useLocale()
  const [compose, setCompose] = useState<'new' | 'reply' | ''>('')
  const [notice, setNotice] = useState('')
  const capabilities = props.sources.find(({ id }) => id === 'omnimail')?.capabilities
  const senders = props.mailboxes.map((mailbox) => ({
    label: mailbox.address,
    value: mailbox.address,
  }))
  if (compose) {
    return <PanelCompose source="omnimail" sourceLabel="OmniMail" senders={senders}
      initialTo={compose === 'reply' ? props.selected?.senderAddress : ''}
      initialSubject={compose === 'reply'
        ? /^re:/i.test(props.selected?.subject || '')
          ? props.selected?.subject : `Re: ${props.selected?.subject || '（无主题）'}`
        : ''}
      replyToMessageId={compose === 'reply' ? props.selected?.id : undefined}
      allowAttachments={true} allowDraft={true} onClose={() => setCompose('')}
      onComplete={(message) => {
        setNotice(message)
        if (compose === 'reply') props.onBack()
        setCompose('')
        props.onRefresh()
      }} />
  }
  if (props.selected) {
    return (
      <article className={`message-reader${props.selected.attachments.length ? ' has-attachments' : ''}`}>
        <button className="back-button" type="button" onClick={props.onBack}><ArrowLeft size={16} />{t('返回收件箱')}</button>
        <header><div className="message-reader-title-row"><h1>{props.selected.subject || t('（无主题）')}</h1>
          {props.canSend && capabilities?.reply && <button type="button" onClick={() => setCompose('reply')}>
            <Reply size={14} aria-hidden="true" />{t('回复')}</button>}</div>
          <p>{senderName(props.selected)} · {formatDate(props.selected.date)}</p>
          <span>{t('发送至 {address}', { address: props.selected.mailboxAddress })}</span></header>
        <PanelAttachments attachments={props.selected.attachments} request={(attachment) => (
          sendExtensionMessage<AttachmentPayload>({
            type: 'api:message-attachment',
            messageId: props.selected!.id,
            attachmentId: attachment.id,
            filename: attachment.filename,
          })
        )} />
        <iframe title={t('邮件正文')} sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={safeEmailDocument(props.selected.html, props.selected.text)} />
      </article>
    )
  }
  return (
    <section className="inbox-page">
      <header className="inbox-toolbar">
        <div><p className="eyebrow">INBOX</p><h1>{t('收件箱')}</h1></div>
        <div className="inbox-toolbar-actions">{props.canSend && capabilities?.send && <button className="icon-button"
          type="button" title={t('新建 OmniMail 邮件')} aria-label={t('新建 OmniMail 邮件')}
          onClick={() => setCompose('new')}><SquarePen size={17} /></button>}
          <button className="icon-button" type="button" title={t('刷新邮件')} aria-label={t('刷新邮件')}
            disabled={props.refreshing} onClick={props.onRefresh}>
            <RefreshCw className={props.refreshing ? 'spin' : ''} size={17} />
          </button></div>
      </header>
      {notice && <div className="source-sync-notice" role="status">{notice}</div>}
      <div className="mailbox-filter">
        <PanelSelect id="inbox-mailbox" ariaLabel={t('筛选邮箱')} value={props.mailbox}
          options={[{ label: t('全部邮箱'), value: '' }, ...props.mailboxes.map((item) => ({ label: item.address, value: item.address }))]}
          onChange={props.onMailbox} />
      </div>
      {props.loading && !props.messages.length ? <div className="empty-state"><LoaderCircle className="spin" size={20} />{t('正在读取邮件…')}</div> : (
        <div className="message-list">
          {props.messages.map((message) => (
            <button className={!message.isRead ? 'is-unread' : ''} type="button"
              key={message.id} onClick={() => props.onSelect(message)}>
              <span className="unread-dot" /><span className="message-copy">
                <strong>{senderName(message)}</strong><b>{message.subject || t('（无主题）')}</b>
                <small>{message.preview || t('暂无预览')}</small></span><time>{formatDate(message.date)}</time>
            </button>
          ))}
          {!props.messages.length && <div className="empty-state"><Inbox size={23} />
            <strong>{t('还没有邮件')}</strong><span>{t('新邮件到达后会自动出现在这里。')}</span></div>}
          {props.page.hasMore && props.page.nextCursor && <div className="indexed-load-more">
            <button type="button" disabled={props.loadingMore} onClick={props.onLoadMore}>
              {props.loadingMore && <LoaderCircle className="spin" size={14} aria-hidden="true" />}
              {props.loadingMore ? t('正在加载…') : t('加载更多')}
            </button>
          </div>}
        </div>
      )}
    </section>
  )
}

export function InboxView(props: Props) {
  const descriptor = props.sources.find(({ id }) => id === props.source)
  return (
    <div className="inbox-source-shell">
      {props.upgradeRequired && <div className="source-upgrade-card">
        <div><strong>{t('解锁更多已连接邮箱')}</strong>
          <span>{t('新来源需要你在 OmniMail 网站明确升级一次授权。')}</span></div>
        <button type="button" onClick={props.onUpgradeAuthorization}>{t('升级授权')}</button>
      </div>}
      {props.unavailableSources.length > 0 && <div className="source-discovery-warning" role="status">
        {t('部分邮箱来源暂时不可用，其他来源不受影响。')}
      </div>}
      {props.source === 'omnimail' ? <OmniInbox {...props} /> : props.source === 'icloud' ? (
        <PanelICloudInbox enabled={props.iCloudEnabled} authorized={props.iCloudAuthorized}
          accounts={props.iCloudAccounts} accountId={props.iCloudAccountId}
          aliases={props.iCloudAliases} preferredAlias={props.iCloudPreferredAlias}
          loadingAccounts={props.iCloudLoadingAccounts} loadingAliases={props.iCloudLoadingAliases}
          onAccount={props.onICloudAccount} onOpenWeb={props.onICloudOpenWeb}
          onReauthorize={props.onICloudReauthorize} />
      ) : descriptor ? <PanelIndexedInbox key={props.source}
        source={props.source as IndexedMailSourceId} descriptor={descriptor}
        canSend={props.canSend}
        onOpenWeb={() => props.onOpenSourceWeb(props.source)} /> : null}
    </div>
  )
}
