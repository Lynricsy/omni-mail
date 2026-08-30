import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckSquare2,
  LoaderCircle,
  RotateCcw,
  Search,
  SearchCheck,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  api,
  type AdminMessageAction,
  type AdminMessageDetail,
  type AdminMessageFilters,
  type AdminMessageSummary,
  type PageInfo,
} from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { getLocale, t } from '../../../shared/i18n'
import { DangerConfirmDialog } from '../../../shared/ui/dialogs/DangerConfirmDialog'
import { AdminPageHeader } from '../shell/AdminPageHeader'
import { AdminMessageDrawer } from './AdminMessageDrawer'

const initialFilters: AdminMessageFilters = {
  query: '',
  user: '',
  mailbox: '',
  direction: 'all',
  folder: 'all',
  status: 'all',
  days: 0,
}

function messageDate(value: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function folderLabel(folder: AdminMessageSummary['folder']): string {
  return t({ inbox: '收件箱', sent: '已发送', trash: '垃圾箱' }[folder])
}

function statusLabel(status: AdminMessageSummary['status']): string {
  return t({ processing: '处理中', ready: '正常', failed: '失败', sent: '已发送' }[status])
}

function SelectionBox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  label: string
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={onChange}
    />
  )
}

type PendingAction = { action: AdminMessageAction; ids: string[] }

export function AdminMailManagement({
  remoteImagesEnabled,
}: {
  remoteImagesEnabled: boolean
}) {
  const [filters, setFilters] = useState(initialFilters)
  const deferredQuery = useDeferredValue(filters.query)
  const [messages, setMessages] = useState<AdminMessageSummary[]>([])
  const [page, setPage] = useState<PageInfo>({ hasMore: false, nextCursor: null, limit: 30 })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<AdminMessageDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const listRequestId = useRef(0)
  const listController = useRef<AbortController | null>(null)
  const detailRequestId = useRef(0)
  const detailController = useRef<AbortController | null>(null)

  useEffect(() => {
    listController.current?.abort()
    detailRequestId.current += 1
    detailController.current?.abort()
    const controller = new AbortController()
    listController.current = controller
    const requestId = ++listRequestId.current
    setLoading(true)
    setLoadingMore(false)
    setError('')
    setSelectedIds(new Set())
    setDrawerOpen(false)
    setDetail(null)
    void api.adminMessages({
      query: deferredQuery,
      days: filters.days,
      direction: filters.direction,
      folder: filters.folder,
      mailbox: filters.mailbox,
      status: filters.status,
      user: filters.user,
    }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted || requestId !== listRequestId.current) return
        setMessages(result.messages)
        setPage(result.page)
      })
      .catch((loadError) => {
        if (!controller.signal.aborted && requestId === listRequestId.current) {
          setError(errorMessage(loadError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === listRequestId.current) setLoading(false)
      })
    return () => controller.abort()
  }, [
    deferredQuery,
    filters.days,
    filters.direction,
    filters.folder,
    filters.mailbox,
    filters.status,
    filters.user,
    refreshKey,
  ])
  useEffect(() => () => {
    listRequestId.current += 1
    detailRequestId.current += 1
    listController.current?.abort()
    detailController.current?.abort()
  }, [])

  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedIds.has(message.id)),
    [messages, selectedIds],
  )
  const selectableMessages = messages.slice(0, 50)
  const allSelected = selectableMessages.length > 0
    && selectableMessages.every((message) => selectedIds.has(message.id))
  const canDeleteSelection = selectedMessages.length > 0
    && selectedMessages.every((message) => message.folder === 'trash')
  const hasTrashSelection = selectedMessages.some((message) => message.folder === 'trash')
  const hasActiveSelection = selectedMessages.some((message) => message.folder !== 'trash')

  function updateFilter<K extends keyof AdminMessageFilters>(key: K, value: AdminMessageFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < 50) next.add(id)
      return next
    })
  }

  async function loadMore() {
    if (!page.nextCursor || loadingMore) return
    listController.current?.abort()
    const controller = new AbortController()
    listController.current = controller
    const requestId = ++listRequestId.current
    setLoadingMore(true)
    setError('')
    try {
      const result = await api.adminMessages({
        ...filters,
        query: deferredQuery,
        cursor: page.nextCursor,
      }, controller.signal)
      if (controller.signal.aborted || requestId !== listRequestId.current) return
      setMessages((current) => [...current, ...result.messages])
      setPage(result.page)
    } catch (loadError) {
      if (!controller.signal.aborted && requestId === listRequestId.current) {
        setError(errorMessage(loadError))
      }
    } finally {
      if (requestId === listRequestId.current) setLoadingMore(false)
    }
  }

  async function openMessage(message: AdminMessageSummary) {
    detailController.current?.abort()
    const controller = new AbortController()
    detailController.current = controller
    const requestId = ++detailRequestId.current
    setDrawerOpen(true)
    setDetail(null)
    setDetailLoading(true)
    setError('')
    try {
      const result = await api.adminMessage(message.id, controller.signal)
      if (controller.signal.aborted || requestId !== detailRequestId.current) return
      setDetail(result.message)
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== detailRequestId.current) return
      setDrawerOpen(false)
      setError(errorMessage(loadError))
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false)
    }
  }

  async function performAction(action: AdminMessageAction, ids: string[]) {
    setActionLoading(true)
    setError('')
    setNotice('')
    try {
      const result = await api.manageAdminMessages(ids, action)
      setNotice(t('已管理 {count} 封邮件', { count: result.updatedCount }))
      setSelectedIds(new Set())
      detailRequestId.current += 1
      detailController.current?.abort()
      setDrawerOpen(false)
      setDetail(null)
      setRefreshKey((value) => value + 1)
    } catch (actionError) {
      setError(errorMessage(actionError))
    } finally {
      setActionLoading(false)
    }
  }

  function requestAction(action: AdminMessageAction, ids: string[]) {
    if (action === 'restore') {
      void performAction(action, ids)
      return
    }
    setConfirmation('')
    setPending({ action, ids })
  }

  return (
    <main className="admin-workspace admin-mail-workspace">
      <AdminPageHeader
        icon={SearchCheck}
        eyebrow="SUPER ADMIN · ALL MAIL"
        title={t('邮件管理')}
        description={t('检索和管理全站邮件；正文访问、附件下载和删除都会写入操作日志。')}
      />

      <section className="admin-mail-privacy" aria-label={t('隐私与审计说明')}>
        <ShieldCheck size={18} />
        <div><strong>{t('主管理员专用')}</strong><span>{t('打开邮件不会改变所属用户的已读或星标状态。')}</span></div>
      </section>

      <section className="admin-mail-panel">
        <div className="admin-mail-filters">
          <label className="admin-mail-search">
            <Search size={16} />
            <span className="sr-only">{t('搜索全站邮件')}</span>
            <input
              type="search"
              value={filters.query}
              placeholder={t('搜索主题、发件人、收件人或正文')}
              onChange={(event) => updateFilter('query', event.target.value)}
            />
            {filters.query && <button type="button" onClick={() => updateFilter('query', '')} aria-label={t('清除搜索')}><X size={14} /></button>}
          </label>
          <label><span>{t('所属用户')}</span><input type="email" value={filters.user} placeholder="user@example.com" onChange={(event) => updateFilter('user', event.target.value)} /></label>
          <label><span>{t('邮箱')}</span><input type="email" value={filters.mailbox} placeholder="mailbox@example.com" onChange={(event) => updateFilter('mailbox', event.target.value)} /></label>
          <label><span>{t('方向')}</span><select value={filters.direction} onChange={(event) => updateFilter('direction', event.target.value as AdminMessageFilters['direction'])}><option value="all">{t('全部')}</option><option value="incoming">{t('收件')}</option><option value="outgoing">{t('发件')}</option></select></label>
          <label><span>{t('文件夹')}</span><select value={filters.folder} onChange={(event) => updateFilter('folder', event.target.value as AdminMessageFilters['folder'])}><option value="all">{t('全部')}</option><option value="inbox">{t('收件箱')}</option><option value="sent">{t('已发送')}</option><option value="trash">{t('垃圾箱')}</option></select></label>
          <label><span>{t('状态')}</span><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value as AdminMessageFilters['status'])}><option value="all">{t('全部')}</option><option value="ready">{t('正常')}</option><option value="processing">{t('处理中')}</option><option value="failed">{t('失败')}</option><option value="sent">{t('已发送')}</option></select></label>
          <label><span>{t('时间')}</span><select value={filters.days} onChange={(event) => updateFilter('days', Number(event.target.value) as AdminMessageFilters['days'])}><option value={0}>{t('全部时间')}</option><option value={1}>{t('最近 24 小时')}</option><option value={7}>{t('最近 7 天')}</option><option value={30}>{t('最近 30 天')}</option><option value={90}>{t('最近 90 天')}</option></select></label>
          <button className="button button--secondary button--small" type="button" onClick={() => setFilters(initialFilters)}>{t('重置筛选')}</button>
        </div>

        <div className="admin-mail-selection" aria-live="polite">
          <span><CheckSquare2 size={16} />{selectedIds.size ? t('已选择 {count} 封', { count: selectedIds.size }) : t('当前加载 {count} 封', { count: messages.length })}</span>
          {selectedIds.size > 0 && <div>
            {hasActiveSelection && <button type="button" disabled={actionLoading} onClick={() => requestAction('trash', [...selectedIds])}><Trash2 size={15} />{t('移入垃圾箱')}</button>}
            {hasTrashSelection && <button type="button" disabled={actionLoading} onClick={() => requestAction('restore', [...selectedIds])}><RotateCcw size={15} />{t('恢复')}</button>}
            <button className="is-danger" type="button" disabled={actionLoading || !canDeleteSelection} onClick={() => requestAction('delete', [...selectedIds])}><Trash2 size={15} />{t('永久删除')}</button>
          </div>}
        </div>

        {error && <p className="admin-mail-feedback is-error" role="alert"><AlertCircle size={16} />{error}</p>}
        {notice && <p className="admin-mail-feedback" role="status"><ShieldCheck size={16} />{notice}</p>}

        <div className="admin-mail-table-wrap">
          <table className="admin-mail-table">
            <thead><tr>
              <th><SelectionBox checked={allSelected} indeterminate={selectedIds.size > 0 && !allSelected} label={t('选择当前已加载邮件')} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(selectableMessages.map((message) => message.id)))} /></th>
              <th>{t('时间')}</th><th>{t('所属用户')}</th><th>{t('邮箱')}</th><th>{t('通信方')}</th><th>{t('主题')}</th><th>{t('状态')}</th><th>{t('大小')}</th>
            </tr></thead>
            <tbody>
              {!loading && messages.map((message) => (
                <tr key={message.id} className={detail?.id === message.id ? 'is-active' : ''}>
                  <td><SelectionBox checked={selectedIds.has(message.id)} label={t('选择邮件：{subject}', { subject: message.subject })} onChange={() => toggleSelection(message.id)} /></td>
                  <td><time dateTime={new Date(message.date).toISOString()}>{messageDate(message.date)}</time></td>
                  <td><strong>{message.owner.displayName}</strong><small>{message.owner.email}</small></td>
                  <td><span>{message.mailboxAddress}</span><small>{folderLabel(message.folder)}</small></td>
                  <td><span className="admin-mail-direction">{message.direction === 'incoming' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{message.direction === 'incoming' ? message.senderAddress : message.recipients.join(', ')}</span></td>
                  <td><button type="button" onClick={() => void openMessage(message)}><strong>{message.subject}</strong><small>{message.preview || t('暂无正文预览')}</small></button></td>
                  <td><span className={`admin-mail-status is-${message.status}`}>{statusLabel(message.status)}</span></td>
                  <td>{formatSize(message.sizeBytes)}<small>{t('{count} 个附件', { count: message.attachmentCount })}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="admin-mail-state" role="status"><LoaderCircle className="spin" size={19} />{t('正在读取全站邮件…')}</div>}
          {!loading && messages.length === 0 && <div className="admin-mail-state"><SearchCheck size={20} />{t('当前筛选范围内没有邮件。')}</div>}
        </div>
        {page.hasMore && <button className="button button--secondary admin-mail-load-more" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore && <LoaderCircle className="spin" size={15} />}{t(loadingMore ? '正在加载…' : '加载更多邮件')}</button>}
      </section>

      <AdminMessageDrawer open={drawerOpen} message={detail} loading={detailLoading}
        remoteImagesEnabled={remoteImagesEnabled} interactionBlocked={Boolean(pending)}
        onClose={() => { detailRequestId.current += 1; detailController.current?.abort(); setDrawerOpen(false) }}
        onTrash={() => detail && requestAction(detail.folder === 'trash' ? 'delete' : 'trash', [detail.id])}
        onRestore={() => detail && requestAction('restore', [detail.id])} />

      {pending && <DangerConfirmDialog
        icon={Trash2}
        eyebrow={t('高权限邮件操作')}
        title={t(pending.action === 'delete' ? '永久删除所选邮件？' : '将所选邮件移入垃圾箱？')}
        description={t(pending.action === 'delete' ? '所选邮件将从主存储永久删除。' : '这些邮件会从所属用户的当前文件夹移入垃圾箱。')}
        impactTitle={t(pending.action === 'delete' ? '删除后无法恢复' : '之后仍可恢复')}
        impactDescription={t(pending.action === 'delete' ? '备份副本仍会按系统保留策略保存。' : '所属用户可以在自动清理前恢复邮件。')}
        confirmLabel={t(pending.action === 'delete' ? '永久删除' : '移入垃圾箱')}
        confirmation={pending.action === 'delete' && pending.ids.length > 1 ? {
          label: t('请输入 {count} 以确认批量删除', { count: pending.ids.length }),
          expected: String(pending.ids.length),
          value: confirmation,
          onChange: setConfirmation,
        } : undefined}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const current = pending
          setPending(null)
          void performAction(current.action, current.ids)
        }}
      />}
    </main>
  )
}
