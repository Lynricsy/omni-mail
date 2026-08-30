import { describe, expect, it } from 'vitest'
import { gmailSyncErrorCode, missingGmailUids } from './gmail-sync'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import { GmailStoreError } from './gmail-store'
import type { GmailMessageMetadata } from './gmail-types'

function message(uid: number): GmailMessageMetadata {
  return {
    gmailMessageId: String(uid), gmailThreadId: '', imapUid: uid,
    messageIdHeader: '', senderName: '', senderAddress: '', recipients: [], cc: [],
    subject: '', preview: '', internalDate: 0, sizeBytes: 0, flags: [], labels: [],
    isRead: false, isStarred: false, hasAttachments: false,
  }
}

describe('Gmail synchronization decisions', () => {
  it('removes only indexed UIDs no longer returned by the read-only mailbox', () => {
    expect(missingGmailUids([10, 11, 12], [message(10), message(12)])).toEqual([11])
  })

  it('normalizes remote failures without exposing server responses', () => {
    expect(gmailSyncErrorCode(new ImapConnectionError(400, 'secret response')))
      .toBe('authentication_failed')
    expect(gmailSyncErrorCode(new ImapConnectionError(504, 'timeout'))).toBe('timeout')
    expect(gmailSyncErrorCode(new Error('mail subject'))).toBe('sync_failed')
    expect(gmailSyncErrorCode(new GmailStoreError(503, 'key')))
      .toBe('credential_key_unavailable')
  })
})
