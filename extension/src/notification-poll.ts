import type { MailSourceId } from './mail-source'
import { isQuietTime, normalizedNotificationSettings } from './notification-settings'

type AuthenticatedRequest = <T = unknown>(path: string, init?: RequestInit) => Promise<T>

interface NotificationCandidate {
  key: string
  source: MailSourceId
  accountId: string
  messageId: string
  sender: string
  subject: string
  unread: boolean
}

interface NotificationResult {
  messages: Array<{
    source: MailSourceId
    accountId: string
    messageId: string
    senderName: string
    senderAddress: string
    subject: string
    isRead: boolean
  }>
  sources: MailSourceId[]
  unread: number
}

const notificationRoutes: Record<MailSourceId, string> = {
  omnimail: '/mail/inbox', icloud: '/icloud', linuxdo: '/linux-do-mail',
  gmail: '/gmail', microsoft: '/microsoft', qq: '/qq-mail',
  naver: '/naver-mail', yandex: '/yandex-mail',
}

function notificationKey(source: MailSourceId, accountId: string, messageId: string): string {
  return `${source}:${accountId}:${messageId}`
}

function notificationRoute(candidate: NotificationCandidate): string {
  const search = new URLSearchParams({
    source: candidate.source,
    accountId: candidate.accountId,
    messageId: candidate.messageId,
  })
  return `${notificationRoutes[candidate.source]}?${search}`
}

async function updateBadge(unread: number): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ color: '#c9342f' }),
    chrome.action.setBadgeText({ text: unread > 0 ? String(Math.min(unread, 99)) : '' }),
  ])
}

async function pollCandidates(request: AuthenticatedRequest, enabled: Set<MailSourceId>) {
  if (!enabled.size) {
    return { candidates: [], polledSources: new Set<MailSourceId>(), unread: 0 }
  }
  const sources = [...enabled]
  const result = await request<NotificationResult>(
    `/api/mail-notifications?limit=50&sources=${encodeURIComponent(sources.join(','))}`,
  )
  return {
    candidates: result.messages.map((message) => ({
      key: notificationKey(message.source, message.accountId, message.messageId),
      source: message.source,
      accountId: message.accountId,
      messageId: message.messageId,
      sender: message.senderName || message.senderAddress,
      subject: message.subject,
      unread: !message.isRead,
    })),
    polledSources: new Set(result.sources),
    unread: result.unread,
  }
}

async function pollMail(request: AuthenticatedRequest): Promise<void> {
  const stored = await chrome.storage.local.get([
    'notificationsEnabled', 'notificationSources', 'quietHoursStart', 'quietHoursEnd',
    'knownMessageKeys', 'knownNotificationSources', 'notificationTargets',
  ])
  const settings = normalizedNotificationSettings(stored)
  if (!settings.notificationsEnabled) return updateBadge(0)
  const result = await pollCandidates(request, new Set(settings.notificationSources))
  const previousKeys = Array.isArray(stored.knownMessageKeys)
    ? new Set<string>(stored.knownMessageKeys) : null
  const previousSources = new Set<MailSourceId>(
    Array.isArray(stored.knownNotificationSources) ? stored.knownNotificationSources : [],
  )
  const fresh = previousKeys ? result.candidates.filter((candidate) => (
    candidate.unread && previousSources.has(candidate.source) && !previousKeys.has(candidate.key)
  )) : []
  await chrome.storage.local.set({
    knownMessageKeys: result.candidates.map(({ key }) => key),
    knownNotificationSources: [...result.polledSources],
  })
  await updateBadge(result.unread)
  if (!fresh.length || isQuietTime(settings)) return
  const first = fresh[0]
  const notificationId = `float:${crypto.randomUUID()}`
  const targets = stored.notificationTargets && typeof stored.notificationTargets === 'object'
    ? stored.notificationTargets as Record<string, string> : {}
  targets[notificationId] = notificationRoute(first)
  await chrome.storage.local.set({ notificationTargets: targets })
  await chrome.notifications.create(notificationId, {
    type: 'basic', iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: fresh.length === 1
      ? `${first.source === 'omnimail' ? 'OmniMail' : first.source} 收到新邮件`
      : `多个邮箱收到 ${fresh.length} 封新邮件`,
    message: `${first.sender || '未知发件人'} · ${first.subject || '（无主题）'}`,
  })
}

let pollPromise: Promise<void> | null = null

export function runMailPoll(
  request: AuthenticatedRequest,
  _scopes?: () => Promise<string[] | undefined>,
): Promise<void> {
  if (!pollPromise) pollPromise = pollMail(request).finally(() => { pollPromise = null })
  return pollPromise
}
