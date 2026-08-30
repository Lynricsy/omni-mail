import type { MailSourceId } from './mail-source'

export const NOTIFICATION_SOURCE_IDS: MailSourceId[] = [
  'omnimail', 'icloud', 'linuxdo', 'gmail', 'microsoft', 'qq', 'naver', 'yandex',
]

export interface NotificationSettings {
  notificationsEnabled: boolean
  notificationSources: MailSourceId[]
  quietHoursStart: string
  quietHoursEnd: string
}

function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function normalizedNotificationSettings(
  value: Partial<NotificationSettings>,
): NotificationSettings {
  const sources = Array.isArray(value.notificationSources)
    ? value.notificationSources.filter((source): source is MailSourceId => (
        NOTIFICATION_SOURCE_IDS.includes(source as MailSourceId)
      ))
    : NOTIFICATION_SOURCE_IDS
  return {
    notificationsEnabled: value.notificationsEnabled !== false,
    notificationSources: [...new Set(sources)],
    quietHoursStart: validTime(value.quietHoursStart) ? value.quietHoursStart : '',
    quietHoursEnd: validTime(value.quietHoursEnd) ? value.quietHoursEnd : '',
  }
}

function minuteOfDay(value: string): number {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function isQuietTime(
  settings: NotificationSettings,
  date = new Date(),
): boolean {
  if (!settings.quietHoursStart || !settings.quietHoursEnd) return false
  const start = minuteOfDay(settings.quietHoursStart)
  const end = minuteOfDay(settings.quietHoursEnd)
  const current = date.getHours() * 60 + date.getMinutes()
  if (start === end) return false
  return start < end
    ? current >= start && current < end
    : current >= start || current < end
}
