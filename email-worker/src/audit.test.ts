import { describe, expect, it } from 'vitest'
import { redactAuditDetail } from './audit'

describe('audit detail redaction', () => {
  it('drops sensitive keys and keeps useful operation metadata', () => {
    expect(redactAuditDetail({
      password: 'hidden',
      refreshToken: 'hidden',
      Authorization: 'hidden',
      role: 'admin',
      status: 'active',
      nested: { accessToken: 'hidden', safe: 'visible' },
    })).toEqual({
      role: 'admin',
      status: 'active',
      nested: { safe: 'visible' },
    })
  })

  it('bounds free-form strings stored in logs', () => {
    expect(String(redactAuditDetail({ note: 'x'.repeat(800) }).note)).toHaveLength(500)
  })
})
