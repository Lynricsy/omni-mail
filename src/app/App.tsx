import { AlertCircle, Check, LoaderCircle, Search, Sparkles, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ConnectionError, PageLoader, PublicLanding, SetupPage } from '../features/auth/components/AuthPages'
import { DelayedScrollbar } from '../shared/ui/scroll/DelayedScrollbar'
import { DraftComposer, useDraftEditor } from '../features/drafts/components/DraftComposer'
import { DraftFolderContent } from '../features/drafts/components/DraftFolderContent'
import { folderLabel, MailboxSidebar } from '../features/mailbox/components/MailboxSidebar'
import { MailboxSwitcher } from '../features/mailbox/components/MailboxSwitcher'
import { MailboxHeaderActions, MailboxHeaderUtilities } from '../features/mailbox/components/MailboxHeaderActions'
import { MailDeleteDialog } from '../features/mailbox/components/MailDeleteDialog'
import { ListScrollTopHeading } from '../shared/ui/mail-workspace/ListScrollTopHeading'
import { MessageList } from '../features/messages/components/MessageList'
import { MessageReader } from '../features/messages/components/MessageReader'
import { useMailListScroll } from '../shared/ui/mail-workspace/hooks/useMailListScroll'
import {
  api, ApiError,
  type AppConfig, type Folder, type ManagedDomain, type MailboxAddress,
  type MailboxScope, type User,
} from '../shared/api'
import { isAdminRole } from '../shared/auth/roles'
import { deploymentGuideUnseen, markDeploymentGuideSeen } from '../features/deployment/model/deploymentGuide'
import { openingSplashDelay } from './startup/initialSplash'
import { t, useLocale, useTranslationsReady } from '../shared/i18n'
import { errorMessage } from '../shared/api/errorMessage'
import { shouldQuietRefreshFolder } from '../features/mailbox/model/mailboxNavigation'
import { useMailboxMessages } from '../features/mailbox/hooks/useMailboxMessages'
import { useMessageSearch } from '../features/mailbox/hooks/useMessageSearch'
import { useSessionExpiry } from '../features/auth/hooks/useSessionExpiry'
import { useNewMailNotifications } from '../features/mailbox/hooks/useNewMailNotifications'
import { type AdminView, useWorkspaceNavigation } from './navigation/workspaceNavigation'
const AdminWorkspace = lazy(async () => ({ default: (await import('../features/admin/shell/AdminWorkspace')).AdminWorkspace }))
const DeploymentWizard = lazy(async () => ({ default: (await import('../features/deployment/components/DeploymentWizard')).DeploymentWizard }))
const ICloudWorkspace = lazy(async () => ({ default: (await import('../features/icloud/components/ICloudWorkspace')).ICloudWorkspace }))
const LinuxDoMailWorkspace = lazy(async () => ({ default: (await import('../features/linux-do-mail/components/LinuxDoMailWorkspace')).LinuxDoMailWorkspace }))
const GmailWorkspace = lazy(async () => ({ default: (await import('../features/gmail/components/GmailWorkspace')).GmailWorkspace }))
const MicrosoftWorkspace = lazy(async () => ({ default: (await import('../features/microsoft/components/MicrosoftWorkspace')).MicrosoftWorkspace }))
const QqMailWorkspace = lazy(async () => ({ default: (await import('../features/qq-mail/components/QqMailWorkspace')).QqMailWorkspace }))
const NaverMailWorkspace = lazy(async () => ({ default: (await import('../features/naver-mail/components/NaverMailWorkspace')).NaverMailWorkspace }))
const YandexMailWorkspace = lazy(async () => ({ default: (await import('../features/yandex-mail/components/YandexMailWorkspace')).YandexMailWorkspace }))
const ExtensionAuthorizationPage = lazy(async () => ({ default: (await import('../features/extension-authorization/components/ExtensionAuthorizationPage')).ExtensionAuthorizationPage }))
const TemporaryInvitePage = lazy(async () => ({ default: (await import('../features/temporary-invites/components/TemporaryInvitePage')).TemporaryInvitePage }))
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
  const workspaceFeatures = { iCloudWorkspaceEnabled: config.iCloudWorkspaceEnabled, linuxDoMailWorkspaceEnabled: config.linuxDoMailWorkspaceEnabled, gmailWorkspaceEnabled: config.gmailWorkspaceEnabled, microsoftWorkspaceEnabled: config.microsoftWorkspaceEnabled, qqMailWorkspaceEnabled: config.qqMailWorkspaceEnabled, naverMailWorkspaceEnabled: config.naverMailWorkspaceEnabled, yandexMailWorkspaceEnabled: config.yandexMailWorkspaceEnabled }
  const { folder, adminView, openFolder, openAdminView } = useWorkspaceNavigation(user.role, workspaceFeatures)
  const [query, setQuery] = useState('')
  const [searchQuery, nextMessageSignal] = useMessageSearch(query)
  const [mailboxes, setMailboxes] = useState<MailboxAddress[]>([])
  const [mailboxesLoaded, setMailboxesLoaded] = useState(false)
  const [domains, setDomains] = useState<ManagedDomain[]>([])
  const [scope, setScope] = useState<MailboxScope>({ type: 'all' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [availableVersion, setAvailableVersion] = useState('')
  const mailListScroll = useMailListScroll()
  const draftEditor = useDraftEditor()
  const [deploymentWizardOpen, setDeploymentWizardOpen] = useState(() => deploymentGuideUnseen(user))
  const mailNotifications = useNewMailNotifications(user.id, setNotice, setError)
  const {
    messages, selectedMessageIds, messagePage, counts, selectedId, detail, thread,
    listLoading, detailLoading, refreshing, loadingMore, bulkLoading, pendingMailDelete,
    clearSelectedMessage, loadMessages, loadMoreMessages, selectMessage, toggleStar,
    toggleMessageSelection, selectAllLoadedMessages, runBulkAction, requestSelectedDelete,
    confirmMailDelete, restoreSelected, changeDraftCount, markSelectedMessageRetrying,
    cancelMailDelete, beginListLoading,
  } = useMailboxMessages({
    folder,
    searchQuery,
    scope,
    refreshInterval: config.mailRefreshInterval,
    refreshEnabled: !adminView && folder !== 'drafts',
    nextMessageSignal,
    trackNotifications: mailNotifications.track,
    onLogout,
    setError,
    setNotice,
  })
  function closeDeploymentWizard() { markDeploymentGuideSeen(); setDeploymentWizardOpen(false) }
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
  useEffect(() => {
    void loadMailboxData()
  }, [loadMailboxData])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => {
    if (!isAdminRole(user.role)) return
    let active = true
    api.systemVersion()
      .then((version) => {
        if (active && version.updateAvailable && version.latestVersion) {
          setAvailableVersion(version.latestVersion)
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [user.role])
  useEffect(() => {
    if (!availableVersion) return
    const timer = window.setTimeout(() => setAvailableVersion(''), 5000)
    return () => window.clearTimeout(timer)
  }, [availableVersion])
  function changeFolder(next: Folder) {
    const shouldQuietRefresh = shouldQuietRefreshFolder(folder, next, query)
    openFolder(next)
    clearSelectedMessage()
    setQuery('')
    if (shouldQuietRefresh) {
      void loadMessages(true)
      return
    }
    beginListLoading()
  }

  function changeScope(next: MailboxScope) {
    beginListLoading()
    setScope(next)
    clearSelectedMessage()
    setQuery('')
  }

  function changeAdminView(next: AdminView) {
    if (next !== 'account' && next !== 'api' && next !== 'icloud' && next !== 'linuxdo-mail' && next !== 'gmail' && next !== 'microsoft' && next !== 'qq-mail' && next !== 'naver-mail' && next !== 'yandex-mail' && !isAdminRole(user.role)) return
    openAdminView(next)
    setScope({ type: 'all' })
    clearSelectedMessage()
    setQuery('')
  }
  const draftEditorInline = !adminView && folder === 'drafts' && draftEditor.draftId !== undefined
  return (
    <div className={`mail-layout ${selectedId || draftEditorInline ? 'has-selection' : ''} ${adminView ? 'has-admin-view' : ''}`}>
      <MailboxSidebar user={user} folder={folder}
        counts={counts} adminView={adminView} notifications={mailNotifications}
        iCloudWorkspaceEnabled={config.iCloudWorkspaceEnabled} linuxDoMailWorkspaceEnabled={config.linuxDoMailWorkspaceEnabled} gmailWorkspaceEnabled={config.gmailWorkspaceEnabled} microsoftWorkspaceEnabled={config.microsoftWorkspaceEnabled} qqMailWorkspaceEnabled={config.qqMailWorkspaceEnabled} naverMailWorkspaceEnabled={config.naverMailWorkspaceEnabled} yandexMailWorkspaceEnabled={config.yandexMailWorkspaceEnabled} onFolderChange={changeFolder}
        onAdminViewChange={changeAdminView}
        onLogout={onLogout}
      />
      {adminView === 'microsoft' ? <Suspense fallback={null}><MicrosoftWorkspace enabled={config.microsoftEnabled} remoteImagesEnabled={config.remoteImagesEnabled} /></Suspense>
        : adminView === 'qq-mail' ? <Suspense fallback={null}><QqMailWorkspace enabled={config.qqMailEnabled} remoteImagesEnabled={config.remoteImagesEnabled} canSend={user.role === 'super_admin' || user.canReply} /></Suspense>
        : adminView === 'naver-mail' ? <Suspense fallback={null}><NaverMailWorkspace enabled={config.naverMailEnabled} remoteImagesEnabled={config.remoteImagesEnabled} /></Suspense>
        : adminView === 'yandex-mail' ? <Suspense fallback={null}><YandexMailWorkspace enabled={config.yandexMailEnabled} remoteImagesEnabled={config.remoteImagesEnabled} /></Suspense>
        : adminView === 'gmail' ? <Suspense fallback={null}><GmailWorkspace enabled={config.gmailEnabled} remoteImagesEnabled={config.remoteImagesEnabled} /></Suspense>
        : adminView === 'linuxdo-mail' ? <Suspense fallback={null}><LinuxDoMailWorkspace remoteImagesEnabled={config.remoteImagesEnabled} canSend={user.role === 'super_admin' || user.canReply} /></Suspense>
        : adminView === 'icloud' ? (
        <Suspense fallback={(
          <div className="icloud-mail-view"><section className="list-pane icloud-list-pane"><div className="icloud-workspace-loading" role="status">
            <span className="icloud-workspace-loading__icon"><LoaderCircle className="spin" size={18} /></span><span><strong>{t('正在打开 iCloud 收件箱…')}</strong><small>{t('正在准备邮件布局')}</small></span>
          </div></section><main className="reader-pane" /></div>
        )}>
          <ICloudWorkspace userId={user.id} enabled={config.iCloudEnabled} remoteImagesEnabled={config.remoteImagesEnabled} />
        </Suspense>
      ) : adminView ? (
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
              onOpenApiGuide={() => changeAdminView('api')}
              onOpenICloud={() => changeAdminView('icloud')}
              onOpenDeploymentWizard={() => setDeploymentWizardOpen(true)}
            />
          </Suspense>
        </DelayedScrollbar>
      ) : (
        <>
          <section
            ref={mailListScroll.listPane}
            className="list-pane page-content-enter"
            key={`${folder}:${scope.type}:${scope.type === 'all' ? '' : scope.value}`}
          >
        <header className="list-header mailbox-list-header">
          <div className="list-header__scope-row">
            {folder !== 'drafts' && <MailboxSwitcher
              mailboxes={mailboxes} loaded={mailboxesLoaded}
              domains={domains} scope={scope}
              canManage={isAdminRole(user.role) || user.canCreateMailboxes}
              onScopeChange={changeScope} onMailboxesChanged={loadMailboxData}
            />}
            <MailboxHeaderUtilities notifications={mailNotifications} />
          </div>
          <div className="list-header__title-row">
            <ListScrollTopHeading title={folderLabel(folder)}
              onScrollTop={mailListScroll.scrollToTop} />
            <MailboxHeaderActions
              mailboxes={mailboxes} domains={domains} scope={scope}
              canGenerate={isAdminRole(user.role) || user.canCreateMailboxes} randomMailboxPrefix={config.randomMailboxPrefix || ''}
              canCompose={config.replyEnabled && (user.role === 'super_admin' || user.canReply)}
              refreshing={refreshing}
              onRefresh={() => folder === 'drafts' ? draftEditor.refresh() : void loadMessages(true)}
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
          </div>
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
            clearSelectedMessage()
          }}
          onStar={() => detail && void toggleStar(detail)}
          onTrash={requestSelectedDelete}
          onRestore={() => void restoreSelected()}
          onReplySent={() => { setNotice(t('回复已进入发送队列')); void loadMessages(true) }}
          canRetryFailedMessage={isAdminRole(user.role)}
          onRetryFailedMessage={() => { markSelectedMessageRetrying(); setNotice(t('邮件已重新进入发送队列')); void loadMessages(true) }}
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
          onCancel={cancelMailDelete}
          onConfirm={() => void confirmMailDelete()}
        />
      )}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
      {availableVersion && (
        <div className="toast toast--update" role="status" aria-live="polite">
          <Sparkles size={16} aria-hidden="true" />
          {t('发现新版本 {version}', { version: `v${availableVersion}` })}
        </div>
      )}
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
  const localeReady = useTranslationsReady()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectionError, setConnectionError] = useState('')
  const [loadVersion, setLoadVersion] = useState(0)
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'))
  const extensionAuthorization = window.location.pathname === '/extension/authorize'
  const clearSession = useSessionExpiry(user, loading, Boolean(inviteToken) || extensionAuthorization, setUser)
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
  if (loading || !localeReady) return <PageLoader />
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
      <Suspense fallback={<PageLoader />}>
        <TemporaryInvitePage
          token={inviteToken}
          appName={config.appName}
          turnstileSiteKey={config.turnstileSiteKey}
          onAuthenticated={setUser}
        />
      </Suspense>
    )
  } else if (extensionAuthorization) return (
    <Suspense fallback={<PageLoader />}>
      <ExtensionAuthorizationPage config={config} user={user} onAuthenticated={setUser} onLogout={logout} />
    </Suspense>
  )
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
