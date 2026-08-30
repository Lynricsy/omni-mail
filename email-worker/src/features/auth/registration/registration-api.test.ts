import { describe, expect, it } from 'vitest'
import {
  emailAllowedByDomainPolicy,
  emailMatchesDomainList,
  linuxDoAuthReady,
  parseRegistrationDomainPolicy,
  parseRegistrationDomains,
  parseRegistrationInput,
  parseRegistrationMethod,
} from './registration-api'
import type { Env } from '../../../app/types'

describe('external registration validation', () => {
  it('accepts only supported registration methods', () => {
    expect(parseRegistrationMethod('password')).toBe('password')
    expect(parseRegistrationMethod('linuxdo')).toBe('linuxdo')
    expect(parseRegistrationMethod('both')).toBeNull()
  })

  it('requires both Linux DO Connect credentials', () => {
    expect(linuxDoAuthReady({
      LINUX_DO_CLIENT_ID: 'client',
      LINUX_DO_CLIENT_SECRET: 'secret',
    } as Env)).toBe(true)
    expect(linuxDoAuthReady({ LINUX_DO_CLIENT_ID: 'client' } as Env)).toBe(false)
  })
  it('normalizes a valid public registration', () => {
    const result = parseRegistrationInput({
      email: ' New.User@Example.com ',
      displayName: ' New User ',
      password: 'a-secure-password',
      turnstileToken: 'verified-token',
    })
    expect(result).toEqual({
      value: {
        email: 'new.user@example.com',
        displayName: 'New User',
        password: 'a-secure-password',
        turnstileToken: 'verified-token',
      },
    })
  })

  it('rejects malformed registration input', () => {
    expect(parseRegistrationInput({
      email: 'invalid',
      displayName: 'User',
      password: 'a-secure-password',
      turnstileToken: 'verified-token',
    })).toEqual({ error: '请输入有效的登录邮箱。' })
    expect(parseRegistrationInput({
      email: 'user@example.com',
      displayName: '',
      password: 'a-secure-password',
      turnstileToken: 'verified-token',
    })).toEqual({ error: '显示名称需要在 1–60 个字符之间。' })
    expect(parseRegistrationInput({
      email: 'user@example.com',
      displayName: 'User',
      password: 'short',
      turnstileToken: 'verified-token',
    })).toEqual({ error: '密码至少需要 10 个字符。' })
    expect(parseRegistrationInput({
      email: 'user@example.com',
      displayName: 'User',
      password: 'a-secure-password',
    })).toEqual({ error: '请先完成人机验证。' })
  })
})

describe('registration email domain restrictions', () => {
  it('normalizes, deduplicates and sorts valid domain suffixes', () => {
    expect(parseRegistrationDomains([
      ' QQ.com ',
      '@163.COM',
      'qq.com',
    ])).toEqual(['163.com', 'qq.com'])
  })

  it('rejects malformed domain suffix settings', () => {
    expect(parseRegistrationDomains(['qq'])).toBeNull()
    expect(parseRegistrationDomains(['-bad.example'])).toBeNull()
    expect(parseRegistrationDomains('qq.com')).toBeNull()
  })

  it('matches exact domains and subdomains without matching lookalikes', () => {
    expect(emailMatchesDomainList('user@qq.com', ['qq.com'])).toBe(true)
    expect(emailMatchesDomainList('user@mail.qq.com', ['qq.com'])).toBe(true)
    expect(emailMatchesDomainList('user@notqq.com', ['qq.com'])).toBe(false)
  })

  it('supports both blocklist and allowlist policies', () => {
    const blocklist = { mode: 'blocklist' as const, domains: ['qq.com'] }
    const allowlist = { mode: 'allowlist' as const, domains: ['example.com'] }
    expect(emailAllowedByDomainPolicy('user@qq.com', blocklist)).toBe(false)
    expect(emailAllowedByDomainPolicy('user@example.com', blocklist)).toBe(true)
    expect(emailAllowedByDomainPolicy('user@mail.example.com', allowlist)).toBe(true)
    expect(emailAllowedByDomainPolicy('user@other.com', allowlist)).toBe(false)
  })

  it('allows an empty blocklist but rejects an empty allowlist', () => {
    expect(parseRegistrationDomainPolicy({
      mode: 'blocklist',
      domains: [],
    })).toEqual({ mode: 'blocklist', domains: [] })
    expect(parseRegistrationDomainPolicy({
      mode: 'allowlist',
      domains: [],
    })).toBeNull()
    expect(parseRegistrationDomainPolicy({
      mode: 'allowlist',
      domains: ['Example.com'],
    })).toEqual({ mode: 'allowlist', domains: ['example.com'] })
  })
})
