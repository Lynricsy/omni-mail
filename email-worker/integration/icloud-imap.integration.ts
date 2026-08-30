import { describe, expect, it } from 'vitest'
import { quoteICloudImapValue } from '../src/features/icloud/icloud-imap'

describe('iCloud IMAP commands in workerd', () => {
  it('quotes credentials and rejects command injection', () => {
    expect(quoteICloudImapValue('a"b\\c')).toBe('"a\\"b\\\\c"')
    expect(() => quoteICloudImapValue('user\r\nLOGOUT')).toThrow('非法换行')
  })
})
