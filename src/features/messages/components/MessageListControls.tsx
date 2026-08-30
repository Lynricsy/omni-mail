import {
  LoaderCircle,
  Mail,
  MailOpen,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Folder, MessageSummary } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import type { BulkMessageAction } from '../model/messageActions'

export type MessageContextMenuState = {
  message: MessageSummary
  x: number
  y: number
}

export function contextActions(folder: Folder, message: MessageSummary) {
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

export function MessageContextMenu({
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

export function SelectionCheckbox({
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

export function BulkToolbar({
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
