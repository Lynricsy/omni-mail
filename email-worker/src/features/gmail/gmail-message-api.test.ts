import { describe, expect, it, vi } from 'vitest'
import { getGmailMessage } from './gmail-api'
import { encryptGmailCredential } from './gmail-credentials'
import type { Env, SessionUser } from '../../app/types'

const { close, markSeen } = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  markSeen: vi.fn(async () => undefined),
}))

vi.mock('./gmail-imap', () => ({
  GmailImapClient: class {
    async open() { /* no-op */ }
    async close() { return close() }
    async examineInbox() { return { uidValidity: 123, exists: 1 } }
    async findUid() { return 42 }
    async markSeen(uid: number) { return markSeen(uid) }
    async getMessage(uid: number) {
      return {
        message: {
          id: String(uid), from: 'Sender <sender@example.com>', to: 'user@gmail.com', cc: '',
          subject: 'Subject', date: '2026-08-24T00:00:00.000Z', body: 'Body', html: '',
          attachments: [],
        },
        parsedAttachments: [],
      }
    }
  },
}))

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: false, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

describe('Gmail message open behavior', () => {
  it('marks an unread remote message Seen and updates the local index', async () => {
    close.mockClear()
    markSeen.mockClear()
    const key = 'gmail-test-key-that-is-longer-than-thirty-two-characters'
    const cipher = await encryptGmailCredential(
      { GMAIL_CREDENTIALS_KEY: key } as Env,
      'abcdefghijklmnop',
      'user-1:gmail-1:app-password',
    )
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const env = {
      GMAIL_CREDENTIALS_KEY: key,
      DB: {
        prepare(sql: string) {
          return { bind: (...bindings: unknown[]) => {
            statements.push({ sql, bindings })
            return {
              first: async () => {
                if (sql.includes('JOIN gmail_imap_messages')) return {
                  id: 'message-1', account_id: 'gmail-1', gmail_message_id: '12345',
                  imap_uid: 42, uid_validity: 123, sender_name: 'Sender',
                  sender_address: 'sender@example.com', recipients_json: '[]', cc_json: '[]',
                  subject: 'Subject', preview: '', internal_date: 1, size_bytes: 100,
                  is_read: 0, is_starred: 0, has_attachments: 0,
                  account_name: 'Personal', account_email: 'user@gmail.com',
                  account_status: 'active',
                }
                if (sql.includes('SELECT * FROM gmail_imap_accounts')) return {
                  id: 'gmail-1', user_id: 'user-1', name: 'Personal', email: 'user@gmail.com',
                  app_password_cipher: cipher, status: 'active', uid_validity: 123,
                  last_seen_uid: 42, last_synced_at: 1, next_sync_at: 1,
                  last_error_code: '', last_error_at: null, sync_lease_id: null,
                  sync_lease_until: null, last_manual_sync_at: null, created_at: 1, updated_at: 1,
                }
                return null
              },
              run: async () => ({ meta: { changes: 1 } }),
            }
          } }
        },
      },
    } as unknown as Env

    const response = await getGmailMessage(env, user, 'gmail-1', 'message-1')
    const result = await response.json() as { message: { isRead: boolean; body: string } }

    expect(response.status).toBe(200)
    expect(result.message).toMatchObject({ isRead: true, body: 'Body' })
    expect(markSeen).toHaveBeenCalledWith(42)
    expect(statements.some(({ sql, bindings }) => (
      sql.includes('UPDATE gmail_imap_messages SET is_read = 1')
      && bindings.slice(1).includes('message-1')
    ))).toBe(true)

    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    markSeen.mockRejectedValueOnce(new Error('STORE rejected'))
    const failedResponse = await getGmailMessage(env, user, 'gmail-1', 'message-1')
    const failedResult = await failedResponse.json() as {
      message: { isRead: boolean; body: string }
    }
    expect(failedResponse.status).toBe(200)
    expect(failedResult.message).toMatchObject({ isRead: false, body: 'Body' })

    close.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('close failed'))
    const closeFailedResponse = await getGmailMessage(env, user, 'gmail-1', 'message-1')
    const closeFailedResult = await closeFailedResponse.json() as {
      message: { isRead: boolean; body: string }
    }
    logged.mockRestore()

    expect(closeFailedResponse.status).toBe(200)
    expect(closeFailedResult.message).toMatchObject({ isRead: true, body: 'Body' })
  })
})
