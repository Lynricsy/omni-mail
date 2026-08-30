import { describe, expect, it } from 'vitest'
import { randomMailboxLocalPart, validMailboxLocalPart } from './mailboxAddress'

describe('mailbox local parts', () => {
  it('accepts supported custom local parts', () => {
    expect(validMailboxLocalPart('hello')).toBe(true)
    expect(validMailboxLocalPart('hello.world+news')).toBe(true)
    expect(validMailboxLocalPart('-hello')).toBe(false)
    expect(validMailboxLocalPart('hello-')).toBe(false)
  })

  it('generates 12 hexadecimal characters after the configured prefix', () => {
    expect(randomMailboxLocalPart()).toMatch(/^[a-f0-9]{12}$/)
    expect(randomMailboxLocalPart('alias-')).toMatch(/^alias-[a-f0-9]{12}$/)
  })
})
