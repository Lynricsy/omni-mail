import { describe, expect, it } from 'vitest'
import {
  MAX_RECIPIENTS,
  recipientList,
  recipientValueIsValid,
} from './recipients'

describe('message recipients', () => {
  it('parses comma and semicolon separated addresses', () => {
    expect(recipientList(' First@Example.com, second@example.net; THIRD@example.org '))
      .toEqual(['first@example.com', 'second@example.net', 'third@example.org'])
  })

  it('validates every recipient and enforces the recipient limit', () => {
    expect(recipientValueIsValid('first@example.com, second@example.net')).toBe(true)
    expect(recipientValueIsValid('first@example.com, invalid')).toBe(false)
    expect(recipientValueIsValid('')).toBe(false)
    expect(recipientValueIsValid(
      Array.from({ length: MAX_RECIPIENTS + 1 }, (_, index) => `user${index}@example.com`).join(','),
    )).toBe(false)
  })
})
