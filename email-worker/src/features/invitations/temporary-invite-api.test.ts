import { describe, expect, it } from 'vitest'
import {
  inviteAccountExpiresAt,
  inviteState,
  parseInviteAccountRole,
  registerTemporaryInvite,
  temporaryAddress,
} from './temporary-invite-api'
import type { Env } from '../../app/types'

const activeInvite = {
  domain_active: 1,
  expires_at: 200,
  max_uses: 1,
  use_count: 0,
  revoked_at: null,
}

describe('temporary invites', () => {
  it('supports permanent regular users while keeping old invites temporary', () => {
    expect(parseInviteAccountRole(undefined)).toBe('temporary')
    expect(parseInviteAccountRole('temporary')).toBe('temporary')
    expect(parseInviteAccountRole('user')).toBe('user')
    expect(parseInviteAccountRole('admin')).toBeNull()
    expect(inviteAccountExpiresAt('temporary', 100, 24)).toBe(86_500)
    expect(inviteAccountExpiresAt('user', 100, 24)).toBeNull()
  })

  it('builds a normalized mailbox address from a local part', () => {
    expect(temporaryAddress(' Guest.Name ', 'example.com')).toBe('guest.name@example.com')
    expect(temporaryAddress('bad@name', 'example.com')).toBe('')
    expect(temporaryAddress('.hidden', 'example.com')).toBe('')
    expect(temporaryAddress('two..dots', 'example.com')).toBe('')
  })

  it('distinguishes active, expired, used and revoked links', () => {
    expect(inviteState(activeInvite, 100)).toBe('active')
    expect(inviteState({ ...activeInvite, expires_at: 100 }, 100)).toBe('expired')
    expect(inviteState({ ...activeInvite, use_count: 1 }, 100)).toBe('used')
    expect(inviteState({ ...activeInvite, revoked_at: 50 }, 100)).toBe('revoked')
  })

  it('keeps multi-use links active after prior registrations', () => {
    expect(inviteState({ ...activeInvite, max_uses: 0, use_count: 12 }, 100)).toBe('active')
  })

  it('registers invited regular users without a temporary expiry', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const now = Math.floor(Date.now() / 1000)
    const invite = {
      id: 'invite-1',
      domain_name: 'example.com',
      domain_active: 1,
      account_role: 'user',
      expires_at: now + 3_600,
      max_uses: 1,
      use_count: 0,
      address_mode: 'self_selected',
      assigned_address: null,
      account_lifetime_hours: 24,
      mailbox_limit: 2,
      can_create_mailboxes: 1,
      can_reply: 1,
      can_translate: 0,
      created_at: now,
      revoked_at: null,
    }
    const db = {
      prepare(sql: string) {
        const entry = { sql, bindings: [] as unknown[] }
        statements.push(entry)
        const statement = {
          bind(...bindings: unknown[]) {
            entry.bindings = bindings
            return statement
          },
          async first() {
            if (sql.includes('FROM temporary_invites i')) return invite
            if (sql.includes('INSERT INTO registration_attempts')) {
              return { attempts: 1, window_started_at: now }
            }
            return null
          },
          async all() {
            return { results: [] }
          },
          async run() {
            return { meta: { changes: 1 } }
          },
        }
        return statement
      },
      async batch() {
        return []
      },
    }
    const request = new Request('https://mail.example.com/api/invitations/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Regular User',
        localPart: 'regular',
        password: 'long-enough-password',
      }),
    })

    const response = await registerTemporaryInvite(
      { DB: db } as unknown as Env,
      'token',
      request,
      '203.0.113.10',
    )
    const userInsert = statements.find(({ sql }) => sql.includes('INSERT INTO users'))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ email: 'regular@example.com' })
    expect(userInsert?.bindings[4]).toBe('user')
    expect(userInsert?.bindings[6]).toBe(1024 * 1024 * 1024)
    expect(userInsert?.bindings[9]).toBe(0)
    expect(userInsert?.bindings[10]).toBeNull()
  })
})
