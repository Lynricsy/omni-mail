import { describe, expect, it, vi } from 'vitest'
import { encryptGmailCredential } from './gmail-credentials'
import { createGmailAccount, updateGmailAppPassword } from './gmail-api'
import { ImapConnectionError } from '../../platform/imap/imap-errors'
import type { Env, SessionUser } from '../../app/types'

vi.mock('./gmail-imap', () => ({
  GmailImapClient: class {
    async open() { throw new ImapConnectionError(400, 'remote credential detail', true) }
    async examineInbox() { return { uidValidity: 1, exists: 0 } }
    async close() { /* no-op */ }
  },
}))

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: false, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

const key = 'gmail-test-key-that-is-longer-than-thirty-two-characters'

function request(path: string, body: unknown): Request {
  return new Request(`https://mail.example.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Gmail credential validation ordering', () => {
  it('does not insert an account when remote validation fails', async () => {
    const statements: string[] = []
    const env = {
      GMAIL_CREDENTIALS_KEY: key,
      DB: { prepare(sql: string) {
        statements.push(sql)
        return { bind: () => ({
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 1 } }),
        }) }
      } },
    } as unknown as Env

    const response = await createGmailAccount(
      env,
      user,
      request('/api/gmail/accounts', {
        name: 'Personal', email: 'user@gmail.com', appPassword: 'abcdefghijklmnop',
      }),
      '192.0.2.1',
    )

    expect(response.status).toBe(400)
    expect(statements.some((sql) => /INSERT INTO gmail_imap_accounts/i.test(sql))).toBe(false)
    expect(JSON.stringify(await response.json())).not.toContain('remote credential detail')
  })

  it('preserves the previous ciphertext when a replacement password fails validation', async () => {
    const oldCipher = await encryptGmailCredential(
      { GMAIL_CREDENTIALS_KEY: key } as Env,
      'oldoldoldoldoldo',
      'user-1:gmail-1:app-password',
    )
    const statements: string[] = []
    const env = {
      GMAIL_CREDENTIALS_KEY: key,
      DB: { prepare(sql: string) {
        statements.push(sql)
        return { bind: () => ({
          first: async () => sql.includes('SELECT * FROM gmail_imap_accounts') ? {
            id: 'gmail-1', user_id: 'user-1', name: 'Personal', email: 'user@gmail.com',
            app_password_cipher: oldCipher, status: 'active', uid_validity: 1,
            last_seen_uid: 1, last_synced_at: 1, next_sync_at: 1,
            last_error_code: '', last_error_at: null, sync_lease_id: null,
            sync_lease_until: null, last_manual_sync_at: null, created_at: 1, updated_at: 1,
          } : null,
          run: async () => ({ meta: { changes: 1 } }),
        }) }
      } },
    } as unknown as Env

    const response = await updateGmailAppPassword(
      env,
      user,
      'gmail-1',
      request('/api/gmail/accounts/gmail-1/app-password', {
        appPassword: 'newnewnewnewnewn',
      }),
      '192.0.2.1',
    )

    expect(response.status).toBe(400)
    expect(statements.some((sql) => /UPDATE gmail_imap_accounts SET app_password_cipher/i.test(sql)))
      .toBe(false)
  })
})
