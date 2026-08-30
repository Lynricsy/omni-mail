export interface NotificationDeepLink {
  accountId: string
  messageId: string
}

export function notificationDeepLink(
  source: string,
  search = typeof window === 'undefined' ? '' : window.location.search,
): NotificationDeepLink | null {
  const params = new URLSearchParams(search)
  if (params.get('source') !== source) return null
  const accountId = params.get('accountId') || ''
  const messageId = params.get('messageId') || ''
  if (!messageId || accountId.length > 160 || messageId.length > 200
    || /[\r\n\0]/.test(`${accountId}${messageId}`)) return null
  return { accountId, messageId }
}
