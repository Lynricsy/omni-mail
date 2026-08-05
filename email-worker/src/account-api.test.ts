import { describe, expect, it } from 'vitest'
import { validateAccountDeletion, validateAccountUpdate } from './account-api'

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
