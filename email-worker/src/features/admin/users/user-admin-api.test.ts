import { describe, expect, it } from 'vitest'
import { canAssignManagedRole, canEditManagedUser } from './user-admin-api'

describe('managed user authorization', () => {
  it('protects the configured super administrator and the current account', () => {
    expect(canEditManagedUser('super_admin', 'admin', false, false)).toBe(true)
    expect(canEditManagedUser('super_admin', 'super_admin', false, true)).toBe(false)
    expect(canEditManagedUser('admin', 'user', true, false)).toBe(false)
  })

  it('limits regular administrators to user and temporary accounts', () => {
    expect(canEditManagedUser('admin', 'user', false, false)).toBe(true)
    expect(canEditManagedUser('admin', 'temporary', false, false)).toBe(true)
    expect(canEditManagedUser('admin', 'admin', false, false)).toBe(false)
  })

  it('allows only the super administrator to grant admin access', () => {
    expect(canAssignManagedRole('super_admin', 'admin')).toBe(true)
    expect(canAssignManagedRole('admin', 'admin')).toBe(false)
    expect(canAssignManagedRole('admin', 'temporary')).toBe(true)
    expect(canAssignManagedRole('super_admin', 'super_admin')).toBe(false)
  })
})
