import { ArrowLeft, Cloud, Inbox, KeyRound, LoaderCircle, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ICloudAccount, ICloudAlias, ICloudMessage } from '../../src/shared/api/api-types'
import { safeEmailDocument } from './email-document'
import { PanelSelect } from './PanelSelect'
import { sendExtensionMessage } from './protocol'

interface Props {
  accountId: string
  accounts: ICloudAccount[]
  aliases: ICloudAlias[]
  authorized: boolean
  enabled: boolean
  loadingAccounts: boolean
  loadingAliases: boolean
  preferredAlias: string
  onAccount: (accountId: string) => void
  onOpenWeb: () => void
  onReauthorize: () => void
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '无法读取 iCloud 邮件。'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const today = new Date()
  return new Intl.DateTimeFormat('zh-CN', date.toDateString() === today.toDateString()
    ? { hour: '2-digit', minute: '2-digit', hour12: false }
    : { month: 'short', day: 'numeric' }).format(date)
}

export function PanelICloudInbox(props: Props) {
  const requestId = useRef(0)
  const detailRequestId = useRef(0)
  const [alias, setAlias] = useState<string | null>(null)
  const [messages, setMessages] = useState<ICloudMessage[]>([])
  const [selected, setSelected] = useState<ICloudMessage | null>(null)
  const [method, setMethod] = useState<'imap' | 'web'>('web')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')

  const effectiveAlias = alias ?? props.preferredAlias

  useEffect(() => { setAlias(null) }, [props.accountId])

  useEffect(() => {
    setAlias((current) => current !== null
      && !props.aliases.some((item) => item.email === current) ? '' : current)
  }, [props.aliases])

  const loadMessages = useCallback(async (quiet = false) => {
    if (!props.accountId || !props.authorized || !props.enabled
      || props.loadingAccounts || props.loadingAliases) return
    const currentRequest = ++requestId.current
    quiet ? setRefreshing(true) : setLoading(true)
    setError('')
    setSelected(null)
    detailRequestId.current += 1
    try {
      const result = await sendExtensionMessage<{
        messages: ICloudMessage[]
        method: 'imap' | 'web'
      }>({
        type: 'api:icloud-inbox', accountId: props.accountId,
        alias: effectiveAlias || undefined,
      })
      if (currentRequest !== requestId.current) return
      setMessages(result.messages)
      setMethod(result.method)
    } catch (loadError) {
      if (currentRequest === requestId.current) setError(errorText(loadError))
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [
    effectiveAlias,
    props.accountId,
    props.authorized,
    props.enabled,
    props.loadingAccounts,
    props.loadingAliases,
  ])

  useEffect(() => {
    void loadMessages()
    return () => { requestId.current += 1; detailRequestId.current += 1 }
  }, [loadMessages])

  async function openMessage(message: ICloudMessage) {
    const currentRequest = ++detailRequestId.current
    if (method === 'web') {
      setSelected(message)
      return
    }
    setDetailLoading(true)
    setError('')
    try {
      const result = await sendExtensionMessage<{ message: ICloudMessage }>({
        type: 'api:icloud-message', accountId: props.accountId, id: message.id,
      })
      if (currentRequest === detailRequestId.current) setSelected(result.message)
    } catch (loadError) {
      if (currentRequest === detailRequestId.current) setError(errorText(loadError))
    } finally {
      if (currentRequest === detailRequestId.current) setDetailLoading(false)
    }
  }

  if (!props.enabled || !props.authorized) {
    return (
      <section className="icloud-inbox-state">
        <Cloud size={24} />
        <strong>{props.enabled ? '需要更新 Float 授权' : 'iCloud 功能尚未启用'}</strong>
        <span>{props.enabled ? '重新授权后即可查看 iCloud 来信。' : '请先在网页端完成 iCloud 配置。'}</span>
        <button className="secondary-button" type="button"
          onClick={props.enabled ? props.onReauthorize : props.onOpenWeb}>
          {props.enabled ? '重新授权 Float' : '打开网页端'}
        </button>
      </section>
    )
  }

  if (selected) {
    return (
      <article className="message-reader icloud-message-reader">
        <button className="back-button" type="button" onClick={() => { detailRequestId.current += 1; setSelected(null) }}>
          <ArrowLeft size={16} />返回 iCloud 收件箱
        </button>
        <header>
          <div className="icloud-reader-title-row"><h1>{selected.subject || '（无主题）'}</h1>
            <span className="icloud-method-badge">{method === 'imap' ? 'IMAP 完整邮件' : 'Web 摘要'}</span></div>
          <p>{selected.from || '未知发件人'} · {formatDate(selected.date)}</p>
          <span>发送至 {selected.to || effectiveAlias || '当前 iCloud 账号'}</span>
        </header>
        {method === 'web' && (
          <div className="icloud-web-summary-note"><KeyRound size={15} />
            当前显示 iCloud Web 摘要；在网页端配置应用专用密码后可读取完整正文。</div>
        )}
        <iframe title="iCloud 邮件正文" sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={safeEmailDocument(selected.html, selected.body || selected.preview)} />
      </article>
    )
  }

  if (props.loadingAccounts) {
    return <div className="empty-state"><LoaderCircle className="spin" size={20} />正在读取 iCloud 账号…</div>
  }
  if (!props.accounts.length) {
    return <section className="icloud-inbox-state"><Cloud size={24} />
      <strong>还没有可用的 iCloud 账号</strong><span>请先在网页端连接账号。</span>
      <button className="secondary-button" type="button" onClick={props.onOpenWeb}>前往 iCloud 工作区</button>
    </section>
  }

  return (
    <section className="inbox-page icloud-inbox-page">
      <header className="inbox-toolbar">
        <div><p className="eyebrow">ICLOUD INBOX</p><h1>iCloud 收件</h1></div>
        <button className="icon-button" type="button" title="刷新 iCloud 邮件"
          aria-label="刷新 iCloud 邮件" disabled={refreshing || !props.accountId}
          onClick={() => void loadMessages(true)}>
          <RefreshCw className={refreshing ? 'spin' : ''} size={17} />
        </button>
      </header>
      <div className="icloud-inbox-filters">
        <PanelSelect id="icloud-inbox-account" ariaLabel="iCloud 收件账号"
          value={props.accountId} options={props.accounts.map((account) => ({
            label: `${account.name} · ${account.realEmail || account.icloudEmail || account.host}`,
            value: account.id,
          }))} disabled={props.loadingAccounts} onChange={props.onAccount} />
        <PanelSelect id="icloud-inbox-alias" ariaLabel="iCloud 收件地址" value={effectiveAlias}
          options={[{ label: '全部隐藏邮箱', value: '' }, ...props.aliases.map((item) => ({
            label: item.label ? `${item.email} · ${item.label}` : item.email,
            value: item.email,
          }))]} disabled={props.loadingAliases} onChange={setAlias} />
      </div>
      {error && <div className="icloud-inline-error" role="alert">{error}<button type="button" onClick={() => void loadMessages()}>重试</button></div>}
      {detailLoading && <div className="icloud-detail-loading" role="status">
        <LoaderCircle className="spin" size={14} />正在打开邮件…</div>}
      {(loading || detailLoading) && !messages.length ? (
        <div className="empty-state"><LoaderCircle className="spin" size={20} />正在读取 iCloud 邮件…</div>
      ) : (
        <div className="message-list">
          {messages.map((message) => (
            <button type="button" key={message.id} onClick={() => void openMessage(message)}>
              <span className="unread-dot" /><span className="message-copy">
                <strong>{message.from || '未知发件人'}</strong>
                <b>{message.subject || '（无主题）'}</b>
                <small>{message.preview || '暂无预览'}</small>
              </span><time>{formatDate(message.date)}</time>
            </button>
          ))}
          {!messages.length && !error && <div className="empty-state"><Inbox size={23} />
            <strong>最近 7 天没有来信</strong><span>可切换隐藏地址或稍后手动刷新。</span></div>}
        </div>
      )}
      <div className="icloud-inbox-footer"><span>{method === 'imap' ? 'IMAP 完整邮件' : 'iCloud Web 摘要'}</span>
        <button type="button" onClick={props.onOpenWeb}>打开完整网页端</button></div>
    </section>
  )
}
