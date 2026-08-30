import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  api,
  ApiError,
  type Folder,
  type MailboxScope,
  type MailCounts,
  type MessageDetail,
  type MessageSummary,
  type PageInfo,
} from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'
import { bulkMessages, type BulkMessageAction } from '../../messages/model/messageActions'
import { useMailboxRefresh } from '../../../shared/hooks/useAutoRefresh'
import { notificationDeepLink } from '../../../shared/mail/notificationDeepLink'

const emptyCounts: MailCounts = { unread: 0, starred: 0, drafts: 0, sent: 0, trash: 0 }
const emptyPage: PageInfo = { hasMore: false, nextCursor: null, limit: 30 }

type PendingMailDelete = { kind: 'single'; message: MessageDetail }
  | { kind: 'bulk'; action: 'trash' | 'delete'; ids: string[] }

type TrackNotifications = (
  quiet: boolean,
  messages: MessageSummary[],
  currentIsGlobalInbox: boolean,
  version: number,
) => Promise<void>

interface MailboxMessagesOptions {
  folder: Folder
  searchQuery: string
  scope: MailboxScope
  refreshInterval: number
  refreshEnabled: boolean
  nextMessageSignal: () => AbortSignal
  trackNotifications: TrackNotifications
  onLogout: () => Promise<void>
  setError: Dispatch<SetStateAction<string>>
  setNotice: Dispatch<SetStateAction<string>>
}

export function useMailboxMessages({
  folder,
  searchQuery,
  scope,
  refreshInterval,
  refreshEnabled,
  nextMessageSignal,
  trackNotifications,
  onLogout,
  setError,
  setNotice,
}: MailboxMessagesOptions) {
  const [messages, setMessages] = useState<MessageSummary[]>([])
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())
  const [messageVersion, setMessageVersion] = useState<number>()
  const [messagePage, setMessagePage] = useState<PageInfo>(emptyPage)
  const [counts, setCounts] = useState<MailCounts>(emptyCounts)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MessageDetail | null>(null)
  const [thread, setThread] = useState<MessageSummary[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [pendingMailDelete, setPendingMailDelete] = useState<PendingMailDelete | null>(null)
  const messageRequestId = useRef(0)
  const pendingDeepLink = useRef(notificationDeepLink('omnimail'))
  const detailRequestId = useRef(0)
  const detailController = useRef<AbortController | null>(null)

  const clearSelectedMessage = useCallback(() => {
    detailRequestId.current += 1
    detailController.current?.abort()
    detailController.current = null
    setSelectedId(null)
    setDetail(null)
    setThread([])
    setDetailLoading(false)
  }, [])

  const loadMessages = useCallback(async (quiet = false) => {
    const requestId = ++messageRequestId.current
    const signal = nextMessageSignal()
    if (quiet) setRefreshing(true)
    else setListLoading(true)
    setError('')
    try {
      const result = await api.messages(
        folder,
        searchQuery,
        scope,
        undefined,
        quiet ? messageVersion : undefined,
        signal,
      )
      if (requestId !== messageRequestId.current || result.unchanged) return false
      await trackNotifications(
        quiet,
        result.messages,
        folder === 'inbox' && !searchQuery && scope.type === 'all',
        result.version,
      )
      if (requestId !== messageRequestId.current) return false
      setMessageVersion(result.version)
      setMessages(result.messages)
      setSelectedMessageIds((current) => new Set(
        [...current].filter((id) => result.messages.some((message) => message.id === id)),
      ))
      setMessagePage(result.page)
      setCounts(result.counts)
      if (selectedId && !result.messages.some((message) => message.id === selectedId)) {
        clearSelectedMessage()
      }
    } catch (loadError) {
      if (signal.aborted || requestId !== messageRequestId.current) return false
      if (loadError instanceof ApiError && loadError.status === 401) {
        await onLogout()
        return
      }
      setError(errorMessage(loadError))
    } finally {
      if (requestId === messageRequestId.current) {
        setListLoading(false)
        setRefreshing(false)
      }
    }
  }, [
    clearSelectedMessage,
    folder,
    messageVersion,
    nextMessageSignal,
    onLogout,
    scope,
    searchQuery,
    selectedId,
    setError,
    trackNotifications,
  ])

  async function loadMoreMessages() {
    if (!messagePage.hasMore || !messagePage.nextCursor || loadingMore) return
    const requestId = ++messageRequestId.current
    const signal = nextMessageSignal()
    setLoadingMore(true)
    setError('')
    try {
      const result = await api.messages(
        folder,
        searchQuery,
        scope,
        messagePage.nextCursor,
        undefined,
        signal,
      )
      if (requestId !== messageRequestId.current || result.unchanged) return
      setMessages((items) => {
        const existing = new Set(items.map((item) => item.id))
        return [...items, ...result.messages.filter((item) => !existing.has(item.id))]
      })
      setMessagePage(result.page)
      setCounts(result.counts)
    } catch (loadError) {
      if (signal.aborted || requestId !== messageRequestId.current) return
      if (loadError instanceof ApiError && loadError.status === 401) {
        await onLogout()
        return
      }
      setError(errorMessage(loadError))
    } finally {
      if (requestId === messageRequestId.current) setLoadingMore(false)
    }
  }

  const loadMessagesForNavigation = useEffectEvent(() => loadMessages())
  const selectDeepLinkMessage = useEffectEvent((message: MessageSummary) => selectMessage(message))
  useEffect(() => {
    clearSelectedMessage()
    setLoadingMore(false)
    setSelectedMessageIds(new Set())
    if (folder !== 'drafts') void loadMessagesForNavigation()
  }, [clearSelectedMessage, folder, searchQuery, scope])

  useEffect(() => {
    const link = pendingDeepLink.current
    const message = link && folder === 'inbox'
      ? messages.find(({ id }) => id === link.messageId) : undefined
    if (!message) return
    pendingDeepLink.current = null
    void selectDeepLinkMessage(message)
  }, [folder, messages])

  useEffect(() => () => {
    detailRequestId.current += 1
    detailController.current?.abort()
  }, [])

  useMailboxRefresh(
    refreshInterval,
    () => loadMessages(true),
    refreshEnabled,
    messages,
    selectedId,
    detail?.status,
    selectMessage,
  )

  async function selectMessage(message: MessageSummary) {
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    const requestId = ++detailRequestId.current
    setSelectedId(message.id)
    setDetailLoading(true)
    setError('')
    try {
      const result = await api.message(message.id, controller.signal)
      if (requestId !== detailRequestId.current) return
      setDetail(result.message)
      setThread(result.thread ?? [result.message])
      if (!message.isRead) {
        try {
          await api.updateMessage(message.id, { isRead: true })
          setMessages((items) => items.map((item) => item.id === message.id
            ? { ...item, isRead: true }
            : item))
          if (message.direction === 'incoming' && message.folder === 'inbox') {
            setCounts((current) => ({ ...current, unread: Math.max(0, current.unread - 1) }))
          }
          setDetail((current) => current?.id === message.id
            ? { ...current, isRead: true }
            : current)
        } catch (readError) {
          if (requestId === detailRequestId.current) setError(errorMessage(readError))
        }
      }
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== detailRequestId.current) return
      setError(errorMessage(loadError))
      setDetail(null)
      setThread([])
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false)
    }
  }

  async function toggleStar(message: MessageSummary | MessageDetail) {
    try {
      const next = !message.isStarred
      await api.updateMessage(message.id, { isStarred: next })
      setMessages((items) => items.map((item) => (
        item.id === message.id ? { ...item, isStarred: next } : item
      )))
      setDetail((current) => current?.id === message.id
        ? { ...current, isStarred: next }
        : current)
      if (folder === 'starred') await loadMessages(true)
    } catch (starError) {
      setError(errorMessage(starError))
    }
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

  function selectAllLoadedMessages(candidateMessages: MessageSummary[] = messages) {
    const selectable = candidateMessages.slice(0, 50)
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
      if (selectedId && ids.includes(selectedId)) clearSelectedMessage()
      setNotice(t('已更新 {count} 封邮件', { count: result.updatedCount }))
      await loadMessages(true)
    } catch (bulkError) {
      setError(errorMessage(bulkError))
    } finally {
      setBulkLoading(false)
    }
  }

  async function runBulkAction(
    action: BulkMessageAction,
    selectedIds = [...selectedMessageIds],
  ) {
    if (!selectedIds.length) return
    if (action === 'trash' || action === 'delete') {
      setPendingMailDelete({ kind: 'bulk', action, ids: selectedIds })
      return
    }
    await applyBulkAction(action, selectedIds)
  }

  async function applySingleDelete(message: MessageDetail) {
    if (message.folder === 'trash') {
      await api.deleteMessage(message.id)
      setNotice(t('邮件已永久删除'))
    } else {
      await api.updateMessage(message.id, { folder: 'trash' })
      setNotice(t('邮件已移入垃圾箱'))
    }
    clearSelectedMessage()
    await loadMessages(true)
  }

  function requestSelectedDelete() {
    if (detail) setPendingMailDelete({ kind: 'single', message: detail })
  }

  async function confirmMailDelete() {
    const pending = pendingMailDelete
    if (!pending) return
    try {
      if (pending.kind === 'single') await applySingleDelete(pending.message)
      else await applyBulkAction(pending.action, pending.ids)
      setPendingMailDelete(null)
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    }
  }

  async function restoreSelected() {
    if (!detail) return
    try {
      await api.updateMessage(detail.id, {
        folder: detail.direction === 'outgoing' ? 'sent' : 'inbox',
      })
      clearSelectedMessage()
      setNotice(t('邮件已恢复'))
      await loadMessages(true)
    } catch (restoreError) {
      setError(errorMessage(restoreError))
    }
  }

  const changeDraftCount = useCallback((drafts: number) => {
    setCounts((current) => ({ ...current, drafts }))
  }, [])

  function markSelectedMessageRetrying() {
    setDetail((current) => current ? {
      ...current,
      status: 'processing',
      processingError: null,
      deliveryStatus: 'queued',
    } : current)
  }

  return {
    messages,
    selectedMessageIds,
    messagePage,
    counts,
    selectedId,
    detail,
    thread,
    listLoading,
    detailLoading,
    refreshing,
    loadingMore,
    bulkLoading,
    pendingMailDelete,
    clearSelectedMessage,
    loadMessages,
    loadMoreMessages,
    selectMessage,
    toggleStar,
    toggleMessageSelection,
    selectAllLoadedMessages,
    runBulkAction,
    requestSelectedDelete,
    confirmMailDelete,
    restoreSelected,
    changeDraftCount,
    markSelectedMessageRetrying,
    cancelMailDelete: () => setPendingMailDelete(null),
    beginListLoading: () => setListLoading(true),
  }
}
