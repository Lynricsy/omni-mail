import { describe, expect, it, vi } from 'vitest'
import {
  addMailbox,
  canCreateMailbox,
  deleteMailbox,
  mailboxDomain,
  updateMailbox,
} from './mailbox-api'
import type { Env, SessionUser, UserRole } from '../../app/types'

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

  it('enforces the mailbox limit inside the insert statement', async () => {
    const statements: string[] = []
    const database = {
      prepare(sql: string) {
        statements.push(sql)
        return {
          bind() { return this },
          first: async () => sql.includes('FROM domains') ? { is_active: 1 } : null,
          run: async () => ({ meta: { changes: sql.includes('mailboxes (address') ? 0 : 1 } }),
        }
      },
    }
    const response = await addMailbox(
      { DB: database } as unknown as Env,
      user('user', true),
      new Request('https://mail.example/api/mailboxes', {
        method: 'POST', body: JSON.stringify({ address: 'alias@example.com' }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(403)
    const insert = statements.find((sql) => sql.includes('INSERT OR IGNORE INTO mailboxes'))
    expect(insert).toContain('SELECT COUNT(*) FROM mailboxes')
    expect(statements).not.toContain('SELECT COUNT(*) AS count FROM mailboxes WHERE user_id = ? AND is_hidden = 0')
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

  it('atomically moves the primary flag to an active mailbox', async () => {
    const statements: string[] = []
    const database = {
      prepare(sql: string) {
        statements.push(sql)
        const statement = {
          bind() { return statement },
          first: async () => {
            if (sql.includes('FROM mailboxes WHERE address')) {
              return { address: 'alias@example.com', is_primary: 0, is_active: 1 }
            }
            if (sql.includes('FROM domains')) return { is_active: 1 }
            return null
          },
          run: async () => ({ meta: { changes: 1 } }),
        }
        return statement
      },
    }
    const response = await updateMailbox(
      { DB: database } as unknown as Env,
      user('user', true),
      encodeURIComponent('alias@example.com'),
      new Request('https://mail.example/api/mailboxes/alias', {
        method: 'PATCH',
        body: JSON.stringify({ isPrimary: true }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ mailbox: { isPrimary: true } })
    expect(statements.some((sql) => sql.includes('SET is_primary = CASE'))).toBe(true)
  })

  it('does not make a disabled mailbox primary', async () => {
    const batch = vi.fn(async () => [])
    const database = {
      prepare: () => ({
        bind() { return this },
        first: async () => ({ address: 'alias@example.com', is_primary: 0, is_active: 0 }),
      }),
      batch,
    }
    const response = await updateMailbox(
      { DB: database } as unknown as Env,
      user('user', true),
      encodeURIComponent('alias@example.com'),
      new Request('https://mail.example/api/mailboxes/alias', {
        method: 'PATCH',
        body: JSON.stringify({ isPrimary: true }),
      }),
      '127.0.0.1',
    )

    expect(response.status).toBe(409)
    expect(batch).not.toHaveBeenCalled()
  })

  it('hides a secondary mailbox before scheduling permanent cleanup', async () => {
    const create = vi.fn(async () => ({}))
    const statements: string[] = []
    const database = {
      prepare(sql: string) {
        statements.push(sql)
        const statement = {
          bind() { return statement },
          first: async () => ({ address: 'alias@example.com', is_primary: 0, is_active: 1 }),
          run: async () => ({ meta: { changes: 1 } }),
        }
        return statement
      },
    }
    const response = await deleteMailbox(
      { DB: database, CLEANUP_WORKFLOW: { create } } as unknown as Env,
      user('user', true),
      encodeURIComponent('alias@example.com'),
      '127.0.0.1',
    )

    expect(response.status).toBe(202)
    expect(statements.some((sql) => sql.includes('is_hidden = 1'))).toBe(true)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({
        mailboxDeletion: expect.objectContaining({ address: 'alias@example.com' }),
      }),
    }))
  })

  it('does not delete the primary mailbox', async () => {
    const create = vi.fn(async () => ({}))
    const database = {
      prepare: () => ({
        bind() { return this },
        first: async () => ({ address: 'owner@example.com', is_primary: 1, is_active: 1 }),
      }),
    }
    const response = await deleteMailbox(
      { DB: database, CLEANUP_WORKFLOW: { create } } as unknown as Env,
      user('user', true),
      encodeURIComponent('owner@example.com'),
      '127.0.0.1',
    )

    expect(response.status).toBe(409)
    expect(create).not.toHaveBeenCalled()
  })

  it('restores a mailbox when its cleanup workflow cannot start', async () => {
    const statements: string[] = []
    const database = {
      prepare(sql: string) {
        statements.push(sql)
        const statement = {
          bind() { return statement },
          first: async () => ({ address: 'alias@example.com', is_primary: 0, is_active: 1 }),
          run: async () => ({ meta: { changes: 1 } }),
        }
        return statement
      },
    }
    const response = await deleteMailbox(
      {
        DB: database,
        CLEANUP_WORKFLOW: { create: vi.fn(async () => { throw new Error('unavailable') }) },
      } as unknown as Env,
      user('user', true),
      encodeURIComponent('alias@example.com'),
      '127.0.0.1',
    )

    expect(response.status).toBe(503)
    expect(statements.some((sql) => sql.includes('is_hidden = 0'))).toBe(true)
  })
})
