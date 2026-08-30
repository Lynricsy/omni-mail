import { describe, expect, it } from 'vitest'
import { encodeXOAuth2, quoteImapValue } from './imap-values'

describe('shared IMAP command values', () => {
  it('quotes backslashes and double quotes', () => {
    expect(quoteImapValue('name\\"value')).toBe('"name\\\\\\"value"')
  })

  it('rejects CRLF and null injection', () => {
    expect(() => quoteImapValue('name\r\nA0001 LOGOUT')).toThrow('无效字符')
    expect(() => quoteImapValue('name\0value')).toThrow('无效字符')
  })

  it('encodes XOAUTH2 without exposing raw credentials in the command shape', () => {
    const encoded = encodeXOAuth2('user@outlook.com', 'access-token')
    expect(atob(encoded)).toBe(
      'user=user@outlook.com\x01auth=Bearer access-token\x01\x01',
    )
    expect(() => encodeXOAuth2('user@outlook.com\r\n', 'token')).toThrow('无效字符')
    expect(() => encodeXOAuth2('user@outlook.com', 'token\0value')).toThrow('无效字符')
  })
})
