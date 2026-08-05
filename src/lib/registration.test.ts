import { describe, expect, it } from 'vitest'
import {
  emailAllowedByDomainPolicy,
  registrationDomainsFromText,
} from './registration'

describe('registration email domain restrictions', () => {
  it('normalizes comma and line separated domain lists', () => {
    expect(registrationDomainsFromText(' QQ.com,\n@163.COM；qq.com ')).toEqual([
      'qq.com',
      '163.com',
    ])
  })

  it('supports blocklist and allowlist decisions', () => {
    const blocklist = { mode: 'blocklist' as const, domains: ['qq.com'] }
    const allowlist = { mode: 'allowlist' as const, domains: ['example.com'] }
    expect(emailAllowedByDomainPolicy('user@qq.com', blocklist)).toBe(false)
    expect(emailAllowedByDomainPolicy('user@example.com', blocklist)).toBe(true)
    expect(emailAllowedByDomainPolicy('user@mail.example.com', allowlist)).toBe(true)
    expect(emailAllowedByDomainPolicy('user@other.com', allowlist)).toBe(false)
  })
})
