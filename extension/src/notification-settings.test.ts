import { describe, expect, it } from 'vitest'
import {
  isQuietTime,
  NOTIFICATION_SOURCE_IDS,
  normalizedNotificationSettings,
} from './notification-settings'

describe('Float notification settings', () => {
  it('enables every server-indexed source by default and rejects unknown sources', () => {
    expect(normalizedNotificationSettings({}).notificationSources)
      .toEqual(NOTIFICATION_SOURCE_IDS)
    expect(normalizedNotificationSettings({
      notificationSources: ['gmail', 'attacker'] as never,
    }).notificationSources).toEqual(['gmail'])
  })

  it('supports daytime and overnight quiet hours in local time', () => {
    const daytime = normalizedNotificationSettings({
      quietHoursStart: '09:00', quietHoursEnd: '17:00',
    })
    const overnight = normalizedNotificationSettings({
      quietHoursStart: '22:00', quietHoursEnd: '07:00',
    })
    expect(isQuietTime(daytime, new Date(2026, 0, 1, 12, 0))).toBe(true)
    expect(isQuietTime(daytime, new Date(2026, 0, 1, 18, 0))).toBe(false)
    expect(isQuietTime(overnight, new Date(2026, 0, 1, 23, 0))).toBe(true)
    expect(isQuietTime(overnight, new Date(2026, 0, 1, 6, 0))).toBe(true)
    expect(isQuietTime(overnight, new Date(2026, 0, 1, 12, 0))).toBe(false)
  })
})
