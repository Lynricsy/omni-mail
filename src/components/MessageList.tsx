import {
  AlertCircle,
  AtSign,
  CheckCheck,
  Inbox,
  ListChecks,
  LoaderCircle,
  Mail,
  MailOpen,
  Paperclip,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
  X,
} from 'lucide-react'
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { Folder, MessageSummary, PageInfo } from '../lib/api'
import type { BulkMessageAction } from '../lib/messageActions'
import { t } from '../lib/i18n'
import { formatMessageDate, senderLabel } from '../lib/mailFormatting'

type MessageContextMenuState = {
  message: MessageSummary
  x: number
  y: number
}

function contextActions(folder: Folder, message: MessageSummary) {
  if (folder === 'trash') {
    return [
      ['restore', t('恢复邮件'), RotateCcw],
      ['delete', t('永久删除'), Trash2],
    ] as const
  }
  return [
    [message.isRead ? 'unread' : 'read', t(message.isRead ? '标记为未读' : '标记为已读'),
      message.isRead ? Mail : MailOpen],
    [message.isStarred ? 'unstar' : 'star', t(message.isStarred ? '取消星标' : '添加星标'),
      message.isStarred ? StarOff : Star],
    ['trash', t('移入垃圾箱'), Trash2],
  ] as const
}

function MessageContextMenu({
  state,
  folder,
  onAction,
  onClose,
}: {
  state: MessageContextMenuState
  folder: Folder
  onAction: (action: BulkMessageAction, ids?: string[]) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const actions = contextActions(folder, state.message)

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    function closeFromOutside(event: PointerEvent) {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) onClose()
    }
    function closeFromKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', closeFromOutside, true)
    document.addEventListener('keydown', closeFromKeyboard)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside, true)
      document.removeEventListener('keydown', closeFromKeyboard)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  function moveFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const offset = event.key === 'ArrowDown' ? 1 : -1
    items[(current + offset + items.length) % items.length]?.focus()
  }

  return createPortal(
    <div
      ref={ref}
      className="message-context-menu"
      role="menu"
      aria-label={t('邮件操作')}
      style={{ left: state.x, top: state.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={moveFocus}
    >
      {actions.map(([action, label, Icon]) => (
        <button
          className={action === 'trash' || action === 'delete' ? 'is-danger' : ''}
          key={action}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose()
            onAction(action, [state.message.id])
          }}
        >
          <Icon size={16} />
          <span>{label}</span>
        </button>
      ))}
    </div>,
    document.body,
  )
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
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
      className="selection-checkbox"
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
    />
  )
}

function BulkToolbar({
  folder,
  messages,
  selectedIds,
  loading,
  onSelectAll,
  onAction,
  onCancel,
}: {
  folder: Folder
  messages: MessageSummary[]
  selectedIds: ReadonlySet<string>
  loading: boolean
  onSelectAll: () => void
  onAction: (action: BulkMessageAction) => void
  onCancel: () => void
}) {
  const selectable = messages.slice(0, 50)
  const allSelected = selectable.length > 0
    && selectable.every((message) => selectedIds.has(message.id))
  const someSelected = selectedIds.size > 0
  const actions: Array<[BulkMessageAction, string, typeof Mail]> = folder === 'trash'
    ? [
        ['restore', t('恢复所选邮件'), RotateCcw],
        ['delete', t('永久删除所选邮件'), Trash2],
      ]
    : [
        ['read', t('标记为已读'), MailOpen],
        ['unread', t('标记为未读'), Mail],
        ['star', t('添加星标'), Star],
        ['unstar', t('取消星标'), StarOff],
        ['trash', t('移入垃圾箱'), Trash2],
      ]

  return (
    <>
      <label>
        <SelectionCheckbox
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          label={t('选择当前已加载邮件')}
          onChange={onSelectAll}
        />
        <span>{someSelected
          ? t('已选择 {count} 封', { count: selectedIds.size })
          : t('全选')}</span>
      </label>
      <div>
        {someSelected && actions.map(([action, label, Icon]) => (
          <button key={action} type="button" disabled={loading}
            aria-label={label} data-tooltip={label} onClick={() => onAction(action)}>
            {loading ? <LoaderCircle className="spin" size={15} /> : <Icon size={15} />}
          </button>
        ))}
        <button type="button" disabled={loading} aria-label={t('退出批量操作')}
          data-tooltip={t('退出批量操作')} onClick={onCancel}>
          <X size={15} />
        </button>
      </div>
    </>
  )
}

export function MessageList({
  folder,
  messages,
  selectedId,
  selectedIds,
  loading,
  bulkLoading,
  showMailbox,
  page,
  loadingMore,
  onSelect,
  onToggleSelection,
  onSetSelection,
  onSelectAll,
  onBulkAction,
  onStar,
  onLoadMore,
}: {
  folder: Folder
  messages: MessageSummary[]
  selectedId: string | null
  selectedIds: ReadonlySet<string>
  loading: boolean
  bulkLoading: boolean
  showMailbox: boolean
  page: PageInfo
  loadingMore: boolean
  onSelect: (message: MessageSummary) => void
  onToggleSelection: (message: MessageSummary) => void
  onSetSelection: (message: MessageSummary, selected: boolean) => void
  onSelectAll: () => void
  onBulkAction: (action: BulkMessageAction, ids?: string[]) => void
  onStar: (message: MessageSummary) => void
  onLoadMore: () => void
}) {
  const [bulkMode, setBulkMode] = useState(false)
  const [dragSelecting, setDragSelecting] = useState(false)
  const [scrollbarActive, setScrollbarActive] = useState(false)
  const [contextMenu, setContextMenu] = useState<MessageContextMenuState | null>(null)
  const suppressClick = useRef(false)
  const scrollbarTimer = useRef<number | null>(null)
  const drag = useRef<{
    pointerId: number
    startX: number
    startY: number
    anchorIndex: number
    lastIndex: number
    active: boolean
    select: boolean
    initialSelectedIds: Set<string>
  } | null>(null)

  useEffect(() => () => {
    if (scrollbarTimer.current !== null) window.clearTimeout(scrollbarTimer.current)
  }, [])

  function showScrollbarWhileScrolling() {
    setScrollbarActive(true)
    if (scrollbarTimer.current !== null) window.clearTimeout(scrollbarTimer.current)
    scrollbarTimer.current = window.setTimeout(() => {
      setScrollbarActive(false)
      scrollbarTimer.current = null
    }, 700)
  }

  function applyDragSelection(index: number) {
    const current = drag.current
    if (!current || index < 0 || index >= messages.length) return
    const previousStart = Math.min(current.anchorIndex, current.lastIndex)
    const previousEnd = Math.max(current.anchorIndex, current.lastIndex)
    const nextStart = Math.min(current.anchorIndex, index)
    const nextEnd = Math.max(current.anchorIndex, index)
    for (let cursor = previousStart; cursor <= previousEnd; cursor += 1) {
      if (cursor < nextStart || cursor > nextEnd) {
        const message = messages[cursor]
        onSetSelection(message, current.initialSelectedIds.has(message.id))
      }
    }
    for (let cursor = nextStart; cursor <= nextEnd; cursor += 1) {
      if (cursor < previousStart || cursor > previousEnd) {
        onSetSelection(messages[cursor], current.select)
      }
    }
    current.lastIndex = index
  }

  function startDragSelection(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || bulkLoading) return
    if (!(event.target instanceof Element)) return
    const row = event.target.closest('.message-row__main')
      ?.closest<HTMLElement>('[data-message-index]')
    const index = Number(row?.dataset.messageIndex)
    if (!Number.isInteger(index)) return
    suppressClick.current = false
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      anchorIndex: index,
      lastIndex: index,
      active: false,
      select: !selectedIds.has(messages[index].id),
      initialSelectedIds: new Set(selectedIds),
    }
  }

  function continueDragSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (!current.active) {
      const distance = Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      )
      if (distance < 6) return
      current.active = true
      event.currentTarget.setPointerCapture(event.pointerId)
      suppressClick.current = true
      setBulkMode(true)
      setDragSelecting(true)
      onSetSelection(messages[current.anchorIndex], current.select)
    }
    event.preventDefault()
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-message-index]')
    const index = Number(target?.dataset.messageIndex)
    if (Number.isInteger(index)) applyDragSelection(index)
  }

  function finishDragSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    drag.current = null
    setDragSelecting(false)
    if (current.active) {
      event.preventDefault()
      window.setTimeout(() => {
        suppressClick.current = false
      }, 0)
    }
  }

  function cancelDragSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    suppressClick.current = false
    setDragSelecting(false)
  }

  function selectOrOpen(message: MessageSummary) {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    if (bulkMode) onToggleSelection(message)
    else onSelect(message)
  }

  function openContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    message: MessageSummary,
  ) {
    if (window.matchMedia('(max-width: 760px), (hover: none) and (pointer: coarse)').matches) return
    event.preventDefault()
    if (bulkMode || bulkLoading) return
    const rect = event.currentTarget.getBoundingClientRect()
    const actions = contextActions(folder, message)
    const width = 196
    const height = actions.length * 40 + 12
    const requestedX = event.clientX || rect.left + 24
    const requestedY = event.clientY || rect.top + 24
    setContextMenu({
      message,
      x: Math.max(8, Math.min(requestedX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(requestedY, window.innerHeight - height - 8)),
    })
  }

  function closeBulkMode() {
    messages
      .filter((message) => selectedIds.has(message.id))
      .forEach(onToggleSelection)
    setBulkMode(false)
  }

  if (loading) {
    return <div className="list-state" role="status">
      <LoaderCircle className="spin" size={21} /><span>{t('正在读取邮件')}</span>
    </div>
  }
  if (!messages.length) {
    return <div className="list-state list-state--empty">
      <span className="empty-symbol"><Inbox size={24} /></span>
      <strong>{t('这里还是空的')}</strong><span>{t('新邮件到达后会出现在这里。')}</span>
    </div>
  }

  return <>
  <div className="message-list-shell">
    <div
      className={`bulk-toolbar${bulkMode ? ' is-bulk-mode' : ' bulk-toolbar--idle'}${selectedIds.size ? ' is-active' : ''}`}
      aria-label={t('批量邮件操作')}
    >
      {bulkMode ? (
        <BulkToolbar folder={folder} messages={messages} selectedIds={selectedIds}
          loading={bulkLoading} onSelectAll={onSelectAll} onAction={onBulkAction}
          onCancel={closeBulkMode} />
      ) : (
        <button className="bulk-mode-trigger" type="button" onClick={() => setBulkMode(true)}>
          <ListChecks size={15} />{t('批量操作')}
        </button>
      )}
    </div>
    <div
      className={`message-list${bulkMode ? ' is-bulk-mode' : ''}${dragSelecting ? ' is-drag-selecting' : ''}${scrollbarActive ? ' is-scrollbar-active' : ''}`}
      role="listbox" aria-label={t('邮件列表')} onScroll={showScrollbarWhileScrolling}
      onPointerDown={startDragSelection} onPointerMove={continueDragSelection}
      onPointerUp={finishDragSelection} onPointerCancel={cancelDragSelection}>
    {messages.map((message, index) => (
      <article
        className={`message-row ${!message.isRead ? 'is-unread' : ''} ${selectedId === message.id ? 'is-selected' : ''} ${selectedIds.has(message.id) ? 'is-checked' : ''}`}
        key={message.id} role="option" aria-selected={selectedId === message.id}
        data-message-index={index}
        onContextMenu={(event) => openContextMenu(event, message)}
      >
        <span className="message-row__check" aria-hidden={!bulkMode}>
          <SelectionCheckbox
            checked={selectedIds.has(message.id)}
            disabled={!bulkMode}
            label={t('选择邮件：{subject}', { subject: message.subject })}
            onChange={() => onToggleSelection(message)}
          />
        </span>
        <button className="message-row__main" type="button"
          onClick={() => selectOrOpen(message)}
          data-tooltip={message.subject.length > 40 ? message.subject : undefined}>
          <span className="message-row__top">
            <strong>{senderLabel(message)}</strong>
            <time dateTime={new Date(message.date).toISOString()}>{formatMessageDate(message.date)}</time>
          </span>
          <span className="message-row__subject">
            {message.status === 'processing' && <LoaderCircle className="spin" size={13} />}
            {message.status === 'failed' && <AlertCircle size={13} />}
            <span className="message-row__subject-text">{message.subject}</span>
          </span>
          <span className="message-row__preview">{message.preview || t('暂无正文预览')}</span>
          {showMailbox && <span className="mailbox-hint"><AtSign size={12} />{message.mailboxAddress}</span>}
          {message.attachmentCount > 0 && <span className="attachment-hint">
            <Paperclip size={12} /> {message.attachmentCount}
          </span>}
        </button>
        <button className={`row-star ${message.isStarred ? 'is-active' : ''}`}
          type="button" onClick={() => onStar(message)}
          aria-label={t(message.isStarred ? '取消星标' : '添加星标')}
          data-tooltip={t(message.isStarred ? '取消星标' : '添加星标')}>
          <Star size={16} fill={message.isStarred ? 'currentColor' : 'none'} />
        </button>
      </article>
    ))}
    {page.hasMore && <button className="button button--secondary message-load-more"
      type="button" disabled={loadingMore} onClick={onLoadMore}>
      {loadingMore && <LoaderCircle className="spin" size={15} />}
      {t(loadingMore ? '正在加载…' : '加载更多邮件')}
    </button>}
    </div>
  </div>
  {contextMenu && (
    <MessageContextMenu
      state={contextMenu}
      folder={folder}
      onAction={onBulkAction}
      onClose={() => setContextMenu(null)}
    />
  )}
  </>
}
