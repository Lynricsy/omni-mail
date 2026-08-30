import type { MessageSummary } from '../api'
import { getLocale, t } from '../i18n'

export function formatMessageDate(timestamp: number): string {
  const date = new Date(timestamp)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat(getLocale(), {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
  }
  return new Intl.DateTimeFormat(getLocale(), {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export function senderLabel(message: MessageSummary): string {
  if (message.direction === 'outgoing') {
    return t('发给 {recipients}', { recipients: message.recipients.join(', ') })
  }
  return message.senderName || message.senderAddress
}
