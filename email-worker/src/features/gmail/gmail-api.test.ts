import { describe, expect, it, vi } from 'vitest'
import {
  createGmailAccount,
  gmailAppPasswordField,
  gmailEmailField,
  gmailNameField,
  getGmailMessage,
  listGmailMessages,
  listGmailAccounts,
  requestGmailSync,
} from './gmail-api'
import type { Env, SessionUser } from '../../app/types'

const user = {
  id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'user',
  mailboxLimit: 1, storageQuotaBytes: 1024, storageUsedBytes: 0,
  canCreateMailboxes: false, canReply: false, canTranslate: false,
  temporaryExpiresAt: null,
} satisfies SessionUser

function request(body: unknown): Request {
  return new Request('https://mail.example.com/api/gmail/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Gmail account API validation', () => {
  it('normalizes only ordinary display spaces in the 16-character app password', () => {
    expect(gmailAppPasswordField('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop')
    expect(() => gmailAppPasswordField('google-account-password')).toThrow('16 位')
    expect(() => gmailAppPasswordField('abcd\tefghijklmnop')).toThrow('16 位')
  })

  it('validates account labels and full email addresses', () => {
    expect(gmailNameField(' Personal ')).toBe('Personal')
    expect(gmailEmailField('USER@Example.com')).toBe('user@example.com')
    expect(() => gmailEmailField('gmail-user')).toThrow('完整')
  })

  it('does not touch D1 or the network for invalid credentials', async () => {
    const response = await createGmailAccount(
      {} as Env,
      user,
      request({ name: 'Personal', email: 'user@gmail.com', appPassword: 'main-password' }),
      '192.0.2.1',
    )
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: '请填写 Google 生成的 16 位应用专用密码，而不是账号主密码。',
    })
  })

  it('reports the feature as disabled without reading D1', async () => {
    const response = await listGmailAccounts({} as Env, user)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ enabled: false, accounts: [] })
  })

  it('scopes list and detail lookups by the authenticated user before returning data', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const env = {
      GMAIL_CREDENTIALS_KEY: 'gmail-test-key-that-is-longer-than-thirty-two-characters',
      DB: {
        prepare(sql: string) {
          return { bind: (...bindings: unknown[]) => {
            statements.push({ sql, bindings })
            return {
              all: async () => ({ results: [] }),
              first: async () => null,
            }
          } }
        },
      },
    } as unknown as Env

    const list = await listGmailMessages(
      env,
      user,
      new Request('https://mail.example.com/api/gmail/messages?q=Security%20100%25_'),
    )
    const detail = await getGmailMessage(env, user, 'other-account', 'other-message')

    expect(list.status).toBe(200)
    expect(detail.status).toBe(404)
    expect(statements[0].sql).toContain('a.user_id = ?')
    expect(statements[0].bindings[0]).toBe(user.id)
    expect(statements[0].sql).toContain('instr(lower(m.sender_name), ?) > 0')
    expect(statements[0].sql).toContain('instr(lower(m.subject), ?) > 0')
    expect(statements[0].sql).not.toContain('ESCAPE')
    expect(statements[0].bindings.slice(1, 6)).toEqual(
      Array(5).fill('security 100%_'),
    )
    expect(statements[1].sql).toContain('WHERE a.user_id = ? AND a.id = ? AND m.id = ?')
    expect(statements[1].bindings).toEqual([user.id, 'other-account', 'other-message'])
  })

  it('returns after deferring a manual sync enqueue instead of waiting for Queue', async () => {
    let deferred: Promise<unknown> | null = null
    const env = {
      GMAIL_CREDENTIALS_KEY: 'gmail-test-key-that-is-longer-than-thirty-two-characters',
      DB: {
        prepare(sql: string) {
          return { bind: () => ({
            first: async () => sql.includes('SELECT id, name, email, status') ? {
              id: 'gmail-1', name: 'Personal', email: 'user@gmail.com', status: 'active',
              uid_validity: 1, last_seen_uid: 1, last_synced_at: 1, next_sync_at: 1,
              last_error_code: '', last_error_at: null, sync_lease_id: null,
              sync_lease_until: null, last_manual_sync_at: null, created_at: 1, updated_at: 1,
            } : null,
            run: async () => ({ meta: { changes: 1 } }),
          }) }
        },
      },
      MAIL_QUEUE: { send: vi.fn(() => new Promise<void>(() => undefined)) },
    } as unknown as Env

    const response = await Promise.race([
      requestGmailSync(env, user, 'gmail-1', new Request('https://example.test', {
        method: 'POST', body: JSON.stringify({ limit: 20 }),
      }), (task) => { deferred = task }),
      new Promise<never>((_resolve, reject) => setTimeout(
        () => reject(new Error('request waited for Queue send')),
        100,
      )),
    ])

    expect(response.status).toBe(202)
    expect(deferred).toBeInstanceOf(Promise)
    expect(env.MAIL_QUEUE.send).toHaveBeenCalledOnce()
  })
})
