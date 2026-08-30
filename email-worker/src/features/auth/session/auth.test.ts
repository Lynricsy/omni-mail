import { describe, expect, it } from 'vitest'
import {
  applySuperAdminRole,
  activeUser,
  hashPassword,
  sessionFromUser,
  secretsEqual,
  validatePassword,
  verifyPassword,
} from './auth'

describe('password security', () => {
  it('hashes and verifies a password without storing the original', async () => {
    const encoded = await hashPassword('a sufficiently long password')
    expect(encoded).toMatch(/^pbkdf2-sha256\$100000\$/)
    expect(encoded).not.toContain('sufficiently')
    await expect(verifyPassword('a sufficiently long password', encoded)).resolves.toBe(true)
    await expect(verifyPassword('the wrong password', encoded)).resolves.toBe(false)
  })

  it('rejects iteration counts unsupported by the Workers runtime', async () => {
    const encoded = await hashPassword('a sufficiently long password')
    const unsupported = encoded.replace('$100000$', '$100001$')
    await expect(verifyPassword('a sufficiently long password', unsupported)).resolves.toBe(false)
  })

  it('rejects short and excessively long passwords', () => {
    expect(validatePassword('short')).toContain('10')
    expect(validatePassword('x'.repeat(129))).toContain('128')
    expect(validatePassword('long-enough')).toBeNull()
  })

  it('compares setup secrets by digest', async () => {
    await expect(secretsEqual('same-secret', 'same-secret')).resolves.toBe(true)
    await expect(secretsEqual('wrong-secret', 'same-secret')).resolves.toBe(false)
  })

  it('derives the super administrator role from Worker configuration', () => {
    const user = {
      id: 'user-1',
      email: 'Owner@Example.com',
      displayName: 'Owner',
      role: 'user' as const,
      mailboxLimit: 1,
      storageQuotaBytes: 1024,
      storageUsedBytes: 0,
      canCreateMailboxes: false,
      canReply: false,
      canTranslate: false,
      temporaryExpiresAt: null,
    }
    expect(applySuperAdminRole(user, 'owner@example.com')).toMatchObject({
      role: 'super_admin',
      canCreateMailboxes: true,
      canReply: true,
      canTranslate: true,
    })
    expect(applySuperAdminRole(user, 'other@example.com').role).toBe('user')
  })

  it('always enables translation for administrators', () => {
    const row = {
      id: 'admin-1',
      email: 'admin@example.com',
      display_name: 'Admin',
      role: 'admin' as const,
      mailbox_limit: 1,
      storage_quota_bytes: 1024,
      storage_used_bytes: 0,
      can_create_mailboxes: 1,
      can_reply: 1,
      can_translate: 0,
      temporary_expires_at: null,
    }

    expect(sessionFromUser(row).canTranslate).toBe(true)
    expect(sessionFromUser({ ...row, role: 'user' }).canTranslate).toBe(false)
  })

  it('rejects expired and deleted temporary users', () => {
    const temporary = {
      role: 'temporary' as const,
      status: 'active' as const,
      temporary_expires_at: 200,
      deleted_at: null,
    }
    expect(activeUser(temporary, 199)).toBe(true)
    expect(activeUser(temporary, 200)).toBe(false)
    expect(activeUser({ ...temporary, deleted_at: 150 }, 199)).toBe(false)
  })
})
