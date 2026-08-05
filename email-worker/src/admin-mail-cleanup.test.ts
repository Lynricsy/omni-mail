import { describe, expect, it } from 'vitest'
import { normalizeCleanupFilter } from './admin-mail-cleanup'

describe('admin mail cleanup filters', () => {
  it('normalizes an explicit mailbox scope', () => {
    expect(normalizeCleanupFilter({
      scope: 'mailbox',
      scopeValue: ' Inbox@Example.com ',
      category: 'trash',
      olderThanDays: '30',
    })).toEqual({
      scope: 'mailbox',
      scopeValue: 'inbox@example.com',
      category: 'trash',
      olderThanDays: 30,
    })
  })

  it('accepts all mail only when the age and category are valid', () => {
    expect(normalizeCleanupFilter({
      scope: 'all',
      scopeValue: 'ignored',
      category: 'failed',
      olderThanDays: 7,
    })?.scopeValue).toBe('')
    expect(normalizeCleanupFilter({
      scope: 'all',
      category: 'all',
      olderThanDays: 0,
    })).toBeNull()
  })

  it('rejects missing user and mailbox identifiers', () => {
    expect(normalizeCleanupFilter({
      scope: 'user',
      scopeValue: '',
      category: 'sent',
      olderThanDays: 90,
    })).toBeNull()
  })
})
