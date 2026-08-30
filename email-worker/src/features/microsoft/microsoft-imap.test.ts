import { describe, expect, it } from 'vitest'
import {
  decodeModifiedUtf7,
  parseMicrosoftList,
  parseMicrosoftSearchUids,
} from './microsoft-imap-values'

describe('Microsoft IMAP parsing', () => {
  it('parses LIST flags, quoted paths, special-use, and modified UTF-7 names', () => {
    expect(parseMicrosoftList([
      '* LIST (\\HasNoChildren \\Inbox) "/" "INBOX"',
      '* LIST (\\HasNoChildren \\Sent) "/" "Sent Items"',
      '* LIST (\\HasNoChildren) "/" "&ZeVnLIqe-"',
      'A0002 OK LIST completed.',
    ])).toEqual([
      expect.objectContaining({ path: 'INBOX', displayName: 'INBOX', specialUse: '\\Inbox' }),
      expect.objectContaining({ path: 'Sent Items', specialUse: '\\Sent' }),
      expect.objectContaining({ path: '&ZeVnLIqe-', displayName: '日本語' }),
    ])
    expect(decodeModifiedUtf7('A&-B')).toBe('A&B')
  })

  it('normalizes and sorts unique positive search UIDs', () => {
    expect(parseMicrosoftSearchUids(['* SEARCH 9 2 9 nope 4', 'A0003 OK']))
      .toEqual([2, 4, 9])
  })

  it('ignores malformed LIST rows instead of treating them as selectable folders', () => {
    expect(parseMicrosoftList([
      '* LIST (\\HasNoChildren) "/" "bad\\r\\nfolder"',
      '* STATUS INBOX (MESSAGES 1)',
    ])).toEqual([])
  })
})
