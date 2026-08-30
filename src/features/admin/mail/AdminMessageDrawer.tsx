import { ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api, type AdminMessageDetail } from '../../../shared/api'
import { t } from '../../../shared/i18n'
import { MessageReader } from '../../messages/components/MessageReader'

const DRAWER_EXIT_MS = 170

export function AdminMessageDrawer({
  open,
  message,
  loading,
  remoteImagesEnabled,
  onClose,
  onTrash,
  onRestore,
  interactionBlocked,
}: {
  open: boolean
  message: AdminMessageDetail | null
  loading: boolean
  remoteImagesEnabled: boolean
  onClose: () => void
  onTrash: () => void
  onRestore: () => void
  interactionBlocked: boolean
}) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const drawerRef = useRef<HTMLElement>(null)
  const retainedMessage = useRef(message)
  const openRef = useRef(open)
  const onCloseRef = useRef(onClose)
  const interactionBlockedRef = useRef(interactionBlocked)
  if (message) retainedMessage.current = message
  openRef.current = open
  onCloseRef.current = onClose
  interactionBlockedRef.current = interactionBlocked

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    setVisible(false)
    if (!mounted) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(
      () => setMounted(false),
      reducedMotion ? 0 : DRAWER_EXIT_MS,
    )
    return () => window.clearTimeout(timer)
  }, [mounted, open])

  useEffect(() => {
    if (!mounted || !open) return
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [mounted, open])

  useEffect(() => {
    if (!mounted) return
    const previousFocus = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (!openRef.current || interactionBlockedRef.current) return
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key !== 'Tab') return
      const controls = drawerRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], iframe[tabindex="0"]',
      )
      if (!controls?.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [mounted])

  if (!mounted) return null
  const displayedMessage = message ?? retainedMessage.current
  const state = open ? (visible ? 'open' : 'opening') : 'closing'

  return (
    <div className={`admin-mail-drawer-backdrop${visible ? ' is-visible' : ''}`}
      data-state={state} role="presentation" onMouseDown={(event) => {
      if (open && event.target === event.currentTarget) onClose()
    }}>
      <aside
        ref={drawerRef}
        className="admin-mail-drawer"
        role="dialog"
        aria-modal="true"
        aria-hidden={!open || undefined}
        aria-label={t('全站邮件详情')}
        inert={!open || undefined}
      >
        <header className="admin-mail-owner">
          <ShieldCheck size={18} />
          <div>
            <strong>{displayedMessage?.owner.displayName || t('正在读取所属用户…')}</strong>
            <span>{displayedMessage?.owner.email || t('主管理员只读访问')}</span>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={t('关闭')}>
            <X size={18} />
          </button>
        </header>
        <MessageReader
          message={displayedMessage}
          loading={loading}
          replyEnabled={false}
          translationEnabled={false}
          remoteImagesEnabled={remoteImagesEnabled}
          thread={displayedMessage ? [displayedMessage] : []}
          managementMode
          attachmentUrl={api.adminAttachmentUrl}
          attachmentPreviewUrl={api.adminAttachmentPreviewUrl}
          rawUrl={api.adminRawUrl}
          onBack={onClose}
          onStar={() => undefined}
          onTrash={onTrash}
          onRestore={onRestore}
          onReplySent={() => undefined}
          canRetryFailedMessage={false}
          onRetryFailedMessage={() => undefined}
          onSelectThread={() => undefined}
        />
      </aside>
    </div>
  )
}
