import { describe, expect, it, vi } from 'vitest'
import { addMailbox, canCreateMailbox, mailboxDomain, updateMailbox } from './mailbox-api'
import type { Env, SessionUser, UserRole } from './types'

function user(role: UserRole, canCreateMailboxes: boolean): SessionUser {
  return {
    id: role,
    email: `${role}@example.com`,
    displayName: role,
    role,
    mailboxLimit: 1,
    canCreateMailboxes,
    canReply: false,
    temporaryExpiresAt: null,
  }
}

describe('mailboxDomain', () => {
  it('groups mailboxes by a normalized domain suffix', () => {
    expect(mailboxDomain('hello@Example.COM')).toBe('example.com')
    expect(mailboxDomain('alerts@sub.example.com')).toBe('sub.example.com')
  })

  it('requires explicit permission for regular and temporary users', () => {
    expect(canCreateMailbox(user('user', false))).toBe(false)
    expect(canCreateMailbox(user('temporary', false))).toBe(false)
    expect(canCreateMailbox(user('user', true))).toBe(true)
    expect(canCreateMailbox(user('temporary', true))).toBe(true)
  })

  it('allows administrators without a separate mailbox permission', () => {
    expect(canCreateMailbox(user('admin', false))).toBe(true)
    expect(canCreateMailbox(user('super_admin', false))).toBe(true)
  })

  it('does not reactivate a mailbox on a disabled domain', async () => {
    const update = vi.fn()
    const database = {
      prepare(sql: string) {
        const statement = {
          bind() {
            return statement
          },
          first: async () => {
            if (sql.includes('FROM mailboxes WHERE address')) {
              return {
                address: 'owner@example.com',
                user_id: 'user',
                is_primary: 1,
                is_active: 0,
              }
            }
            if (sql.includes('FROM domains')) return { is_active: 0 }
            return null
          },
          run: update,
        }
        return statement
      },
    }

    const response = await addMailbox(
      { DB: database } as unknown as Env,
      user('user', true),
      new Request('https://mail.example/api/mailboxes', {
        method: 'POST',
        body: JSON.stringify({ address: 'owner@example.com' }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(403)
    expect(update).not.toHaveBeenCalled()
  })

  it('does not enable a mailbox through the status endpoint on a disabled domain', async () => {
    const update = vi.fn()
    const database = {
      prepare(sql: string) {
        const statement = {
          bind() {
            return statement
          },
          first: async () => {
            if (sql.includes('FROM mailboxes WHERE address')) {
              return { address: 'owner@example.com', is_primary: 1, is_active: 0 }
            }
            if (sql.includes('FROM domains')) return { is_active: 0 }
            return null
          },
          run: update,
        }
        return statement
      },
    }

    const response = await updateMailbox(
      { DB: database } as unknown as Env,
      user('user', true),
      encodeURIComponent('owner@example.com'),
      new Request('https://mail.example/api/mailboxes/owner', {
        method: 'PATCH',
        body: JSON.stringify({ isActive: true }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(403)
    expect(update).not.toHaveBeenCalled()
  })
})
