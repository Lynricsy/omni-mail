import { describe, expect, it } from 'vitest'
import { messageSummary, parseSyncVersion } from './message-list-api'
import { searchLikePattern } from './message-search'

describe('message sync version', () => {
  it('accepts non-negative integer versions', () => {
    expect(parseSyncVersion(null)).toBeNull()
    expect(parseSyncVersion('0')).toBe(0)
    expect(parseSyncVersion('42')).toBe(42)
  })

  it('rejects malformed versions', () => {
    expect(parseSyncVersion('-1')).toBeUndefined()
    expect(parseSyncVersion('1.5')).toBeUndefined()
    expect(parseSyncVersion('latest')).toBeUndefined()
  })

  it('builds a literal full-text search pattern', () => {
    expect(searchLikePattern('invoice_50%')).toBe('%invoice\\_50\\%%')
  })

  it('shows the original recipient for unassigned mail', () => {
    const summary = messageSummary({
      id: 'message-1',
      mailbox_address: '__unassigned__@omnimail.invalid',
      delivered_to: 'unknown@example.com',
      direction: 'incoming',
      status: 'ready',
      folder: 'inbox',
      sender_name: null,
      sender_address: 'sender@example.net',
      recipients_json: '["unknown@example.com"]',
      subject: 'Hello',
      preview: 'Preview',
      received_at: 1,
      sent_at: null,
      attachment_count: 0,
      is_read: 0,
      is_starred: 0,
      processing_error: null,
      purge_after: null,
      created_at: 1,
    })

    expect(summary.mailboxAddress).toBe('unknown@example.com')
  })
})
