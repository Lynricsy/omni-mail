import {
  ArrowLeft,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Reply,
  Search,
  SquarePen,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getLocale, t, useLocale } from '../../src/shared/i18n'
import {
  type FloatAttachment,
  type IndexedMailSourceId,
  type IndexedMessageDetail,
  type IndexedMessageSummary,
  type MailSourceDescriptor,
  type MailSourceFolder,
} from './mail-source'
import { safeEmailDocument } from './email-document'
import { PanelAttachments } from './PanelAttachments'
import { PanelCompose } from './PanelCompose'
import { PanelSelect } from './PanelSelect'
import {
  type AttachmentPayload,
  type IndexedInboxResult,
  sendExtensionMessage,
} from './protocol'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '读取邮箱失败。'
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  return new Intl.DateTimeFormat(getLocale(), date.toDateString() === today.toDateString()
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { month: 'short', day: 'numeric' }).format(date)
}

function sender(message: IndexedMessageSummary): string {
  return message.senderName || message.senderAddress || '未知发件人'
}

export function PanelIndexedInbox({ source, descriptor, canSend, onOpenWeb }: {
  source: IndexedMailSourceId
  descriptor: MailSourceDescriptor
  canSend: boolean
  onOpenWeb: () => void
}) {
  useLocale()
  const listRequestId = useRef(0)
  const detailRequestId = useRef(0)
  const folderRequestId = useRef(0)
  const [accountId, setAccountId] = useState('')
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [folder, setFolder] = useState(source === 'linuxdo' ? 'inbox' : '')
  const [folders, setFolders] = useState<MailSourceFolder[]>([])
  const [messages, setMessages] = useState<IndexedMessageSummary[]>([])
  const [page, setPage] = useState<IndexedInboxResult['page']>({
    hasMore: false, nextCursor: null, limit: 30,
  })
  const [selected, setSelected] = useState<IndexedMessageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState('')
  const [compose, setCompose] = useState<'new' | 'reply' | ''>('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const canReadAttachments = Boolean(descriptor.capabilities?.attachments)
  const canReadFolders = Boolean(descriptor.capabilities?.folders)
  const canSync = Boolean(descriptor.capabilities?.sync)
  const canSendAllowed = Boolean(canSend && descriptor.capabilities?.send)
  const canReply = Boolean(canSendAllowed && descriptor.capabilities?.reply)
  const composeAccount = source === 'linuxdo'
    ? descriptor.accounts[0]
    : descriptor.accounts.find((account) => account.id === accountId)
  const composeLabel = source === 'qq' ? 'QQ' : descriptor.label
  const attention = descriptor.accounts.filter((account) => account.needsAttention)
  const folderLabel = source === 'linuxdo'
    ? t(folder === 'sent' ? '已发送' : '收件箱')
    : folders.find((item) => item.path === folder)?.label || '收件箱'
  const inboxTitle = source === 'linuxdo'
    ? `${descriptor.label} ${folderLabel}`
    : source === 'microsoft' && accountId && folder
      ? `${descriptor.label} · ${folderLabel}`
      : getLocale() === 'zh-CN' && descriptor.label.endsWith('邮箱')
        ? `${descriptor.label}收件箱`
        : t('{source} 收件箱', { source: descriptor.label })

  const loadMessages = useCallback(async (quiet = false, cursor?: string) => {
    const current = ++listRequestId.current
    if (cursor) setLoadingMore(true)
    else if (quiet) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const result = await sendExtensionMessage<IndexedInboxResult>({
        type: 'api:indexed-source-messages', source,
        accountId: accountId || undefined, query: searchQuery || undefined,
        cursor,
        folder: source === 'linuxdo' || source === 'microsoft' ? folder : undefined,
      })
      if (current !== listRequestId.current) return
      setMessages((items) => cursor ? [
        ...items,
        ...result.messages.filter((message) => !items.some((item) => (
          item.id === message.id && item.accountId === message.accountId
        ))),
      ] : result.messages)
      setPage(result.page)
      if (!cursor) {
        setSelected(null)
        detailRequestId.current += 1
      }
    } catch (loadError) {
      if (current === listRequestId.current) setError(errorText(loadError))
    } finally {
      if (current === listRequestId.current) {
        setLoading(false)
        setRefreshing(false)
        setLoadingMore(false)
      }
    }
  }, [accountId, folder, searchQuery, source])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => { void loadMessages() }, [loadMessages])
  useEffect(() => {
    const current = ++folderRequestId.current
    setFolders([])
    if (source !== 'microsoft' || !accountId || !canReadFolders) return
    void sendExtensionMessage<{ folders: MailSourceFolder[] }>({
      type: 'api:indexed-source-folders', source, accountId,
    }).then((result) => {
      if (current === folderRequestId.current) setFolders(result.folders)
    }).catch((loadError) => {
      if (current === folderRequestId.current) setError(errorText(loadError))
    })
  }, [accountId, canReadFolders, source])
  useEffect(() => () => {
    listRequestId.current += 1
    detailRequestId.current += 1
    folderRequestId.current += 1
  }, [])

  async function syncAccount() {
    if (!accountId || !canSync) {
      await loadMessages(true)
      return
    }
    setSyncing(true)
    setSyncNotice('')
    setError('')
    try {
      await sendExtensionMessage<{ queued: true }>({
        type: 'api:indexed-source-sync', source, accountId,
      })
      setSyncNotice('同步任务已加入队列，稍后再次刷新可查看新邮件。')
      await loadMessages(true)
    } catch (syncError) {
      setError(errorText(syncError))
    } finally {
      setSyncing(false)
    }
  }

  function attachmentRequest(attachment: FloatAttachment): Promise<AttachmentPayload> {
    return sendExtensionMessage<AttachmentPayload>({
      type: 'api:indexed-source-attachment', source,
      accountId: selected!.accountId, messageId: selected!.id,
      attachmentId: attachment.id, filename: attachment.filename,
    })
  }

  if (compose && composeAccount && canSendAllowed && (source === 'qq' || source === 'linuxdo')) {
    const senders = (composeAccount.senders?.length
      ? composeAccount.senders
      : [{ name: composeAccount.name, email: composeAccount.email }])
      .map((senderOption) => ({
        label: `${senderOption.name} · ${senderOption.email}`,
        value: senderOption.email,
      }))
    return <PanelCompose source={source} sourceLabel={composeLabel}
      accountId={composeAccount.id} senders={senders}
      initialTo={compose === 'reply' ? selected?.senderAddress : ''}
      initialSubject={compose === 'reply'
        ? /^re:/i.test(selected?.subject || '')
          ? selected?.subject : `Re: ${selected?.subject || '（无主题）'}`
        : ''}
      replyToMessageId={compose === 'reply' ? selected?.id : undefined}
      allowAttachments={false} allowDraft={false} onClose={() => setCompose('')}
      onComplete={(message) => {
        setSyncNotice(message)
        setCompose('')
        void loadMessages(true)
      }} />
  }

  async function openMessage(message: IndexedMessageSummary) {
    const current = ++detailRequestId.current
    setDetailLoading(true)
    setError('')
    try {
      const result = await sendExtensionMessage<{ message: IndexedMessageDetail }>({
        type: 'api:indexed-source-message', source,
        accountId: message.accountId, id: message.id,
        folder: source === 'linuxdo' ? folder : undefined,
      })
      if (current !== detailRequestId.current) return
      setSelected(result.message)
      setMessages((items) => items.map((item) => item.id === message.id
        && item.accountId === message.accountId ? { ...item, isRead: true } : item))
    } catch (loadError) {
      if (current === detailRequestId.current) setError(errorText(loadError))
    } finally {
      if (current === detailRequestId.current) setDetailLoading(false)
    }
  }

  if (selected) {
    return (
      <article className={`message-reader indexed-message-reader${selected.attachments.length ? ' has-attachments' : ''}`}>
        <button className="back-button" type="button" onClick={() => {
          detailRequestId.current += 1
          setSelected(null)
        }}><ArrowLeft size={16} />{t('返回 {source}', { source: inboxTitle })}</button>
        <header><div className="message-reader-title-row"><h1>{selected.subject || '（无主题）'}</h1>
          {source === 'qq' && canReply && !composeAccount?.needsAttention && <button type="button"
            onClick={() => setCompose('reply')}><Reply size={14} aria-hidden="true" />{t('回复')}</button>}
          </div>
          <p>{sender(selected)} · {formatDate(selected.date)}</p>
          <span>{selected.accountName} · {selected.accountEmail}</span></header>
        {canReadAttachments
          ? <PanelAttachments attachments={selected.attachments} request={attachmentRequest} />
          : selected.attachmentCount > 0 && <div className="indexed-attachment-note">
             {t('更新 Float 授权后可安全下载附件。')}
             <button type="button" onClick={onOpenWeb}>{t('打开网页端')}</button></div>}
        <iframe title={`${descriptor.label} 邮件正文`}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={safeEmailDocument(selected.html, selected.body)} />
      </article>
    )
  }

  return (
    <section className="inbox-page indexed-inbox-page">
      <header className="inbox-toolbar">
        <div><p className="eyebrow">CONNECTED MAIL</p><h1>{inboxTitle}</h1></div>
        <div className="inbox-toolbar-actions">{canSendAllowed && composeAccount && !composeAccount.needsAttention
          && <button className="icon-button" type="button"
             title={t('新建 {source} 邮件', { source: composeLabel })}
             aria-label={t('新建 {source} 邮件', { source: composeLabel })}
            onClick={() => setCompose('new')}><SquarePen size={17} /></button>}
          <button className="icon-button" type="button" title={t('刷新 {source} 邮件', { source: descriptor.label })}
          aria-label={accountId && canSync
             ? t('同步 {source} 账号', { source: descriptor.label })
             : t('刷新 {source} 邮件', { source: descriptor.label })}
          disabled={refreshing || syncing}
          onClick={() => void syncAccount()}>
          <RefreshCw className={refreshing || syncing ? 'spin' : ''} size={17} />
          </button></div>
      </header>
      <div className="indexed-inbox-filters">
        {source === 'linuxdo' ? <PanelSelect id="linuxdo-folder" ariaLabel={t('Linux DO Mail 文件夹')}
          value={folder} options={[{ label: t('收件箱'), value: 'inbox' }, { label: t('已发送'), value: 'sent' }]}
          onChange={(value) => setFolder(value as 'inbox' | 'sent')} /> : (
          <PanelSelect id={`${source}-account`} ariaLabel={t('{source} 账号', { source: descriptor.label })}
            value={accountId} options={[{ label: t('全部账号'), value: '' },
              ...descriptor.accounts.map((account) => ({
                label: `${account.name} · ${account.email}${account.needsAttention
                  ? ` · ${t('需要修复')}` : ''}`,
                value: account.id,
              }))]} onChange={(value) => { setFolder(''); setAccountId(value) }} />
        )}
        {source === 'microsoft' && accountId && canReadFolders && <PanelSelect id="microsoft-folder"
          ariaLabel={t('Microsoft 文件夹')} value={folder}
          options={[{ label: t('收件箱（默认）'), value: '' }, ...folders
            .filter((item) => item.path.toUpperCase() !== 'INBOX')
            .map((item) => ({ label: item.label, value: item.path }))]}
          onChange={setFolder} />}
        <label className="indexed-search-field" htmlFor={`${source}-search`}>
          <Search size={14} aria-hidden="true" /><span className="sr-only">{t('搜索邮件')}</span>
          <input id={`${source}-search`} type="search" value={query}
            placeholder={t('搜索主题、发件人或收件人')} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      {attention.length > 0 && <div className="source-attention" role="status">
        <span>{t('{count} 个账号需要修复；已索引邮件仍可查看。', {
          count: attention.length,
        })}</span>
        <button type="button" onClick={onOpenWeb}>{t('前往处理')}</button></div>}
      {syncNotice && <div className="source-sync-notice" role="status">{syncNotice}</div>}
      {error && <div className="icloud-inline-error" role="alert"><span>{error}</span>
        <button type="button" onClick={() => void loadMessages()}>{t('重试')}</button></div>}
      {detailLoading && <div className="icloud-detail-loading" role="status">
        <LoaderCircle className="spin" size={14} />{t('正在打开邮件…')}</div>}
      {loading && !messages.length ? <div className="empty-state">
        <LoaderCircle className="spin" size={20} />{t('正在读取 {source} 邮件…', { source: descriptor.label })}</div> : (
        <div className="message-list">
          {messages.map((message) => (
            <button className={!message.isRead ? 'is-unread' : ''} type="button"
              key={`${message.accountId}:${message.id}`} onClick={() => void openMessage(message)}>
              <span className="unread-dot" /><span className="message-copy">
                <strong>{sender(message)}</strong><b>{message.subject || '（无主题）'}</b>
                <small>{message.preview || message.accountEmail}</small></span>
              <time>{formatDate(message.date)}</time>
            </button>
          ))}
          {!messages.length && !error && <div className="empty-state"><Inbox size={23} />
            <strong>{t('没有匹配的邮件')}</strong><span>{t('可以切换账号或修改搜索词。')}</span></div>}
          {page.hasMore && page.nextCursor && <div className="indexed-load-more">
            <button type="button" disabled={loadingMore}
              onClick={() => void loadMessages(false, page.nextCursor || undefined)}>
              {loadingMore && <LoaderCircle className="spin" size={14} aria-hidden="true" />}
              {loadingMore ? t('正在加载…') : t('加载更多')}
            </button>
          </div>}
        </div>
      )}
      <div className="icloud-inbox-footer"><span>{t('通过 OmniMail 安全读取')}</span>
        <button type="button" onClick={onOpenWeb}>{t('打开完整网页端')}</button></div>
    </section>
  )
}
