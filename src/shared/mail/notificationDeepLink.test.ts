import { describe, expect, it } from 'vitest'
import { notificationDeepLink } from './notificationDeepLink'

describe('mail notification deep links', () => {
  it('accepts only the matching fixed source and bounded identifiers', () => {
    expect(notificationDeepLink(
      'gmail',
      '?source=gmail&accountId=gmail-1&messageId=message-1',
    )).toEqual({ accountId: 'gmail-1', messageId: 'message-1' })
    expect(notificationDeepLink(
      'qq',
      '?source=gmail&accountId=gmail-1&messageId=message-1',
    )).toBeNull()
    expect(notificationDeepLink('gmail', '?source=gmail&messageId=')).toBeNull()
  })
})
