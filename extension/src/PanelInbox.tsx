import { ArrowLeft, Inbox, LoaderCircle, RefreshCw } from 'lucide-react'
import type {
  ICloudAccount,
  ICloudAlias,
  MailboxAddress,
  MessageDetail,
  MessageSummary,
} from '../../src/shared/api/api-types'
import { safeEmailDocument } from './email-document'
import { PanelICloudInbox } from './PanelICloudInbox'
import { PanelIndexedInbox } from './PanelIndexedInbox'
import type {
  IndexedMailSourceId,
  MailSourceDescriptor,
  MailSourceId,
} from './mail-source'
import { PanelMailSourceSelect } from './PanelMailSourceSelect'
import { PanelSelect } from './PanelSelect'

interface Props {
  iCloudAccountId: string
  iCloudAccounts: ICloudAccount[]
  iCloudAliases: ICloudAlias[]
  iCloudAuthorized: boolean
  iCloudEnabled: boolean
  iCloudLoadingAccounts: boolean
  iCloudLoadingAliases: boolean
  iCloudPreferredAlias: string
  loading: boolean
  mailbox: string
  mailboxes: MailboxAddress[]
  messages: MessageSummary[]
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
  onRefresh: () => void
  onSelect: (message: MessageSummary) => void
  onSource: (source: MailSourceId) => void
  onOpenSourceWeb: (source: MailSourceId) => void
  onUpgradeAuthorization: () => void
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  return new Intl.DateTimeFormat('zh-CN', date.toDateString() === today.toDateString()
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { month: 'short', day: 'numeric' }).format(date)
}

function senderName(message: MessageSummary): string {
  return message.senderName || message.senderAddress || '未知发件人'
}

function OmniInbox(props: Pick<Props,
  'loading' | 'mailbox' | 'mailboxes' | 'messages' | 'refreshing' | 'selected'
  | 'onBack' | 'onMailbox' | 'onRefresh' | 'onSelect'
>) {
  if (props.selected) {
    return (
      <article className="message-reader">
        <button className="back-button" type="button" onClick={props.onBack}><ArrowLeft size={16} />返回收件箱</button>
        <header><h1>{props.selected.subject || '（无主题）'}</h1><p>{senderName(props.selected)} · {formatDate(props.selected.date)}</p><span>发送至 {props.selected.mailboxAddress}</span></header>
        <iframe title="邮件正文" sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={safeEmailDocument(props.selected.html, props.selected.text)} />
      </article>
    )
  }
  return (
    <section className="inbox-page">
      <header className="inbox-toolbar">
        <div><p className="eyebrow">INBOX</p><h1>收件箱</h1></div>
        <button className="icon-button" type="button" title="刷新邮件" aria-label="刷新邮件"
          disabled={props.refreshing} onClick={props.onRefresh}>
          <RefreshCw className={props.refreshing ? 'spin' : ''} size={17} />
        </button>
      </header>
      <div className="mailbox-filter">
        <PanelSelect id="inbox-mailbox" ariaLabel="筛选邮箱" value={props.mailbox}
          options={[{ label: '全部邮箱', value: '' }, ...props.mailboxes.map((item) => ({ label: item.address, value: item.address }))]}
          onChange={props.onMailbox} />
      </div>
      {props.loading && !props.messages.length ? <div className="empty-state"><LoaderCircle className="spin" size={20} />正在读取邮件…</div> : (
        <div className="message-list">
          {props.messages.map((message) => (
            <button className={!message.isRead ? 'is-unread' : ''} type="button"
              key={message.id} onClick={() => props.onSelect(message)}>
              <span className="unread-dot" /><span className="message-copy">
                <strong>{senderName(message)}</strong><b>{message.subject || '（无主题）'}</b>
                <small>{message.preview || '暂无预览'}</small></span><time>{formatDate(message.date)}</time>
            </button>
          ))}
          {!props.messages.length && <div className="empty-state"><Inbox size={23} />
            <strong>还没有邮件</strong><span>新邮件到达后会自动出现在这里。</span></div>}
        </div>
      )}
    </section>
  )
}

export function InboxView(props: Props) {
  const descriptor = props.sources.find(({ id }) => id === props.source)
  return (
    <div className="inbox-source-shell">
      <div className="inbox-source-select"><PanelMailSourceSelect id="inbox-mail-source"
        source={props.source} sources={props.sources} onChange={props.onSource} /></div>
      {props.upgradeRequired && <div className="source-upgrade-card">
        <div><strong>解锁更多已连接邮箱</strong>
          <span>新来源需要你在 OmniMail 网站明确升级一次只读授权。</span></div>
        <button type="button" onClick={props.onUpgradeAuthorization}>升级授权</button>
      </div>}
      {props.unavailableSources.length > 0 && <div className="source-discovery-warning" role="status">
        部分邮箱来源暂时不可用，其他来源不受影响。
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
        onOpenWeb={() => props.onOpenSourceWeb(props.source)} /> : null}
    </div>
  )
}
