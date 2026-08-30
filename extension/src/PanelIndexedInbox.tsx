import { ArrowLeft, Inbox, LoaderCircle, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type IndexedMailSourceId,
  type IndexedMessageDetail,
  type IndexedMessageSummary,
  type MailSourceDescriptor,
} from './mail-source'
import { safeEmailDocument } from './email-document'
import { PanelSelect } from './PanelSelect'
import {
  type IndexedInboxResult,
  sendExtensionMessage,
} from './protocol'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '读取邮箱失败。'
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  return new Intl.DateTimeFormat('zh-CN', date.toDateString() === today.toDateString()
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { month: 'short', day: 'numeric' }).format(date)
}

function sender(message: IndexedMessageSummary): string {
  return message.senderName || message.senderAddress || '未知发件人'
}

export function PanelIndexedInbox({ source, descriptor, onOpenWeb }: {
  source: IndexedMailSourceId
  descriptor: MailSourceDescriptor
  onOpenWeb: () => void
}) {
  const listRequestId = useRef(0)
  const detailRequestId = useRef(0)
  const [accountId, setAccountId] = useState('')
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox')
  const [messages, setMessages] = useState<IndexedMessageSummary[]>([])
  const [selected, setSelected] = useState<IndexedMessageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const attention = descriptor.accounts.filter((account) => account.needsAttention)
  const folderLabel = folder === 'sent' ? '已发送' : '收件箱'
  const inboxTitle = source === 'linuxdo'
    ? `${descriptor.label} ${folderLabel}`
    : descriptor.label.endsWith('邮箱')
    ? `${descriptor.label}收件箱`
    : `${descriptor.label} 收件箱`

  const loadMessages = useCallback(async (quiet = false) => {
    const current = ++listRequestId.current
    quiet ? setRefreshing(true) : setLoading(true)
    setError('')
    try {
      const result = await sendExtensionMessage<IndexedInboxResult>({
        type: 'api:indexed-source-messages', source,
        accountId: accountId || undefined, query: searchQuery || undefined,
        folder: source === 'linuxdo' ? folder : undefined,
      })
      if (current !== listRequestId.current) return
      setMessages(result.messages)
      setSelected(null)
      detailRequestId.current += 1
    } catch (loadError) {
      if (current === listRequestId.current) setError(errorText(loadError))
    } finally {
      if (current === listRequestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [accountId, folder, searchQuery, source])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => { void loadMessages() }, [loadMessages])
  useEffect(() => () => {
    listRequestId.current += 1
    detailRequestId.current += 1
  }, [])

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
      <article className="message-reader indexed-message-reader">
        <button className="back-button" type="button" onClick={() => {
          detailRequestId.current += 1
          setSelected(null)
        }}><ArrowLeft size={16} />返回 {inboxTitle}</button>
        <header><h1>{selected.subject || '（无主题）'}</h1>
          <p>{sender(selected)} · {formatDate(selected.date)}</p>
          <span>{selected.accountName} · {selected.accountEmail}</span></header>
        {selected.attachmentCount > 0 && <div className="indexed-attachment-note">
          这封邮件包含 {selected.attachmentCount} 个附件，请在完整网页端查看。
          <button type="button" onClick={onOpenWeb}>打开网页端</button></div>}
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
        <button className="icon-button" type="button" title={`刷新 ${descriptor.label} 邮件`}
          aria-label={`刷新 ${descriptor.label} 邮件`} disabled={refreshing}
          onClick={() => void loadMessages(true)}>
          <RefreshCw className={refreshing ? 'spin' : ''} size={17} />
        </button>
      </header>
      <div className="indexed-inbox-filters">
        {source === 'linuxdo' ? <PanelSelect id="linuxdo-folder" ariaLabel="Linux DO Mail 文件夹"
          value={folder} options={[{ label: '收件箱', value: 'inbox' }, { label: '已发送', value: 'sent' }]}
          onChange={(value) => setFolder(value as 'inbox' | 'sent')} /> : (
          <PanelSelect id={`${source}-account`} ariaLabel={`${descriptor.label} 账号`}
            value={accountId} options={[{ label: '全部账号', value: '' },
              ...descriptor.accounts.map((account) => ({
                label: `${account.name} · ${account.email}${account.needsAttention ? ' · 需要修复' : ''}`,
                value: account.id,
              }))]} onChange={setAccountId} />
        )}
        <label className="indexed-search-field" htmlFor={`${source}-search`}>
          <Search size={14} aria-hidden="true" /><span className="sr-only">搜索邮件</span>
          <input id={`${source}-search`} type="search" value={query}
            placeholder="搜索主题、发件人或收件人" onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      {attention.length > 0 && <div className="source-attention" role="status">
        <span>{attention.length} 个账号需要修复；已索引邮件仍可查看。</span>
        <button type="button" onClick={onOpenWeb}>前往处理</button></div>}
      {error && <div className="icloud-inline-error" role="alert"><span>{error}</span>
        <button type="button" onClick={() => void loadMessages()}>重试</button></div>}
      {detailLoading && <div className="icloud-detail-loading" role="status">
        <LoaderCircle className="spin" size={14} />正在打开邮件…</div>}
      {loading && !messages.length ? <div className="empty-state">
        <LoaderCircle className="spin" size={20} />正在读取 {descriptor.label} 邮件…</div> : (
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
            <strong>没有匹配的邮件</strong><span>可以切换账号或修改搜索词。</span></div>}
        </div>
      )}
      <div className="icloud-inbox-footer"><span>通过 OmniMail 安全读取</span>
        <button type="button" onClick={onOpenWeb}>打开完整网页端</button></div>
    </section>
  )
}
