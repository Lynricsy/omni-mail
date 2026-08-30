import { useCallback, useRef, useState } from 'react'
import { api, type MessageSummary } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { t } from '../../../shared/i18n'

export function newUnreadMessages(
  knownIds: ReadonlySet<string>,
  messages: MessageSummary[],
): MessageSummary[] {
  return messages.filter((message) => (
    !knownIds.has(message.id)
    && message.direction === 'incoming'
    && message.folder === 'inbox'
    && !message.isRead
  ))
}

export function rememberMessageIds(
  knownIds: ReadonlySet<string>,
  messages: MessageSummary[],
): ReadonlySet<string> {
  return new Set([...knownIds, ...messages.map((message) => message.id)])
}

export function notificationInboxNeedsRefresh(
  enabled: boolean,
  currentIsGlobalInbox: boolean,
  currentVersion: number,
  inboxVersion: number | undefined,
): boolean {
  return enabled && !currentIsGlobalInbox && currentVersion !== inboxVersion
}

export interface MailNotificationControls {
  enabled: boolean
  supported: boolean
  toggle: () => void
}

export function useNewMailNotifications(
  userId: string,
  onStatus: (message: string) => void,
  onError: (message: string) => void,
) {
  const storageKey = `omnimail.mail-notifications.${userId}`
  const knownIds = useRef<ReadonlySet<string>>(new Set())
  const inboxVersion = useRef<number | undefined>(undefined)
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [enabled, setEnabled] = useState(() => (
    supported
    && window.Notification.permission === 'granted'
    && window.localStorage.getItem(storageKey) === '1'
  ))

  const toggle = useCallback(() => {
    void (async () => {
      if (!supported) throw new Error(t('当前浏览器不支持新邮件通知。'))
      if (enabled) {
        window.localStorage.removeItem(storageKey)
        setEnabled(false)
        onStatus(t('新邮件通知已关闭'))
        return
      }
      const permission = await window.Notification.requestPermission()
      if (permission !== 'granted') throw new Error(t('浏览器未授予通知权限。'))
      const baseline = await api.messages('inbox', '', { type: 'all' })
      if (!baseline.unchanged) {
        inboxVersion.current = baseline.version
        knownIds.current = rememberMessageIds(knownIds.current, baseline.messages)
      }
      window.localStorage.setItem(storageKey, '1')
      setEnabled(true)
      onStatus(t('新邮件通知已开启'))
    })().catch((notificationError) => onError(errorMessage(notificationError)))
  }, [enabled, onError, onStatus, storageKey, supported])

  const notify = useCallback((knownIds: ReadonlySet<string>, messages: MessageSummary[]) => {
    if (!enabled || !supported || window.Notification.permission !== 'granted') return
    for (const message of newUnreadMessages(knownIds, messages).slice(0, 3)) {
      const notification = new window.Notification(message.subject || t('新邮件'), {
        body: message.senderName || message.senderAddress,
        tag: `omnimail-message-${message.id}`,
      })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
  }, [enabled, supported])

  const track = useCallback(async (
    quiet: boolean,
    messages: MessageSummary[],
    currentIsGlobalInbox: boolean,
    version: number,
  ) => {
    try {
      let tracked = messages
      if (currentIsGlobalInbox) inboxVersion.current = version
      if (notificationInboxNeedsRefresh(
        enabled,
        currentIsGlobalInbox,
        version,
        inboxVersion.current,
      )) {
        const inbox = await api.messages(
          'inbox',
          '',
          { type: 'all' },
          undefined,
          inboxVersion.current,
        )
        inboxVersion.current = inbox.version
        if (inbox.unchanged) return
        tracked = inbox.messages
      }
      if (quiet) notify(knownIds.current, tracked)
      knownIds.current = rememberMessageIds(knownIds.current, tracked)
    } catch (notificationError) {
      onError(errorMessage(notificationError))
    }
  }, [enabled, notify, onError])

  return { enabled, supported, toggle, track }
}
