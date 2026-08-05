import { AlertCircle, Check, LoaderCircle, Search, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { ConnectionError, PageLoader, PublicLanding, SetupPage } from './components/AuthPages'
import { DelayedScrollbar } from './components/DelayedScrollbar'
import { DraftComposer, useDraftEditor } from './components/DraftComposer'
import { DraftFolderContent } from './components/DraftFolderContent'
import { folderLabel, MailboxSidebar } from './components/MailboxSidebar'
import { MailboxSwitcher } from './components/MailboxSwitcher'
import { MailboxHeaderActions } from './components/MailboxHeaderActions'
import { MailDeleteDialog } from './components/MailDeleteDialog'
import { MessageList } from './components/MessageList'
import { MessageReader } from './components/MessageReader'
import { TemporaryInvitePage } from './components/TemporaryInvitePage'
import {
  api,
  ApiError,
  type AppConfig,
  type Folder,
  type ManagedDomain,
  type MailboxAddress,
  type MailCounts,
  type MailboxScope,
  type MessageDetail,
  type MessageSummary,
  type PageInfo,
  type User,
} from './lib/api'
import { isAdminRole } from './lib/roles'
import { deploymentGuideUnseen, markDeploymentGuideSeen } from './lib/deploymentGuide'
import { useMailboxRefresh } from './lib/useAutoRefresh'
import { openingSplashDelay } from './lib/initialSplash'
import { t, useLocale } from './lib/i18n'
import { bulkMessages, type BulkMessageAction } from './lib/messageActions'
import { errorMessage } from './lib/errorMessage'
import { shouldQuietRefreshFolder } from './lib/mailboxNavigation'
import { useSessionExpiry } from './lib/useSessionExpiry'
import { useNewMailNotifications } from './lib/useNewMailNotifications'
import { type AdminView, useWorkspaceNavigation } from './lib/workspaceNavigation'
const AdminWorkspace = lazy(async () => ({ default: (await import('./components/AdminWorkspace')).AdminWorkspace }))
const DeploymentWizard = lazy(async () => ({ default: (await import('./components/DeploymentWizard')).DeploymentWizard }))
const emptyCounts: MailCounts = { unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 }
const emptyPage: PageInfo = { hasMore: false, nextCursor: null, limit: 30 }
type PendingMailDelete = { kind: 'single'; message: MessageDetail }
  | { kind: 'bulk'; action: 'trash' | 'delete'; ids: string[] }

function Mailbox({
  user,
  config,
  onConfigChange,
  onUserChange,
  onLogout,
}: {
  user: User
  config: AppConfig
  onConfigChange: (config: AppConfig) => void
  onUserChange: (user: User) => void
  onLogout: () => Promise<void>
}) {
  const { folder, adminView, openFolder, openAdminView } = useWorkspaceNavigation(user.role)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())
  const [messageVersion, setMessageVersion] = useState<number>()
  const [messagePage, setMessagePage] = useState<PageInfo>(emptyPage)
  const [mailboxes, setMailboxes] = useState<MailboxAddress[]>([])
  const [mailboxesLoaded, setMailboxesLoaded] = useState(false)
  const [domains, setDomains] = useState<ManagedDomain[]>([])
  const [scope, setScope] = useState<MailboxScope>({ type: 'all' })
  const [counts, setCounts] = useState<MailCounts>(emptyCounts)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MessageDetail | null>(null)
  const [thread, setThread] = useState<MessageSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingMailDelete, setPendingMailDelete] = useState<PendingMailDelete | null>(null)
  const messageRequestId = useRef(0)
  const draftEditor = useDraftEditor()
  const [deploymentWizardOpen, setDeploymentWizardOpen] = useState(() => deploymentGuideUnseen(user))
  const mailNotifications = useNewMailNotifications(user.id, setNotice, setError)
  function closeDeploymentWizard() {
    markDeploymentGuideSeen(); setDeploymentWizardOpen(false)
  }
  const loadMailboxes = useCallback(async () => {
    try {
      const result = await api.mailboxes()
      setMailboxes(result.mailboxes)
      setMailboxesLoaded(true)
      setScope((current) => {
        if (current.type === 'all') return current
        const active = result.mailboxes.filter((mailbox) => mailbox.isActive)
        const available = current.type === 'mailbox'
          ? active.some((mailbox) => mailbox.address === current.value)
          : active.some((mailbox) => mailbox.domain === current.value)
        return available ? current : { type: 'all' }
      })
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        await onLogout()
        return
      }
      setError(errorMessage(loadError))
    }
  }, [onLogout])
  const loadDomains = useCallback(async () => {
    try {
      const result = await api.domains()
      setDomains(result.domains)
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        await onLogout()
        return
      }
      setError(errorMessage(loadError))
    }
  }, [onLogout])
  const loadMailboxData = useCallback(async () => {
    await Promise.all([loadMailboxes(), loadDomains()])
  }, [loadDomains, loadMailboxes])
  const loadMessages = useCallback(async (quiet = false) => {
    const requestId = ++messageRequestId.current
    if (quiet) setRefreshing(true)
    else setListLoading(true)
    setError('')
    try {
      const result = await api.messages(
        folder, deferredQuery, scope, undefined, quiet ? messageVersion : undefined,
      )
      if (requestId !== messageRequestId.current || result.unchanged) return false
      await mailNotifications.track(quiet, result.messages, folder === 'inbox' && !deferredQuery && scope.type === 'all')
      if (requestId !== messageRequestId.current) return false
      setMessageVersion(result.version)
      setMessages(result.messages)
      setSelectedMessageIds((current) => new Set(
        [...current].filter((id) => result.messages.some((message) => message.id === id)),
      ))
      setMessagePage(result.page)
      setCounts(result.counts)
      if (selectedId && !result.messages.some((message) => message.id === selectedId)) {
        setSelectedId(null)
        setDetail(null)
        setThread([])
      }
    } catch (loadError) {
      if (requestId !== messageRequestId.current) return false
      if (loadError instanceof ApiError && loadError.status === 401) {
        await onLogout()
        return
      }
      setError(errorMessage(loadError))
    } finally {
      if (requestId === messageRequestId.current) { setListLoading(false); setRefreshing(false) }
    }
  }, [deferredQuery, folder, mailNotifications.track, messageVersion, onLogout, scope, selectedId])
  async function loadMoreMessages() {
    if (!messagePage.hasMore || !messagePage.nextCursor || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const result = await api.messages(
        folder,
        deferredQuery,
        scope,
        messagePage.nextCursor,
      )
      if (result.unchanged) return
      setMessages((items) => {
        const existing = new Set(items.map((item) => item.id))
        return [...items, ...result.messages.filter((item) => !existing.has(item.id))]
      })
      setMessagePage(result.page)
      setCounts(result.counts)
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        await onLogout()
        return
      }
      setError(errorMessage(loadError))
    } finally {
      setLoadingMore(false)
    }
  }
  useEffect(() => {
    setSelectedMessageIds(new Set())
    if (folder !== 'drafts') void loadMessages()
  }, [folder, deferredQuery, scope]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadMailboxData()
  }, [loadMailboxData])
  useMailboxRefresh(config.mailRefreshInterval, () => loadMessages(true), !adminView && folder !== 'drafts', messages, selectedId, detail?.status, selectMessage)
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])
  async function selectMessage(message: MessageSummary) {
    setSelectedId(message.id)
    setDetailLoading(true)
    setError('')
    try {
      const result = await api.message(message.id)
      setDetail(result.message)
      setThread(result.thread ?? [result.message])
      if (!message.isRead) {
        await api.updateMessage(message.id, { isRead: true })
        setMessages((items) => items.map((item) => (
          item.id === message.id ? { ...item, isRead: true } : item
        )))
        if (message.direction === 'incoming' && message.folder === 'inbox') {
          setCounts((current) => ({ ...current, unread: Math.max(0, current.unread - 1) }))
        }
        setDetail((current) => current ? { ...current, isRead: true } : current)
      }
    } catch (loadError) {
      setError(errorMessage(loadError))
      setDetail(null)
      setThread([])
    } finally {
      setDetailLoading(false)
    }
  }

  async function toggleStar(message: MessageSummary | MessageDetail) {
    const next = !message.isStarred
    await api.updateMessage(message.id, { isStarred: next })
    setMessages((items) => items.map((item) => (
      item.id === message.id ? { ...item, isStarred: next } : item
    )))
    setDetail((current) => current?.id === message.id ? { ...current, isStarred: next } : current)
    await loadMessages(true)
  }

  function toggleMessageSelection(message: MessageSummary, selected?: boolean) {
    setSelectedMessageIds((current) => {
      const next = new Set(current)
      const shouldSelect = selected ?? !next.has(message.id)
      if (!shouldSelect) next.delete(message.id)
      else if (next.size < 50) next.add(message.id)
      return next
    })
  }
  function selectAllLoadedMessages() {
    const selectable = messages.slice(0, 50)
    const allSelected = selectable.every((message) => selectedMessageIds.has(message.id))
    setSelectedMessageIds(allSelected
      ? new Set()
      : new Set(selectable.map((message) => message.id)))
  }

  async function applyBulkAction(action: BulkMessageAction, ids: string[]) {
    setBulkLoading(true)
    setError('')
    try {
      const result = await bulkMessages(ids, action)
      setSelectedMessageIds(new Set())
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null)
        setDetail(null)
        setThread([])
      }
      setNotice(t('已更新 {count} 封邮件', { count: result.updatedCount }))
      await loadMessages(true)
    } catch (bulkError) {
      setError(errorMessage(bulkError))
    } finally {
      setBulkLoading(false)
    }
  }

  async function runBulkAction(action: BulkMessageAction, selectedIds = [...selectedMessageIds]) {
    const ids = selectedIds
    if (!ids.length) return
    if (action === 'trash' || action === 'delete') {
      setPendingMailDelete({ kind: 'bulk', action, ids })
      return
    }
    await applyBulkAction(action, ids)
  }

  async function applySingleDelete(message: MessageDetail) {
    if (message.folder === 'trash') {
      await api.deleteMessage(message.id)
      setNotice(t('邮件已永久删除'))
    } else {
      await api.updateMessage(message.id, { folder: 'trash' })
      setNotice(t('邮件已移入垃圾箱'))
    }
    setSelectedId(null)
    setDetail(null)
    setThread([])
    await loadMessages(true)
  }

  function trashSelected() {
    if (detail) setPendingMailDelete({ kind: 'single', message: detail })
  }

  async function confirmMailDelete() {
    const pending = pendingMailDelete
    if (!pending) return
    setPendingMailDelete(null)
    if (pending.kind === 'single') {
      await applySingleDelete(pending.message)
    } else {
      await applyBulkAction(pending.action, pending.ids)
    }
  }

  async function restoreSelected() {
    if (!detail) return
    await api.updateMessage(detail.id, {
      folder: detail.direction === 'outgoing' ? 'sent' : 'inbox',
    })
    setSelectedId(null)
    setDetail(null)
    setThread([])
    setNotice(t('邮件已恢复'))
    await loadMessages(true)
  }

  function changeFolder(next: Folder) {
    const shouldQuietRefresh = shouldQuietRefreshFolder(folder, next, query)
    openFolder(next)
    setSelectedId(null)
    setDetail(null)
    setThread([])
    setQuery('')
    if (shouldQuietRefresh) {
      void loadMessages(true)
      return
    }
    setListLoading(true)
  }

  function changeScope(next: MailboxScope) {
    setListLoading(true)
    setScope(next)
    setSelectedId(null)
    setDetail(null)
    setThread([])
    setQuery('')
  }

  function changeAdminView(next: AdminView) {
    if (next !== 'account' && !isAdminRole(user.role)) return
    openAdminView(next)
    setScope({ type: 'all' })
    setSelectedId(null)
    setDetail(null)
    setThread([])
    setQuery('')
  }

  const changeDraftCount = useCallback((drafts: number) => setCounts((current) => ({ ...current, drafts })), [])
  const draftEditorInline = !adminView && folder === 'drafts' && draftEditor.draftId !== undefined
  return (
    <div className={`mail-layout ${selectedId || draftEditorInline ? 'has-selection' : ''} ${adminView ? 'has-admin-view' : ''}`}>
      <MailboxSidebar
        user={user}
        folder={folder}
        counts={counts}
        adminView={adminView}
        onFolderChange={changeFolder}
        onAdminViewChange={changeAdminView}
        onLogout={onLogout}
      />

      {adminView ? (
        <DelayedScrollbar className="admin-scroll-shell" resetKey={adminView}>
          <Suspense fallback={(
            <main className="admin-workspace">
              <div className="statistics-loading" role="status">
                <LoaderCircle className="spin" size={20} />{t('正在打开管理页面…')}
              </div>
            </main>
          )}>
            <AdminWorkspace
              key={adminView}
              view={adminView}
              user={user}
              config={config}
              mailboxes={mailboxes}
              domains={domains}
              onDomainsChanged={loadDomains}
              onConfigChange={onConfigChange}
              onUserChange={onUserChange}
              onLogout={onLogout}
              onOpenDeploymentWizard={() => setDeploymentWizardOpen(true)}
            />
          </Suspense>
        </DelayedScrollbar>
      ) : (
        <>
          <section
            className="list-pane page-content-enter"
            key={`${folder}:${scope.type}:${scope.type === 'all' ? '' : scope.value}`}
          >
        <header className="list-header">
          <div>
            {folder !== 'drafts' && <MailboxSwitcher
              mailboxes={mailboxes} loaded={mailboxesLoaded}
              domains={domains} scope={scope}
              canManage={isAdminRole(user.role) || user.canCreateMailboxes}
              onScopeChange={changeScope}
              onMailboxesChanged={loadMailboxData}
            />}
            <h1>{folderLabel(folder)}</h1>
          </div>
          <MailboxHeaderActions
            mailboxes={mailboxes} domains={domains} scope={scope}
            canGenerate={isAdminRole(user.role) || user.canCreateMailboxes}
            canCompose={config.replyEnabled && (user.role === 'super_admin' || user.canReply)}
            refreshing={refreshing} notifications={mailNotifications}
            onRefresh={() => folder === 'drafts'
              ? draftEditor.refresh()
              : void loadMessages(true)}
            onCopied={(address) => {
              setError('')
              setNotice(t('已复制：{address}', { address }))
            }}
            onCopyError={() => setError(t('无法访问剪贴板，请手动复制邮箱地址。'))}
            onMailboxCreated={async (mailbox) => {
              await loadMailboxData()
              changeScope({ type: 'mailbox', value: mailbox.address })
              setNotice(t('已生成：{address}', { address: mailbox.address }))
            }}
            onCompose={draftEditor.openNew}
          />
        </header>
        {folder !== 'drafts' && <label className="search-field">
          <Search size={17} />
          <span className="sr-only">{t('搜索邮件')}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('搜索发件人、主题或正文')}
            type="search"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={t('清除搜索')}><X size={15} /></button>
          )}
        </label>}
        {error && <p className="list-error" role="alert"><AlertCircle size={15} />{error}</p>}
        <DraftFolderContent
          active={folder === 'drafts'} refreshRequest={draftEditor.refreshRequest}
          selectedDraftId={draftEditor.draftId} onOpen={draftEditor.open} onCountChange={changeDraftCount} />
        {folder !== 'drafts' && <MessageList
          folder={folder} messages={messages}
          selectedId={selectedId} selectedIds={selectedMessageIds}
          loading={listLoading} bulkLoading={bulkLoading}
          showMailbox={scope.type !== 'mailbox'}
          page={messagePage} loadingMore={loadingMore}
          onSelect={(message) => void selectMessage(message)}
          onToggleSelection={toggleMessageSelection}
          onSetSelection={toggleMessageSelection}
          onSelectAll={selectAllLoadedMessages}
          onBulkAction={(action, ids) => void runBulkAction(action, ids)}
          onStar={(message) => void toggleStar(message)}
          onLoadMore={() => void loadMoreMessages()}
        />}
      </section>

      {!draftEditorInline && <main className="reader-pane">
        <MessageReader
          message={detail} emptyLabel={folder === 'drafts' ? '选择草稿继续编辑' : '选择一封邮件'}
          loading={detailLoading}
          thread={thread}
          replyEnabled={config.replyEnabled && (user.role === 'super_admin' || user.canReply)}
          translationEnabled={user.canTranslate} remoteImagesEnabled={config.remoteImagesEnabled}
          onBack={() => {
            setSelectedId(null)
            setDetail(null)
            setThread([])
          }}
          onStar={() => detail && void toggleStar(detail)}
          onTrash={() => void trashSelected()}
          onRestore={() => void restoreSelected()}
          onReplySent={() => { setNotice(t('回复已进入发送队列')); void loadMessages(true) }}
          canRetryFailedMessage={isAdminRole(user.role)}
          onRetryFailedMessage={() => { setDetail((current) => current ? { ...current, status: 'processing', processingError: null, deliveryStatus: 'queued' } : current); setNotice(t('邮件已重新进入发送队列')); void loadMessages(true) }}
          onSelectThread={(message) => void selectMessage(message)}
        />
      </main>}
        </>
      )}
      <DraftComposer
        draftId={draftEditor.draftId} instance={draftEditor.instance} inline={draftEditorInline}
        mailboxes={mailboxes} scope={scope} onChanged={draftEditor.refresh}
        onClose={draftEditor.close} onSent={() => { draftEditor.close(); setNotice(t('邮件已进入发送队列')) }} />
      {pendingMailDelete && (
        <MailDeleteDialog
          count={pendingMailDelete.kind === 'single' ? 1 : pendingMailDelete.ids.length}
          permanent={pendingMailDelete.kind === 'single'
            ? pendingMailDelete.message.folder === 'trash'
            : pendingMailDelete.action === 'delete'}
          onCancel={() => setPendingMailDelete(null)}
          onConfirm={() => void confirmMailDelete()}
        />
      )}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
      {deploymentWizardOpen && (
        <Suspense fallback={null}>
          <DeploymentWizard open onClose={closeDeploymentWizard} />
        </Suspense>
      )}
    </div>
  )
}

export function App() {
  useLocale()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState('')
  const [loadVersion, setLoadVersion] = useState(0)
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'))
  const clearSession = useSessionExpiry(user, loading, Boolean(inviteToken), setUser)

  useEffect(() => {
    if (!inviteToken) return
    const url = new URL(window.location.href)
    url.searchParams.delete('invite')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [inviteToken])

  useEffect(() => {
    let active = true
    setLoading(true)
    setConnectionError('')
    Promise.all([api.config(), api.session(), openingSplashDelay(loadVersion > 0)])
      .then(([nextConfig, session]) => {
        if (!active) return
        setConfig(nextConfig)
        setUser(session.user)
      })
      .catch((error) => {
        if (active) setConnectionError(errorMessage(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [loadVersion])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      clearSession()
    }
  }, [clearSession])
  if (loading) return <PageLoader />
  if (connectionError || !config) {
    return <ConnectionError message={connectionError || t('配置读取失败。')} retry={() => setLoadVersion((value) => value + 1)} />
  }
  if (!config.setupComplete) {
    return (
      <SetupPage
        superAdminEmail={config.superAdminEmail}
        requirements={config.setupRequirements}
        onAuthenticated={(nextUser) => {
          setUser(nextUser)
          setConfig({ ...config, setupComplete: true })
        }}
      />
    )
  }
  if (inviteToken && !user) {
    return (
      <TemporaryInvitePage
        token={inviteToken}
        appName={config.appName}
        turnstileSiteKey={config.turnstileSiteKey}
        onAuthenticated={setUser}
      />
    )
  }
  if (!user) {
    return (
      <PublicLanding
        appName={config.appName}
        registrationEnabled={config.registrationAvailable}
        registrationMethod={config.registrationMethod}
        linuxDoLoginEnabled={config.linuxDoLoginEnabled}
        registrationDomainPolicy={config.registrationDomainPolicy}
        turnstileSiteKey={config.turnstileSiteKey}
        onAuthenticated={setUser}
      />
    )
  }
  return <Mailbox user={user} config={config} onConfigChange={setConfig} onUserChange={setUser} onLogout={logout} />
}
