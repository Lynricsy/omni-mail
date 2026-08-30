import { describe, expect, it, vi } from 'vitest'
import { deleteDomain, normalizeDomain, validDomainName } from './domain-api'
import type { Env, SessionUser } from '../../../app/types'

describe('domain validation', () => {
  it('normalizes case and a trailing dot', () => {
    expect(normalizeDomain(' Example.COM. ')).toBe('example.com')
  })

  it('accepts regular and local test domains', () => {
    expect(validDomainName('example.com')).toBe(true)
    expect(validDomainName('mail.omni.test')).toBe(true)
  })

  it('rejects email addresses and invalid labels', () => {
    expect(validDomainName('owner@example.com')).toBe(false)
    expect(validDomainName('-mail.example.com')).toBe(false)
    expect(validDomainName('localhost')).toBe(false)
  })

  it('refuses to delete a domain while mailboxes still reference it', async () => {
    const batch = vi.fn()
    const database = {
      prepare() {
        const statement = {
          bind() {
            return statement
          },
          first: async () => ({
            name: 'example.com',
            is_active: 1,
            mailbox_count: 2,
            created_at: 1,
            updated_at: 1,
          }),
        }
        return statement
      },
      batch,
    }

    const response = await deleteDomain(
      { DB: database } as unknown as Env,
      { id: 'admin-1', role: 'admin' } as SessionUser,
      'example.com',
      '127.0.0.1',
    )

    expect(response.status).toBe(409)
    expect(batch).not.toHaveBeenCalled()
  })
})
