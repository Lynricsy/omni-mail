import { describe, expect, it } from 'vitest'
import { GmailAccountStore, publicGmailAccount } from './gmail-store'
import type { GmailAccount } from './gmail-types'
import type { Env } from '../../app/types'

const key = 'gmail-test-key-that-is-longer-than-thirty-two-characters'

function account(): GmailAccount {
  return {
    id: 'gmail-1', userId: 'user-1', name: 'Personal', email: 'user@gmail.com',
    appPassword: 'abcdefghijklmnop', status: 'active', uidValidity: 123,
    lastSeenUid: 42, lastSyncedAt: 1, nextSyncAt: 2, lastErrorCode: '',
    lastErrorAt: null, syncLeaseId: null, syncLeaseUntil: null,
    lastManualSyncAt: null, createdAt: 1, updatedAt: 1,
  }
}

describe('Gmail storage boundary', () => {
  it('never exposes credentials, ownership, or IMAP cursors', () => {
    const result = publicGmailAccount(account())
    expect(result).toMatchObject({ email: 'user@gmail.com', hasAppPassword: true })
    expect(JSON.stringify(result)).not.toContain('abcdefghijklmnop')
    expect(result).not.toHaveProperty('userId')
    expect(result).not.toHaveProperty('appPassword')
    expect(result).not.toHaveProperty('uidValidity')
  })

  it('deletes a corrupted credential without decrypting it', async () => {
    const statements: string[] = []
    const env = {
      GMAIL_CREDENTIALS_KEY: key,
      DB: {
        prepare(sql: string) {
          statements.push(sql)
          return { bind: () => ({
            first: async () => ({
              id: 'gmail-1', name: 'Personal', email: 'user@gmail.com', status: 'error',
              uid_validity: null, last_seen_uid: 0, last_synced_at: null,
              next_sync_at: 0, last_error_code: 'sync_failed', last_error_at: 1,
              sync_lease_id: null, sync_lease_until: null, last_manual_sync_at: null,
              created_at: 1, updated_at: 1,
            }),
            run: async () => ({ meta: { changes: 1 } }),
          }) }
        },
      },
    } as unknown as Env
    await expect(new GmailAccountStore(env, 'user-1').remove('gmail-1')).resolves
      .toMatchObject({ id: 'gmail-1', hasAppPassword: true })
    expect(statements[0]).not.toContain('app_password_cipher')
    expect(statements[1]).toContain('DELETE FROM gmail_imap_accounts')
  })

  it('invalidates an in-flight sync lease when replacing the app password', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const env = {
      GMAIL_CREDENTIALS_KEY: key,
      DB: {
        prepare(sql: string) {
          return { bind: (...bindings: unknown[]) => ({
            run: async () => {
              statements.push({ sql, bindings })
              return { meta: { changes: 1 } }
            },
          }) }
        },
      },
    } as unknown as Env

    await new GmailAccountStore(env, 'user-1')
      .replaceAppPassword('gmail-1', 'newnewnewnewnewn', 10)

    expect(statements[0].sql).toContain('sync_lease_id = NULL')
    expect(statements[0].sql).toContain('sync_lease_until = NULL')
    expect(statements[0].bindings.slice(-3)).toEqual([10, 'gmail-1', 'user-1'])
  })
})
