import {
  AlertCircle,
  AtSign,
  Check,
  Cloud,
  Copy,
  Inbox,
  KeyRound,
  LoaderCircle,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  api,
  type ICloudAccount,
  type ICloudAlias,
  type ICloudMessage,
} from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import '../styles/icloud-region-select.css'
import '../../../shared/ui/mail-workspace/styles/scope-switcher.css'
import '../../../shared/ui/mail-workspace/styles/workspace.css'
import {
  activateICloudMailCacheUser,
  clearICloudAccountCache,
  readICloudInboxCache,
  readICloudMessageCache,
  writeICloudInboxCache,
  writeICloudMessageCache,
  type ICloudInboxScope,
} from '../model/icloudMailCache'
import { parseICloudSender } from '../../../shared/mail/sender'
import { t } from '../../../shared/i18n'
import { notificationDeepLink } from '../../../shared/mail/notificationDeepLink'
import { useMailListScroll } from '../../../shared/ui/mail-workspace/hooks/useMailListScroll'
import {
  AddICloudAccountDialog,
  ICloudModal,
  ICloudAccountSettingsDialog,
} from './ICloudAccountDialogs'
import { ICloudScopeSwitcher } from './ICloudScopeSwitcher'
import { ICloudReader } from './ICloudReader'
import { ICloudSearchField } from './ICloudSearchField'
import { ICloudAliasBatchForm } from './ICloudAliasBatchForm'
import { ListScrollTopHeading } from '../../../shared/ui/mail-workspace/ListScrollTopHeading'

function Spinner({ size = 17 }: { size?: number }) {
  return <LoaderCircle className="spin" size={size} aria-hidden="true" />
}

function Empty({ icon, title, description, action }: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="icloud-empty">
      <span>{icon}</span><h3>{title}</h3><p>{description}</p>{action}
    </div>
  )
}

export function ICloudWorkspace({ userId, enabled, remoteImagesEnabled }: {
  userId: string
  enabled: boolean
  remoteImagesEnabled: boolean
}) {
  const mailListScroll = useMailListScroll()
  const pendingDeepLink = useRef(notificationDeepLink('icloud'))
  const [accounts, setAccounts] = useState<ICloudAccount[]>([])
  const [selectedId, setSelectedId] = useState(pendingDeepLink.current?.accountId || '')
  const [aliases, setAliases] = useState<ICloudAlias[]>([])
  const [selectedAlias, setSelectedAlias] = useState('')
  const [messages, setMessages] = useState<ICloudMessage[]>([])
  const [inboxMethod, setInboxMethod] = useState<'imap' | 'web' | ''>('')
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [credentials, setCredentials] = useState<ICloudAccount | null>(null)
  const [opened, setOpened] = useState<ICloudMessage | null>(null)
  const [messageLoading, setMessageLoading] = useState(false)
  const aliasRequestId = useRef(0)
  const inboxRequestId = useRef(0)
  const messageRequestId = useRef(0)
  const accountsRequestId = useRef(0)
  const accountsController = useRef<AbortController | null>(null)
  const aliasController = useRef<AbortController | null>(null)
  const inboxController = useRef<AbortController | null>(null)
  const messageController = useRef<AbortController | null>(null)
  const openDeepLinkMessage = useEffectEvent((message: ICloudMessage) => openMessage(message))
  const selected = accounts.find((account) => account.id === selectedId)
  const activeAlias = aliases.find((alias) => alias.email === selectedAlias)
  const activeMainAddress = selected?.hasAppPassword && selected.icloudEmail === selectedAlias
    ? selected.icloudEmail
    : ''

  useEffect(() => {
    const link = pendingDeepLink.current
    const message = link && messages.find(({ id }) => id === link.messageId)
    if (!message) return
    pendingDeepLink.current = null
    void openDeepLinkMessage(message)
  }, [messages])

  const loadAccounts = useCallback(async () => {
    if (!enabled) { setLoading(false); return }
    accountsController.current?.abort()
    const controller = new AbortController()
    accountsController.current = controller
    const current = ++accountsRequestId.current
    try {
      const result = await api.iCloudAccounts(controller.signal)
      if (current !== accountsRequestId.current) return
      setAccounts(result.accounts)
      setSelectedId((current) => result.accounts.some((item) => item.id === current) ? current : result.accounts[0]?.id || '')
      setCredentials((current) => current ? result.accounts.find((item) => item.id === current.id) || null : null)
    } catch (loadError) {
      if (current === accountsRequestId.current) setError(errorMessage(loadError))
    } finally {
      if (current === accountsRequestId.current) setLoading(false)
    }
  }, [enabled])

  const sync = useCallback(async (alias = selectedAlias, forceInbox = false) => {
    const id = selectedId
    if (!id) return
    const scope: ICloudInboxScope = { userId, accountId: id, alias, query: searchQuery }
    const cached = readICloudInboxCache(scope)
    if (cached) {
      setMessages(cached.value.messages)
      setInboxMethod(cached.value.method)
    }
    aliasController.current?.abort()
    inboxController.current?.abort()
    const aliasAbort = new AbortController()
    aliasController.current = aliasAbort
    const aliasCurrent = ++aliasRequestId.current
    const inboxCurrent = ++inboxRequestId.current
    setSyncing(true); setError('')
    try {
      if (selected?.hasCookies) {
        const aliasResult = await api.iCloudAliases(id, aliasAbort.signal)
        if (aliasCurrent !== aliasRequestId.current) return
        setAliases(aliasResult.aliases)
      } else {
        setAliases([])
      }
      await loadAccounts()
      if (aliasCurrent !== aliasRequestId.current || inboxCurrent !== inboxRequestId.current) return
      if (!forceInbox && cached?.fresh) return
      try {
        inboxController.current?.abort()
        const inboxAbort = new AbortController()
        inboxController.current = inboxAbort
        const inboxResult = writeICloudInboxCache(
          scope,
          await api.iCloudInbox(id, alias, searchQuery, inboxAbort.signal),
        )
        if (inboxCurrent === inboxRequestId.current) {
          setMessages(inboxResult.messages)
          setInboxMethod(inboxResult.method)
        }
      } catch (inboxError) {
        if (inboxCurrent === inboxRequestId.current) {
          if (!cached) { setMessages([]); setInboxMethod('') }
          setError(errorMessage(inboxError))
        }
      }
    } catch (syncError) {
      if (aliasCurrent === aliasRequestId.current) {
        setAliases([])
        if (!cached) { setMessages([]); setInboxMethod('') }
        setError(errorMessage(syncError))
      }
    } finally {
      if (aliasCurrent === aliasRequestId.current && inboxCurrent === inboxRequestId.current) setSyncing(false)
    }
  }, [loadAccounts, searchQuery, selected?.hasCookies, selectedAlias, selectedId, userId])

  const loadInbox = useCallback(async (force = false) => {
    const id = selectedId
    if (!id) return
    const scope: ICloudInboxScope = {
      userId, accountId: id, alias: selectedAlias, query: searchQuery,
    }
    inboxController.current?.abort()
    const current = ++inboxRequestId.current
    const cached = readICloudInboxCache(scope)
    if (cached) {
      setMessages(cached.value.messages)
      setInboxMethod(cached.value.method)
      if (cached.fresh && !force) { setSyncing(false); setError(''); return }
    }
    const inboxAbort = new AbortController()
    inboxController.current = inboxAbort
    setSyncing(true); setError('')
    try {
      const result = writeICloudInboxCache(
        scope,
        await api.iCloudInbox(id, selectedAlias, searchQuery, inboxAbort.signal),
      )
      if (current === inboxRequestId.current) {
        setMessages(result.messages)
        setInboxMethod(result.method)
      }
    } catch (inboxError) {
      if (current === inboxRequestId.current) {
        if (!cached) { setMessages([]); setInboxMethod('') }
        setError(errorMessage(inboxError))
      }
    } finally { if (current === inboxRequestId.current) setSyncing(false) }
  }, [searchQuery, selectedAlias, selectedId, userId])

  useEffect(() => activateICloudMailCacheUser(userId), [userId])
  useEffect(() => { void loadAccounts() }, [loadAccounts])
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => {
    aliasController.current?.abort(); inboxController.current?.abort()
    messageController.current?.abort(); messageRequestId.current += 1
    aliasRequestId.current += 1; inboxRequestId.current += 1
    setAliases([]); setMessages([]); setInboxMethod(''); setSelectedAlias(''); setOpened(null)
  }, [selectedId])
  const syncSelectedAccount = useEffectEvent(() => { if (selectedId) void sync() })
  const loadSelectedInbox = useEffectEvent(() => { if (selectedId) void loadInbox() })
  useEffect(() => { void syncSelectedAccount() }, [selectedId])
  useEffect(() => {
    messageController.current?.abort()
    messageRequestId.current += 1
    setOpened(null)
    setMessageLoading(false)
    void loadSelectedInbox()
  }, [searchQuery, selectedAlias])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => () => {
    accountsRequestId.current += 1
    aliasRequestId.current += 1
    inboxRequestId.current += 1
    messageRequestId.current += 1
    accountsController.current?.abort()
    aliasController.current?.abort()
    inboxController.current?.abort()
    messageController.current?.abort()
  }, [])

  async function aliasAction(alias: ICloudAlias, action: 'deactivate' | 'reactivate' | 'delete') {
    if (!selected) return
    if (action === 'delete' && !window.confirm(t('确定永久删除 {address} 吗？', { address: alias.email }))) return
    try {
      if (action === 'delete') await api.deleteICloudAlias(alias.anonymousId, selected.id)
      else await api.updateICloudAlias(alias.anonymousId, selected.id, action)
      if (action === 'delete' && selectedAlias === alias.email) setSelectedAlias('')
      setNotice(t(action === 'delete' ? '隐藏邮箱已删除' : action === 'deactivate' ? '隐藏邮箱已停用' : '隐藏邮箱已恢复'))
      await sync(selectedAlias, true)
    } catch (actionError) { setError(errorMessage(actionError)) }
  }
  async function openMessage(message: ICloudMessage) {
    messageController.current?.abort()
    const current = ++messageRequestId.current
    setOpened(message)
    setMessageLoading(false)
    if (!selected?.hasAppPassword || !/^\d+$/.test(message.id)) return
    const cached = readICloudMessageCache(userId, selected.id, message.id)
    if (cached) {
      setOpened(cached.value)
      if (cached.value.isRead) {
        setMessages((items) => items.map((item) => (
          item.id === cached.value.id ? { ...item, isRead: true } : item
        )))
      }
      if (cached.fresh) return
    }
    const controller = new AbortController()
    messageController.current = controller
    setMessageLoading(!cached)
    try {
      const result = await api.iCloudMessage(selected.id, message.id, controller.signal)
      if (current === messageRequestId.current) {
        const detail = writeICloudMessageCache(userId, selected.id, result.message)
        setOpened(detail)
        if (detail.isRead) {
          setMessages((items) => items.map((item) => (
            item.id === detail.id ? { ...item, isRead: true } : item
          )))
        }
      }
    } catch (openError) {
      if (current === messageRequestId.current) setError(errorMessage(openError))
    } finally {
      if (current === messageRequestId.current) setMessageLoading(false)
    }
  }
  async function copyAlias(address: string) {
    try {
      await navigator.clipboard.writeText(address)
      setNotice(t('已复制：{address}', { address }))
    } catch {
      setError(t('无法访问剪贴板，请手动复制邮箱地址。'))
    }
  }
  function closeMessage() {
    messageController.current?.abort()
    messageRequestId.current += 1
    setOpened(null)
    setMessageLoading(false)
  }

  return (
    <div className={`icloud-mail-view${opened ? ' has-selection' : ''}`}>
      <section ref={mailListScroll.listPane} className="list-pane icloud-list-pane page-content-enter">
        <header className="list-header icloud-list-header">
          <div>
            {accounts.length ? <ICloudScopeSwitcher accounts={accounts} aliases={aliases}
              selectedAccountId={selectedId} selectedAlias={selectedAlias}
              onAccountChange={setSelectedId} onAliasChange={setSelectedAlias}
              onAliasCopy={copyAlias} onAccountSettings={setCredentials} />
              : <p className="eyebrow">ICLOUD · HIDE MY EMAIL</p>}
            <ListScrollTopHeading title="iCloud" onScrollTop={mailListScroll.scrollToTop} />
          </div>
          <div className="list-header__actions">
            {selected && <span className={`icloud-mail-status ${selected.hasAppPassword ? 'is-imap' : 'is-cookie'}`}>
              {selected.hasAppPassword
                ? <ShieldCheck size={13} aria-hidden="true" />
                : <KeyRound size={13} aria-hidden="true" />}
              {t(selected.hasAppPassword ? 'IMAP 完整邮件' : 'Web 摘要')}
            </span>}
            <div className="icloud-header-action-buttons">
              <button className="icon-button" type="button" disabled={!enabled}
                onClick={() => setAddOpen(true)} aria-label={t('添加 iCloud 账号')}
                data-tooltip={t('添加 iCloud 账号')}><Plus size={17} /></button>
              <button className="icon-button" type="button" disabled={!selected?.hasCookies}
                onClick={() => setCreateOpen(true)}
                aria-label={t(selected?.hasCookies ? '创建隐藏邮箱' : '配置 Cookie 后可创建隐藏邮箱')}
                data-tooltip={t(selected?.hasCookies ? '创建隐藏邮箱' : '配置 Cookie 后可创建隐藏邮箱')}><AtSign size={17} /></button>
              <button className="icon-button" type="button" disabled={!selected}
                onClick={() => selected && setCredentials(selected)} aria-label={t('账号设置')}
                data-tooltip={t('账号设置')}><Settings2 size={17} /></button>
              <button className="icon-button" type="button" disabled={!selected || syncing}
                onClick={() => void sync(selectedAlias, true)} aria-label={t('同步')}
                data-tooltip={t('同步')}>{syncing ? <Spinner /> : <RefreshCw size={17} />}</button>
            </div>
          </div>
        </header>

        {selected && (!selectedAlias || selected.hasAppPassword) && <ICloudSearchField
          value={query} loading={syncing} summaryOnly={inboxMethod === 'web'} onChange={setQuery} />}

        {error && <p className="list-error" role="alert"><AlertCircle size={15} />{t(error)}</p>}
        {activeAlias && <div className="icloud-list-context">
          <span><AtSign size={16} /></span>
          <p><strong>{activeAlias.label || t('未命名地址')}</strong><small>{activeAlias.email}</small></p>
          <div>
            <button type="button" onClick={() => void copyAlias(activeAlias.email)} aria-label={t('复制')} data-tooltip={t('复制')}><Copy size={14} /></button>
            <button type="button" onClick={() => void aliasAction(activeAlias, activeAlias.active ? 'deactivate' : 'reactivate')} aria-label={t(activeAlias.active ? '停用' : '恢复')} data-tooltip={t(activeAlias.active ? '停用' : '恢复')}>{activeAlias.active ? <PowerOff size={14} /> : <Power size={14} />}</button>
            <button className="is-danger" type="button" onClick={() => void aliasAction(activeAlias, 'delete')} aria-label={t('删除')} data-tooltip={t('删除')}><Trash2 size={14} /></button>
          </div>
        </div>}
        {activeMainAddress && <div className="icloud-list-context">
          <span><AtSign size={16} aria-hidden="true" /></span>
          <p><strong>{t('主邮箱')}</strong><small>{activeMainAddress}</small></p>
          <div><button type="button" onClick={() => void copyAlias(activeMainAddress)}
            aria-label={t('复制')} data-tooltip={t('复制')}><Copy size={14} /></button></div>
        </div>}

        {!enabled ? <Empty icon={<KeyRound size={24} />} title={t('iCloud 功能尚未启用')} description={t('在 Worker Variables & Secrets 中配置至少 32 字节的 ICLOUD_CREDENTIALS_KEY，然后重新部署。')} />
          : loading ? <div className="icloud-loading"><Spinner size={22} />{t('正在读取 iCloud 账号…')}</div>
          : !accounts.length ? <Empty icon={<Cloud size={24} />} title={t('还没有 iCloud 账号')} description={t('使用应用专用密码即可收取主邮箱；如需管理隐藏邮箱，再添加 Cookie。')} action={<button className="button button--primary" type="button" onClick={() => setAddOpen(true)}><Plus size={16} />{t('添加第一个账号')}</button>} />
          : selectedAlias && !selected?.hasAppPassword ? <Empty icon={<KeyRound size={24} />} title={t('需要应用专用密码')} description={t('配置后才能准确筛选这个隐藏邮箱收到的邮件。')} action={<button className="button button--secondary button--small" type="button" onClick={() => selected && setCredentials(selected)}>{t('配置应用密码')}</button>} />
          : syncing && !messages.length ? <div className="icloud-loading"><Spinner />{t('正在读取收件箱…')}</div>
          : messages.length ? <div className="message-list-shell"><div className="message-list" role="listbox" aria-label={t('iCloud 邮件列表')}>
            {messages.map((message) => {
              const active = opened?.id === message.id && opened.to === message.to
              const sender = parseICloudSender(message.from)
              const unread = message.isRead === false
              return <article className={`message-row${unread ? ' is-unread' : ''}${active ? ' is-selected' : ''}`} role="option" aria-selected={active} key={`${message.id}-${message.to}`}>
                <button className="message-row__main" type="button" onClick={() => void openMessage(message)}>
                  <span className="message-row__top"><strong>{sender.name || sender.address || t('未知发件人')}</strong><time>{message.date ? new Date(message.date).toLocaleDateString() : ''}</time>{unread && <span className="sr-only">{t('未读邮件')}</span>}</span>
                  <span className="message-row__subject"><span className="message-row__subject-text">{message.subject || t('无主题')}</span></span>
                  <span className="message-row__preview">{message.preview || t('暂无正文预览')}</span>
                  {message.to && <span className="mailbox-hint"><AtSign size={12} />{message.to}</span>}
                </button>
                {unread && <span className="message-row__unread-dot" aria-hidden="true" />}
              </article>
            })}
          </div></div> : <Empty icon={<Inbox size={24} />}
            title={t(searchQuery ? '没有匹配的 iCloud 邮件' : '暂无 iCloud 邮件')}
            description={t(searchQuery
              ? '请尝试其他发件人、主题或正文关键词。'
              : '最近 7 天没有找到邮件，或需要更新账号凭据。')} />}
      </section>

      <main className="reader-pane icloud-reader-pane">
        <ICloudReader message={opened} loading={messageLoading} method={inboxMethod} remoteImagesEnabled={remoteImagesEnabled} onBack={closeMessage} />
      </main>

      {addOpen && <AddICloudAccountDialog onClose={() => setAddOpen(false)} onCreated={(account) => { setAccounts((items) => [...items, account]); setSelectedId(account.id); setNotice(t('iCloud 账号已添加')) }} />}
      {createOpen && selected && <ICloudModal title={t('创建隐藏邮箱')} description={t('预览 Apple 生成的地址，确认后一次创建最多 5 个。')} onClose={() => setCreateOpen(false)}>{(close) => <ICloudAliasBatchForm account={selected} close={close} onCreated={async (createdAliases) => { const latest = createdAliases.at(-1); if (!latest) return; setSelectedAlias(latest.email); setNotice(t(createdAliases.length === 1 ? '新的隐藏邮箱已创建' : '已创建 {count} 个隐藏邮箱', { count: createdAliases.length })); await sync(latest.email, true) }} />}</ICloudModal>}
      {credentials && <ICloudAccountSettingsDialog account={credentials} onClose={() => setCredentials(null)} onChanged={async () => { clearICloudAccountCache(userId, credentials.id); await loadAccounts() }} onDeleted={async () => { clearICloudAccountCache(userId, credentials.id); await loadAccounts(); setAliases([]); setMessages([]); setInboxMethod('') }} onNotice={setNotice} />}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    </div>
  )
}
