import { describe, expect, it } from 'vitest'
import { hashPassword, sha256 } from '../session/auth'
import { updateAccount, validateAccountDeletion, validateAccountUpdate } from './account-api'
import type { Env, SessionUser } from '../../../app/types'

describe('account update validation', () => {
  it('normalizes a display name update', () => {
    expect(validateAccountUpdate({ displayName: '  Omni Owner  ' })).toEqual({
      value: { displayName: 'Omni Owner' },
    })
  })

  it('requires the current password when changing passwords', () => {
    expect(validateAccountUpdate({ newPassword: 'new-password-123' })).toEqual({
      error: '请输入当前密码。',
    })
  })

  it('rejects empty updates and short new passwords', () => {
    expect(validateAccountUpdate({})).toEqual({
      error: '没有需要保存的账户更改。',
    })
    expect(validateAccountUpdate({
      currentPassword: 'old-password',
      newPassword: 'short',
    })).toEqual({
      error: '密码至少需要 10 个字符。',
    })
  })

  it('revokes every browser session and rotates the current one when the password changes', async () => {
    const statements: Array<{ sql: string; bindings: unknown[] }> = []
    const oldHash = await hashPassword('old-password-123')
    const db = {
      prepare(sql: string) {
        const entry = { sql, bindings: [] as unknown[] }
        statements.push(entry)
        return {
          bind(...bindings: unknown[]) { entry.bindings = bindings; return this },
          first: async () => ({ password_hash: oldHash }),
          run: async () => ({ meta: { changes: 1 } }),
        }
      },
      batch: async (batch: Array<{ run?: () => Promise<unknown> }>) => (
        Promise.all(batch.map(() => ({ meta: { changes: 1 } })))
      ),
    }
    const user = {
      id: 'user-1', displayName: 'User', email: 'user@example.com', role: 'user',
    } as SessionUser
    const currentToken = 'current-browser-session'
    const response = await updateAccount(
      { DB: db } as unknown as Env,
      user,
      new Request('https://mail.example/api/account', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: 'old-password-123',
          newPassword: 'new-password-456',
        }),
      }),
      '127.0.0.1',
      currentToken,
    )

    expect(response.status).toBe(200)
    const deletion = statements.find(({ sql }) => sql.includes('DELETE FROM sessions'))
    const replacement = statements.find(({ sql }) => sql.includes('INSERT INTO sessions'))
    expect(deletion?.bindings).toEqual(['user-1'])
    expect(replacement?.bindings[0]).toBe(await sha256(
      response.headers.get('X-OmniMail-Replacement-Session') || '',
    ))
    expect(replacement?.bindings[1]).toBe('user-1')
  })
})

describe('account deletion validation', () => {
  it('allows regular users to confirm with their login email', () => {
    expect(validateAccountDeletion(
      { email: 'user@example.com', role: 'user' },
      { confirmationEmail: ' USER@example.com ' },
    )).toEqual({})
  })

  it('keeps password confirmation for temporary users', () => {
    expect(validateAccountDeletion(
      { email: 'temp@example.com', role: 'temporary' },
      { currentPassword: 'temporary-password' },
    )).toEqual({ currentPassword: 'temporary-password' })
  })

  it('prevents administrators from deleting their own account', () => {
    expect(validateAccountDeletion(
      { email: 'admin@example.com', role: 'admin' },
      { confirmationEmail: 'admin@example.com' },
    )).toMatchObject({ status: 403 })
  })
})
