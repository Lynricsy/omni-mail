import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  Mail,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  api,
  type PageInfo,
  type NaverMailAccount,
  type NaverMailMessageDetail,
  type NaverMailMessageSummary,
} from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { notificationDeepLink } from '../../../shared/mail/notificationDeepLink'
import { ListScrollTopHeading } from '../../../shared/ui/mail-workspace/ListScrollTopHeading'
import { useMailListScroll } from '../../../shared/ui/mail-workspace/hooks/useMailListScroll'
import '../../../shared/ui/mail-workspace/styles/workspace.css'
import '../../gmail/styles/gmail-dialog.css'
import '../../gmail/styles/gmail-workspace.css'
import { NaverMailAccountDialog } from './NaverMailAccountDialog'
import { NaverMailIcon } from './NaverMailIcon'
import { NaverMailReader } from './NaverMailReader'
import { NaverMailScopeSwitcher } from './NaverMailScopeSwitcher'
import { NaverMailSearchField } from './NaverMailSearchField'

const emptyPage: PageInfo = { hasMore: false, nextCursor: null, limit: 30 }
const SYNC_POLL_ATTEMPTS = 15

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function accountError(accounts: NaverMailAccount[]): string {
  const failed = accounts.filter(({ status }) => status === 'error' || status === 'credential_error')
  return failed.length ? t('{count} 个 NAVER 邮箱账号需要处理，其他账号仍会继续同步。', {
    count: failed.length,
  }) : ''
}

export function NaverMailWorkspace({ enabled, remoteImagesEnabled }: {
  enabled: boolean
  remoteImagesEnabled: boolean
}) {
  const mailListScroll = useMailListScroll()
  const pendingDeepLink = useRef(notificationDeepLink('naver'))
  const [accounts, setAccounts] = useState<NaverMailAccount[]>([])
  const [accountId, setAccountId] = useState(pendingDeepLink.current?.accountId || '')
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [messages, setMessages] = useState<NaverMailMessageSummary[]>([])
  const [page, setPage] = useState<PageInfo>(emptyPage)
  const [selected, setSelected] = useState<NaverMailMessageSummary | null>(null)
  const [detail, setDetail] = useState<NaverMailMessageDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [remoteSyncing, setRemoteSyncing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [dialogMode, setDialogMode] = useState<'add' | 'manage' | null>(null)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [notice, setNotice] = useState('')
  const listController = useRef<AbortController | null>(null)
  const listRequestId = useRef(0)
  const messageController = useRef<AbortController | null>(null)
  const syncRequestId = useRef(0)
  const manageButton = useRef<HTMLButtonElement>(null)
  const currentAccount = accountId
    ? accounts.find(({ id }) => id === accountId)
    : accounts.length === 1 ? accounts[0] : undefined

  const loadAccounts = useCallback(async () => {
    if (!enabled) {
      setAccounts([])
      setLoading(false)
      return []
    }
    const result = await api.naverMailAccounts()
    setAccounts(result.accounts)
    setAccountId((current) => current && !result.accounts.some(({ id }) => id === current)
      ? '' : current)
    return result.accounts
  }, [enabled])

  const loadMessages = useCallback(async (quiet = false) => {
    if (!enabled) return
    listController.current?.abort()
    const controller = new AbortController()
    listController.current = controller
    const current = ++listRequestId.current
    if (!quiet) setLoading(true)
    setError('')
    try {
      const result = await api.naverMailMessages(accountId, '', searchQuery, controller.signal)
      if (current !== listRequestId.current) return
      setMessages(result.messages)
      setPage(result.page)
      setSelected((value) => value && result.messages.some(({ id }) => id === value.id)
        ? value : null)
    } catch (loadError) {
      if (current === listRequestId.current) setError(errorMessage(loadError))
    } finally {
      if (!quiet && current === listRequestId.current) setLoading(false)
    }
  }, [accountId, enabled, searchQuery])

  const refresh = useCallback(async () => {
    setError('')
    try {
      await loadAccounts()
      await loadMessages(true)
    } catch (refreshError) {
      setError(errorMessage(refreshError))
    }
  }, [loadAccounts, loadMessages])

  useEffect(() => {
    void loadAccounts().catch((loadError) => {
      setError(errorMessage(loadError))
      setLoading(false)
    })
  }, [loadAccounts])
  useEffect(() => { void loadMessages() }, [loadMessages])
  useEffect(() => {
    const link = pendingDeepLink.current
    const message = link && messages.find(({ id, account }) => (
      id === link.messageId && (!link.accountId || account.id === link.accountId)
    ))
    if (!message) return
    pendingDeepLink.current = null
    void selectMessage(message)
  }, [messages])
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => {
    messageController.current?.abort()
    setSelected(null); setDetail(null); setDetailError(''); setDetailLoading(false)
  }, [searchQuery])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4_000)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => () => {
    listController.current?.abort()
    listRequestId.current += 1
    messageController.current?.abort()
    syncRequestId.current += 1
  }, [])

  async function syncRemote() {
    if (remoteSyncing) return
    const scoped = accountId ? accounts.filter(({ id }) => id === accountId) : accounts
    const eligible = scoped.filter(({ status }) => status !== 'credential_error' && status !== 'syncing')
    if (!eligible.length) {
      setError(t(scoped.some(({ status }) => status === 'syncing')
        ? 'NAVER 邮箱同步正在进行，请稍候。'
        : '没有可同步的 NAVER 邮箱账号，请先更新失效的应用专用密码。'))
      return
    }

    const requestId = ++syncRequestId.current
    const baseline = new Map(eligible.map(({ id, lastSyncedAt }) => [id, lastSyncedAt ?? 0]))
    setRemoteSyncing(true)
    setError('')
    setNotice('')
    try {
      const results = await Promise.allSettled(eligible.map(({ id }) => api.syncNaverMail(id)))
      if (requestId !== syncRequestId.current) return
      const accepted = eligible.filter((_account, index) => results[index].status === 'fulfilled')
      const rejected = results.filter(({ status }) => status === 'rejected')
      if (!accepted.length) {
        const failure = results.find(({ status }) => status === 'rejected') as PromiseRejectedResult
        throw failure.reason
      }
      setNotice(t(accepted.length === 1
        ? 'NAVER 邮箱同步任务已加入队列。'
        : '已加入 {count} 个 NAVER 邮箱同步任务。', { count: accepted.length }))

      for (let attempt = 0; attempt < SYNC_POLL_ATTEMPTS; attempt += 1) {
        await delay(1_000)
        if (requestId !== syncRequestId.current) return
        const latest = await loadAccounts()
        const finished = accepted.every(({ id }) => {
          const account = latest.find((item) => item.id === id)
          return Boolean(account && (
            (account.lastSyncedAt ?? 0) > (baseline.get(id) ?? 0)
            || account.status === 'error'
            || account.status === 'credential_error'
          ))
        })
        if (!finished) continue
        await loadMessages(true)
        const failed = latest.filter((account) => accepted.some(({ id }) => id === account.id)
          && (account.status === 'error' || account.status === 'credential_error'))
        if (failed.length || rejected.length) {
          setError(t('部分 NAVER 邮箱账号同步失败，请在账号管理中查看状态。'))
        } else {
          setNotice(t(accepted.length === 1
            ? 'NAVER 邮箱同步完成。'
            : '已完成 {count} 个 NAVER 邮箱账号同步。', { count: accepted.length }))
        }
        return
      }
      await loadMessages(true)
      setNotice(t('同步任务仍在后台运行，稍后会自动更新列表。'))
    } catch (syncError) {
      if (requestId === syncRequestId.current) setError(errorMessage(syncError))
    } finally {
      if (requestId === syncRequestId.current) setRemoteSyncing(false)
    }
  }

  async function selectMessage(message: NaverMailMessageSummary) {
    messageController.current?.abort()
    const controller = new AbortController()
    messageController.current = controller
    setSelected(message)
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    setError('')
    try {
      const result = await api.naverMailMessage(message.account.id, message.id, controller.signal)
      if (!controller.signal.aborted) {
        setDetail(result.message)
        setMessages((items) => items.map((item) => item.id === message.id
          ? { ...item, isRead: result.message.isRead }
          : item))
      }
    } catch (loadError) {
      if (!controller.signal.aborted) setDetailError(errorMessage(loadError))
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false)
    }
  }

  async function loadMore() {
    if (!page.hasMore || !page.nextCursor || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const current = listRequestId.current
      const result = await api.naverMailMessages(accountId, page.nextCursor, searchQuery)
      if (current !== listRequestId.current) return
      setMessages((items) => {
        const ids = new Set(items.map(({ id }) => id))
        return [...items, ...result.messages.filter(({ id }) => !ids.has(id))]
      })
      setPage(result.page)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoadingMore(false)
    }
  }

  function chooseAccount(next: string) {
    setAccountId(next)
    setSelected(null)
    setDetail(null)
    setDetailError('')
  }

  function closeDialog() {
    setDialogMode(null)
    window.requestAnimationFrame(() => manageButton.current?.focus())
  }

  async function copyAccountAddress() {
    if (!currentAccount) return
    try {
      await navigator.clipboard.writeText(currentAccount.email)
      setNotice(t('已复制：{address}', { address: currentAccount.email }))
    } catch {
      setError(t('无法访问剪贴板，请手动复制邮箱地址。'))
    }
  }

  return <div className={`icloud-mail-view gmail-workspace gmail-mail-view${selected ? ' has-selection' : ''}`}>
    <section ref={mailListScroll.listPane}
      className="list-pane icloud-list-pane page-content-enter gmail-list-pane">
      <header className="list-header icloud-list-header gmail-list-header">
        <div>{enabled && accounts.length ? <NaverMailScopeSwitcher accounts={accounts}
          selectedAccountId={accountId} onChange={chooseAccount}
          onManage={() => setDialogMode('manage')} />
          : <p className="eyebrow">NAVER MAIL · IMAP</p>}
          <ListScrollTopHeading title={t('NAVER 邮箱')} onScrollTop={mailListScroll.scrollToTop} /></div>
        {enabled && <div className="list-header__actions">
          {accounts.length > 0 && <span className="icloud-mail-status is-imap">
            <ShieldCheck size={13} aria-hidden="true" />{t('IMAP 同步')}</span>}
          <div className="icloud-header-action-buttons">
            <button className="icon-button" type="button" disabled={!currentAccount}
              onClick={() => void copyAccountAddress()}
              aria-label={currentAccount
                ? t('复制邮箱地址：{address}', { address: currentAccount.email })
                : t('暂无可复制邮箱')}
              data-tooltip={currentAccount
                ? t('复制邮箱地址：{address}', { address: currentAccount.email })
                : t('暂无可复制邮箱')}>
              <Copy size={17} aria-hidden="true" />
            </button>
            <button ref={manageButton} className="icon-button" type="button"
              onClick={() => setDialogMode('manage')} aria-label={t('管理 NAVER 邮箱账号')}
              data-tooltip={t('管理 NAVER 邮箱账号')}>
              <Settings2 size={17} /></button>
            <button className="icon-button" type="button" disabled={!accounts.length || remoteSyncing}
              aria-busy={remoteSyncing} onClick={() => void syncRemote()}
              aria-label={t(accountId ? '同步当前 NAVER 邮箱账号' : '同步全部 NAVER 邮箱账号')}
              data-tooltip={t(accountId ? '同步当前 NAVER 邮箱账号' : '同步全部 NAVER 邮箱账号')}>
              {remoteSyncing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
            </button>
          </div>
        </div>}
      </header>
      {enabled && accounts.length > 0 && <NaverMailSearchField value={query} loading={loading}
        onChange={setQuery} />}
      {enabled && accountError(accounts) && <p className="gmail-partial-error" role="status">
        <AlertCircle size={15} />{accountError(accounts)}</p>}
      {error && <p className="list-error" role="alert"><AlertCircle size={15} />{error}</p>}
      <div className="gmail-message-list" aria-busy={loading}>
        {!enabled ? <div className="icloud-empty">
          <span><KeyRound size={24} /></span><h3>{t('NAVER 邮箱功能尚未启用')}</h3>
          <p>{t('在 Worker Variables & Secrets 中配置至少 32 字节的 NAVER_MAIL_CREDENTIALS_KEY，然后重新部署。')}</p>
        </div> : loading ? <div className="gmail-list-state" role="status">
          <LoaderCircle className="spin" size={21} />{t('正在读取 NAVER 邮箱索引…')}
        </div> : !accounts.length ? <div className="gmail-list-state gmail-list-state--empty">
          <span><NaverMailIcon width={25} height={25} aria-hidden="true" /></span>
          <h2>{t('连接你的第一个 NAVER 邮箱')}</h2>
          <p>{t('使用 NAVER 邮箱应用专用密码，安全聚合最近的 INBOX 邮件。')}</p>
          <button className="button button--primary" type="button" onClick={() => setDialogMode('add')}>
            <Plus size={16} />{t('添加 NAVER 邮箱账号')}</button>
        </div> : !messages.length ? <div className="gmail-list-state gmail-list-state--empty">
          <span>{searchQuery ? <Search size={25} /> : <Mail size={25} />}</span>
          <h2>{t(searchQuery ? '未找到相关 NAVER 邮件' : '还没有已索引邮件')}</h2>
          <p>{t(searchQuery
            ? '请尝试其他发件人、收件人或主题关键词。'
            : '首次同步可能需要片刻；可在账号管理中手动加入同步任务。')}</p>
        </div> : <div className="message-list-shell"><div className="message-list" role="listbox"
          aria-label={t('NAVER 邮箱邮件列表')}>
          {messages.map((message) => {
            const active = selected?.id === message.id
            const sender = message.senderName || message.senderAddress || t('未知发件人')
            return <article className={`message-row${message.isRead ? '' : ' is-unread'}${active ? ' is-selected' : ''}`}
              role="option" aria-selected={active} key={message.id}>
              <button className="message-row__main" type="button" onClick={() => void selectMessage(message)}>
                <span className="message-row__top"><strong>{sender}</strong>
                  <time dateTime={new Date(message.date * 1000).toISOString()}>
                    {new Date(message.date * 1000).toLocaleDateString()}</time>
                  {!message.isRead && <span className="sr-only">{t('未读邮件')}</span>}</span>
                <span className="message-row__subject"><span className="message-row__subject-text">
                  {message.subject || t('无主题')}</span></span>
                <span className="message-row__preview">
                  {message.preview || t('邮件正文将在打开时按需读取')}</span>
                <span className="mailbox-hint"><NaverMailIcon width={12} height={12}
                  aria-hidden="true" />{message.account.name}</span>
                {message.hasAttachments && <span className="attachment-hint">
                  <Paperclip size={12} />{t('附件')}</span>}
              </button>
              {!message.isRead && <span className="message-row__unread-dot" aria-hidden="true" />}
            </article>
          })}
          {page.hasMore && <button className="gmail-load-more" type="button"
            disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore && <LoaderCircle className="spin" size={15} />}{t('加载更多')}</button>}
        </div></div>}
      </div>
    </section>

    <main className="reader-pane icloud-reader-pane gmail-reader-pane">
      <NaverMailReader selected={selected} message={detail} loading={detailLoading}
        error={detailError} remoteImagesEnabled={remoteImagesEnabled}
        onBack={() => { setSelected(null); setDetail(null); setDetailError('') }}
        onRetry={() => selected && void selectMessage(selected)} />
    </main>
    {dialogMode && <NaverMailAccountDialog accounts={accounts}
      startAdding={dialogMode === 'add'} onClose={closeDialog} onChanged={refresh} />}
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
  </div>
}
