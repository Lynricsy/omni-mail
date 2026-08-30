import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env, SessionUser } from '../../app/types'
import {
  encryptMicrosoftCredential,
  microsoftCredentialContext,
} from './microsoft-credentials'
import { getMicrosoftMessage } from './microsoft-message-api'

const { close, getMessage, markSeen, openMicrosoftClient } = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  getMessage: vi.fn(async () => ({
    message: {
      id: '7', from: 'Sender <sender@example.com>', to: 'user@outlook.com', cc: '',
      subject: 'Subject', date: '2026-08-25T00:00:00.000Z', body: 'Body', html: '',
      attachments: [],
    },
    parsedAttachments: [],
  })),
  markSeen: vi.fn(async () => undefined),
  openMicrosoftClient: vi.fn(async () => ({
    close,
    examineFolder: async () => ({ uidValidity: 42, exists: 1 }),
    getMessage,
    markSeen,
  })),
}))

vi.mock('./microsoft-session', () => ({ openMicrosoftClient }))

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: false, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

const key = 'microsoft-message-test-key-longer-than-thirty-two-bytes'

async function testEnv(isRead = 0) {
  const refreshTokenCipher = await encryptMicrosoftCredential(
    { MICROSOFT_CREDENTIALS_KEY: key } as Env,
    'refresh-secret',
    microsoftCredentialContext(user.id, 'microsoft-1', 'refresh-token'),
  )
  const statements: Array<{ sql: string; bindings: unknown[] }> = []
  const messageRow = {
    id: 'message-1', account_id: 'microsoft-1', folder_path: 'INBOX',
    uid_validity: 42, imap_uid: 7, internet_message_id: '<message@example.com>',
    sender_name: 'Sender', sender_address: 'sender@example.com', recipients_json: '[]',
    cc_json: '[]', subject: 'Subject', preview: '', received_at: 1, sent_at: null,
    size_bytes: 100, is_read: isRead, is_starred: 0, has_attachments: 0,
    account_name: 'Work', account_email: 'user@outlook.com', account_status: 'active',
  }
  const accountRow = {
    id: 'microsoft-1', user_id: user.id, name: 'Work',
    provided_email: 'user@outlook.com', normalized_email: 'user@outlook.com',
    auth_mode: 'oauth2', client_id: '00000000-0000-4000-8000-000000000000',
    authority: 'common', refresh_token_cipher: refreshTokenCipher,
    access_token_cipher: '', access_token_expires_at: null, password_cipher: '',
    combination_password_cipher: '', status: 'active', last_synced_at: 1,
    next_sync_at: 1, last_error_code: '', last_error_at: null, sync_lease_id: null,
    sync_lease_until: null, token_lease_id: null, token_lease_until: null,
    last_manual_sync_at: null, created_at: 1, updated_at: 1,
  }
  const env = {
    MICROSOFT_CREDENTIALS_KEY: key,
    DB: { prepare(sql: string) {
      return { bind: (...bindings: unknown[]) => {
        statements.push({ sql, bindings })
        return {
          first: async () => sql.includes('JOIN microsoft_imap_messages')
            ? messageRow : sql.includes('SELECT * FROM microsoft_imap_accounts')
              ? accountRow : null,
          run: async () => ({ meta: { changes: 1 } }),
        }
      } }
    } },
  } as unknown as Env
  return { env, statements }
}

describe('Microsoft message open behavior', () => {
  beforeEach(() => {
    close.mockClear()
    getMessage.mockClear()
    markSeen.mockReset().mockResolvedValue(undefined)
    openMicrosoftClient.mockClear()
  })

  it('marks an unread remote message Seen and updates the local index', async () => {
    const { env, statements } = await testEnv()
    const response = await getMicrosoftMessage(env, user, 'microsoft-1', 'message-1')
    const result = await response.json() as { message: { isRead: boolean; body: string } }

    expect(response.status).toBe(200)
    expect(result.message).toMatchObject({ isRead: true, body: 'Body' })
    expect(markSeen).toHaveBeenCalledWith('INBOX', 7, 42)
    expect(statements.some(({ sql, bindings }) => (
      sql.includes('UPDATE microsoft_imap_messages SET is_read = 1')
      && bindings.includes('message-1')
    ))).toBe(true)
  })

  it('still returns the body when Microsoft rejects the Seen update', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    markSeen.mockRejectedValueOnce(new Error('STORE rejected'))
    const { env, statements } = await testEnv()
    const response = await getMicrosoftMessage(env, user, 'microsoft-1', 'message-1')
    const result = await response.json() as { message: { isRead: boolean; body: string } }
    logged.mockRestore()

    expect(response.status).toBe(200)
    expect(result.message).toMatchObject({ isRead: false, body: 'Body' })
    expect(statements.some(({ sql }) => (
      sql.includes('UPDATE microsoft_imap_messages SET is_read = 1')
    ))).toBe(false)
  })

  it('does not write Seen again when the indexed message is already read', async () => {
    const { env } = await testEnv(1)
    const response = await getMicrosoftMessage(env, user, 'microsoft-1', 'message-1')
    const result = await response.json() as { message: { isRead: boolean } }

    expect(response.status).toBe(200)
    expect(result.message.isRead).toBe(true)
    expect(markSeen).not.toHaveBeenCalled()
  })
})
