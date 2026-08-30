import { afterEach, describe, expect, it } from 'vitest'
import type { ICloudMessage } from '../../../shared/api/api-types'
import {
  activateICloudMailCacheUser,
  clearICloudAccountCache,
  ICLOUD_INBOX_CACHE_MS,
  ICLOUD_MESSAGE_CACHE_MS,
  readICloudInboxCache,
  readICloudMessageCache,
  resetICloudMailCache,
  writeICloudInboxCache,
  writeICloudMessageCache,
  type ICloudInboxScope,
} from './icloudMailCache'

const scope: ICloudInboxScope = {
  userId: 'user-1', accountId: 'icloud-1', alias: '', query: '',
}
const unread: ICloudMessage = {
  id: '42', from: 'sender@example.com', to: 'alias@icloud.com', subject: 'Subject',
  date: '', preview: 'Preview', body: '', html: '', isRead: false,
}

afterEach(resetICloudMailCache)

describe('iCloud in-memory mail cache', () => {
  it('reports freshness while retaining stale inbox data for background refresh', () => {
    writeICloudInboxCache(scope, { messages: [unread], method: 'imap' }, 1_000)

    expect(readICloudInboxCache(scope, 1_000 + ICLOUD_INBOX_CACHE_MS - 1)?.fresh).toBe(true)
    const stale = readICloudInboxCache(scope, 1_000 + ICLOUD_INBOX_CACHE_MS)
    expect(stale?.fresh).toBe(false)
    expect(stale?.value.messages).toHaveLength(1)
  })

  it('propagates a successful Seen update to every cached inbox scope', () => {
    const searchScope = { ...scope, query: 'subject' }
    writeICloudInboxCache(scope, { messages: [unread], method: 'imap' })
    writeICloudInboxCache(searchScope, { messages: [unread], method: 'imap' })
    writeICloudMessageCache(scope.userId, scope.accountId, { ...unread, isRead: true })

    expect(readICloudInboxCache(scope)?.value.messages[0].isRead).toBe(true)
    expect(readICloudInboxCache(searchScope)?.value.messages[0].isRead).toBe(true)
  })

  it('allows a refreshed inbox to restore unread after the detail cache expires', () => {
    writeICloudMessageCache(scope.userId, scope.accountId, { ...unread, isRead: true }, 1_000)
    writeICloudInboxCache(
      scope,
      { messages: [unread], method: 'imap' },
      1_000 + ICLOUD_MESSAGE_CACHE_MS,
    )

    expect(readICloudInboxCache(scope)?.value.messages[0].isRead).toBe(false)
  })

  it('isolates users and clears one account without affecting another', () => {
    writeICloudInboxCache(scope, { messages: [unread], method: 'imap' })
    writeICloudMessageCache(scope.userId, scope.accountId, unread)
    const other = { ...scope, accountId: 'icloud-2' }
    writeICloudInboxCache(other, { messages: [unread], method: 'imap' })

    clearICloudAccountCache(scope.userId, scope.accountId)
    expect(readICloudInboxCache(scope)).toBeNull()
    expect(readICloudMessageCache(scope.userId, scope.accountId, unread.id)).toBeNull()
    expect(readICloudInboxCache(other)).not.toBeNull()

    activateICloudMailCacheUser('user-1')
    activateICloudMailCacheUser('user-2')
    expect(readICloudInboxCache(other)).toBeNull()
  })
})
