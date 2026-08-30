import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAFT_LIMIT,
  draftLimitForRole,
  draftLimitsFromSettings,
  validDraftLimits,
} from './draft-policy'

describe('draft retention policy', () => {
  it('defaults every role to five drafts and keeps role-specific values', () => {
    expect(draftLimitsFromSettings(new Map())).toEqual({
      superAdmin: DEFAULT_DRAFT_LIMIT,
      admin: DEFAULT_DRAFT_LIMIT,
      user: DEFAULT_DRAFT_LIMIT,
      temporary: DEFAULT_DRAFT_LIMIT,
    })
    const limits = draftLimitsFromSettings(new Map([
      ['draft_limit_super_admin', '12'],
      ['draft_limit_admin', '8'],
      ['draft_limit_user', '5'],
      ['draft_limit_temporary', '2'],
    ]))
    expect(draftLimitForRole(limits, 'super_admin')).toBe(12)
    expect(draftLimitForRole(limits, 'temporary')).toBe(2)
  })

  it('rejects partial or out-of-range role limits', () => {
    expect(validDraftLimits({ superAdmin: 5, admin: 5, user: 5, temporary: 5 })).toBe(true)
    expect(validDraftLimits({ superAdmin: 5, admin: 5, user: 0, temporary: 5 })).toBe(false)
    expect(validDraftLimits({ superAdmin: 5, admin: 5, user: 5 })).toBe(false)
  })
})
