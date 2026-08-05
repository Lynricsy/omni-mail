import { describe, expect, it } from 'vitest'
import { auditCategory, auditDays } from './audit-log-api'

describe('audit log filters', () => {
  it('accepts supported time windows with a seven-day default', () => {
    expect(auditDays('1')).toBe(1)
    expect(auditDays('30')).toBe(30)
    expect(auditDays('90')).toBe(90)
    expect(auditDays('365')).toBe(7)
  })

  it('accepts known categories and rejects arbitrary SQL fragments', () => {
    expect(auditCategory('auth')).toBe('auth')
    expect(auditCategory('invitation')).toBe('invitation')
    expect(auditCategory("auth' OR 1=1")).toBe('all')
  })
})
