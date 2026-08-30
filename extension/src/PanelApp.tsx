import {
  AlertCircle,
  Check,
  Inbox,
  MailPlus,
  Settings,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OmniLogo } from '../../src/shared/ui/brand/OmniLogo'
import type {
  AppConfig,
  ManagedDomain,
  MailboxAddress,
  MessageDetail,
  MessageSummary,
} from '../../src/shared/api/api-types'
import { useAutoRefresh } from '../../src/shared/hooks/useAutoRefresh'
import {
  randomMailboxLocalPart,
  validMailboxLocalPart,
} from '../../src/features/mailbox/model/mailboxAddress'
import { GenerateView } from './PanelGenerate'
import { InboxView } from './PanelInbox'
import { PanelScrollbar } from './PanelScrollbar'
import { LoginView, NavButton, SettingsView } from './PanelViews'
import {
  type AuthStatus,
  type ExtensionSettings,
  type InboxResult,
  type MailSourcesResult,
  type ThemePreference,
  sendExtensionMessage,
} from './protocol'
import { setPanelTheme } from './theme'
import { usePanelICloud } from './usePanelICloud'
import { usePanelMailSources } from './usePanelMailSources'

type View = 'generate' | 'inbox' | 'settings'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试。'
}
export function PanelApp() {
  const mainRef = useRef<HTMLElement>(null)
  const messageRequestId = useRef(0)
  const detailRequestId = useRef(0)
  const [view, setView] = useState<View>(() => location.hash === '#inbox' ? 'inbox' : 'generate')
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [settings, setSettings] = useState<ExtensionSettings>({
    floatingEnabled: true,
    theme: 'system',
  })
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [mailboxes, setMailboxes] = useState<MailboxAddress[]>([])
  const [domains, setDomains] = useState<ManagedDomain[]>([])
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [selectedMailbox, setSelectedMailbox] = useState('')
  const [selectedMessage, setSelectedMessage] = useState<MessageDetail | null>(null)
  const [domain, setDomain] = useState('')
  const [localPart, setLocalPart] = useState('')
  const [generatedAddress, setGeneratedAddress] = useState('')
  const sourceState = usePanelMailSources(auth?.apiOrigin || '')
  const { apply: applySources, reset: resetSources } = sourceState
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const iCloud = usePanelICloud({
    active: (view === 'generate' && sourceState.generateSource === 'icloud')
      || (view === 'inbox' && sourceState.inboxSource === 'icloud'),
    authorized: Boolean(auth?.iCloudAuthorized),
    enabled: Boolean(config?.iCloudEnabled),
    onError: setError,
    onNotice: setNotice,
  })

  const enabledDomains = useMemo(() => domains.filter((item) => item.isActive), [domains])
  const canGenerate = Boolean(auth?.user && (
    ['super_admin', 'admin'].includes(auth.user.role) || auth.user.canCreateMailboxes
  ))
  const currentMailbox = selectedMailbox || mailboxes.find((item) => item.isPrimary)?.address || ''
  const generateAddress = generatedAddress || currentMailbox
  const generateMessages = messages.filter((message) => message.mailboxAddress === generateAddress)

  const loadMessages = useCallback(async (mailbox = selectedMailbox, quiet = false) => {
    const requestId = ++messageRequestId.current
    quiet ? setRefreshing(true) : setLoading(true)
    setError('')
    try {
      const result = await sendExtensionMessage<InboxResult>({
        type: 'api:messages', mailbox: mailbox || undefined,
      })
      if (requestId === messageRequestId.current) setMessages(result.messages)
    } catch (loadError) {
      if (requestId === messageRequestId.current) setError(errorText(loadError))
    } finally {
      if (requestId === messageRequestId.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [selectedMailbox])

  const loadMailboxData = useCallback(async () => {
    const [mailboxResult, domainResult] = await Promise.all([
      sendExtensionMessage<{ mailboxes: MailboxAddress[] }>({ type: 'api:mailboxes' }),
      sendExtensionMessage<{ domains: ManagedDomain[] }>({ type: 'api:domains' }),
    ])
    setMailboxes(mailboxResult.mailboxes)
    setDomains(domainResult.domains)
    setDomain((current) => domainResult.domains.some((item) => item.isActive && item.name === current)
      ? current
      : domainResult.domains.find((item) => item.isActive)?.name || '')
    return mailboxResult.mailboxes
  }, [])

  const loadAuthenticatedData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextConfig, nextMailboxes, sourceResult] = await Promise.all([
        sendExtensionMessage<AppConfig>({ type: 'api:config' }),
        loadMailboxData(),
        sendExtensionMessage<MailSourcesResult>({ type: 'api:mail-sources' }),
      ])
      setConfig(nextConfig)
      applySources(sourceResult)
      const saved = await chrome.storage.local.get(['lastMailbox'])
      const savedMailbox = typeof saved.lastMailbox === 'string' ? saved.lastMailbox : ''
      const nextMailbox = nextMailboxes.some((item) => item.address === savedMailbox)
        ? savedMailbox
        : ''
      setSelectedMailbox(nextMailbox)
      await loadMessages(nextMailbox)
    } catch (loadError) {
      setError(errorText(loadError))
    } finally {
      setLoading(false)
    }
  }, [applySources, loadMailboxData, loadMessages])

  useEffect(() => {
    let active = true
    Promise.all([
      sendExtensionMessage<AuthStatus>({ type: 'auth:status' }),
      sendExtensionMessage<ExtensionSettings>({ type: 'settings:get' }),
    ]).then(([nextAuth, nextSettings]) => {
      if (!active) return
      setAuth(nextAuth)
      setSettings(nextSettings)
      if (nextAuth.authenticated) void loadAuthenticatedData()
      else setLoading(false)
    }).catch((loadError) => {
      if (active) {
        setError(errorText(loadError))
        setLoading(false)
      }
    })
    return () => { active = false }
  }, [loadAuthenticatedData])

  useEffect(() => {
    const handleAuthStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'session' || (!changes.refreshToken && !changes.user)) return
      void sendExtensionMessage<AuthStatus>({ type: 'auth:status' }).then((nextAuth) => {
        setAuth(nextAuth)
        if (nextAuth.authenticated) return
        detailRequestId.current += 1
        messageRequestId.current += 1
        setMailboxes([])
        setDomains([])
        setMessages([])
        resetSources()
        setSelectedMessage(null)
        setLoading(false)
      }).catch((authError) => setError(errorText(authError)))
    }
    chrome.storage.onChanged.addListener(handleAuthStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleAuthStorageChange)
  }, [resetSources])
  useEffect(() => () => {
    messageRequestId.current += 1
    detailRequestId.current += 1
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2400)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [sourceState.generateSource, sourceState.inboxSource, view])

  const refreshMailbox = view === 'generate' ? generateAddress : selectedMailbox
  const omniMailVisible = (view === 'generate' && sourceState.generateSource === 'omnimail')
    || (view === 'inbox' && sourceState.inboxSource === 'omnimail')
  useAutoRefresh(
    config?.mailRefreshInterval ?? 0,
    () => loadMessages(refreshMailbox, true),
    Boolean(auth?.authenticated && config?.mailRefreshInterval && omniMailVisible),
    false,
  )

  async function login(input: { apiOrigin: string }) {
    setLoading(true)
    setError('')
    try {
      const nextAuth = await sendExtensionMessage<AuthStatus>({ type: 'auth:authorize', ...input })
      setAuth(nextAuth)
      await loadAuthenticatedData()
    } catch (loginError) {
      setError(errorText(loginError))
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    messageRequestId.current += 1
    detailRequestId.current += 1
    setLoading(true)
    try {
      await sendExtensionMessage({ type: 'auth:logout' })
      setAuth((current) => ({
        apiOrigin: current?.apiOrigin || '',
        authenticated: false,
        iCloudAuthorized: false,
        mailSourcesAuthorized: false,
        user: null,
      }))
      setMailboxes([])
      setMessages([])
      resetSources()
      setSelectedMessage(null)
    } finally {
      setLoading(false)
    }
  }

  async function generateMailbox() {
    if (!domain || generating) return
    const requestedLocalPart = localPart.trim().toLowerCase()
    if (requestedLocalPart && !validMailboxLocalPart(requestedLocalPart)) {
      setError('邮箱前缀支持字母、数字、点、下划线、加号和连字符，长度为 1–64 个字符。')
      return
    }
    setGenerating(true)
    setError('')
    const maximumAttempts = requestedLocalPart ? 1 : 3
    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      try {
        const address = `${requestedLocalPart
          || randomMailboxLocalPart(config?.randomMailboxPrefix || '')}@${domain}`
        const result = await sendExtensionMessage<{ mailbox: MailboxAddress }>({
          type: 'api:create-mailbox', address,
        })
        setLocalPart('')
        setGeneratedAddress(result.mailbox.address)
        await loadMailboxData()
        setSelectedMailbox(result.mailbox.address)
        await chrome.storage.local.set({ lastMailbox: result.mailbox.address })
        await loadMessages(result.mailbox.address, true)
        setNotice('邮箱已生成')
        setGenerating(false)
        return
      } catch (generateError) {
        if (attempt < maximumAttempts - 1 && /已经|属于|占用/.test(errorText(generateError))) continue
        setError(errorText(generateError))
        break
      }
    }
    setGenerating(false)
  }

  async function generateICloudAlias(label: string): Promise<string> {
    const address = await iCloud.createAlias(label)
    if (address) {
      window.requestAnimationFrame(() => {
        const panel = mainRef.current
        panel?.scrollTo({
          top: panel.scrollHeight,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      })
    }
    return address
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address)
      setNotice('邮箱地址已复制')
    } catch {
      setError('无法访问剪贴板，请手动复制。')
    }
  }

  async function fillAddress(address: string) {
    try {
      await sendExtensionMessage({ type: 'page:fill-email', email: address })
      setNotice('已填入当前网页')
    } catch (fillError) {
      setError(errorText(fillError))
    }
  }

  async function changeMailbox(address: string) {
    detailRequestId.current += 1
    setSelectedMailbox(address)
    setGeneratedAddress('')
    setSelectedMessage(null)
    await chrome.storage.local.set({ lastMailbox: address })
    await loadMessages(address)
  }

  async function openMessage(message: MessageSummary) {
    const requestId = ++detailRequestId.current
    setDetailLoading(true)
    setError('')
    try {
      const result = await sendExtensionMessage<{ message: MessageDetail; thread: MessageSummary[] }>({
        type: 'api:message', id: message.id,
      })
      if (requestId !== detailRequestId.current) return
      setSelectedMessage(result.message)
      if (!message.isRead) {
        try {
          await sendExtensionMessage({ type: 'api:mark-read', id: message.id })
          setMessages((items) => items.map((item) => item.id === message.id
            ? { ...item, isRead: true }
            : item))
        } catch (readError) {
          if (requestId === detailRequestId.current) setError(errorText(readError))
        }
      }
    } catch (loadError) {
      if (requestId === detailRequestId.current) setError(errorText(loadError))
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false)
    }
  }

  async function toggleFloating(enabled: boolean) {
    setSettings((current) => ({ ...current, floatingEnabled: enabled }))
    try {
      await sendExtensionMessage({ type: 'settings:set-floating', enabled })
      setNotice(enabled ? '已启用网页悬浮按钮' : '已关闭网页悬浮按钮')
    } catch (settingsError) {
      setSettings((current) => ({ ...current, floatingEnabled: !enabled }))
      setError(errorText(settingsError))
    }
  }

  async function changeTheme(theme: ThemePreference) {
    const previous = settings.theme
    setSettings((current) => ({ ...current, theme }))
    setPanelTheme(theme)
    try {
      await sendExtensionMessage({ type: 'settings:set-theme', theme })
      setNotice(theme === 'system'
        ? '主题已设为跟随系统'
        : '已切换为' + (theme === 'light' ? '亮色' : '暗色') + '主题')
    } catch (settingsError) {
      setSettings((current) => ({ ...current, theme: previous }))
      setPanelTheme(previous)
      setError(errorText(settingsError))
    }
  }

  if (!auth?.authenticated) {
    return <div className="panel-content login-scroll-shell">
      <main className="panel-main" ref={mainRef}>
        <LoginView apiOrigin={auth?.apiOrigin || ''} busy={loading} error={error} onLogin={login} />
      </main>
      <PanelScrollbar scrollRef={mainRef} />
    </div>
  }

  return (
    <div className="panel-shell">
      <nav className="panel-nav" aria-label="OmniMail 功能">
        <div className="panel-brand" title={config?.appName || 'OmniMail'}><OmniLogo size={23} /></div>
        <NavButton active={view === 'generate'} icon={<MailPlus />} label="生成" onClick={() => setView('generate')} />
        <NavButton active={view === 'inbox'} icon={<Inbox />} label="收件" onClick={() => setView('inbox')} />
        <NavButton active={view === 'settings'} icon={<Settings />} label="设置" onClick={() => setView('settings')} />
      </nav>

      <div className="panel-content">
        <main className="panel-main" ref={mainRef}>
          {error && <div className="panel-alert" role="alert"><AlertCircle size={15} /><span>{error}</span><button type="button" onClick={() => setError('')}>关闭</button></div>}
          <div className="panel-view" key={view}>
          {view === 'generate' && (
            <GenerateView
              source={sourceState.generateSource}
              sources={sourceState.generateSources}
              domains={enabledDomains}
              domain={domain}
              localPart={localPart}
              generatedAddress={generatedAddress}
              fallbackAddress={currentMailbox}
              messages={generateMessages}
              canGenerate={canGenerate}
              busy={generating}
              mailLoading={loading}
              refreshing={refreshing}
              refreshInterval={config?.mailRefreshInterval ?? 0}
              randomMailboxPrefix={config?.randomMailboxPrefix || ''}
              iCloudEnabled={config?.iCloudEnabled ?? false}
              iCloudAuthorized={auth.iCloudAuthorized}
              iCloudAccounts={iCloud.accounts}
              iCloudAccountId={iCloud.accountId}
              iCloudAliases={iCloud.aliases}
              iCloudSelectedAlias={iCloud.selectedAlias}
              iCloudBusy={loading}
              iCloudCreating={iCloud.creating}
              iCloudLoadingAccounts={iCloud.loadingAccounts}
              iCloudLoadingAliases={iCloud.loadingAliases}
              onSource={sourceState.setGenerateSource}
              onDomain={setDomain}
              onLocalPart={setLocalPart}
              onGenerate={generateMailbox}
              onICloudAccount={(accountId) => void iCloud.selectAccount(accountId)}
              onICloudAlias={iCloud.selectAlias}
              onICloudGenerate={generateICloudAlias}
              onICloudOpenWeb={() => sourceState.openWeb('icloud')}
              onICloudReauthorize={() => void login({ apiOrigin: auth.apiOrigin })}
              onICloudRetry={() => void iCloud.loadAccounts()}
              onICloudRetryAliases={() => void iCloud.loadAliases()}
              onCopy={copyAddress}
              onFill={fillAddress}
              onRefresh={() => loadMessages(generateAddress, true)}
              onSelect={(message) => {
                sourceState.setInboxSource('omnimail')
                setView('inbox')
                void openMessage(message)
              }}
            />
          )}
          {view === 'inbox' && (
            <InboxView
              source={sourceState.inboxSource}
              sources={sourceState.sources}
              unavailableSources={sourceState.unavailable}
              upgradeRequired={sourceState.upgradeRequired}
              messages={messages}
              mailboxes={mailboxes.filter((item) => item.isActive)}
              mailbox={selectedMailbox}
              selected={selectedMessage}
              loading={loading || detailLoading}
              refreshing={refreshing}
              iCloudEnabled={config?.iCloudEnabled ?? false}
              iCloudAuthorized={auth.iCloudAuthorized}
              iCloudAccounts={iCloud.accounts}
              iCloudAccountId={iCloud.accountId}
              iCloudAliases={iCloud.aliases}
              iCloudPreferredAlias={iCloud.selectedAlias}
              iCloudLoadingAccounts={iCloud.loadingAccounts}
              iCloudLoadingAliases={iCloud.loadingAliases}
              onSource={sourceState.setInboxSource}
              onOpenSourceWeb={sourceState.openWeb}
              onUpgradeAuthorization={() => void login({ apiOrigin: auth.apiOrigin })}
              onICloudAccount={(accountId) => void iCloud.selectAccount(accountId)}
              onICloudOpenWeb={() => sourceState.openWeb('icloud')}
              onICloudReauthorize={() => void login({ apiOrigin: auth.apiOrigin })}
              onMailbox={changeMailbox}
              onRefresh={() => loadMessages(selectedMailbox, true)}
              onSelect={openMessage}
              onBack={() => { detailRequestId.current += 1; setSelectedMessage(null) }}
            />
          )}
          {view === 'settings' && (
            <SettingsView
              auth={auth}
              settings={settings}
              onToggleFloating={toggleFloating}
              onTheme={(theme) => void changeTheme(theme)}
              onOpenWeb={() => void chrome.tabs.create({ url: auth.apiOrigin })}
              onLogout={logout}
            />
          )}
          </div>
        </main>
        <PanelScrollbar scrollRef={mainRef} />
      </div>
      {notice && <div className="panel-toast" role="status"><Check size={15} />{notice}</div>}
    </div>
  )
}
